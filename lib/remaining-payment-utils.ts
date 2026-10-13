/**
 * Utilidades para la gestión del Pago Restante (Saldo Pendiente en Local)
 * Cancheros - Gestión de Pagos
 */

export type PaymentMethod = 'cash' | 'nequi' | 'daviplata' | 'transfer' | 'card' | 'other';

export interface RemainingPaymentData {
  status: 'completed' | 'pending';
  method: PaymentMethod;
  amount: number;
  proofUrl: string | null;
  notes: string;
  at: string;
  by?: string;
}

export const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: string; description: string }[] = [
  { id: 'cash', label: 'Efectivo', icon: '💵', description: 'Pago en billetes/monedas en caja' },
  { id: 'nequi', label: 'Nequi', icon: '📲', description: 'Transferencia directa Nequi' },
  { id: 'daviplata', label: 'Daviplata', icon: '📱', description: 'Transferencia directa Daviplata' },
  { id: 'transfer', label: 'Bancolombia / Transf.', icon: '🏦', description: 'Transferencia bancaria' },
  { id: 'card', label: 'Datáfono / Tarjeta', icon: '💳', description: 'Cobro con tarjeta débito o crédito' },
  { id: 'other', label: 'Otro Medio', icon: '📝', description: 'Bono, convenio u otro método' },
];

/**
 * Formatea el método de pago a texto legible
 */
export function formatPaymentMethod(method?: string | null): string {
  if (!method) return 'No especificado';
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
    return {
      status: 'completed',
      method: (booking.remaining_payment_method as PaymentMethod) || 'cash',
      amount: Number(booking.remaining_payment_amount || 0),
      proofUrl: booking.remaining_payment_proof_url || null,
      notes: booking.remaining_payment_notes || '',
      at: booking.remaining_payment_at || booking.updated_at || new Date().toISOString(),
      by: booking.remaining_payment_by,
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
        };
      }
    } catch (e) {
      console.warn('[parseRemainingPayment fallback error]', e);
    }
  }

  return null;
}

/**
 * Obtiene el enlace del comprobante inicial de anticipo (descartando el sufijo de saldo si existe)
 */
export function getBookingOriginalProof(booking: any): string | null {
  if (!booking || !booking.payment_proof_url) return null;
  const raw = String(booking.payment_proof_url).trim();
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
