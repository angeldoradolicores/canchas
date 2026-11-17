import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { createClient, type User } from '@supabase/supabase-js';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';
import { ALERT_LABELS } from '@/lib/security-alerts';

export const dynamic = 'force-dynamic';

/**
 * Seguridad de reservas — SOLO superadmin (con segundo factor, aal2).
 * GET                                        → alertas abiertas + celulares bloqueados
 * POST   { action:'block', company_id, phone, reason?, alert_id? } → bloquea el celular en ese complejo
 * POST   { action:'resolve', alert_id }      → marca la alerta como revisada
 * DELETE { company_id, phone }               → desbloquea
 */
const NO_STORE = { 'Cache-Control': 'private, no-store' };

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function hasMfa(user: User) {
  const jar = await cookies();
  const sessionClient = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => jar.getAll(), setAll: () => {} },
  });
  const { data: claims, error } = await sessionClient.auth.getClaims();
  return !error && claims?.claims.sub === user.id && claims?.claims.aal === 'aal2';
}

async function guard(req: NextRequest) {
  const limit = checkRateLimit(req, { limit: 60, windowSeconds: 60, keyPrefix: 'api:admin-security' });
  if (!limit.success) return { error: createRateLimitErrorResponse(limit) };
  const user = await getAuthenticatedUser(req);
  if (!user) return { error: NextResponse.json({ error: 'Inicia sesión' }, { status: 401 }) };
  // El rol de plataforma solo se lee de app_metadata (el usuario no puede editarlo).
  if (user.app_metadata?.role !== 'superadmin') {
    return { error: NextResponse.json({ error: 'Solo superadministradores' }, { status: 403 }) };
  }
  if (!await hasMfa(user)) {
    return { error: NextResponse.json({ error: 'Verifica tu segundo factor', mfaRequired: true }, { status: 403, headers: NO_STORE }) };
  }
  return { user };
}

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if ('error' in g) return g.error;
  const sb = db();
  const [alertsRes, blockedRes] = await Promise.all([
    sb.from('security_alerts')
      .select('id, code, company_id, pitch_id, phone, customer_name, user_id, ip_hash, attempts, created_at, last_seen_at, companies(name), pitches(name)')
      .is('resolved_at', null)
      .order('last_seen_at', { ascending: false })
      .limit(200),
    sb.from('booking_blocked_phones')
      .select('company_id, phone, reason, created_at, companies(name)')
      .order('created_at', { ascending: false })
      .limit(500),
  ]);
  if (alertsRes.error || blockedRes.error) {
    return NextResponse.json({ error: 'No se pudo cargar. ¿Ya ejecutaste la migración 2026-11-28?' }, { status: 500 });
  }
  const { data: companies } = await sb.from('companies').select('id, name').order('name').limit(1000);
  return NextResponse.json({
    alerts: (alertsRes.data || []).map((a: any) => ({
      ...a,
      label: ALERT_LABELS[a.code] || a.code,
      company_name: a.companies?.name || '',
      pitch_name: a.pitches?.name || '',
      companies: undefined,
      pitches: undefined,
    })),
    blocked: (blockedRes.data || []).map((b: any) => ({ ...b, company_name: b.companies?.name || '', companies: undefined })),
    companies: companies || [],
  }, { headers: NO_STORE });
}

const postSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('block'),
    company_id: z.string().uuid(),
    phone: z.string().trim().max(20),
    reason: z.string().trim().max(200).optional().nullable(),
    alert_id: z.string().uuid().optional(),
  }),
  z.object({ action: z.literal('resolve'), alert_id: z.string().uuid() }),
]);

export async function POST(req: NextRequest) {
  const g = await guard(req);
  if ('error' in g) return g.error;
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  const sb = db();
  const now = new Date().toISOString();

  if (parsed.data.action === 'resolve') {
    const { error } = await sb.from('security_alerts').update({ resolved_at: now, resolved_by: g.user.id }).eq('id', parsed.data.alert_id);
    if (error) return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const digits = parsed.data.phone.replace(/\D/g, '');
  const phone = digits.length >= 7 ? digits.slice(-10) : null;
  if (!phone) return NextResponse.json({ error: 'Celular inválido' }, { status: 400 });

  const { error } = await sb.from('booking_blocked_phones').upsert({
    company_id: parsed.data.company_id,
    phone,
    reason: parsed.data.reason || null,
    created_by: g.user.id,
  }, { onConflict: 'company_id,phone' });
  if (error) return NextResponse.json({ error: 'No se pudo bloquear' }, { status: 500 });

  // Libera las horas que ese celular tenga pendientes en el complejo (reservas en línea, no del dueño).
  const { data: pitches } = await sb.from('pitches').select('id').eq('company_id', parsed.data.company_id);
  const pitchIds = (pitches || []).map(p => p.id);
  let released = 0;
  if (pitchIds.length) {
    const { data: pend } = await sb.from('bookings')
      .select('id, customer_phone')
      .in('pitch_id', pitchIds)
      .in('status', ['pending', 'draft'])
      .or('source.is.null,source.neq.owner_panel')
      .limit(500);
    const ids = (pend || []).filter(b => (b.customer_phone || '').replace(/\D/g, '').slice(-10) === phone).map(b => b.id);
    if (ids.length) {
      await sb.from('bookings').update({ status: 'cancelled', payment_status: 'rejected', reviewed_at: now }).in('id', ids);
      released = ids.length;
    }
  }

  if (parsed.data.alert_id) {
    await sb.from('security_alerts').update({ resolved_at: now, resolved_by: g.user.id }).eq('id', parsed.data.alert_id);
  }
  return NextResponse.json({ success: true, phone, released });
}

const unblockSchema = z.object({
  company_id: z.string().uuid(),
  phone: z.string().regex(/^[0-9]{7,10}$/),
});

export async function DELETE(req: NextRequest) {
  const g = await guard(req);
  if ('error' in g) return g.error;
  const parsed = unblockSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  const { error } = await db().from('booking_blocked_phones').delete()
    .eq('company_id', parsed.data.company_id).eq('phone', parsed.data.phone);
  if (error) return NextResponse.json({ error: 'No se pudo desbloquear' }, { status: 500 });
  return NextResponse.json({ success: true });
}
