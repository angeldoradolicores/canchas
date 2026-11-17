import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Alertas de seguridad para el superadmin (migración 2026-11-28).
 *
 * Cuando alguien choca con los límites anti-acaparamiento o intenta reservar con un
 * celular bloqueado, se registra una alerta y se avisa a los superadmins. Los intentos
 * repetidos de la misma persona/red en las últimas 2 horas se suman a la misma alerta.
 */

const CODES = [
  'QUOTA_DRAFT_GUEST', 'QUOTA_DRAFT_USER', 'QUOTA_DRAFT_IP',
  'QUOTA_PENDING_PHONE', 'QUOTA_PENDING_DEVICE', 'QUOTA_PENDING_IP', 'BLOCKED_PHONE',
] as const;

export const ALERT_LABELS: Record<string, string> = {
  QUOTA_DRAFT_GUEST: 'Invitado intentó apartar demasiadas horas',
  QUOTA_DRAFT_USER: 'Usuario intentó apartar demasiadas horas',
  QUOTA_DRAFT_IP: 'Muchas horas apartadas desde la misma red',
  QUOTA_PENDING_PHONE: 'Muchas reservas del mismo celular en un día',
  QUOTA_PENDING_DEVICE: 'Muchas reservas del mismo dispositivo en un día',
  QUOTA_PENDING_IP: 'Muchas reservas desde la misma red en un día',
  BLOCKED_PHONE: 'Celular bloqueado intentó reservar',
};

/** Intentos de "apartar" que puede hacer un jugador normal antes de avisar (se equivoca, recarga…). */
const DRAFT_NOTIFY_AT = 3;

export function quotaCodeOf(err: { message?: string } | null | undefined): string | null {
  const msg = err?.message || '';
  return CODES.find(c => msg.includes(c)) || null;
}

const phoneKey = (p: string | null | undefined) => {
  const d = (p || '').replace(/\D/g, '');
  return d.length >= 7 ? d.slice(-10) : null;
};

export async function reportSecurityAlert(sb: SupabaseClient, input: {
  code: string;
  pitchId?: string | null;
  phone?: string | null;
  customerName?: string | null;
  userId?: string | null;
  ipHash?: string | null;
  deviceToken?: string | null;
}) {
  try {
    const phone = phoneKey(input.phone);
    let companyId: string | null = null;
    let pitchName = '';
    let companyName = '';
    if (input.pitchId) {
      const { data } = await sb.from('pitches').select('name, company_id, companies(name)').eq('id', input.pitchId).maybeSingle();
      companyId = (data as any)?.company_id || null;
      pitchName = (data as any)?.name || '';
      companyName = (data as any)?.companies?.name || '';
    }

    // ¿Ya hay una alerta abierta de esta misma persona/red en las últimas 2 horas?
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const who = [
      phone && `phone.eq.${phone}`,
      input.userId && `user_id.eq.${input.userId}`,
      input.deviceToken && `device_token.eq.${input.deviceToken}`,
      input.ipHash && `ip_hash.eq.${input.ipHash}`,
    ].filter(Boolean).join(',');
    let existing: { id: string; attempts: number } | null = null;
    if (who) {
      let q = sb.from('security_alerts').select('id, attempts')
        .eq('code', input.code).is('resolved_at', null).gte('last_seen_at', since).or(who)
        .order('last_seen_at', { ascending: false }).limit(1);
      q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null);
      existing = ((await q).data?.[0] as any) || null;
    }

    let attempts = 1;
    if (existing) {
      attempts = existing.attempts + 1;
      await sb.from('security_alerts').update({
        attempts,
        last_seen_at: new Date().toISOString(),
        ...(phone ? { phone } : {}),
        ...(input.customerName ? { customer_name: input.customerName.slice(0, 120) } : {}),
      }).eq('id', existing.id);
    } else {
      await sb.from('security_alerts').insert({
        code: input.code,
        company_id: companyId,
        pitch_id: input.pitchId || null,
        phone,
        customer_name: input.customerName?.slice(0, 120) || null,
        user_id: input.userId || null,
        ip_hash: input.ipHash || null,
        device_token: input.deviceToken || null,
      });
    }

    // Avisar una sola vez por alerta: los intentos de apartar horas de un jugador normal
    // pueden ser un error, así que esperan a varios intentos; lo demás avisa de inmediato.
    const isDraftPerson = input.code === 'QUOTA_DRAFT_GUEST' || input.code === 'QUOTA_DRAFT_USER';
    const shouldNotify = isDraftPerson ? attempts === DRAFT_NOTIFY_AT : attempts === 1;
    if (!shouldNotify) return;

    const { data: admins } = await sb.from('profiles').select('id').eq('role', 'superadmin').limit(20);
    if (!admins?.length) return;

    const title = '🚨 Posible reserva masiva';
    const where = [companyName, pitchName].filter(Boolean).join(' · ');
    const message = `${ALERT_LABELS[input.code] || input.code}${where ? ` en ${where}` : ''}${phone ? ` (cel. ${phone})` : ''}. Revisa en Super Admin.`;

    await sb.from('notifications').insert(admins.map(a => ({
      user_id: a.id, title, message, type: 'security_alert', is_read: false,
    })));

    if (process.env.INTERNAL_API_SECRET) {
      const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      await Promise.all(admins.map(a => fetch(`${base}/api/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET! },
        body: JSON.stringify({ userId: a.id, title, message, url: '/jogoa' }),
      }).catch(() => null)));
    }
  } catch (err) {
    // Nunca debe romper la reserva: la alerta es informativa.
    console.error('[security-alerts]', err);
  }
}
