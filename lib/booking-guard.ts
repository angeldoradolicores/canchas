import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';
import { getClientIp } from '@/lib/rate-limit';

/** Horas que un invitado (sin cuenta) puede apartar a la vez. Debe coincidir con la migración 2026-11-27. */
export const GUEST_MAX_HOURS = 2;
/** Horas que un jugador con cuenta puede apartar a la vez. */
export const USER_MAX_HOURS = 4;

/**
 * Huella de la red del cliente: hash de la IP con una sal secreta.
 * Nunca se guarda la IP real en la base de datos.
 */
export function hashClientIp(req: NextRequest): string | null {
  const ip = getClientIp(req);
  if (!ip || ip === 'unknown') return null;
  const salt = process.env.BOOKING_IP_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

const QUOTA_MESSAGES: Record<string, string> = {
  QUOTA_DRAFT_GUEST: `Como invitado puedes apartar hasta ${GUEST_MAX_HOURS} horas a la vez. Termina tu reserva actual o crea tu cuenta gratis para reservar hasta ${USER_MAX_HOURS} horas.`,
  QUOTA_DRAFT_USER: `Puedes apartar hasta ${USER_MAX_HOURS} horas a la vez. Termina tu reserva actual antes de apartar más.`,
  QUOTA_DRAFT_IP: 'Desde esta red ya hay muchas horas apartadas en este momento. Espera unos minutos e inténtalo de nuevo.',
  QUOTA_PENDING_PHONE: 'Este celular ya tiene el máximo de reservas por aprobar en este complejo para ese día. Espera a que el complejo las revise o comunícate con ellos.',
  QUOTA_PENDING_DEVICE: 'Ya tienes el máximo de reservas por aprobar en este complejo para ese día. Espera a que el complejo las revise o crea tu cuenta para reservar más horas.',
  QUOTA_PENDING_IP: 'Desde esta red ya hay muchas reservas por aprobar en este complejo para ese día. Comunícate con el complejo.',
  BLOCKED_PHONE: 'Este complejo no recibe reservas en línea de este celular. Comunícate directamente con el complejo.',
};

/** Traduce los códigos del trigger enforce_booking_quota a un mensaje para el jugador. */
export function quotaErrorMessage(err: { message?: string } | null | undefined): string | null {
  const msg = err?.message || '';
  for (const code of Object.keys(QUOTA_MESSAGES)) {
    if (msg.includes(code)) return QUOTA_MESSAGES[code];
  }
  return null;
}

/**
 * Verifica el CAPTCHA invisible de Cloudflare Turnstile.
 * Si TURNSTILE_SECRET_KEY no está configurada, no se exige (la app sigue funcionando).
 */
export async function verifyTurnstile(token: string | null | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== 'unknown') body.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    // Si Cloudflare no responde, no bloqueamos a jugadores reales: los límites de la base de datos siguen activos.
    return true;
  }
}
