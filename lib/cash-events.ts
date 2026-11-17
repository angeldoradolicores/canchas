import { parsePaymentHistory } from '@/lib/remaining-payment-utils';

function bookingIncome(b: any): number {
  return Number(b.total_price || b.pitches?.price_per_hour || 0);
}

/** Anticipo de una reserva (columna deposit_amount o, en reservas en línea viejas, el % de la cancha). */
function bookingDeposit(b: any): number {
  if (b.deposit_amount !== undefined && b.deposit_amount !== null && Number(b.deposit_amount) > 0) {
    return Number(b.deposit_amount);
  }
  if (b.source !== 'owner_panel' && b.pitches && !b.is_loyalty_free) {
    const customPricing = b.pitches.custom_pricing || {};
    if (customPricing.booking_type === 'fixed') return Number(customPricing.booking_fixed || 0);
    const pct = customPricing.booking_percentage || b.pitches.booking_percentage || 50;
    return (bookingIncome(b) * Number(pct)) / 100;
  }
  return 0;
}

/**
 * Movimientos de caja: cada pago cuenta el DÍA EN QUE SE RECIBIÓ, no el día del partido.
 * - Reserva del panel del dueño pagada completa (manual / turno fijo, no a crédito): el día que se registró.
 * - Anticipo de una reserva en línea: el día en que se hizo la reserva.
 * - Cada abono del historial: el día en que se registró el abono. Un abono de turno fijo se guarda
 *   en todas las horas del contrato con el mismo id, así que se cuenta UNA sola vez.
 */
export type CashEvent = { at: number; amount: number; kind: 'deposit' | 'abono' };
export function getCashEvents(bookings: any[]): CashEvent[] {
  const events: CashEvent[] = [];
  const seenPayments = new Set<string>();
  for (const b of bookings) {
    if (!b || b.status !== 'confirmed' || b.is_loyalty_free || b.source === 'loyalty_reward') continue;
    const createdAt = new Date(b.created_at || b.start_time).getTime();
    const method = b.payment_method;
    const paidInFull = b.source === 'owner_panel' && b.payment_status === 'verified'
      && method !== 'credito' && method !== 'cuenta_cobrar';
    const history = parsePaymentHistory(b);
    if (paidInFull && history.length === 0) {
      events.push({ at: createdAt, amount: bookingIncome(b), kind: 'deposit' });
      continue;
    }
    const deposit = bookingDeposit(b);
    if (deposit > 0) events.push({ at: createdAt, amount: deposit, kind: 'deposit' });
    for (const e of history) {
      const amount = Number(e?.amount || 0);
      if (!(amount > 0)) continue;
      const key = e.id || `${b.id}_${e.at}`;
      if (seenPayments.has(key)) continue;
      seenPayments.add(key);
      const at = new Date(e.at || b.updated_at || b.created_at).getTime();
      if (!isNaN(at)) events.push({ at, amount, kind: 'abono' });
    }
  }
  return events;
}


/** Suma de pagos recibidos entre dos fechas (por fecha del pago). */
export function sumCash(events: CashEvent[], from: Date, to: Date) {
  let deposits = 0, abonos = 0;
  for (const ev of events) {
    if (ev.at < from.getTime() || ev.at > to.getTime()) continue;
    if (ev.kind === 'abono') abonos += ev.amount; else deposits += ev.amount;
  }
  return { deposits, abonos, total: deposits + abonos };
}
