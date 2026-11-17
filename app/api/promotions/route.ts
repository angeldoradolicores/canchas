import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getAuthenticatedUser, verifyCompanyOwnership } from '@/lib/auth-guard';
import { boundedJson } from '@/lib/bounded-json';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';

const uuid = z.string().uuid();
const PROMO_COLUMNS = 'id,company_id,title,required_bookings,gift_hours,redeem_days,weekdays,starts_at,ends_at,active,period,image_url,redeem_pitch_ids,count_pitch_ids';

const campaign = z.object({
  company_id: uuid,
  title: z.string().trim().min(3).max(120),
  period: z.enum(['day', 'week', 'biweek', 'month', 'campaign']),
  required_bookings: z.number().int().min(1).max(1000),
  gift_hours: z.number().int().min(1).max(24),
  // null = el regalo se usa hasta el final de la misma semana/mes.
  redeem_days: z.number().int().min(1).max(365).nullable(),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  ends_at: z.string().datetime(),
  image_url: z.string().max(600).nullable().optional(),
  // null = el regalo se puede usar en cualquier cancha del complejo.
  redeem_pitch_ids: z.array(uuid).min(1).max(50).nullable().optional(),
  // null = cuentan las reservas de cualquier cancha; si no, SOLO las de estas canchas.
  count_pitch_ids: z.array(uuid).min(1).max(50).nullable().optional(),
}).strict();

// Mensajes claros para cada motivo de rechazo del canje (los genera la BD).
const REDEEM_ERRORS: Record<string, string> = {
  PROMO_REWARD_NOT_FOUND: 'Este regalo no pertenece a tu cuenta.',
  PROMO_REWARD_EXPIRED: 'Este regalo ya venció o no le quedan horas.',
  PROMO_NOT_ENOUGH_HOURS: 'Seleccionaste más horas de las que tiene tu regalo. Quita horas o paga las adicionales aparte.',
  PROMO_QUALIFYING_CANCELLED: 'Una de las reservas con las que ganaste este regalo fue cancelada, por eso ya no es válido.',
  PROMO_LOCK_EXPIRED: 'El tiempo para confirmar este horario se agotó. Selecciona la hora de nuevo.',
  PROMO_PAST_SLOT: 'Ese horario ya pasó. Elige uno futuro.',
  PROMO_AFTER_EXPIRY: 'Ese día es posterior al vencimiento del regalo. Elige una fecha anterior.',
  PROMO_SLOT_LENGTH: 'El regalo solo aplica a turnos de una hora.',
  PROMO_WEEKDAY: 'El complejo solo permite usar este regalo en los días indicados en la promoción.',
  PROMO_OTHER_COMPLEX: 'Este regalo solo se puede usar en las canchas del complejo que lo otorgó.',
  PROMO_PITCH: 'Este regalo solo se puede usar en las canchas que indicó el complejo. Elige una de ellas.',
  PROMO_BOOKING_LIST: 'Selecciona de nuevo el horario e inténtalo otra vez.',
};

