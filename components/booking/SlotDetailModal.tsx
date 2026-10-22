'use client';

import { useMemo } from 'react';
import {
  X, Clock, CalendarDays, CheckCircle, XCircle, Receipt,
  DollarSign, Phone, MessageCircle, FileText, Sparkles, Wrench,
  AlertTriangle, ArrowRight, ShieldCheck, Plus
} from 'lucide-react';
import {
  getBookingRemainingPayment,
  getBookingOriginalProof,
  calculateRemainingBalance,
  formatPaymentMethod,
} from '@/lib/remaining-payment-utils';

interface SlotDetailModalProps {
  data: {
    pitch: any;
    slot: string; // "07:00"
    dateStr: string; // "2026-10-19"
    booking: any | null;
    relatedBookings?: any[];
    isOperating: boolean;
  };
  onClose: () => void;
  onApprove?: (booking: any) => void;
  onBatchApprove?: (bookings: any[], customerName: string, pitchName: string, totalPrice: number, depositAmount: number) => void;
  onCancelRequest?: (booking: any) => void;
  onBatchCancel?: (bookingIds: string[], label: string) => void;
  onCollectBalance?: (booking: any) => void;
  onViewProof?: (url: string) => void;
  onGoToList?: (booking: any) => void;
  onCreateManual?: (pitch: any, dateStr: string, slot: string) => void;
}

