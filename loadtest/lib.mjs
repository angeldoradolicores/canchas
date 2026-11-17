// Utilidades compartidas por las pruebas en Node (doble-reserva.mjs y seguridad.mjs).
import { randomUUID } from 'node:crypto';

export const env = (k, d = '') => (process.env[k] ?? d).toString().trim();

export const CFG = {
  base: env('BASE_URL', 'http://localhost:3000').replace(/\/$/, ''),
  supabase: env('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, ''),
  anon: env('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  service: env('SUPABASE_SERVICE_ROLE_KEY'),
  pitch: env('TEST_PITCH_ID'),
  linkedPitch: env('TEST_LINKED_PITCH_ID'),
  owner: { email: env('OWNER_EMAIL'), password: env('OWNER_PASSWORD') },
  players: env('PLAYER_ACCOUNTS').split(';').filter(Boolean).map((p) => {
    const i = p.lastIndexOf(':');
    return { email: p.slice(0, i), password: p.slice(i + 1) };
  }),
};

export const isProd = () => /cancheros\.site/i.test(CFG.base);

export function requireVars(names) {
  const missing = names.filter((n) => !env(n));
  if (missing.length) {
    console.error(`\nFaltan variables: ${missing.join(', ')}\nCópialas en loadtest/.env.test (ver loadtest/env.example).\n`);
    process.exit(2);
  }
}

/** Inicia sesión en Supabase y devuelve { token, userId }. */
export async function login({ email, password }) {
  const r = await fetch(`${CFG.supabase}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: CFG.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`No se pudo iniciar sesión con ${email}: ${j.error_description || j.msg || r.status}`);
  return { token: j.access_token, userId: j.user?.id, email };
}

/** Petición a la app midiendo la latencia. */
export async function call(path, { method = 'GET', token, cookie, body, headers = {} } = {}) {
  const t0 = performance.now();
  let status = 0, json = null, text = '', resHeaders = null;
  try {
    const r = await fetch(CFG.base + path, {
      method,
      redirect: 'manual',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        Origin: CFG.base,
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    status = r.status;
    resHeaders = r.headers;
    text = await r.text();
    try { json = JSON.parse(text); } catch { /* no es JSON */ }
  } catch (e) {
    text = String(e?.message || e);
  }
  return { status, json, text, headers: resHeaders, ms: performance.now() - t0 };
}

/** Petición directa a la API REST de Supabase (como lo haría un navegador o un atacante). */
export async function rest(path, { method = 'GET', token, key = CFG.anon, body, prefer } = {}) {
  const r = await fetch(`${CFG.supabase}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token || key}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* vacío */ }
  return { status: r.status, json, text };
}

/** Reservas activas (pendiente/confirmada o borrador vigente) de una cancha en una hora. */
export async function activeAt(pitchIds, startIso, endIso) {
  const r = await rest('/rest/v1/rpc/get_pitch_occupancy', {
    method: 'POST',
    body: { p_pitch_ids: pitchIds, p_from: startIso, p_to: endIso },
  });
  if (r.status !== 200 || !Array.isArray(r.json)) throw new Error(`get_pitch_occupancy falló: ${r.status} ${r.text.slice(0, 200)}`);
  const now = Date.now();
  return r.json.filter((b) =>
    new Date(b.start_time).getTime() < new Date(endIso).getTime() &&
    new Date(b.end_time).getTime() > new Date(startIso).getTime() &&
    (b.status === 'pending' || b.status === 'confirmed' ||
      (b.status === 'draft' && b.expires_at && new Date(b.expires_at).getTime() > now)));
}

export const guestCookie = () => `booking_guest=${randomUUID()}`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function percentile(values, p) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

/** Fecha YYYY-MM-DD en Bogotá, N días después de hoy. */
export function futureDate(days) {
  const d = new Date(Date.now() + days * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

// ── Reporte en consola ──
const results = [];
export function report(ok, name, detail = '', level = ok ? 'PASS' : 'FAIL') {
  results.push({ level, name, detail });
  const icon = level === 'PASS' ? '✅' : level === 'WARN' ? '⚠️ ' : level === 'INFO' ? 'ℹ️ ' : '❌';
  console.log(`${icon} ${name}${detail ? `  — ${detail}` : ''}`);
}
export const warn = (name, detail) => report(true, name, detail, 'WARN');
export const info = (name, detail) => report(true, name, detail, 'INFO');
export function summary(title) {
  const fails = results.filter((r) => r.level === 'FAIL').length;
  const warns = results.filter((r) => r.level === 'WARN').length;
  const pass = results.filter((r) => r.level === 'PASS').length;
  console.log(`\n══ ${title}: ${pass} correctas, ${warns} advertencias, ${fails} fallas ══`);
  return fails;
}
