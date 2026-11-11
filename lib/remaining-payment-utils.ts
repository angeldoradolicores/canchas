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

/** Un abono/pago parcial en el historial */
export interface PaymentEntry {
  id: string;             // UUID único del abono
  amount: number;         // Monto cobrado en este abono
  method: string;         // Método de pago (cash, transfer, etc.)
  splits?: PaymentSplitItem[]; // Si fue pago mixto
  proofUrl?: string | null;   // Foto del comprobante (opcional)
  notes?: string;         // Nota del pago
  at: string;             // ISO timestamp de cuando se registró
  by?: string;            // ID del usuario que registró
  // Campos de auditoría de edición:
  editedAt?: string;      // ISO timestamp de la última edición
  editedBy?: string;      // ID del usuario que editó
  previousAmount?: number;  // Monto anterior antes de editar
  previousMethod?: string;  // Método anterior antes de editar
  previousNotes?: string;   // Nota anterior antes de editar
}

/**
 * Calcula el total abonado sumando todos los pagos del historial
 */
export function getTotalPaid(paymentHistory: PaymentEntry[] | null | undefined): number {
  if (!Array.isArray(paymentHistory) || paymentHistory.length === 0) return 0;
  return paymentHistory.reduce((sum, e) => sum + Number(e.amount || 0), 0);
}

/**
 * Parsea el payment_history de una reserva (soporta string JSON, array, o fallback en columnas/proof_url)
 */
export function parsePaymentHistory(booking: any): PaymentEntry[] {
  const raw = booking?.payment_history;
  if (Array.isArray(raw) && raw.length > 0) return raw as PaymentEntry[];
  if (typeof raw === 'string' && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as PaymentEntry[];
    } catch { /* ignorar */ }
  }

  // Fallback 1: Si no hay columna payment_history, revisar si está embebido en payment_proof_url
  if (typeof booking?.payment_proof_url === 'string' && booking.payment_proof_url.includes('###remaining:')) {
    try {
      const parts = booking.payment_proof_url.split('###remaining:');
      const parsed = JSON.parse(parts[1]);
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.history) && parsed.history.length > 0) {
          return parsed.history as PaymentEntry[];
        }
        if (parsed.amount && Number(parsed.amount) > 0) {
          return [{
            id: `pay_legacy_${booking.id || Date.now()}`,
            amount: Number(parsed.amount),
            method: parsed.method || 'cash',
            splits: parsed.splits,
            proofUrl: parsed.proofUrl || parsed.proof_url || null,
            notes: parsed.notes || '',
            at: parsed.at || booking.updated_at || new Date().toISOString(),
            by: parsed.by,
          }];
        }
      }
    } catch { /* ignorar */ }
  }

  // Fallback 2: Si hay remaining_payment_amount en columnas nativas sin payment_history
  if (booking?.remaining_payment_amount && Number(booking.remaining_payment_amount) > 0) {
    let splits: PaymentSplitItem[] | undefined;
    if (booking.remaining_payment_splits) {
      splits = typeof booking.remaining_payment_splits === 'string'
        ? JSON.parse(booking.remaining_payment_splits)
        : booking.remaining_payment_splits;
    }
    return [{
      id: `pay_legacy_${booking.id || Date.now()}`,
      amount: Number(booking.remaining_payment_amount),
      method: booking.remaining_payment_method || 'cash',
      splits,
      proofUrl: booking.remaining_payment_proof_url || null,
      notes: booking.remaining_payment_notes || '',
      at: booking.remaining_payment_at || booking.updated_at || new Date().toISOString(),
      by: booking.remaining_payment_by,
    }];
  }

  return [];
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

// Exportación consolidada para compatibilidad completa con Turbopack HMR
const remainingPaymentUtils = {
  parsePaymentHistory,
  getTotalPaid,
  getBookingRemainingPayment,
  getBookingOriginalProof,
  calculateRemainingBalance,
  formatPaymentMethod,
  PAYMENT_METHODS,
};

export { remainingPaymentUtils };
