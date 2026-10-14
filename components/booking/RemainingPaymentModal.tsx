'use client';

import { useState, useRef, useEffect } from 'react';
import {
  X, Camera, Upload, CheckCircle2, Loader2, DollarSign,
  Receipt, AlertCircle, Trash2, ArrowRight, ShieldCheck, Plus, Sparkles,
  FileText, ChevronDown, Eye, ExternalLink
} from 'lucide-react';
import {
  PAYMENT_METHODS, PaymentMethod, PaymentSplitItem,
  calculateRemainingBalance, getBookingRemainingPayment,
  getBookingOriginalProof, formatPaymentMethod
} from '@/lib/remaining-payment-utils';

interface RemainingPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingGroup?: any;
  booking?: any;
  onSuccess: (updatedPayment: any, bookingIds?: string[]) => void;
}

/**
 * Comprime imágenes en el navegador antes de enviarlas al servidor.
 * Evita errores por límites de tamaño en Vercel (4.5 MB) y acelera la subida en móviles.
 */
async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<File> {
  if (file.size <= 400 * 1024) return file; // Si ya pesa < 400KB, no procesar

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          resolve(compressed);
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

export function RemainingPaymentModal({
  isOpen,
  onClose,
  bookingGroup,
  booking,
  onSuccess,
}: RemainingPaymentModalProps) {
  const targetBooking = bookingGroup || booking;

  // ⚠️ Regla de Hooks de React: TODOS los hooks declarados al inicio
  const [selectedMethods, setSelectedMethods] = useState<PaymentMethod[]>(['cash']);
  const [methodAmounts, setMethodAmounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<string>('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [viewingImage, setViewingImage] = useState<{ url: string; title: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calcular montos financieros base
  const totalPrice = Number(targetBooking?.total_price || 0);
  const depositAmount = Number(targetBooking?.deposit_amount || 0);
  const paidRemaining = Number(targetBooking?.remaining_payment_amount || targetBooking?.remaining_amount_paid || 0);
  const remainingToCollect = calculateRemainingBalance(totalPrice, depositAmount, paidRemaining);

  // Extraer datos guardados previamente de la reserva
  const existingPayment = getBookingRemainingPayment(targetBooking);
  const initialProofUrl =
    getBookingOriginalProof(targetBooking?.payment_proof_url) ||
    targetBooking?.bookings?.find((b: any) => b.payment_proof_url)?.payment_proof_url ||
    null;
  const savedRemainingProof =
    targetBooking?.remaining_payment_proof_url ||
    existingPayment?.proofUrl ||
    null;

  // Inicializar o restaurar método, monto, comprobante y notas previamente guardados
  useEffect(() => {
    if (!isOpen || !targetBooking) return;

    const prevSplits = targetBooking.remaining_payment_splits || existingPayment?.splits;
    const prevMethod = targetBooking.remaining_payment_method || existingPayment?.method;
    const prevProof = targetBooking.remaining_payment_proof_url || existingPayment?.proofUrl || null;
    const prevNotes = targetBooking.remaining_payment_notes || existingPayment?.notes || '';
    const prevAmount = Number(targetBooking.remaining_amount_paid || targetBooking.remaining_payment_amount || existingPayment?.amount || 0);

    const amountToSet = remainingToCollect > 0 ? remainingToCollect : prevAmount > 0 ? prevAmount : Math.max(0, totalPrice - depositAmount);

    if (Array.isArray(prevSplits) && prevSplits.length > 0) {
      setSelectedMethods(prevSplits.map((s: any) => s.method as PaymentMethod));
      const amountsMap: Record<string, string> = {};
      prevSplits.forEach((s: any) => {
        amountsMap[s.method] = String(s.amount || 0);
      });
      setMethodAmounts(amountsMap);
    } else if (prevMethod && prevMethod !== 'split') {
      setSelectedMethods([prevMethod as PaymentMethod]);
      setMethodAmounts({ [prevMethod]: String(amountToSet) });
    } else {
      setSelectedMethods(['cash']);
      setMethodAmounts({ cash: String(amountToSet) });
    }

    setPhotoPreview(prevProof);
    setPhotoFile(null);
    setNotes(prevNotes);
    setError(null);
    setShowHistory(false);
  }, [
    isOpen,
    targetBooking?.id,
    targetBooking?.remaining_payment_at,
    targetBooking?.remaining_amount_paid,
    targetBooking?.remaining_payment_method
  ]);

  // Si no está abierto o no hay reserva, no renderizar
  if (!isOpen || !targetBooking) return null;

  const bookingsList = targetBooking.bookings || [targetBooking];
  const bookingIds = bookingsList.map((b: any) => b.id);
  const clientName = targetBooking.customer_name || 'Cliente';
  const pitchName = targetBooking.pitches?.name || 'Cancha';

  // Toggle de métodos de pago (permite seleccionar 1 o más, ej: Efectivo + Transferencia)
  const toggleMethod = (methodId: PaymentMethod) => {
    setError(null);
    if (selectedMethods.includes(methodId)) {
      // Si intenta deseleccionar el único método activo, no permitir quedar en 0
      if (selectedMethods.length === 1) return;
      const next = selectedMethods.filter(m => m !== methodId);
      setSelectedMethods(next);

      // Reasignar el total al primer método si queda uno solo
      if (next.length === 1) {
        setMethodAmounts({ [next[0]]: String(remainingToCollect > 0 ? remainingToCollect : paidRemaining) });
      }
    } else {
      const next = [...selectedMethods, methodId];
      setSelectedMethods(next);

      // Si pasa a múltiples métodos, dividir equitativamente por defecto
      if (next.length > 1) {
        const baseAmt = remainingToCollect > 0 ? remainingToCollect : paidRemaining;
        const splitVal = Math.round(baseAmt / next.length);
        const newAmounts: Record<string, string> = {};
        let accum = 0;
        next.forEach((m, idx) => {
          if (idx === next.length - 1) {
            newAmounts[m] = String(Math.max(0, baseAmt - accum));
          } else {
            newAmounts[m] = String(splitVal);
            accum += splitVal;
          }
        });
        setMethodAmounts(newAmounts);
      }
    }
  };

  // Cambio individual de monto para un método
  const handleAmountChange = (methodId: PaymentMethod, val: string) => {
    setMethodAmounts(prev => ({
      ...prev,
      [methodId]: val,
    }));
  };

  // Botón rápido para repartir en partes iguales
  const handleSplitEqually = () => {
    if (selectedMethods.length <= 1) return;
    const baseAmt = remainingToCollect > 0 ? remainingToCollect : paidRemaining;
    const splitVal = Math.round(baseAmt / selectedMethods.length);
    const newAmounts: Record<string, string> = {};
    let accum = 0;
    selectedMethods.forEach((m, idx) => {
      if (idx === selectedMethods.length - 1) {
        newAmounts[m] = String(Math.max(0, baseAmt - accum));
      } else {
        newAmounts[m] = String(splitVal);
        accum += splitVal;
      }
    });
    setMethodAmounts(newAmounts);
  };

  // Cálculo de suma actual de todos los métodos seleccionados
  const totalEntered = selectedMethods.reduce((sum, m) => {
    const val = Number(methodAmounts[m] || 0);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const baseCompare = remainingToCollect > 0 ? remainingToCollect : paidRemaining;
  const difference = totalEntered - baseCompare;

  // Manejo de foto del comprobante
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Por favor selecciona una foto o imagen del comprobante.');
      return;
    }

    setError(null);
    try {
      // Comprimir en cliente para evitar fallos por tamaño (> 4.5MB en Vercel)
      const compressed = await compressImage(file);
      setPhotoFile(compressed);
      const previewUrl = URL.createObjectURL(compressed);
      setPhotoPreview(previewUrl);
    } catch {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    if (photoPreview && photoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Envío del cobro
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (totalEntered <= 0) {
      setError('El total a cobrar debe ser mayor a cero.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let uploadedProofUrl: string | null = photoPreview;

      // 1. Si adjuntó foto nueva desde su dispositivo, subirla a Cloudflare R2 / Supabase
      if (photoFile) {
        const formData = new FormData();
        formData.append('file', photoFile);
        formData.append('type', 'receipt');

        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok || !uploadJson.success) {
          throw new Error(uploadJson.error || 'Error al subir la foto del comprobante. Intenta de nuevo.');
        }

        uploadedProofUrl = uploadJson.url;
      } else if (!photoPreview) {
        uploadedProofUrl = null;
      }

      // Preparar estructura de métodos y splits
      const isSplit = selectedMethods.length > 1;
      const primaryMethod = isSplit ? 'split' : selectedMethods[0];
      const splitsData: PaymentSplitItem[] = selectedMethods.map(m => ({
        method: m,
        amount: Number(methodAmounts[m] || 0),
      }));

      // 2. Registrar cobro vía /api/bookings/remaining-payment
      const res = await fetch('/api/bookings/remaining-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_ids: bookingIds,
          payment_method: primaryMethod,
          amount: totalEntered,
          proof_url: uploadedProofUrl,
          notes,
          splits: isSplit ? splitsData : null,
        }),
      });

      const resJson = await res.json();
      if (!res.ok || !resJson.success) {
        throw new Error(resJson.error || 'No se pudo registrar el pago restante.');
      }

      onSuccess(resJson.data, bookingIds);
      onClose();
    } catch (err: any) {
      console.error('[RemainingPaymentModal submit error]', err);
      setError(err.message || 'Error al procesar el pago restante.');
    } finally {
      setSubmitting(false);
    }
  };

  const hasDigitalMethod = selectedMethods.some(m => m !== 'cash');

  return (
    <div className="fixed inset-0 z-[220] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl border border-border overflow-hidden max-h-[92vh] flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">

        {/* Cabecera compacta y moderna */}
        <div className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-green-700 p-4 text-white shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
                <Receipt size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-base font-black leading-tight">Cobrar Saldo Restante</h2>
                <p className="text-[11px] text-white/80 truncate max-w-[220px] capitalize">
                  {pitchName} • {clientName}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={submitting}
              className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
              title="Cerrar"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Formulario con Scroll */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-4 text-foreground">

          {/* ── 1. Resumen Financiero Claro (3 Valores Solicitados) ── */}
          <div className="grid grid-cols-3 gap-2 bg-secondary/50 p-3 rounded-2xl border border-border">
            <div className="text-center">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cancha</p>
              <p className="text-xs sm:text-sm font-extrabold text-foreground mt-0.5">
                ${totalPrice.toLocaleString('es-CO')}
              </p>
            </div>
            <div className="text-center border-x border-border/70 px-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Anticipo</p>
              <p className="text-xs sm:text-sm font-extrabold text-primary mt-0.5">
                ${depositAmount.toLocaleString('es-CO')}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-black text-amber-500 dark:text-amber-400 uppercase tracking-wider">
                Saldo
              </p>
              <p className="text-xs sm:text-sm font-black text-amber-500 dark:text-amber-400 mt-0.5">
                ${remainingToCollect.toLocaleString('es-CO')}
              </p>
            </div>
          </div>

          {/* ── Botón / Sección: Ver Historial de Pagos e Imágenes Guardadas ── */}
          <div className="rounded-2xl border border-border/70 overflow-hidden bg-secondary/20">
            <button
              type="button"
              onClick={() => setShowHistory(prev => !prev)}
              className="w-full flex items-center justify-between p-3 text-xs font-bold text-foreground hover:bg-secondary/40 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <FileText size={15} className="text-primary" />
                <span>Ver historial de comprobantes y pagos</span>
              </span>
              <span className="text-[11px] text-primary flex items-center gap-1 font-semibold">
                {showHistory ? 'Ocultar historial' : 'Ver historial'}
                <ChevronDown size={14} className={`transform transition-transform ${showHistory ? 'rotate-180' : ''}`} />
              </span>
            </button>

            {showHistory && (
              <div className="p-3 border-t border-border/60 bg-card space-y-3 text-xs animate-in fade-in duration-150">
                {/* 1. Comprobante inicial de anticipo / abono */}
                <div className="p-2.5 rounded-xl bg-secondary/30 border border-border/60 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 size={12} className="text-emerald-500" />
                      1. Abono Inicial (Reserva)
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      ${depositAmount.toLocaleString('es-CO')}
                    </span>
                  </div>
                  {initialProofUrl ? (
                    <div className="flex items-center gap-2.5 pt-1">
                      <img
                        src={initialProofUrl}
                        alt="Comprobante inicial"
                        className="w-14 h-14 object-cover rounded-lg border border-border shadow-2xs shrink-0 cursor-pointer hover:opacity-90"
                        onClick={() => setViewingImage({ url: initialProofUrl, title: 'Comprobante Abono Inicial' })}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[11px] text-foreground truncate">Comprobante de Anticipo</p>
                        <p className="text-[10px] text-muted-foreground">Adjuntado por el cliente</p>
                        <button
                          type="button"
                          onClick={() => setViewingImage({ url: initialProofUrl, title: 'Comprobante Abono Inicial' })}
                          className="mt-1 text-[10px] text-primary font-bold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                        >
                          <Eye size={11} /> Ver foto completa
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic pt-0.5">
                      Sin foto de comprobante inicial (reserva manual o presencial).
                    </p>
                  )}
                </div>

                {/* 2. Comprobante y método de saldo restante */}
                <div className="p-2.5 rounded-xl bg-secondary/30 border border-border/60 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Receipt size={12} className="text-sky-500" />
                      2. Saldo Restante Guardado
                    </span>
                    <span className="font-bold text-foreground">
                      ${paidRemaining > 0 ? paidRemaining.toLocaleString('es-CO') : remainingToCollect.toLocaleString('es-CO')}
                    </span>
                  </div>

                  <div className="text-[11px] space-y-1 text-muted-foreground pt-0.5">
                    <p>
                      <strong className="text-foreground">Método:</strong>{' '}
                      {formatPaymentMethod(targetBooking.remaining_payment_method, targetBooking.remaining_payment_splits)}
                    </p>
                    {targetBooking.remaining_paid_at && (
                      <p>
                        <strong className="text-foreground">Fecha registro:</strong>{' '}
                        {new Date(targetBooking.remaining_paid_at).toLocaleString('es-CO', {
                          timeZone: 'America/Bogota',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </p>
                    )}
                    {targetBooking.remaining_payment_notes && (
                      <p>
                        <strong className="text-foreground">Nota:</strong> {targetBooking.remaining_payment_notes}
                      </p>
                    )}
                  </div>

                  {savedRemainingProof ? (
                    <div className="flex items-center gap-2.5 pt-1">
                      <img
                        src={savedRemainingProof}
                        alt="Comprobante saldo"
                        className="w-14 h-14 object-cover rounded-lg border border-border shadow-2xs shrink-0 cursor-pointer hover:opacity-90"
                        onClick={() => setViewingImage({ url: savedRemainingProof, title: 'Comprobante Saldo Restante' })}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[11px] text-foreground truncate">Comprobante de Saldo</p>
                        <p className="text-[10px] text-muted-foreground">Guardado previamente</p>
                        <button
                          type="button"
                          onClick={() => setViewingImage({ url: savedRemainingProof, title: 'Comprobante Saldo Restante' })}
                          className="mt-1 text-[10px] text-primary font-bold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                        >
                          <Eye size={11} /> Ver foto completa
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic pt-0.5">
                      Sin foto de saldo registrada previamente.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── 2. Métodos de Pago Simplificados (Permite Escoger Más de 1) ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span>Método de pago</span>
                <span className="text-[10px] text-muted-foreground font-normal">(puedes elegir varios)</span>
              </label>
              {selectedMethods.length > 1 && (
                <button
                  type="button"
                  onClick={handleSplitEqually}
                  className="text-[10px] font-bold text-primary hover:underline flex items-center gap-0.5"
                >
                  <Sparkles size={10} /> Mitad y mitad
                </button>
              )}
            </div>

            {/* Selector interactivo de botones compactos */}
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((m) => {
                const isSelected = selectedMethods.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMethod(m.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${isSelected
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold shadow-2xs'
                      : 'border-border bg-card hover:bg-secondary/40 text-foreground font-medium'
                      }`}
                  >
                    <span className="text-lg leading-none">{m.icon}</span>
                    <span className="text-xs truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── 3. Montos a Cobrar (Simple si es 1, Dividido si son varios) ── */}
          {selectedMethods.length === 1 ? (
            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground">
                Monto recibido ({PAYMENT_METHODS.find(m => m.id === selectedMethods[0])?.shortLabel})
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={
                    methodAmounts[selectedMethods[0]]
                      ? Number(methodAmounts[selectedMethods[0]]).toLocaleString('es-CO')
                      : ''
                  }
                  onChange={(e) => {
                    const rawValue = e.target.value.replace(/\D/g, '');
                    handleAmountChange(selectedMethods[0], rawValue);
                  }}
                  required
                  placeholder={Number(remainingToCollect > 0 ? remainingToCollect : paidRemaining).toLocaleString('es-CO')}
                  className="w-full pl-8 pr-3 py-2 text-sm font-bold bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-foreground"
                />
              </div>

            </div>
          ) : (
            <div className="space-y-2 bg-secondary/30 p-3 rounded-2xl border border-border">
              <p className="text-[11px] font-bold text-foreground flex items-center justify-between">
                <span>Distribución del pago mixto:</span>
                <span className={`text-[10px] font-bold ${difference === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {difference === 0 ? '✓ Cuadra exacto' : difference > 0 ? `+ $${difference.toLocaleString('es-CO')}` : `- $${Math.abs(difference).toLocaleString('es-CO')}`}
                </span>
              </p>

              <div className="space-y-1.5">
                {selectedMethods.map((m) => {
                  const meta = PAYMENT_METHODS.find(item => item.id === m);
                  const rawValue = methodAmounts[m];
                  const formattedValue = rawValue ? Number(rawValue).toLocaleString('es-CO') : '';

                  return (
                    <div key={m} className="flex items-center gap-2">
                      <span className="text-xs font-bold w-28 truncate flex items-center gap-1.5 text-muted-foreground">
                        <span>{meta?.icon}</span>
                        <span>{meta?.shortLabel}:</span>
                      </span>
                      <div className="relative flex-1">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold">$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formattedValue}
                          onChange={(e) => {
                            const numericValue = e.target.value.replace(/\D/g, '');
                            handleAmountChange(m, numericValue);
                          }}
                          placeholder="0"
                          className="w-full pl-6 pr-2 py-1.5 text-xs font-bold bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-foreground"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 4. Foto del Comprobante (Fácil y con Compresión Automática) ── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground flex items-center gap-1">
                <span>Foto comprobante</span>
                {hasDigitalMethod ? (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">(recomendado)</span>
                ) : (
                  <span className="text-[10px] text-muted-foreground font-normal">(opcional)</span>
                )}
              </label>
              {photoPreview && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="text-[10px] text-red-500 hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <Trash2 size={10} /> Quitar foto
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoSelect}
              className="hidden"
            />

            {photoPreview ? (
              <div className="relative rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-2.5 flex items-center gap-3">
                <img
                  src={photoPreview}
                  alt="Vista previa"
                  className="w-13 h-13 object-cover rounded-lg border border-border shadow-xs shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setViewingImage({ url: photoPreview, title: 'Comprobante de Saldo' })}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-foreground truncate">
                    {photoFile ? 'Foto nueva seleccionada' : 'Foto guardada previamente'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {photoFile ? 'Comprimida y lista para guardar' : 'Comprobante actual de saldo'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setViewingImage({ url: photoPreview, title: 'Comprobante de Saldo' })}
                    className="mt-0.5 text-[10px] text-primary font-bold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                  >
                    <Eye size={10} /> Ver completa
                  </button>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-bold text-primary px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors cursor-pointer"
                  >
                    Cambiar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary text-xs font-bold cursor-pointer"
              >
                <Camera size={16} />
                <span>Tomar foto o subir captura</span>
              </button>
            )}
          </div>

          {/* ── 5. Nota opcional ── */}
          <div>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Nota opcional (ej: recibido en caja)"
              maxLength={120}
              className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Error visual */}
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold animate-in fade-in">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ── 6. Botón de Confirmación Principal ── */}
          <div className="pt-1">
            <button
              type="submit"
              disabled={submitting || totalEntered <= 0}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Guardando cobro...</span>
                </>
              ) : (
                <>
                  <span>Guardar Cobro de ${totalEntered.toLocaleString('es-CO')}</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>

      {/* Modal de Vista Previa de Imagen en Pantalla Completa */}
      {viewingImage && (
        <div
          className="fixed inset-0 z-[260] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in"
          onClick={() => setViewingImage(null)}
        >
          <div
            className="relative max-w-lg w-full bg-card rounded-2xl overflow-hidden border border-border p-3 shadow-2xl flex flex-col gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="text-xs font-bold text-foreground">{viewingImage.title}</span>
              <button
                type="button"
                onClick={() => setViewingImage(null)}
                className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto flex items-center justify-center bg-black/40 rounded-xl">
              <img
                src={viewingImage.url}
                alt={viewingImage.title}
                className="max-h-[68vh] w-auto object-contain rounded-lg"
              />
            </div>
            <div className="flex justify-end pt-1">
              <a
                href={viewingImage.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <ExternalLink size={13} /> Abrir original
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
