/**
 * Utilidades para detección y cálculo de cobro en Contratos / Turnos Fijos.
 * Soporta cobro por sesión o cobro de plan completo (mensualidad anticipada/vencida, quincenal, total).
 */

export type BillingScheme =
  | 'mes_anticipado'
  | 'mes_vencido'
  | 'por_sesion'
  | 'quincenal_anticipado'
  | 'quincenal_vencido'
  | 'total_anticipado';

export interface ContractBillingInfo {
  isContract: boolean;
  contractId: string | null;
  billingScheme: BillingScheme;
  billingSchemeLabel: string;
  isPlanBilling: boolean; // true si es mensual, quincenal o total (no por sesión)
  ratePerSession: number;
  totalSessions: number;
  planTotalPrice: number;
  cycleToCollect: number; // Monto que corresponde cobrar según la modalidad
  cycleLabel: string;
  relatedBookingIds: string[];
}

const SCHEME_LABELS: Record<BillingScheme, string> = {
  mes_anticipado: 'Mensualidad Anticipada',
  mes_vencido: 'Mensualidad Vencida (Crédito)',
  por_sesion: 'Pago por Sesión / Partido',
  quincenal_anticipado: 'Quincenal Anticipado',
  quincenal_vencido: 'Quincenal Vencido (Crédito)',
  total_anticipado: 'Pago Total Anticipado',
};

/**
 * Parsea y extrae la información financiera y de cobro de una reserva de turno fijo.
 */
