import { NextRequest } from 'next/server';
import { createClient, User } from '@supabase/supabase-js';

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  return createClient(url, key);
}

/**
 * Extrae el access token JWT de un valor de cookie de sesión de Supabase SSR.
 * Soporta los formatos que emite @supabase/ssr:
 *  - "base64-<base64(JSON)>"  → decodifica y parsea el JSON interno
 *  - JSON array  "[access_token, refresh_token, ...]"
 *  - JSON object "{access_token: ..., ...}"
 *  - plain JWT string
 */
function extractAccessToken(raw: string): string | null {
  let str = raw.trim();

  // @supabase/ssr v0.12+ serializa la sesión como base64
  if (str.startsWith('base64-')) {
    try {
      str = Buffer.from(str.slice(7), 'base64').toString('utf-8');
    } catch {
      return null;
    }
  }

  if (str.startsWith('[')) {
    try {
      const arr = JSON.parse(str);
      return Array.isArray(arr) ? (arr[0] ?? null) : null;
    } catch {
      return null;
    }
  }

  if (str.startsWith('{')) {
    try {
      const obj = JSON.parse(str);
      return obj?.access_token ?? null;
    } catch {
      return null;
    }
  }

  // JWT plano (tres segmentos separados por puntos)
  if (str.split('.').length === 3) return str;

  return null;
}

/**
 * Obtiene de forma segura el usuario autenticado a partir del encabezado
 * Authorization (Bearer token) o de las cookies de sesión de Supabase SSR.
 * NUNCA confía en IDs enviados en el body del payload.
 */
export async function getAuthenticatedUser(
  req: NextRequest,
): Promise<User | null> {
  const supabase = getAdminSupabase();

  // ── 1. Encabezado Authorization: Bearer <token> ────────────────────────────
  const authHeader =
    req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token) {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data?.user) return data.user;
    }
  }

  // ── 2. Cookies de sesión de Supabase SSR ──────────────────────────────────
  const supabaseRef =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0] ?? '';
  const cookieBaseName = `sb-${supabaseRef}-auth-token`;

  // 2a. Cookie simple (nombre exacto o nombre alternativo)
  let rawCookie =
    req.cookies.get('sb-access-token')?.value ??
    req.cookies.get(cookieBaseName)?.value;

  // 2b. Cookies chunked (.0, .1, …) que genera @supabase/ssr para JWT grandes
  if (!rawCookie) {
    let assembled = '';
    for (let i = 0; ; i++) {
      const chunk = req.cookies.get(`${cookieBaseName}.${i}`)?.value;
      if (!chunk) break;
      assembled += chunk;
    }
    if (assembled) rawCookie = assembled;
  }

  if (rawCookie) {
    const token = extractAccessToken(rawCookie);
    if (token) {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data?.user) return data.user;
    }
  }

  return null;
}

/**
 * Verifica si un usuario es propietario legítimo de una empresa (complejo deportivo).
 */
export async function verifyCompanyOwnership(
  userId: string,
  companyId: string,
): Promise<boolean> {
  if (!userId || !companyId) return false;
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('owner_id', userId)
    .maybeSingle();

  return !error && !!data;
}

/**
 * Verifica si un usuario es propietario de la cancha especificada
 * (a través de la empresa a la que pertenece la cancha).
 */
export async function verifyPitchOwnership(
  userId: string,
  pitchId: string,
): Promise<boolean> {
  if (!userId || !pitchId) return false;
  const supabase = getAdminSupabase();

  const { data: pitch, error: pitchErr } = await supabase
    .from('pitches')
    .select('company_id')
    .eq('id', pitchId)
    .maybeSingle();

  if (pitchErr || !pitch?.company_id) return false;

  return verifyCompanyOwnership(userId, pitch.company_id);
}
