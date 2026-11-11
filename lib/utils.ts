import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Verifica si un horario ya pasó para una fecha dada (hora oficial de Colombia America/Bogota).
 * @param selectedDate Fecha en formato 'YYYY-MM-DD'
 * @param slot Hora en formato 'HH:mm' (ej: '10:00')
 * @param graceMinutes Minutos de gracia tras iniciada la hora (ej: 5 min -> 10:00 se permite hasta 10:05)
 * @returns boolean true si la hora ya pasó y superó los minutos de gracia
 */
export function isSlotPassed(selectedDate: string, slot: string, graceMinutes: number = 5): boolean {
  if (!selectedDate || !slot) return false;

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
  const currentHour = parseInt(getPart('hour'), 10);
  const currentMinute = parseInt(getPart('minute'), 10);

  // Si la fecha seleccionada es un día anterior a hoy
  if (selectedDate < currentYMD) return true;
  // Si la fecha seleccionada es un día futuro
  if (selectedDate > currentYMD) return false;

  // Si la fecha seleccionada es hoy
  const [slotHStr, slotMStr] = slot.split(':');
  const slotH = parseInt(slotHStr, 10);
  const slotM = parseInt(slotMStr || '0', 10);

  const currentTotalMinutes = currentHour * 60 + currentMinute;
  const slotTotalMinutes = slotH * 60 + slotM;

  return currentTotalMinutes > (slotTotalMinutes + graceMinutes);
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
