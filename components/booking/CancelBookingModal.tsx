'use client';

import React from 'react';
import { AlertCircle, Clock3, Compass, Trash2, ArrowLeft } from 'lucide-react';
import { useActiveBooking } from '@/lib/active-booking-context';
import { useRouter } from 'next/navigation';

interface CancelBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStayInBooking: () => void;
  onMinimizeToFloating?: () => void;
}

export function CancelBookingModal({
  isOpen,
  onClose,
  onStayInBooking,
  onMinimizeToFloating,
}: CancelBookingModalProps) {
  const { activeBooking, secondsLeft, cancelActiveBooking, setIsFloating } = useActiveBooking();
  const router = useRouter();

  if (!isOpen || !activeBooking) return null;

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const timeFormatted = `${mins}:${secs.toString().padStart(2, '0')}`;

  const handleMinimize = () => {
    setIsFloating(true);
    onClose();
    if (onMinimizeToFloating) onMinimizeToFloating();
  };

  const handleCancelAndRelease = async () => {
    await cancelActiveBooking();
    onClose();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cancel-active-booking'));
    }
    router.push('/');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-booking-title"
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-md bg-card border border-border/80 rounded-3xl shadow-2xl p-6 sm:p-7 relative text-foreground animate-in zoom-in-95 duration-200"
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        }}
      >
        {/* Encabezado con Icono */}
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0 text-amber-500">
            <AlertCircle size={26} />
          </div>
          <div className="flex-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md inline-block mb-1">
              Atención
            </span>
            <h3 id="cancel-booking-title" className="text-xl font-black text-foreground tracking-tight">
              Tienes una reserva en curso
            </h3>
          </div>
        </div>

        {/* Tarjeta con detalles de la cancha y cronómetro */}
        <div className="bg-secondary/60 border border-border/60 rounded-2xl p-4 mb-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-foreground truncate">{activeBooking.pitch.name}</span>
            <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-primary text-white shadow-sm flex items-center gap-1">
              <Clock3 size={13} /> {timeFormatted}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            📅 {activeBooking.selectedDate} · ⏰ {activeBooking.selectedTimes.join(', ')}
          </p>
          <p className="text-[11px] text-muted-foreground/90 border-t border-border/40 pt-2 mt-2 leading-relaxed">
            Esta cancha está bloqueada exclusivamente para ti durante este tiempo. Si te vas sin confirmar, ¿qué deseas hacer?
          </p>
        </div>

        {/* Botones de acción estilizados con la identidad del proyecto */}
        <div className="flex flex-col gap-2.5">
          {/* Opción 1: Seguir navegando con cronómetro flotante */}
          <button
            type="button"
            onClick={handleMinimize}
            className="w-full py-3 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.99]"
          >
            <Compass size={17} />
            <span>Seguir navegando (Cronómetro flotante)</span>
          </button>

          {/* Opción 2: Cancelar reserva y liberar cancha */}
          <button
            type="button"
            onClick={handleCancelAndRelease}
            className="w-full py-3 px-4 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive font-bold text-sm border border-destructive/20 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
          >
            <Trash2 size={16} />
            <span>Cancelar reserva y liberar cancha</span>
          </button>

          {/* Opción 3: Quedarse en la reserva */}
          <button
            type="button"
            onClick={onStayInBooking}
            className="w-full py-2.5 px-4 rounded-xl text-muted-foreground hover:text-foreground font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Volver a la pantalla de pago</span>
          </button>
        </div>
      </div>
    </div>
  );
}
