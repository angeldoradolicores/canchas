import { parsePaymentHistory } from '@/lib/remaining-payment-utils';

/**
 * DINERO DE LAS RESERVAS — una sola regla para dashboard, reportes y trazabilidad
 * (la misma que usa la gestión de reservas para mostrar "Saldo"):
 *
 *   Recibido   = anticipo + abonos. Cada pago cuenta el DÍA EN QUE SE RECIBIÓ, no el día del partido.
 *   Por cobrar = valor de la reserva − lo recibido.
 *
 * Una reserva manual o un turno fijo SIN anticipo ni abonos no suma nada a la caja: queda por cobrar
 * (aunque se haya guardado como "aprobada"). Un abono de turno fijo se guarda en todas las horas del
 * contrato con el mismo id, así que se cuenta UNA sola vez y cubre primero los partidos más próximos.
 */

export function bookingIncome(b: any): number {
  return Number(b.total_price || b.pitches?.price_per_hour || 0);
}

/** Anticipo de una reserva (columna deposit_amount o, en reservas en línea viejas, el % de la cancha). */
export function bookingDeposit(b: any): number {
  if (b.deposit_amount !== undefined && b.deposit_amount !== null && Number(b.deposit_amount) > 0) {
    return Number(b.deposit_amount);
  }
  if (b.source !== 'owner_panel' && b.booking_type !== 'contract' && b.pitches && !b.is_loyalty_free) {
    const customPricing = b.pitches.custom_pricing || {};
    if (customPricing.booking_type === 'fixed') return Number(customPricing.booking_fixed || 0);
    const pct = customPricing.booking_percentage || b.pitches.booking_percentage || 50;
    return (bookingIncome(b) * Number(pct)) / 100;
  }
  return 0;
}

const countsForMoney = (b: any) =>
  !!b && b.status === 'confirmed' && !b.is_loyalty_free && b.source !== 'loyalty_reward';

export type CashEvent = {
  at: number;
  amount: number;
  kind: 'deposit' | 'abono';
  key: string;
  bookingId: string;
  pitchId: string;
  customer: string;
  pitch: string;
  method: string;
  notes: string;
};

/** Cada pago recibido (anticipos y abonos), sin duplicar los abonos compartidos de un turno fijo. */
export function getCashEvents(bookings: any[]): CashEvent[] {
  const events: CashEvent[] = [];
  const seenPayments = new Set<string>();
  for (const b of bookings) {
    if (!countsForMoney(b)) continue;
    const base = {
      bookingId: b.id,
      pitchId: String(b.pitch_id || ''),
      customer: String(b.customer_name || 'Cliente'),
      pitch: String(b.pitches?.name || 'Cancha'),
    };
    const deposit = bookingDeposit(b);
    if (deposit > 0) {
      events.push({
        ...base, at: new Date(b.created_at || b.start_time).getTime(), amount: deposit, kind: 'deposit',
        key: `dep_${b.id}`, method: b.payment_method || '', notes: 'Anticipo al reservar',
      });
    }
    for (const e of parsePaymentHistory(b)) {
      const amount = Number(e?.amount || 0);
      if (!(amount > 0)) continue;
      const key = e.id || `${b.id}_${e.at}`;
      if (seenPayments.has(key)) continue;
      seenPayments.add(key);
      const at = new Date(e.at || b.updated_at || b.created_at).getTime();
      if (!isNaN(at)) events.push({ ...base, at, amount, kind: 'abono', key, method: e.method || '', notes: e.notes || '' });
    }
  }
  return events.sort((a, b) => a.at - b.at);
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

/**
 * Saldo pendiente de cada reserva confirmada (id → pesos).
 * Las reservas que comparten un abono (turno fijo, varias horas) forman un grupo: lo pagado en el
 * grupo cubre primero los partidos más próximos, así lo que queda por cobrar cae en los últimos.
 */
export function getOutstandingMap(bookings: any[]): Map<string, number> {
  const list = bookings.filter(countsForMoney);
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const b of list) parent.set(b.id, b.id);
  const ownerOfPayment = new Map<string, string>();
  for (const b of list) {
    for (const e of parsePaymentHistory(b)) {
      if (!e?.id) continue;
      const other = ownerOfPayment.get(e.id);
      if (other) parent.set(find(b.id), find(other));
      else ownerOfPayment.set(e.id, b.id);
    }
  }

  const groups = new Map<string, any[]>();
  for (const b of list) {
    const r = find(b.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(b);
  }

  const out = new Map<string, number>();
  for (const group of groups.values()) {
    let pool = getCashEvents(group).reduce((s, ev) => s + ev.amount, 0);
    group.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    for (const b of group) {
      const price = bookingIncome(b);
      const covered = Math.min(price, pool);
      pool -= covered;
      out.set(b.id, Math.max(0, price - covered));
    }
  }
  return out;
}

/** Abonos de un cliente/contrato con el saldo que quedó después de cada uno. */
export function getPaymentLedger(bookings: any[]) {
  const billed = bookings.filter(countsForMoney).reduce((s, b) => s + bookingIncome(b), 0);
  let paid = 0;
  const rows = getCashEvents(bookings).map(ev => {
    paid += ev.amount;
    return { ...ev, paidSoFar: paid, remaining: Math.max(0, billed - paid) };
  });
  return { billed, paid, remaining: Math.max(0, billed - paid), rows };
}
