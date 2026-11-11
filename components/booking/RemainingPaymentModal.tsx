'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  X, Camera, Upload, CheckCircle2, Loader2, DollarSign,
  Receipt, AlertCircle, Trash2, ArrowRight, ShieldCheck, Plus, Sparkles,
  FileText, ChevronDown, Eye, ExternalLink, Repeat, Edit3, Clock, History
} from 'lucide-react';
import {
  PAYMENT_METHODS, PaymentMethod, PaymentSplitItem, PaymentEntry,
  calculateRemainingBalance, getBookingRemainingPayment,
  getBookingOriginalProof, formatPaymentMethod,
  parsePaymentHistory, getTotalPaid
} from '@/lib/remaining-payment-utils';
import { getContractBillingInfo } from '@/lib/contract-billing';

interface RemainingPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingGroup?: any;
  booking?: any;
  allBookings?: any[];
  onSuccess: (updatedPayment: any, bookingIds?: string[]) => void;
}

/**
 * Comprime imágenes en el navegador antes de enviarlas al servidor.
 */
async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<File> {
  if (file.size <= 400 * 1024) return file;

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
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
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
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

function formatCOP(n: number) {
  return `$${Math.max(0, n).toLocaleString('es-CO')}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return iso; }
}

export function RemainingPaymentModal({
  isOpen,
  onClose,
  bookingGroup,
  booking,
  allBookings,
  onSuccess,
}: RemainingPaymentModalProps) {
  const targetBooking = bookingGroup || booking;

  // ⚠️ Hooks al inicio
  const [selectedMethods, setSelectedMethods] = useState<PaymentMethod[]>(['cash']);
  const [methodAmounts, setMethodAmounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<string>('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [viewingImage, setViewingImage] = useState<{ url: string; title: string } | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Info de contrato
  const contractInfo = useMemo(() => {
    return getContractBillingInfo(targetBooking, allBookings);
  }, [targetBooking, allBookings]);

  // Historial de pagos de todas las reservas del grupo
  const paymentHistory = useMemo(() => {
    if (!targetBooking) return [];
    const bookingsList: any[] = targetBooking.bookings || [targetBooking];
    // Merge payment_history de todas las reservas del grupo, deduplicar por ID
    const allEntries: PaymentEntry[] = [];
    const seenIds = new Set<string>();
    for (const b of bookingsList) {
      const entries = parsePaymentHistory(b);
      for (const e of entries) {
        if (!seenIds.has(e.id)) {
          seenIds.add(e.id);
          allEntries.push(e);
        }
      }
    }
    // Ordenar por fecha
    return allEntries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [targetBooking]);

  // Total ya pagado en abonos del historial
  const totalPaidFromHistory = useMemo(() => getTotalPaid(paymentHistory), [paymentHistory]);

  // Precio total (del grupo/tarjeta o contrato)
  const totalPrice = useMemo(() => {
    if (Number(targetBooking?.total_price) > 0) {
      return Number(targetBooking.total_price);
    }
    if (contractInfo.isContract && contractInfo.isPlanBilling && contractInfo.cycleToCollect > 0) {
      return contractInfo.cycleToCollect;
    }
    return Number(targetBooking?.total_price || 0);
  }, [contractInfo, targetBooking]);

  const depositAmount = Number(targetBooking?.deposit_amount || 0);

  // Saldo pendiente = total - anticipo - abonos ya realizados
  const remainingToCollect = useMemo(() => {
    return Math.max(0, totalPrice - depositAmount - totalPaidFromHistory);
  }, [totalPrice, depositAmount, totalPaidFromHistory]);

  const initialProofUrl =
    getBookingOriginalProof(targetBooking?.payment_proof_url) ||
    targetBooking?.bookings?.find((b: any) => b.payment_proof_url)?.payment_proof_url ||
    null;

  // Inicializar formulario
  useEffect(() => {
    if (!isOpen || !targetBooking) return;

    // Si estamos editando un pago, cargar sus datos
    if (editingPaymentId) {
      const entry = paymentHistory.find(e => e.id === editingPaymentId);
      if (entry) {
        if (entry.splits && entry.splits.length > 1) {
          setSelectedMethods(entry.splits.map(s => s.method));
          const amts: Record<string, string> = {};
          entry.splits.forEach(s => { amts[s.method] = String(s.amount); });
          setMethodAmounts(amts);
        } else {
          const m = (entry.method || 'cash') as PaymentMethod;
          setSelectedMethods([m]);
          setMethodAmounts({ [m]: String(entry.amount) });
        }
        setPhotoPreview(entry.proofUrl || null);
        setPhotoFile(null);
        setNotes(entry.notes || '');
        setError(null);
        return;
      }
    }

    // Nuevo abono: el monto sugerido es el saldo restante
    const amountToSet = remainingToCollect > 0 ? remainingToCollect : 0;
    setSelectedMethods(['cash']);
    setMethodAmounts({ cash: String(amountToSet) });
    setPhotoPreview(null);
    setPhotoFile(null);
    setNotes('');
    setError(null);
    setEditingPaymentId(null);
  }, [isOpen, targetBooking?.id, editingPaymentId]);

  // Si ya existen abonos en el historial, expandir automáticamente la sección de historial
  useEffect(() => {
    if (paymentHistory.length > 0) {
      setShowHistory(true);
    }
  }, [paymentHistory.length, isOpen]);

  if (!isOpen || !targetBooking) return null;

  const bookingsList = targetBooking.bookings || [targetBooking];
  const bookingIds: string[] = useMemo(() => {
    let ids: string[] = [];
    if (Array.isArray(targetBooking.bookings) && targetBooking.bookings.length > 0) {
      ids = targetBooking.bookings.map((b: any) => b.id);
    } else if (contractInfo.isContract && contractInfo.isPlanBilling && contractInfo.relatedBookingIds.length > 0) {
      ids = contractInfo.relatedBookingIds;
    } else if (targetBooking.id) {
      ids = [targetBooking.id];
    }
    const filtered = Array.from(new Set(ids.filter(Boolean)));
    return filtered.length > 0 ? filtered : (targetBooking.id ? [targetBooking.id] : []);
  }, [targetBooking, contractInfo]);
  const clientName = targetBooking.customer_name || 'Cliente';
  const pitchName = targetBooking.pitches?.name || 'Cancha';

  const isFullyPaid = remainingToCollect <= 0 && totalPaidFromHistory > 0;

  // Toggle de métodos de pago
  const toggleMethod = (methodId: PaymentMethod) => {
    setError(null);
    if (selectedMethods.includes(methodId)) {
      if (selectedMethods.length === 1) return;
      const next = selectedMethods.filter(m => m !== methodId);
      setSelectedMethods(next);
      if (next.length === 1) {
        const amt = editingPaymentId
          ? String(paymentHistory.find(e => e.id === editingPaymentId)?.amount || 0)
          : String(remainingToCollect);
        setMethodAmounts({ [next[0]]: amt });
      }
    } else {
      const next = [...selectedMethods, methodId];
      setSelectedMethods(next);
      if (next.length > 1) {
        const baseAmt = Number(Object.values(methodAmounts).reduce((s, v) => s + Number(v || 0), 0)) || remainingToCollect;
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

  const handleAmountChange = (methodId: PaymentMethod, val: string) => {
    setMethodAmounts(prev => ({ ...prev, [methodId]: val }));
  };

  const handleSplitEqually = () => {
    if (selectedMethods.length <= 1) return;
    const baseAmt = remainingToCollect > 0 ? remainingToCollect : totalEntered;
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

  const totalEntered = selectedMethods.reduce((sum, m) => {
    const val = Number(methodAmounts[m] || 0);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Por favor selecciona una foto o imagen del comprobante.');
      return;
    }
    setError(null);
    try {
      const compressed = await compressImage(file);
      setPhotoFile(compressed);
      setPhotoPreview(URL.createObjectURL(compressed));
    } catch {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    if (photoPreview && photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startEditPayment = (entry: PaymentEntry) => {
    setEditingPaymentId(entry.id);
    setShowHistory(false);
  };

  const cancelEdit = () => {
    setEditingPaymentId(null);
    // Re-inicializar para nuevo abono
    setSelectedMethods(['cash']);
    setMethodAmounts({ cash: String(remainingToCollect) });
    setPhotoPreview(null);
    setPhotoFile(null);
    setNotes('');
    setError(null);
  };

  // Envío del cobro/abono
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalEntered <= 0) {
      setError('El monto a abonar debe ser mayor a cero.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let uploadedProofUrl: string | null = photoPreview;

      if (photoFile) {
        const formData = new FormData();
        formData.append('file', photoFile);
        formData.append('type', 'receipt');
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok || !uploadJson.success) {
          throw new Error(uploadJson.error || 'Error al subir la foto del comprobante.');
        }
        uploadedProofUrl = uploadJson.url;
      } else if (!photoPreview) {
        uploadedProofUrl = null;
      }

      if (!bookingIds || bookingIds.length === 0) {
        setError('No se pudo identificar la reserva para registrar el pago.');
        return;
      }

      const isSplit = selectedMethods.length > 1;
      const primaryMethod = isSplit ? 'split' : selectedMethods[0];
      const splitsData: PaymentSplitItem[] = selectedMethods.map(m => ({
        method: m,
        amount: Number(methodAmounts[m] || 0),
      }));

      let authToken: string | undefined;
      try {
        const supabase = createClient();
        const { data: sessData } = await supabase.auth.getSession();
        authToken = sessData?.session?.access_token;
      } catch { /* noop */ }

      const res = await fetch('/api/bookings/remaining-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          booking_ids: bookingIds,
          payment_method: primaryMethod,
          amount: totalEntered,
          proof_url: uploadedProofUrl,
          notes,
          splits: isSplit ? splitsData : null,
          edit_payment_id: editingPaymentId || undefined,
        }),
      });

      const resJson = await res.json();
      if (!res.ok || !resJson.success) {
        throw new Error(resJson.error || 'No se pudo registrar el abono.');
      }

      onSuccess(resJson.data, bookingIds);
      onClose();
    } catch (err: any) {
      console.error('[RemainingPaymentModal submit error]', err);
      setError(err.message || 'Error al procesar el abono.');
    } finally {
      setSubmitting(false);
    }
  };

  const hasDigitalMethod = selectedMethods.some(m => m !== 'cash');

  return (
    <div className="fixed inset-0 z-[220] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl border border-border overflow-hidden max-h-[92vh] flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">

        {/* Cabecera */}
        <div className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-green-700 p-4 text-white shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
                <Receipt size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-base font-black leading-tight">
                  {editingPaymentId ? 'Editar Abono' : isFullyPaid ? 'Historial de Pagos' : 'Registrar Abono'}
                </h2>
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

          {/* Banner de contrato */}
          {contractInfo.isContract && (
            <div className="p-3 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Repeat size={15} className="text-violet-500 shrink-0" />
                <div>
                  <p className="font-extrabold text-violet-700 dark:text-violet-300">
                    {contractInfo.billingSchemeLabel}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-semibold">
                    {contractInfo.isPlanBilling
                      ? `Modalidad de plan acumulado: ${contractInfo.cycleLabel}`
                      : 'Cobro individual por cada partido / sesión'}
                  </p>
                </div>
              </div>
              <span className="text-[10px] uppercase font-black px-2.5 py-1 rounded-full bg-violet-600 text-white">
                {contractInfo.isPlanBilling ? 'Plan Completo' : 'Por Sesión'}
              </span>
            </div>
          )}

          {/* Resumen Financiero: Total, Abonado, Saldo */}
          <div className="grid grid-cols-3 gap-2 bg-secondary/50 p-3 rounded-2xl border border-border">
            <div className="text-center">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {contractInfo.isContract ? (contractInfo.isPlanBilling ? 'Total Plan' : 'Valor Sesión') : 'Total'}
              </p>
              <p className="text-xs sm:text-sm font-extrabold text-foreground mt-0.5">
                {formatCOP(totalPrice)}
              </p>
            </div>
            <div className="text-center border-x border-border/70 px-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Abonado</p>
              <p className="text-xs sm:text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {formatCOP(depositAmount + totalPaidFromHistory)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-black text-amber-500 dark:text-amber-400 uppercase tracking-wider">
                Saldo
              </p>
              <p className={`text-xs sm:text-sm font-black mt-0.5 ${remainingToCollect <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500 dark:text-amber-400'}`}>
                {remainingToCollect <= 0 ? '✓ Pago completo' : formatCOP(remainingToCollect)}
              </p>
            </div>
          </div>

          {/* Barra de progreso del pago */}
          {totalPrice > 0 && (
            <div className="space-y-1">
              <div className="w-full h-2.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, ((depositAmount + totalPaidFromHistory) / totalPrice) * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground text-right font-semibold">
                {Math.round(((depositAmount + totalPaidFromHistory) / totalPrice) * 100)}% pagado
                {paymentHistory.length > 0 && ` · ${paymentHistory.length} abono${paymentHistory.length > 1 ? 's' : ''}`}
              </p>
            </div>
          )}

          {/* Historial de Abonos */}
          <div className="rounded-2xl border border-border/70 overflow-hidden bg-secondary/20">
            <button
              type="button"
              onClick={() => setShowHistory(prev => !prev)}
              className="w-full flex items-center justify-between p-3 text-xs font-bold text-foreground hover:bg-secondary/40 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <History size={15} className="text-primary" />
                <span>Historial de abonos y pagos ({paymentHistory.length + (depositAmount > 0 ? 1 : 0)})</span>
              </span>
              <span className="text-[11px] text-primary flex items-center gap-1 font-semibold">
                {showHistory ? 'Ocultar' : 'Ver historial'}
                <ChevronDown size={14} className={`transform transition-transform ${showHistory ? 'rotate-180' : ''}`} />
              </span>
            </button>

            {showHistory && (
              <div className="p-3 border-t border-border/60 bg-card space-y-2.5 text-xs animate-in fade-in duration-150 max-h-[300px] overflow-y-auto">
                {/* Anticipo inicial */}
                {depositAmount > 0 && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-[11px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 size={12} className="text-emerald-500" />
                        Anticipo Inicial (Reserva)
                      </span>
                      <span className="font-black text-emerald-600 dark:text-emerald-400">
                        {formatCOP(depositAmount)}
                      </span>
                    </div>
                    {initialProofUrl && (
                      <div className="flex items-center gap-2.5 pt-1">
                        <img
                          src={initialProofUrl}
                          alt="Comprobante inicial"
                          className="w-12 h-12 object-cover rounded-lg border border-border shadow-2xs shrink-0 cursor-pointer hover:opacity-90"
                          onClick={() => setViewingImage({ url: initialProofUrl, title: 'Comprobante Anticipo' })}
                        />
                        <div>
                          <p className="font-bold text-[11px] text-foreground">Comprobante de anticipo</p>
                          <button
                            type="button"
                            onClick={() => setViewingImage({ url: initialProofUrl, title: 'Comprobante Anticipo' })}
                            className="text-[10px] text-primary font-bold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            <Eye size={11} /> Ver foto
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Cada abono del historial */}
                {paymentHistory.map((entry, idx) => (
                  <div key={entry.id} className="p-2.5 rounded-xl bg-secondary/40 border border-border/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-[11px] uppercase tracking-wider text-foreground flex items-center gap-1">
                        <DollarSign size={12} className="text-sky-500" />
                        Abono #{idx + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-foreground">
                          {formatCOP(entry.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => startEditPayment(entry)}
                          className="text-[10px] text-primary hover:underline flex items-center gap-0.5 cursor-pointer font-bold"
                          title="Editar este abono"
                        >
                          <Edit3 size={10} /> Editar
                        </button>
                      </div>
                    </div>
                    <div className="text-[11px] space-y-0.5 text-muted-foreground">
                      <p>
                        <strong className="text-foreground">Método:</strong>{' '}
                        {formatPaymentMethod(entry.method, entry.splits)}
                      </p>
                      <p>
                        <strong className="text-foreground">Fecha:</strong>{' '}
                        {fmtDate(entry.at)}
                      </p>
                      {entry.notes && (
                        <p>
                          <strong className="text-foreground">Nota:</strong> {entry.notes}
                        </p>
                      )}
                      {entry.editedAt && (
                        <div className="mt-1 p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-700 dark:text-amber-300 space-y-0.5">
                          <p className="font-bold flex items-center gap-1">
                            <Edit3 size={9} /> Editado el {fmtDate(entry.editedAt)}
                          </p>
                          {entry.previousAmount !== undefined && entry.previousAmount !== entry.amount && (
                            <p>Monto anterior: {formatCOP(entry.previousAmount)}</p>
                          )}
                          {entry.previousMethod && entry.previousMethod !== entry.method && (
                            <p>Método anterior: {formatPaymentMethod(entry.previousMethod)}</p>
                          )}
                          {entry.previousNotes && entry.previousNotes !== entry.notes && (
                            <p>Nota anterior: {entry.previousNotes}</p>
                          )}
                        </div>
                      )}
                    </div>
                    {entry.proofUrl && (
                      <div className="flex items-center gap-2.5 pt-1">
                        <img
                          src={entry.proofUrl}
                          alt={`Comprobante abono #${idx + 1}`}
                          className="w-12 h-12 object-cover rounded-lg border border-border shadow-2xs shrink-0 cursor-pointer hover:opacity-90"
                          onClick={() => setViewingImage({ url: entry.proofUrl!, title: `Comprobante Abono #${idx + 1}` })}
                        />
                        <button
                          type="button"
                          onClick={() => setViewingImage({ url: entry.proofUrl!, title: `Comprobante Abono #${idx + 1}` })}
                          className="text-[10px] text-primary font-bold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                        >
                          <Eye size={11} /> Ver comprobante
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {paymentHistory.length === 0 && depositAmount === 0 && (
                  <p className="text-[11px] text-muted-foreground italic text-center py-2">
                    No hay abonos registrados aún.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Banner de edición */}
          {editingPaymentId && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs">
              <span className="font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                <Edit3 size={13} />
                Editando abono #{paymentHistory.findIndex(e => e.id === editingPaymentId) + 1}
              </span>
              <button
                type="button"
                onClick={cancelEdit}
                className="text-[11px] text-primary font-bold hover:underline cursor-pointer"
              >
                Cancelar edición
              </button>
            </div>
          )}

          {/* Si ya está totalmente pagado y no estamos editando, solo mostrar historial */}
          {isFullyPaid && !editingPaymentId ? (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center text-xs font-bold text-emerald-700 dark:text-emerald-300 space-y-1">
              <CheckCircle2 size={24} className="mx-auto text-emerald-500" />
              <p>Saldo completamente pagado</p>
              <p className="text-[10px] font-semibold text-muted-foreground">
                Total cobrado: {formatCOP(depositAmount + totalPaidFromHistory)} de {formatCOP(totalPrice)}
              </p>
            </div>
          ) : (
            <>
              {/* Métodos de Pago */}
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

                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map((m) => {
                    const isSelected = selectedMethods.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleMethod(m.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${isSelected
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

              {/* Montos */}
              {selectedMethods.length === 1 ? (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground">
                    {editingPaymentId ? 'Monto corregido' : 'Monto a abonar'} ({PAYMENT_METHODS.find(m => m.id === selectedMethods[0])?.shortLabel})
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
                      placeholder={formatCOP(remainingToCollect).replace('$', '')}
                      className="w-full pl-8 pr-3 py-2 text-sm font-bold bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-foreground"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2 bg-secondary/30 p-3 rounded-2xl border border-border">
                  <p className="text-[11px] font-bold text-foreground flex items-center justify-between">
                    <span>Distribución del pago mixto:</span>
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

              {/* Foto del Comprobante */}
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
                  accept="image/jpeg,image/png,image/webp"
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
                      onClick={() => setViewingImage({ url: photoPreview, title: 'Comprobante' })}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-foreground truncate">
                        {photoFile ? 'Foto nueva seleccionada' : 'Foto guardada'}
                      </p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs font-bold text-primary px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors cursor-pointer mt-1"
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

              {/* Nota opcional */}
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

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold animate-in fade-in">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Botón de Confirmar */}
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={submitting || totalEntered <= 0}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>
                      {editingPaymentId
                        ? `Guardar Edición (${formatCOP(totalEntered)})`
                        : `Registrar Abono de ${formatCOP(totalEntered)}`}
                    </span>
                  )}
                </button>
              </div>
            </>
          )}

        </form>

      </div>

      {/* Modal de Vista Previa de Imagen */}
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