export function getContractBillingInfo(
  booking: any,
  allBookings?: any[]
): ContractBillingInfo {
  if (!booking) {
    return {
      isContract: false,
      contractId: null,
      billingScheme: 'por_sesion',
      billingSchemeLabel: 'Pago por Sesión',
      isPlanBilling: false,
      ratePerSession: 0,
      totalSessions: 1,
      planTotalPrice: 0,
      cycleToCollect: 0,
      cycleLabel: 'Sesión individual',
      relatedBookingIds: [],
    };
  }

  const bFirst = (Array.isArray(booking?.bookings) && booking.bookings.length > 0) ? booking.bookings[0] : booking;
  const name = String(booking.customer_name || bFirst?.customer_name || '');
  const note = String(booking.note || bFirst?.note || '');
  const rawScheme = String(booking.billing_scheme || bFirst?.billing_scheme || '');
  const isExplicitContract =
    booking.booking_type === 'contract' ||
    bFirst?.booking_type === 'contract' ||
    booking.is_contract === true ||
    bFirst?.is_contract === true ||
    rawScheme.length > 0 ||
    name.includes('[Turno Fijo') ||
    name.includes('[Contrato') ||
    name.includes('[ENTIDAD') ||
    name.includes('[ESCUELA') ||
    note.includes('[TURNO FIJO') ||
    note.includes('CID:') ||
    note.includes('ESQUEMA:');

  if (!isExplicitContract) {
    const singlePrice = Number(booking.total_price || booking.custom_rate || bFirst?.total_price || bFirst?.custom_rate || 0);
    return {
      isContract: false,
      contractId: null,
      billingScheme: 'por_sesion',
      billingSchemeLabel: 'Pago por Sesión',
      isPlanBilling: false,
      ratePerSession: singlePrice,
      totalSessions: 1,
      planTotalPrice: singlePrice,
      cycleToCollect: singlePrice,
      cycleLabel: 'Sesión individual',
      relatedBookingIds: booking.id ? [booking.id] : [],
    };
  }

  // 1. Extraer Contract ID si existe (de booking o de su note)
  let contractId: string | null = booking.contract_id || bFirst?.contract_id || null;
  const cidMatch = note.match(/CID:([a-zA-Z0-9_-]+)/i) || note.match(/contract_id=([a-zA-Z0-9_-]+)/i);
  if (!contractId && cidMatch) contractId = cidMatch[1];

  // 2. Extraer Billing Scheme con detección profunda (booking.billing_scheme, note ESQUEMA:, o texto)
  let scheme: BillingScheme = 'mes_anticipado'; // Para turnos fijos el default es mes_anticipado, no por_sesion
  const candScheme = booking.billing_scheme || bFirst?.billing_scheme;
  if (candScheme && SCHEME_LABELS[candScheme as BillingScheme]) {
    scheme = candScheme as BillingScheme;
  } else {
    const schemeMatch = note.match(/ESQUEMA:([a-z_]+)/i) || note.match(/scheme=([a-z_]+)/i);
    if (schemeMatch && SCHEME_LABELS[schemeMatch[1].toLowerCase() as BillingScheme]) {
      scheme = schemeMatch[1].toLowerCase() as BillingScheme;
    } else if (/mensualidad\s*anticipada|mes_anticipado/i.test(note)) {
      scheme = 'mes_anticipado';
    } else if (/mensualidad\s*vencida|mes_vencido/i.test(note)) {
      scheme = 'mes_vencido';
    } else if (/quincenal\s*anticipado|quincenal_anticipado/i.test(note)) {
      scheme = 'quincenal_anticipado';
    } else if (/quincenal\s*vencido|quincenal_vencido/i.test(note)) {
      scheme = 'quincenal_vencido';
    } else if (/total\s*anticipado|total_anticipado/i.test(note)) {
      scheme = 'total_anticipado';
    } else if (/por\s*sesi[oó]n|por_sesion/i.test(note)) {
      scheme = 'por_sesion';
    } else if (/cobro:\s*mensualidad/i.test(note)) {
      scheme = 'mes_anticipado';
    } else if (booking.payment_method === 'cuenta_cobrar' || booking.payment_method === 'credito' || bFirst?.payment_method === 'cuenta_cobrar' || bFirst?.payment_method === 'credito') {
      // Si el método de pago es a crédito / cuenta por cobrar, es mensualidad vencida
      scheme = 'mes_vencido';
    }
  }

  // 3. Extraer valores financieros base
  const ratePerSession = Number(
    booking.custom_rate ||
    bFirst?.custom_rate ||
    booking.total_price ||
    bFirst?.total_price ||
    (note.match(/TARIFA:(\d+)/i)?.[1]) ||
    0
  );

  let planTotalPrice = Number(
    (note.match(/PLAN_TOTAL:(\d+)/i)?.[1]) ||
    0
  );

  let totalSessions = Number(
    (note.match(/SESIONES:(\d+)/i)?.[1]) ||
    0
  );

  let monthPlanPrice = Number(
    (note.match(/MES_TOTAL:(\d+)/i)?.[1]) ||
    0
  );

  // 4. Buscar reservas hermanas del MISMO contrato únicamente
  let relatedBookings: any[] = [];
  if (Array.isArray(allBookings) && allBookings.length > 0) {
    // Si tenemos contractId (CID:xxx), usamos ESE identificador único para no mezclar con otros contratos
    if (contractId) {
      relatedBookings = allBookings.filter(b =>
        b.contract_id === contractId ||
        (b.note && b.note.includes(`CID:${contractId}`))
      );
    }

    // Fallback: solo si NO existe contractId (contratos antiguos sin CID generado)
    // Agrupamos estrictamente por el nombre completo idéntico (incluyendo día y hora del turno fijo) y cancha
    if (relatedBookings.length === 0 && name) {
      relatedBookings = allBookings.filter(b =>
        b.pitch_id === (booking.pitch_id || bFirst?.pitch_id) &&
        String(b.customer_name || '').trim().toLowerCase() === name.trim().toLowerCase() &&
        !b.note?.includes('CID:') // Solo los que no tienen su propio CID diferente
      );
    }
  }

  const groupBookings: any[] = Array.isArray(booking.bookings) && booking.bookings.length > 0
    ? (relatedBookings.length > booking.bookings.length ? relatedBookings : booking.bookings)
    : (relatedBookings.length > 0 ? relatedBookings : (booking.id ? [booking] : []));

  if (totalSessions <= 0) {
    totalSessions = relatedBookings.length > 0 ? relatedBookings.length : (groupBookings.length || 1);
  }
  if (planTotalPrice <= 0) {
    if (relatedBookings.length > 0) {
      planTotalPrice = relatedBookings.reduce(
        (sum: number, b: any) => sum + Number(b.custom_rate || b.total_price || ratePerSession),
        0
      );
    } else if (totalSessions > 0 && ratePerSession > 0) {
      planTotalPrice = totalSessions * ratePerSession;
    } else {
      planTotalPrice = groupBookings.reduce(
        (sum: number, b: any) => sum + Number(b.custom_rate || b.total_price || ratePerSession),
        0
      );
    }
  }

  // 5. Determinar el ciclo de cobro y monto según el billing_scheme
  // Independiente de qué condiciones financieras elija, excepto si elige 'por_sesion',
  // en cobrar saldo debe salir el total del contrato completo (ej: 4 canchas a 70.000 = 280.000).
  const isPlanBilling = scheme !== 'por_sesion';
  let cycleToCollect = 0;
  let cycleLabel = '';
  let relatedBookingIds: string[] = (relatedBookings.length > 0 ? relatedBookings : groupBookings).map((b: any) => b.id).filter(Boolean);

  if (scheme === 'por_sesion') {
    cycleToCollect = ratePerSession > 0 ? ratePerSession : Number(booking.total_price || 0);
    cycleLabel = 'Sesión individual';
    relatedBookingIds = [booking.id || bFirst?.id].filter(Boolean);
  } else {
    // Para todas las demás condiciones financieras (mes_anticipado, mes_vencido, total_anticipado, quincenal_anticipado, quincenal_vencido):
    // El monto total de cobro es el total del contrato completo.
    const effectiveTotal = planTotalPrice > 0
      ? planTotalPrice
      : (totalSessions > 0 && ratePerSession > 0 ? (totalSessions * ratePerSession) : (groupBookings.length * ratePerSession));

    cycleToCollect = effectiveTotal > 0 ? effectiveTotal : Number(booking.total_price || ratePerSession);
    const countSessions = totalSessions > 0 ? totalSessions : (relatedBookings.length || groupBookings.length);
    cycleLabel = `Contrato Total (${countSessions} ${countSessions === 1 ? 'partido' : 'partidos'})`;
  }

  return {
    isContract: true,
    contractId,
    billingScheme: scheme,
    billingSchemeLabel: SCHEME_LABELS[scheme] || 'Mensualidad',
    isPlanBilling,
    ratePerSession,
    totalSessions,
    planTotalPrice,
    cycleToCollect,
    cycleLabel,
    relatedBookingIds,
  };
}