export function SlotDetailModal({
  data,
  onClose,
  onApprove,
  onBatchApprove,
  onCancelRequest,
  onBatchCancel,
  onCollectBalance,
  onViewProof,
  onGoToList,
  onCreateManual,
}: SlotDetailModalProps) {
  const { pitch, slot, dateStr, booking, relatedBookings = [], isOperating } = data;

  const hNum = parseInt(slot.split(':')[0], 10);
  const h12 = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum;
  const ampm = hNum < 12 ? 'AM' : 'PM';
  const timeLabel = `${h12}:00 ${ampm}`;

  const endHNum = (hNum + 1) % 24;
  const endH12 = endHNum === 0 ? 12 : endHNum > 12 ? endHNum - 12 : endHNum;
  const endAmpm = endHNum < 12 ? 'AM' : 'PM';
  const defaultTimeRange = `${timeLabel} – ${endH12}:00 ${endAmpm}`;

  // Formatear fecha en español
  const formattedDate = useMemo(() => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Bogota',
    });
  }, [dateStr]);

  // Lista ordenada de todas las reservas asociadas (misma cancha o múltiples canchas / horas no seguidas)
  const relatedList = useMemo(() => {
    if (relatedBookings && relatedBookings.length > 0) {
      return [...relatedBookings].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
    }
    return booking ? [booking] : [];
  }, [relatedBookings, booking]);

  const isMultiHour = relatedList.length > 1;
  const hoursCount = Math.max(1, relatedList.length);

  // Detección de múltiples canchas
  const distinctPitchNames = useMemo(() => {
    const names = relatedList.map(b => b.pitches?.name || pitch?.name || 'Cancha').filter(Boolean);
    return Array.from(new Set(names));
  }, [relatedList, pitch]);
  const isMultiPitch = distinctPitchNames.length > 1;

  // Detección de si todas las horas son continuas en la misma cancha
  const isContiguous = useMemo(() => {
    if (isMultiPitch || relatedList.length <= 1) return false;
    for (let i = 0; i < relatedList.length - 1; i++) {
      const curr = relatedList[i];
      const next = relatedList[i + 1];
      const currEnd = new Date(curr.end_time || new Date(curr.start_time).getTime() + 3600000).getTime();
      const nextStart = new Date(next.start_time).getTime();
      if (Math.abs(nextStart - currEnd) > 2000) return false;
    }
    return true;
  }, [relatedList, isMultiPitch]);

  // Rango horario consolidado (adaptado a continuas, no seguidas o multi-cancha)
  const { timeRange, sortedHourLabels } = useMemo(() => {
    if (relatedList.length > 1) {
      const labels = relatedList.map(b => {
        const d = new Date(b.start_time);
        const pName = b.pitches?.name || pitch?.name;
        const timePart = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' });
        return isMultiPitch ? `${pName}: ${timePart}` : timePart;
      });

      if (isContiguous) {
        const first = relatedList[0];
        const last = relatedList[relatedList.length - 1];
        const sDate = new Date(first.start_time);
        const eDate = new Date(last.end_time || new Date(last.start_time).getTime() + 3600000);

        const sLabel = sDate.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' });
        const eLabel = eDate.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' });

        return {
          timeRange: `${sLabel} – ${eLabel} (${hoursCount} horas continuas)`,
          sortedHourLabels: labels,
        };
      } else if (isMultiPitch) {
        return {
          timeRange: `${hoursCount} horas en ${distinctPitchNames.length} canchas`,
          sortedHourLabels: labels,
        };
      } else {
        return {
          timeRange: `${hoursCount} horas no seguidas (${labels.join(', ')})`,
          sortedHourLabels: labels,
        };
      }
    }
    return {
      timeRange: defaultTimeRange,
      sortedHourLabels: [timeLabel],
    };
  }, [relatedList, hoursCount, isContiguous, isMultiPitch, distinctPitchNames, defaultTimeRange, timeLabel, pitch]);

  const isManual = booking?.source === 'owner_panel' || relatedList.some(b => b.source === 'owner_panel');
  const isDraft = booking?.status === 'draft';
  const isPending = booking?.status === 'pending' || relatedList.some(b => b.status === 'pending');
  const isConfirmed = booking?.status === 'confirmed' || relatedList.some(b => b.status === 'confirmed');

  // Precios consolidados para todas las horas/canchas reservadas
  const tPrice = useMemo(() => {
    if (relatedList.length > 1) {
      return relatedList.reduce((sum, b) => {
        return sum + Number(b.total_price || b.pitches?.price_per_hour || pitch?.price_per_hour || 80000);
      }, 0);
    }
    return Number(booking?.total_price || pitch?.price_per_hour || 80000);
  }, [relatedList, booking, pitch]);

  const dAmount = useMemo(() => {
    if (relatedList.length > 1) {
      const explicitDeposit = relatedList.reduce((sum, b) => sum + Number(b.deposit_amount || 0), 0);
      if (explicitDeposit > 0) return explicitDeposit;
    } else if (Number(booking?.deposit_amount || 0) > 0) {
      return Number(booking?.deposit_amount || 0);
    }

    if (pitch) {
      const customPricing = pitch.custom_pricing || {};
      const isFixed = customPricing.booking_type === 'fixed';
      const pct = customPricing.booking_percentage || pitch.booking_percentage || 50;
      if (isFixed) {
        return Number(customPricing.booking_fixed || 0) * hoursCount;
      }
      return (tPrice * Number(pct)) / 100;
    }
    return (tPrice * 50) / 100;
  }, [relatedList, booking, pitch, hoursCount, tPrice]);

  const remainingInfo = booking ? getBookingRemainingPayment(booking) : null;
  const remPaid = useMemo(() => {
    if (relatedList.length > 1) {
      return relatedList.reduce((sum, b) => {
        const info = getBookingRemainingPayment(b);
        return sum + Number(info?.amount || b.remaining_amount_paid || 0);
      }, 0);
    }
    return Number(remainingInfo?.amount || booking?.remaining_amount_paid || 0);
  }, [relatedList, remainingInfo, booking]);

  const balance = calculateRemainingBalance(tPrice, dAmount, remPaid);
  const isFullyPaid = isConfirmed && (balance <= 0 || remPaid > 0);

  const proofUrl = useMemo(() => {
    if (relatedList.length > 1) {
      const found = relatedList.find(b => b.payment_proof_url);
      if (found) return found.payment_proof_url;
    }
    return booking ? (booking.payment_proof_url || remainingInfo?.proofUrl) : null;
  }, [relatedList, booking, remainingInfo]);

  const phoneClean = booking?.customer_phone ? booking.customer_phone.replace(/\D/g, '') : '';
  const waSummary = relatedList.length > 1
    ? relatedList.map(b => {
      const pName = b.pitches?.name || pitch?.name || 'Cancha';
      const s = new Date(b.start_time).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' });
      return `${pName} a las ${s}`;
    }).join(', ')
    : `${pitch?.name || 'la cancha'} de ${timeRange}`;

  const waUrl = phoneClean
    ? `https://wa.me/57${phoneClean}?text=Hola%20${encodeURIComponent(booking?.customer_name || 'jugador')},%20te%20contacto%20sobre%20tu%20reserva%20en%20${encodeURIComponent(waSummary)}.`
    : '';

  return (
    <div className="fixed inset-0 z-[220] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border border-border p-5 sm:p-6 shadow-2xl animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado con Cancha, Franja y Botón Cerrar */}
        <div className="flex items-start justify-between gap-3 border-b border-border pb-3.5">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-primary" />
              <h3 className="font-extrabold text-sm sm:text-base text-foreground tracking-tight">
                {pitch?.name?.toUpperCase() || 'CANCHA'}
              </h3>
            </div>
            <p className="text-xs font-semibold text-primary flex items-center gap-1.5 capitalize">
              <CalendarDays size={13} className="shrink-0 text-muted-foreground" />
              {formattedDate} · {timeRange}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
            title="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* CONTENIDO SEGÚN ESTADO DE LA HORA */}
        {booking ? (
          <div className="space-y-4">
            {/* 1. Badge de Estado Principal Destacado */}
            <div>
              {isPending && (
                <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-800 dark:text-amber-200 space-y-1">
                  <div className="flex items-center gap-2 font-extrabold text-sm">
                    <Clock size={16} className="text-amber-600 animate-pulse" />
                    <span>Reserva Pendiente de Aprobación</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    El cliente envió su solicitud y subió el comprobante de anticipo. Revisa el pago y confirma la reserva.
                  </p>
                </div>
              )}

              {isConfirmed && !isFullyPaid && (
                <div className="p-3.5 rounded-2xl bg-sky-500/15 border border-sky-500/40 text-sky-800 dark:text-sky-200 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-extrabold text-sm">
                      <Receipt size={16} className="text-sky-600" />
                      <span>Aprobada · Saldo Por Cobrar</span>
                    </div>
                    <span className="text-xs font-black px-2 py-0.5 rounded-md bg-sky-500 text-white">
                      Resta: ${balance.toLocaleString('es-CO')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    El anticipo está confirmado. Cuando el cliente juegue en la cancha, registra el cobro del saldo restante.
                  </p>
                </div>
              )}

              {isConfirmed && isFullyPaid && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-800 dark:text-emerald-200 space-y-1">
                  <div className="flex items-center gap-2 font-extrabold text-sm">
                    <CheckCircle size={16} className="text-emerald-600" />
                    <span>Aprobada · Totalmente Cobrada (100%)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Esta reserva tiene el pago completo registrado y validado.
                  </p>
                </div>
              )}

              {isDraft && (
                <div className="p-3.5 rounded-2xl bg-orange-500/15 border border-orange-500/40 text-orange-800 dark:text-orange-200 space-y-1">
                  <div className="flex items-center gap-2 font-extrabold text-sm">
                    <Clock size={16} className="text-orange-600 animate-pulse" />
                    <span>Siendo Reservada en este momento</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Un cliente está en el proceso de pago y checkout. Si no completa el pago a tiempo, la hora se liberará automáticamente.
                  </p>
                </div>
              )}

              {isManual && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/15 text-purple-700 dark:text-purple-300 text-xs font-bold border border-purple-500/30">
                  <Wrench size={12} />
                  <span>Reserva Registrada Manualmente por el Propietario</span>
                </div>
              )}
            </div>

            {/* 2. Banner Destacado para Reservas Múltiples (Multi-Cancha, Multi-Hora no seguidas o Continuas) */}
            {isMultiHour && (
              <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-950 dark:text-amber-100 space-y-2.5 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div>
                      <h4 className="font-extrabold text-sm tracking-tight text-amber-950 dark:text-amber-100">
                        {isMultiPitch
                          ? `Reserva Múltiple (${hoursCount} Horas en ${distinctPitchNames.length} Canchas)`
                          : isContiguous
                            ? `Reserva Continua de ${hoursCount} Horas`
                            : `Reserva Múltiple (${hoursCount} Horas No Seguidas)`}
                      </h4>
                      <p className="text-[11px] text-amber-900/80 dark:text-amber-300 font-medium">
                        {isMultiPitch
                          ? 'El usuario reservó turnos en diferentes canchas el mismo día.'
                          : isContiguous
                            ? 'El usuario reservó un bloque de horas seguidas.'
                            : 'El usuario reservó más de una hora con horarios separados / no seguidos.'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500 text-white shrink-0">
                    {hoursCount} Turnos
                  </span>
                </div>

                {/* Lista detallada de cada turno con su cancha, horario y valor */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                  {relatedList.map((b: any, idx: number) => {
                    const bPitchName = b.pitches?.name || (b.pitch_id === pitch?.id ? pitch?.name : 'Cancha');
                    const sTime = new Date(b.start_time).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' });
                    const eTime = b.end_time
                      ? new Date(b.end_time).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' })
                      : '';
                    const bPrice = Number(b.total_price || b.pitches?.price_per_hour || pitch?.price_per_hour || 80000);
                    return (
                      <div key={b.id || idx} className="flex items-center justify-between p-2 rounded-xl bg-card/85 border border-amber-500/30 text-xs shadow-2xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-primary/15 text-primary font-black text-[10px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="font-bold text-foreground text-[11px] truncate">{bPitchName}</p>
                            <p className="text-[10px] text-muted-foreground">{sTime} {eTime ? `– ${eTime}` : ''}</p>
                          </div>
                        </div>
                        <span className="text-[11px] font-extrabold text-foreground shrink-0 pl-1">
                          ${bPrice.toLocaleString('es-CO')}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Mensaje explícito solicitado por el usuario para el dueño */}
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-950 dark:text-amber-200 leading-relaxed">
                  ℹ️ <strong>Resumen:</strong> El valor total de <strong>${tPrice.toLocaleString('es-CO')}</strong> y el abono correspondiente de <strong>${dAmount.toLocaleString('es-CO')}</strong> corresponden a <strong>{booking.customer_name || 'este cliente'}</strong> por haber reservado estas <strong>{hoursCount} horas</strong> en estas canchas.
                </div>
              </div>
            )}

            {/* 3. Datos del Cliente y Contacto Directo */}
            <div className="p-3.5 bg-secondary/40 rounded-2xl border border-border space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary font-black text-sm flex items-center justify-center shrink-0">
                    {(booking.customer_name || 'U')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-extrabold text-sm text-foreground truncate">
                      {booking.customer_name || 'Cliente sin nombre'}
                    </h4>
                    <p className="text-xs text-muted-foreground truncate">
                      {booking.customer_phone ? `Tel: ${booking.customer_phone}` : 'Sin teléfono'}
                    </p>
                  </div>
                </div>

                {/* Botones de Contacto Rápido */}
                {booking.customer_phone && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                        title="Escribir por WhatsApp"
                      >
                        <MessageCircle size={14} />
                        <span className="hidden sm:inline">WhatsApp</span>
                      </a>
                    )}
                    <a
                      href={`tel:${booking.customer_phone}`}
                      className="p-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground border border-border transition-colors cursor-pointer"
                      title="Llamar"
                    >
                      <Phone size={14} />
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* 4. Desglose Financiero */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-secondary/30 border border-border/70">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">
                  {isMultiHour ? `Total (${hoursCount}h)` : 'Valor Turno'}
                </p>
                <p className="font-black text-xs sm:text-sm text-foreground mt-0.5">
                  ${tPrice.toLocaleString('es-CO')}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-300">
                  {isMultiHour ? 'Separación' : 'Anticipo'}
                </p>
                <p className="font-black text-xs sm:text-sm text-emerald-700 dark:text-emerald-300 mt-0.5">
                  ${dAmount.toLocaleString('es-CO')}
                </p>
              </div>
              <div className={`p-2.5 rounded-xl border ${balance > 0 ? 'bg-sky-500/10 border-sky-500/20' : 'bg-secondary/30 border-border/70'}`}>
                <p className={`text-[10px] uppercase font-bold ${balance > 0 ? 'text-sky-700 dark:text-sky-300' : 'text-muted-foreground'}`}>
                  Saldo Restante
                </p>
                <p className={`font-black text-xs sm:text-sm mt-0.5 ${balance > 0 ? 'text-sky-700 dark:text-sky-300' : 'text-foreground'}`}>
                  ${Math.max(0, balance).toLocaleString('es-CO')}
                </p>
              </div>
            </div>

            {/* 5. Comprobante de Pago (si existe) */}
            {proofUrl && (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-secondary/30 border border-border">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-primary" />
                  <div>
                    <p className="text-xs font-bold text-foreground">Comprobante de Pago Adjunto</p>
                    <p className="text-[10px] text-muted-foreground">
                      {isMultiHour ? `Respaldo de separación por ${hoursCount} horas` : 'Adjuntado por el cliente'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onViewProof?.(proofUrl)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  Ver foto
                </button>
              </div>
            )}

            {/* 6. Botones de Acción de Estado */}
            <div className="space-y-2 pt-2 border-t border-border">
              {isPending && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      if (isMultiHour && onBatchApprove) {
                        onBatchApprove(
                          relatedList,
                          booking.customer_name || 'Cliente',
                          distinctPitchNames.join(', ') || pitch?.name || 'Cancha',
                          tPrice,
                          dAmount
                        );
                      } else {
                        onApprove?.(booking);
                      }
                    }}
                    className="py-2.5 px-3 rounded-xl font-extrabold text-xs bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer text-center"
                  >
                    <CheckCircle size={15} />
                    <span>
                      {isMultiHour ? `Aprobar ${hoursCount} Horas Juntas` : 'Aprobar Reserva'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      if (isMultiHour && onBatchCancel) {
                        onBatchCancel(
                          relatedList.map(b => b.id),
                          `Reserva de ${booking.customer_name || 'Cliente'} (${hoursCount} horas: ${sortedHourLabels.join(', ')})`
                        );
                      } else {
                        onCancelRequest?.(booking);
                      }
                    }}
                    className="py-2.5 px-3 rounded-xl font-extrabold text-xs text-rose-600 dark:text-rose-400 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 border border-rose-200/80 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-center"
                  >
                    <XCircle size={15} />
                    <span>
                      {isMultiHour ? `Rechazar ${hoursCount} Horas` : 'Rechazar'}
                    </span>
                  </button>
                </div>
              )}

              {isConfirmed && !isFullyPaid && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    const combinedBooking = isMultiHour
                      ? { ...booking, total_price: tPrice, deposit_amount: dAmount, remaining_amount_paid: remPaid }
                      : booking;
                    onCollectBalance?.(combinedBooking);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl font-extrabold text-xs bg-sky-600 hover:bg-sky-700 active:scale-95 text-white transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Receipt size={15} />
                  <span>
                    Cobrar Saldo en Local (${Math.max(0, balance).toLocaleString('es-CO')})
                    {isMultiHour && ` · ${hoursCount} Horas`}
                  </span>
                </button>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onGoToList?.(booking);
                  }}
                  className="flex-1 py-2 px-3 rounded-xl font-bold text-xs bg-secondary hover:bg-secondary/80 text-foreground border border-border transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowRight size={14} className="text-primary" />
                  <span>Ver en Lista de Reservas</span>
                </button>

                {(isConfirmed || isPending) && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      if (isMultiHour && onBatchCancel) {
                        onBatchCancel(
                          relatedList.map(b => b.id),
                          `Reserva de ${booking.customer_name || 'Cliente'} (${hoursCount} horas: ${sortedHourLabels.join(', ')})`
                        );
                      } else {
                        onCancelRequest?.(booking);
                      }
                    }}
                    className="py-2 px-3 rounded-xl font-bold text-xs text-rose-600 hover:bg-rose-500/10 transition-colors flex items-center gap-1 cursor-pointer"
                    title={isMultiHour ? `Cancelar las ${hoursCount} horas juntas` : 'Cancelar esta reserva'}
                  >
                    <XCircle size={14} />
                    <span>{isMultiHour ? `Cancelar las ${hoursCount} Horas Juntas` : 'Cancelar'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : !isOperating ? (
          /* Escenario: Fuera de Horario / Cerrado */
          <div className="space-y-4 py-2">
            <div className="p-4 rounded-2xl bg-secondary/40 border border-border text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto text-xl">
                🔒
              </div>
              <h4 className="font-extrabold text-sm text-foreground">Horario Fuera de Operación</h4>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Esta cancha está configurada como cerrada a las {timeLabel}.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onCreateManual?.(pitch, dateStr, slot);
              }}
              className="w-full py-2.5 rounded-xl font-bold text-xs bg-secondary hover:bg-secondary/80 text-foreground border border-border flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus size={14} />
              <span>Forzar Reserva Manual de Emergencia</span>
            </button>
          </div>
        ) : (
          /* Escenario: LIBRE / DISPONIBLE */
          <div className="space-y-4 py-2">
            <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-600 flex items-center justify-center mx-auto text-2xl animate-bounce">
                ⚽
              </div>
              <h4 className="font-extrabold text-base text-emerald-800 dark:text-emerald-200">
                ¡Esta Cancha está Disponible!
              </h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                La franja de {timeRange} en {pitch?.name} no tiene reservas asignadas. Está 100% libre para jugar o agendar un cliente directamente.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onCreateManual?.(pitch, dateStr, slot);
              }}
              className="w-full py-3 px-4 rounded-xl font-extrabold text-xs sm:text-sm bg-primary hover:bg-primary/90 text-primary-foreground transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <Plus size={16} />
              <span>+ Crear Reserva Manual en este Horario</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
