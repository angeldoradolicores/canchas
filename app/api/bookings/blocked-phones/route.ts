import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getAuthenticatedUser, isPlatformAdmin } from '@/lib/auth-guard';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Celulares bloqueados por el dueño: no pueden enviar reservas en línea a su complejo.
 * GET    → lista de los complejos del dueño
 * POST   { booking_id, reason? } → bloquea el celular de esa reserva
 * DELETE { company_id, phone }   → desbloquea
 */
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

const phoneKey = (p: string | null | undefined) => {
  const d = (p || '').replace(/\D/g, '');
  return d.length >= 7 ? d.slice(-10) : null;
};

async function ownerCompanies(userId: string, isAdmin: boolean) {
  const sb = admin();
  if (!isAdmin) {
    const { data: profile } = await sb.from('profiles').select('role').eq('id', userId).maybeSingle();
    if (profile?.role !== 'owner') return [] as { id: string; name: string }[];
  }
  const { data } = await sb.from('companies').select('id, name').eq('owner_id', userId);
  return (data || []) as { id: string; name: string }[];
}

async function guard(req: NextRequest) {
  const limit = checkRateLimit(req, { limit: 30, windowSeconds: 60, keyPrefix: 'api:blocked-phones' });
  if (!limit.success) return { error: createRateLimitErrorResponse(limit) };
  const user = await getAuthenticatedUser(req);
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  const companies = await ownerCompanies(user.id, isPlatformAdmin(user));
  if (!companies.length) return { error: NextResponse.json({ error: 'Solo el dueño del complejo puede hacer esto' }, { status: 403 }) };
  return { user, companies };
}

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if ('error' in g) return g.error;
  const { data, error } = await admin()
    .from('booking_blocked_phones')
    .select('company_id, phone, reason, created_at')
    .in('company_id', g.companies.map(c => c.id))
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: 'No se pudo cargar la lista. ¿Ya ejecutaste la migración 2026-11-27?' }, { status: 500 });
  const names = new Map(g.companies.map(c => [c.id, c.name]));
  return NextResponse.json({ blocked: (data || []).map(r => ({ ...r, company_name: names.get(r.company_id) || '' })) });
}

const blockSchema = z.object({
  booking_id: z.string().uuid(),
  reason: z.string().trim().max(200).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const g = await guard(req);
  if ('error' in g) return g.error;
  const parsed = blockSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const sb = admin();
  const { data: booking } = await sb
    .from('bookings')
    .select('id, customer_phone, pitches!inner(company_id)')
    .eq('id', parsed.data.booking_id)
    .maybeSingle();
  const companyId = (booking as any)?.pitches?.company_id as string | undefined;
  if (!booking || !companyId || !g.companies.some(c => c.id === companyId)) {
    return NextResponse.json({ error: 'Esta reserva no es de tu complejo' }, { status: 403 });
  }
  const phone = phoneKey(booking.customer_phone);
  if (!phone) return NextResponse.json({ error: 'Esta reserva no tiene un celular válido para bloquear' }, { status: 400 });

  const { error } = await sb.from('booking_blocked_phones').upsert({
    company_id: companyId,
    phone,
    reason: parsed.data.reason || null,
    created_by: g.user.id,
  }, { onConflict: 'company_id,phone' });
  if (error) return NextResponse.json({ error: 'No se pudo bloquear. ¿Ya ejecutaste la migración 2026-11-27?' }, { status: 500 });
  return NextResponse.json({ success: true, phone, company_id: companyId });
}

const unblockSchema = z.object({
  company_id: z.string().uuid(),
  phone: z.string().regex(/^[0-9]{7,10}$/),
});

export async function DELETE(req: NextRequest) {
  const g = await guard(req);
  if ('error' in g) return g.error;
  const parsed = unblockSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !g.companies.some(c => c.id === parsed.data.company_id)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }
  const { error } = await admin().from('booking_blocked_phones').delete()
    .eq('company_id', parsed.data.company_id).eq('phone', parsed.data.phone);
  if (error) return NextResponse.json({ error: 'No se pudo desbloquear' }, { status: 500 });
  return NextResponse.json({ success: true });
}
