/**
 * Hook para obtener la fecha actual solo en el cliente.
 * Evita el error de hydration mismatch en Next.js.
 */
import { useState, useEffect } from 'react';

export function useToday(): string {
  const [today, setToday] = useState('');

  useEffect(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const localToday = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    setToday(localToday);
  }, []);

  return today;
}

/** Horas disponibles de 06:00 a 22:00 en formato 24h */
export const BOOKING_HOURS = Array.from({ length: 17 }, (_, i) => {
  const h = i + 6;
  return `${h.toString().padStart(2, '0')}:00`;
});
