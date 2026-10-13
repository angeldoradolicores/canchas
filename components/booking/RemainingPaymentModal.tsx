'use client';

import { useState, useRef } from 'react';
import {
  X, Camera, Upload, CheckCircle, Loader2, DollarSign,
  FileText, Trash2, AlertCircle, Receipt, Smartphone
} from 'lucide-react';
import { PAYMENT_METHODS, PaymentMethod } from '@/lib/remaining-payment-utils';

interface RemainingPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingGroup: any; // Group or single booking object
  onSuccess: (updatedPayment: any, bookingIds: string[]) => void;
}

export function RemainingPaymentModal({
  isOpen,
  onClose,
  bookingGroup,
  onSuccess,
}: RemainingPaymentModalProps) {
  if (!isOpen || !bookingGroup) return null;

  const bookingsList = bookingGroup.bookings || [bookingGroup];
  const bookingIds = bookingsList.map((b: any) => b.id);

  const totalPrice = Number(bookingGroup.total_price || 0);
  const depositAmount = Number(bookingGroup.deposit_amount || 0);
  const defaultRemaining = Math.max(0, totalPrice - depositAmount);

  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState<string>(String(defaultRemaining));
  const [notes, setNotes] = useState<string>('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Solo se admiten fotos o imágenes del comprobante.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('La foto excede el tamaño máximo permitido (10 MB).');
      return;
    }

    setError(null);
    setPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setError('Por favor ingresa un monto válido.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let uploadedProofUrl: string | null = null;

      // 1. Si se adjuntó una foto/comprobante, subirlo a Cloudflare R2 vía /api/upload
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
          throw new Error(uploadJson.error || 'Error al subir la foto del comprobante a Cloudflare.');
        }

        uploadedProofUrl = uploadJson.url;
      }

      // 2. Registrar el pago restante vía /api/bookings/remaining-payment
      const res = await fetch('/api/bookings/remaining-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_ids: bookingIds,
          payment_method: method,
          amount: parsedAmount,
          proof_url: uploadedProofUrl,
          notes,
        }),
      });

      const resJson = await res.json();
      if (!res.ok || !resJson.success) {
        throw new Error(resJson.error || 'No se pudo guardar el pago restante.');
      }

      // Notificar al componente padre para actualizar la interfaz al instante
      onSuccess(resJson.data, bookingIds);
      onClose();
    } catch (err: any) {
      console.error('[RemainingPaymentModal submit error]', err);
      setError(err.message || 'Error al procesar el pago restante.');
    } finally {
      setSubmitting(false);
    }
  };

  const clientName = bookingGroup.customer_name || 'Anónimo';
  const pitchName = bookingGroup.pitches?.name || 'Cancha';
  const hoursCount = bookingsList.length;

  return (
    <div className="fixed inset-0 z-[220] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-border overflow-hidden max-h-[92vh] flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        
        {/* Header con gradiente verde */}
        <div className="relative bg-gradient-to-r from-emerald-700 via-emerald-600 to-green-700 p-4 sm:p-5 text-white shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-xs">
                <Receipt size={22} className="text-white" />
              </div>
              <div>
                <h3 className="font-black text-base sm:text-lg leading-tight">Registrar Pago Restante</h3>
                <p className="text-xs text-white/80">Cobro de saldo físico en el establecimiento</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={submitting}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Contenido scrolleable */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-foreground">

          {/* Resumen Financiero de la Reserva */}
          <div className="bg-secondary/40 border border-border/70 rounded-2xl p-3.5 sm:p-4 space-y-2.5">
            <div className="flex justify-between items-start gap-2 border-b border-border/50 pb-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cliente & Cancha</p>
                <p className="font-black text-sm text-foreground truncate">{clientName}</p>
                <p className="text-xs text-muted-foreground">{pitchName} · {hoursCount} {hoursCount === 1 ? 'hora' : 'horas'}</p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                  {bookingGroup.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="bg-background/80 rounded-xl p-2 border border-border/40">
                <p className="text-[10px] text-muted-foreground font-semibold">Total Reserva</p>
                <p className="text-xs sm:text-sm font-black text-foreground mt-0.5">
                  ${totalPrice.toLocaleString('es-CO')}
                </p>
              </div>
              <div className="bg-background/80 rounded-xl p-2 border border-border/40">
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Anticipo Pagado</p>
                <p className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                  ${depositAmount.toLocaleString('es-CO')}
                </p>
              </div>
              <div className="bg-emerald-500/10 rounded-xl p-2 border border-emerald-500/30">
                <p className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold">Saldo a Cobrar</p>
                <p className="text-xs sm:text-sm font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                  ${defaultRemaining.toLocaleString('es-CO')}
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Monto a Cobrar */}
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                Monto Cobrado ($ COP)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  placeholder="Ej: 40000"
                  className="w-full pl-8 pr-4 py-2.5 bg-background border border-border focus:border-emerald-500 rounded-xl text-sm font-black text-foreground focus:outline-hidden transition-colors"
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Puedes ajustar el monto si el cliente agregó bebidas, arbitraje o solicitó un descuento.
              </p>
            </div>

            {/* Selector de Método de Pago */}
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                Método de Pago Utilizado en el Local
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PAYMENT_METHODS.map((m) => {
                  const isSelected = method === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m.id)}
                      className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all active:scale-98 ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/30 shadow-xs'
                          : 'border-border bg-background hover:bg-secondary/60 text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 w-full">
                        <span className="text-base">{m.icon}</span>
                        <span className="text-xs font-bold truncate">{m.label}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {m.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Foto del Comprobante / Recibo (Especialmente para Nequi, Daviplata, Transferencia o Datáfono) */}
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5 flex items-center justify-between">
                <span>Foto del Comprobante {method === 'cash' ? '(Opcional)' : '(Recomendado)'}</span>
                <span className="text-[10px] text-muted-foreground">Guardado en Cloudflare R2</span>
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoSelect}
                className="hidden"
              />

              {photoPreview ? (
                <div className="relative rounded-2xl border border-border p-2.5 bg-background flex items-center gap-3">
                  <img
                    src={photoPreview}
                    alt="Vista previa comprobante"
                    className="w-16 h-16 object-cover rounded-xl border border-border shrink-0 shadow-xs"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-foreground truncate">{photoFile?.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {photoFile ? `${(photoFile.size / 1024).toFixed(0)} KB` : ''} · Listo para guardar
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-500/10 rounded-xl transition-colors"
                    title="Eliminar foto"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 py-3 px-3.5 rounded-xl border-2 border-dashed border-border hover:border-emerald-500 bg-background hover:bg-emerald-500/5 transition-all text-xs font-bold text-foreground flex items-center justify-center gap-2"
                  >
                    <Camera size={16} className="text-emerald-600 dark:text-emerald-400" />
                    <span>Tomar foto con la cámara</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="py-3 px-3.5 rounded-xl border border-border bg-secondary/50 hover:bg-secondary text-xs font-bold text-foreground flex items-center justify-center gap-1.5 transition-colors"
                    title="Subir desde galería"
                  >
                    <Upload size={14} />
                    <span className="hidden sm:inline">Galería</span>
                  </button>
                </div>
              )}
            </div>

            {/* Observaciones Opcionales */}
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                Notas adicionales (Opcional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: Entregó $50.000, devueltos $10.000 de cambio"
                className="w-full px-3.5 py-2 bg-background border border-border focus:border-emerald-500 rounded-xl text-xs text-foreground focus:outline-hidden transition-colors"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Botones de Acción */}
            <div className="flex gap-2.5 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Guardando pago...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={16} />
                    <span>Confirmar Pago de ${Number(amount || 0).toLocaleString('es-CO')}</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="py-3 px-4 rounded-xl border border-border bg-secondary/60 hover:bg-secondary text-xs sm:text-sm font-bold text-foreground transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}
