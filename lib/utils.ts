import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Minutos de tolerancia para reservar (y subir el comprobante) después de iniciada la hora.
 * Con 10, la hora de las 7:00 se puede reservar hasta las 7:09:59 y se cierra a las 7:10:00.
 * Con 0 se cerraría exactamente al empezar.
 */
export const BOOKING_GRACE_MINUTES = 10;
/**
 * Desde cuántos minutos antes del cierre se avisa al jugador. Si hay tolerancia, se avisa
 * desde que la hora empieza (toda la tolerancia), y nunca menos de 5 minutos.
 */
export const BOOKING_CLOSE_WARNING_MINUTES = Math.max(5, BOOKING_GRACE_MINUTES);

function bogotaNowParts(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    seconds: parseInt(get('hour'), 10) * 3600 + parseInt(get('minute'), 10) * 60 + parseInt(get('second'), 10),
  };
}

function slotStartSeconds(slot: string) {
  const [h, m] = slot.split(':');
  return parseInt(h, 10) * 3600 + parseInt(m || '0', 10) * 60;
}

/**
 * Verifica si un horario ya se cerró para reservar (hora oficial de Colombia America/Bogota).
 * Con la gracia en 0, la hora de las 7:00 se cierra exactamente a las 7:00:00.
 */
export function isSlotPassed(selectedDate: string, slot: string, graceMinutes: number = BOOKING_GRACE_MINUTES, now: Date = new Date()): boolean {
  if (!selectedDate || !slot) return false;
  const cur = bogotaNowParts(now);
  if (selectedDate < cur.ymd) return true;
  if (selectedDate > cur.ymd) return false;
  return cur.seconds >= slotStartSeconds(slot) + graceMinutes * 60;
}

/**
 * Segundos que faltan para que se cierre la reserva de un horario de HOY,
 * solo si quedan menos de `warnMinutes`. Si falta más, es otro día o ya cerró: null.
 */
export function getSlotSecondsToClose(selectedDate: string, slot: string, warnMinutes: number = BOOKING_CLOSE_WARNING_MINUTES, now: Date = new Date()): number | null {
  if (!selectedDate || !slot) return null;
  const cur = bogotaNowParts(now);
  if (selectedDate !== cur.ymd) return null;
  const left = slotStartSeconds(slot) + BOOKING_GRACE_MINUTES * 60 - cur.seconds;
  return left > 0 && left <= warnMinutes * 60 ? left : null;
}

/**
 * Retorna los minutos transcurridos desde que empezó el slot para hoy (0 si no ha empezado o es otro día).
 */
export function getSlotElapsedMinutes(selectedDate: string, slot: string): number {
  if (!selectedDate || !slot) return 0;

  const now = new Date();
  const colombiaFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = colombiaFormatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';
  const currentYMD = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  if (selectedDate !== currentYMD) return 0;

  const currentHour = parseInt(getPart('hour'), 10);
  const currentMinute = parseInt(getPart('minute'), 10);
  const [slotHStr, slotMStr] = slot.split(':');
  const slotH = parseInt(slotHStr, 10);
  const slotM = parseInt(slotMStr || '0', 10);

  const diff = (currentHour * 60 + currentMinute) - (slotH * 60 + slotM);
  return diff > 0 ? diff : 0;
}

/** 125 → "2 min 05 s" */
export function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return m > 0 ? `${m} min ${String(sec).padStart(2, '0')} s` : `${sec} s`;
}

/** Hora en que se cierra la reserva de un horario: "07:00" con 10 min de tolerancia → "7:10". */
export function slotCloseLabel(slot: string, graceMinutes: number = BOOKING_GRACE_MINUTES): string {
  const total = slotStartSeconds(slot) / 60 + graceMinutes;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}
