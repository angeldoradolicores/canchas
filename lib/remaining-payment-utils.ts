/**
 * Utilidades para la gestión del Pago Restante (Saldo Pendiente en Local)
 * Cancheros - Gestión de Pagos
 */

export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'other' | 'split';

export interface PaymentSplitItem {
  method: PaymentMethod;
  amount: number;
}

export interface RemainingPaymentData {
  status: 'completed' | 'pending';
  method: PaymentMethod | string;
  amount: number;
  proofUrl: string | null;
  notes: string;
  at: string;
  by?: string;
  splits?: PaymentSplitItem[];
}

export const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: string; shortLabel: string }[] = [
  { id: 'cash', label: 'Efectivo', icon: '💵', shortLabel: 'Efectivo' },
  { id: 'transfer', label: 'Transferencia', icon: '📲', shortLabel: 'Transferencia' },
  { id: 'card', label: 'Tarjeta / Datáfono', icon: '💳', shortLabel: 'Tarjeta' },
  { id: 'other', label: 'Otro Medio', icon: '', shortLabel: 'Otro' },
];

/**
 * Formatea el método de pago a texto legible (incluye soporte para pagos divididos)
 */
export function formatPaymentMethod(method?: string | null, splits?: PaymentSplitItem[]): string {
  if (splits && splits.length > 1) {
    return splits
      .filter(s => s.amount > 0)
      .map(s => {
        const found = PAYMENT_METHODS.find(m => m.id === s.method);
        const name = found ? found.shortLabel : s.method;
        return `${name} ($${s.amount.toLocaleString('es-CO')})`;
      })
      .join(' + ');
  }

  if (!method) return 'No especificado';
  if (method === 'split') return 'Pago Mixto / Dividido';
  if (method === 'nequi' || method === 'daviplata') return 'Transferencia';

  const found = PAYMENT_METHODS.find(m => m.id === method);
  return found ? found.label : method;
}

/**
 * Extrae la información del pago restante de una reserva,
 * soportando tanto columnas nativas como fallback codificado en payment_proof_url.
 */
export function getBookingRemainingPayment(booking: any): RemainingPaymentData | null {
  if (!booking) return null;

  // 1. Columnas nativas de Supabase si existen
  if (booking.remaining_payment_status === 'completed' || (booking.remaining_payment_amount && Number(booking.remaining_payment_amount) > 0)) {
    let splits: PaymentSplitItem[] | undefined;
    if (booking.remaining_payment_splits) {
      splits = typeof booking.remaining_payment_splits === 'string'
        ? JSON.parse(booking.remaining_payment_splits)
        : booking.remaining_payment_splits;
    }

    return {
      status: 'completed',
      method: (booking.remaining_payment_method as PaymentMethod) || 'cash',
      amount: Number(booking.remaining_payment_amount || 0),
      proofUrl: booking.remaining_payment_proof_url || null,
      notes: booking.remaining_payment_notes || '',
      at: booking.remaining_payment_at || booking.updated_at || new Date().toISOString(),
      by: booking.remaining_payment_by,
      splits,
    };
  }

  // 2. Fallback codificado dentro de payment_proof_url
  if (typeof booking.payment_proof_url === 'string' && booking.payment_proof_url.includes('###remaining:')) {
    try {
      const parts = booking.payment_proof_url.split('###remaining:');
      const rawJson = parts[1];
      const parsed = JSON.parse(rawJson);
      if (parsed && typeof parsed === 'object') {
        return {
          status: 'completed',
          method: (parsed.method as PaymentMethod) || 'cash',
          amount: Number(parsed.amount || 0),
          proofUrl: parsed.proofUrl || parsed.proof_url || null,
          notes: parsed.notes || '',
          at: parsed.at || new Date().toISOString(),
          by: parsed.by,
          splits: parsed.splits,
        };
      }
    } catch (e) {
      console.warn('[parseRemainingPayment fallback error]', e);
    }
  }

  return null;
}

/**
 * Obtiene el enlace del comprobante inicial de anticipo (descartando el sufijo de saldo si existe).
 * Acepta tanto un objeto booking/group como una URL directa en string.
 */
export function getBookingOriginalProof(target: any): string | null {
  if (!target) return null;
  const rawUrl = typeof target === 'string' ? target : target.payment_proof_url;
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const raw = rawUrl.trim();
  if (raw.includes('###remaining:')) {
    const original = raw.split('###remaining:')[0].trim();
    return original.length > 0 ? original : null;
  }
  return raw.length > 0 ? raw : null;
}

/**
 * Calcula el saldo pendiente exacto por cobrar en el local
 */
export function calculateRemainingBalance(totalPrice: number, depositAmount: number, paidRemaining = 0): number {
  const remaining = Math.max(0, (totalPrice || 0) - (depositAmount || 0));
  return Math.max(0, remaining - paidRemaining);
}
