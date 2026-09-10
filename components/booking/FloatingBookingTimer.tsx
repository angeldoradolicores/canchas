'use client';

import React, { useState } from 'react';
import { Clock3, X, ArrowRight } from 'lucide-react';
import { useActiveBooking } from '@/lib/active-booking-context';
import { useRouter, usePathname } from 'next/navigation';
import { CustomAlertModal } from '@/components/ui/CustomAlertModal';

export function FloatingBookingTimer() {
  const { activeBooking, secondsLeft, isFloating, setIsFloating, cancelActiveBooking } = useActiveBooking();
  const router = useRouter();
  const pathname = usePathname();
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  if (!activeBooking || secondsLeft <= 0 || !isFloating) {
    return null;
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const timeFormatted = `${mins}:${secs.toString().padStart(2, '0')}`;
  const isCritical = secondsLeft <= 50;

  const handleResume = () => {
    setIsFloating(false);
    if (pathname !== '/') {
      if (typeof window !== 'undefined') {
        localStorage.setItem('resume-booking', 'true');
      }
      router.push('/');
    } else {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('resume-active-booking'));
      }
    }
  };

  return (
    <aside
      aria-label="Reserva en curso"
      /* En móvil: ocupa todo el ancho con margen, justo encima de la barra de navegación inferior.
         En desktop: ancla abajo a la derecha con ancho fijo. */
      className="fixed bottom-[72px] sm:bottom-6 left-2 right-2 sm:left-auto sm:right-6 z-[990] animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      <div
        className={`flex items-center gap-2.5 p-3 sm:p-3.5 rounded-2xl shadow-2xl border backdrop-blur-xl transition-all ${isCritical
          ? 'bg-red-950/95 border-red-500/60 text-white ring-2 ring-red-500/40'
          : 'bg-card/98 border-primary/25 text-foreground ring-1 ring-primary/15 shadow-black/30'
          }`}
      >
        {/* Ícono reloj */}
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isCritical ? 'bg-red-600 text-white' : 'bg-primary/10 text-primary'
            }`}
        >
          <Clock3 size={18} className={isCritical ? 'animate-spin' : ''} />
        </div>

        {/* Texto — flex-1 para ocupar el espacio, min-w-0 para truncado */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`font-mono font-black text-xs px-2 py-0.5 rounded-lg whitespace-nowrap ${isCritical ? 'bg-red-600/80 text-white' : 'bg-primary/15 text-primary'
              }`}>
              ⏱ {timeFormatted}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
              reservando
            </span>
          </div>
          <p className="font-bold text-xs truncate leading-tight">
            {activeBooking.pitch.name.toUpperCase()}
          </p>
          <p className="text-[10px] text-muted-foreground truncate leading-tight">
            {activeBooking.selectedDate} · {activeBooking.selectedTimes.slice(0, 2).join(', ')}
            {activeBooking.selectedTimes.length > 2 ? ` +${activeBooking.selectedTimes.length - 2}` : ''}
          </p>
        </div>

        {/* Botones — nunca se encogen */}
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
          <button
            type="button"
            onClick={handleResume}
            className={`px-3 py-2 rounded-xl font-bold text-xs active:scale-95 transition-all flex items-center gap-1.5 shadow-sm whitespace-nowrap ${isCritical
              ? 'bg-red-500 hover:bg-red-400 text-white'
              : 'bg-primary hover:bg-primary/90 text-white'
              }`}
          >
            Completar <ArrowRight size={12} />
          </button>
          <button
            type="button"
            onClick={() => setConfirmCancelOpen(true)}
            className="p-1.5 rounded-xl bg-secondary/70 hover:bg-red-500/20 text-muted-foreground hover:text-red-500 transition-colors"
            title="Cancelar reserva"
            aria-label="Cancelar reserva"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <CustomAlertModal
        alertState={{
          isOpen: confirmCancelOpen,
          type: 'warning',
          title: '¿Cancelar reserva?',
          message: '¿Seguro que deseas cancelar esta reserva y liberar la cancha para otros jugadores?',
          showCancel: true,
          confirmOnLeft: true,
          confirmText: 'Sí, liberar cancha',
          confirmButtonClassName: 'bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2.5 rounded-xl flex-1 shadow-sm transition-colors',
          cancelText: 'Continuar reserva',
          cancelButtonClassName: 'btn-primary bg-secondary text-foreground hover:bg-border flex-1 font-bold',
          onConfirm: async () => {
            setConfirmCancelOpen(false);
            await cancelActiveBooking();
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('cancel-active-booking'));
            }
            router.push('/');
          }
        }}
        onClose={() => setConfirmCancelOpen(false)}
      />
    </aside>
  );
}