/** Solo imágenes subidas por este mismo dueño mediante /api/upload (tipo promotion). */
function isOwnPromotionImage(url: string, userId: string) {
  const file = `/promotions/${userId}/[0-9]+_[a-z0-9]+\\.webp$`;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const bases = ['/api/media'];
  const r2 = (process.env.R2_PUBLIC_DOMAIN || '').replace(/\/$/, '');
  if (r2.startsWith('https://')) bases.push(r2);
  const sb = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  if (sb.startsWith('https://')) bases.push(`${sb}/storage/v1/object/public/pitch-images`);
  return bases.some(b => new RegExp('^' + esc(b) + file).test(url));
}

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: NextRequest) {
  try {
    const service = db();
    const user = await getAuthenticatedUser(req);
    const company = req.nextUrl.searchParams.get('company_id');
    if (company && !uuid.safeParse(company).success) return NextResponse.json({ error: 'Complejo inválido' }, { status: 400 });

    const loadPromos = (columns: string) => {
      let query = service.from('complex_promotions').select(columns).eq('active', true).gt('ends_at', new Date().toISOString());
      if (company) query = query.eq('company_id', company);
      return query.order('starts_at', { ascending: false }).limit(100);
    };
    let { data: promoRows, error } = await loadPromos(PROMO_COLUMNS);
    // Si aún no se ejecutó la migración 2026-11-29 (count_pitch_ids), se cargan sin esa columna.
    if (error && error.message?.includes('count_pitch_ids')) {
      ({ data: promoRows, error } = await loadPromos(PROMO_COLUMNS.replace(',count_pitch_ids', '')));
    }
    if (error) throw error;
    // Nombres de las canchas donde se puede usar cada regalo (para mostrarlos al jugador).
    const pitchIds = [...new Set((promoRows || []).flatMap((p: any) => [...(p.redeem_pitch_ids || []), ...(p.count_pitch_ids || [])]))];
    const { data: pitchRows } = pitchIds.length
      ? await service.from('pitches').select('id,name').in('id', pitchIds)
      : { data: [] as { id: string; name: string }[] };
    const pitchName = new Map((pitchRows || []).map((p: any) => [p.id, p.name]));
    const promotions = (promoRows || []).map((p: any) => ({
      ...p,
      redeem_pitches: p.redeem_pitch_ids ? p.redeem_pitch_ids.map((id: string) => ({ id, name: pitchName.get(id) || 'Cancha' })) : null,
      count_pitches: p.count_pitch_ids ? p.count_pitch_ids.map((id: string) => ({ id, name: pitchName.get(id) || 'Cancha' })) : null,
    }));

    const { data: rewards, error: rewardError } = user
      ? await service.from('promotion_rewards')
        .select('id,promotion_id,hours,remaining,expires_at,earned_at,celebrated_at,period_start, complex_promotions(title,company_id,weekdays,period,image_url,redeem_pitch_ids,companies(name))')
        .eq('user_id', user.id).gt('remaining', 0).gt('expires_at', new Date().toISOString())
        .order('earned_at', { ascending: false }).limit(100)
      : { data: [], error: null };
    if (rewardError) throw rewardError;

    const { data: companies } = user ? await service.from('companies').select('id,name').eq('owner_id', user.id) : { data: [] };
    const companyIds = (companies || []).map((c: any) => c.id);
    const { data: ownPitches } = companyIds.length
      ? await service.from('pitches').select('id,name,company_id').in('company_id', companyIds).order('name')
      : { data: [] };
    return NextResponse.json({ promotions, rewards, companies, pitches: ownPitches || [] },{ headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'No se pudieron consultar las promociones' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
    if (req.headers.get('origin') !== req.nextUrl.origin) return NextResponse.json({ error: 'Origen inválido' }, { status: 403 });
    const limit = checkRateLimit(req, { limit: 15, windowSeconds: 60, keyPrefix: 'promotions', identifier: user.id });
    if (!limit.success) return createRateLimitErrorResponse(limit);
    const body = await boundedJson(req, 6000);
    const service = db();

    // El usuario marca como vista la celebración de su bono.
    if (body.action === 'ack') {
      const parsed = z.object({ action: z.literal('ack'), reward_id: uuid }).strict().safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
      await service.from('promotion_rewards').update({ celebrated_at: new Date().toISOString() })
        .eq('id', parsed.data.reward_id).eq('user_id', user.id).is('celebrated_at', null);
      return NextResponse.json({ success: true });
    }

    if (body.action === 'redeem') {
      const parsed = z.object({
        action: z.literal('redeem'), reward_id: uuid, booking_ids: z.array(uuid).min(1).max(24),
        customer_name: z.string().trim().min(2).max(100).optional(),
        customer_phone: z.string().trim().regex(/^[0-9+ ()-]{7,20}$/).optional(),
      }).strict().safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: 'Selecciona de nuevo el horario e inténtalo otra vez.' }, { status: 400 });
      const { data, error } = await service.rpc('redeem_complex_reward', { p_reward: parsed.data.reward_id, p_user: user.id, p_ids: parsed.data.booking_ids });
      if (error) {
        const code = Object.keys(REDEEM_ERRORS).find(k => error.message?.includes(k));
        return NextResponse.json({ error: code ? REDEEM_ERRORS[code] : 'No se pudo aplicar el regalo. Inténtalo de nuevo.', code: code || null }, { status: 409 });
      }
      let rows = (data || []) as any[];
      // Datos de contacto para que el dueño sepa quién juega (solo en las reservas recién canjeadas por este usuario).
      if (rows.length && (parsed.data.customer_name || parsed.data.customer_phone)) {
        const { data: updated } = await service.from('bookings')
          .update({
            ...(parsed.data.customer_name ? { customer_name: parsed.data.customer_name } : {}),
            ...(parsed.data.customer_phone ? { customer_phone: parsed.data.customer_phone } : {}),
          })
          .in('id', rows.map(r => r.id)).eq('user_id', user.id).eq('source', 'loyalty_reward').select();
        if (updated?.length) rows = updated;
      }
      return NextResponse.json({ success: true, data: rows.map(({ lock_token, ...b }: any) => b) });
    }

    if (body.action === 'stop') {
      const parsed = z.object({ action: z.literal('stop'), id: uuid }).strict().safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
      const { data: p } = await service.from('complex_promotions').select('company_id').eq('id', parsed.data.id).single();
      if (!p || !await verifyCompanyOwnership(user.id, p.company_id)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
      const { error } = await service.from('complex_promotions').update({ active: false }).eq('id', parsed.data.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    // ── Crear promoción: solo el dueño aprobado del complejo ──
    const parsed = campaign.safeParse(body);
    if (!parsed.success || new Date(parsed.data.ends_at).getTime() <= Date.now())
      return NextResponse.json({ error: 'Revisa los datos y la fecha de finalización' }, { status: 400 });
    const promo = parsed.data;
    if (promo.period === 'campaign' && promo.redeem_days === null)
      return NextResponse.json({ error: 'Indica cuántos días tiene el cliente para usar el regalo' }, { status: 400 });
    if (promo.image_url && !isOwnPromotionImage(promo.image_url, user.id))
      return NextResponse.json({ error: 'La imagen debe subirse desde este formulario' }, { status: 400 });
    if (!await verifyCompanyOwnership(user.id, promo.company_id))
      return NextResponse.json({ error: 'Solo el dueño aprobado puede crear promociones' }, { status: 403 });
    const redeemPitchIds = promo.redeem_pitch_ids?.length ? [...new Set(promo.redeem_pitch_ids)] : null;
    const countPitchIds = promo.count_pitch_ids?.length ? [...new Set(promo.count_pitch_ids)] : null;
    const allPitchIds = [...new Set([...(redeemPitchIds || []), ...(countPitchIds || [])])];
    if (allPitchIds.length) {
      const { data: own } = await service.from('pitches').select('id').eq('company_id', promo.company_id).in('id', allPitchIds);
      if ((own || []).length !== allPitchIds.length)
        return NextResponse.json({ error: 'Elige solo canchas de este complejo' }, { status: 400 });
    }

    const { error: expiryError } = await service.from('complex_promotions').update({ active: false })
      .eq('company_id', promo.company_id).eq('active', true).lte('ends_at', new Date().toISOString());
    if (expiryError) throw expiryError;
    const { error } = await service.from('complex_promotions').insert({
      ...promo,
      weekdays: [...new Set(promo.weekdays)].sort(),
      image_url: promo.image_url || null,
      redeem_pitch_ids: redeemPitchIds,
      count_pitch_ids: countPitchIds,
      created_by: user.id,
    });
    if (error) {
      const tooMany = error.message?.includes('Too many active promotions');
      const periodPending = error.message?.includes('complex_promotions_period_check');
      const pitchPending = error.message?.includes('count_pitch_ids');
      return NextResponse.json({
        error: tooMany ? 'Puedes tener máximo 10 promociones activas. Finaliza alguna para publicar otra.'
          : periodPending ? 'Esta forma de contar aún no está activa. Elige semana, mes o toda la promoción.'
          : pitchPending ? 'Falta activar las promociones por cancha (migración 2026-11-29).'
          : 'No se pudo crear la promoción. Inténtalo de nuevo.',
      }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'No se pudo procesar la promoción' }, { status: 400 });
  }
}
