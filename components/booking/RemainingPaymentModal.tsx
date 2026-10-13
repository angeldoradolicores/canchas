'use client';

import { useState, useRef, useEffect } from 'react';
import {
  X, Camera, Upload, CheckCircle2, Loader2, DollarSign,
  Receipt, AlertCircle, Trash2, ArrowRight, ShieldCheck, Plus, Sparkles
} from 'lucide-react';
import {
  PAYMENT_METHODS, PaymentMethod, PaymentSplitItem,
  calculateRemainingBalance
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calcular montos financieros base
  const totalPrice = Number(targetBooking?.total_price || 0);
  const depositAmount = Number(targetBooking?.deposit_amount || 0);
  const paidRemaining = Number(targetBooking?.remaining_payment_amount || 0);
  const remainingToCollect = calculateRemainingBalance(totalPrice, depositAmount, paidRemaining);

  // Inicializar o ajustar montos cuando cambia la reserva o el saldo a cobrar
  useEffect(() => {
    if (isOpen && remainingToCollect > 0) {
      if (selectedMethods.length === 1) {
        setMethodAmounts({ [selectedMethods[0]]: String(remainingToCollect) });
      }
    }
  }, [isOpen, remainingToCollect]);

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
        setMethodAmounts({ [next[0]]: String(remainingToCollect) });
      }
    } else {
      const next = [...selectedMethods, methodId];
      setSelectedMethods(next);

      // Si pasa a múltiples métodos, dividir equitativamente por defecto
      if (next.length > 1) {
        const splitVal = Math.round(remainingToCollect / next.length);
        const newAmounts: Record<string, string> = {};
        let accum = 0;
        next.forEach((m, idx) => {
          if (idx === next.length - 1) {
            newAmounts[m] = String(Math.max(0, remainingToCollect - accum));
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
    const splitVal = Math.round(remainingToCollect / selectedMethods.length);
    const newAmounts: Record<string, string> = {};
    let accum = 0;
    selectedMethods.forEach((m, idx) => {
      if (idx === selectedMethods.length - 1) {
        newAmounts[m] = String(Math.max(0, remainingToCollect - accum));
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

  const difference = totalEntered - remainingToCollect;

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
    if (photoPreview) URL.revokeObjectURL(photoPreview);
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
      let uploadedProofUrl: string | null = null;

      // 1. Si adjuntó foto, subirla a Cloudflare R2 / Supabase
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
                <p className="text-[11px] text-white/80 truncate max-w-[220px]">
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
              <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Saldo</p>
              <p className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                ${remainingToCollect.toLocaleString('es-CO')}
              </p>
            </div>
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
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
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
                  type="number"
                  min="0"
                  step="1000"
                  value={methodAmounts[selectedMethods[0]] || ''}
                  onChange={(e) => handleAmountChange(selectedMethods[0], e.target.value)}
                  required
                  placeholder={String(remainingToCollect)}
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
                  return (
                    <div key={m} className="flex items-center gap-2">
                      <span className="text-xs font-bold w-28 truncate flex items-center gap-1.5 text-muted-foreground">
                        <span>{meta?.icon}</span>
                        <span>{meta?.shortLabel}:</span>
                      </span>
                      <div className="relative flex-1">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold">$</span>
                        <input
                          type="number"
                          min="0"
                          step="1000"
                          value={methodAmounts[m] || ''}
                          onChange={(e) => handleAmountChange(m, e.target.value)}
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
              {photoFile && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="text-[10px] text-red-500 hover:underline flex items-center gap-0.5"
                >
                  <Trash2 size={10} /> Quitar
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
              <div className="relative rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-2 flex items-center gap-3">
                <img
                  src={photoPreview}
                  alt="Vista previa"
                  className="w-12 h-12 object-cover rounded-lg border border-border shadow-xs shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-foreground truncate">Foto lista para guardar</p>
                  <p className="text-[10px] text-muted-foreground">Comprimida y lista para Cloudflare</p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-bold text-primary px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary text-xs font-bold"
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
                  <span>Registrando cobro...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>Confirmar Cobro de ${totalEntered.toLocaleString('es-CO')}</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
