'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Clock, ArrowRight, X, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useActiveBooking, EXPIRED_GRACE_KEY, GRACE_PERIOD_SECONDS } from '@/lib/active-booking-context';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export interface ExpiredGraceSnapshot {
  pitch: any;
  selectedDate: string;
  selectedTimes: string[];
  complexName: string;
  pitchName: string;
  expiredAt: number; // timestamp en ms
}

export function ExpiredBookingFloatingBanner() {
  const { activeBooking, secondsLeft } = useActiveBooking();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const [snapshot, setSnapshot] = useState<ExpiredGraceSnapshot | null>(null);
  const [remainingGrace, setRemainingGrace] = useState<number>(0);
  const [dismissed, setDismissed] = useState(false);

  /** Verifica contra Supabase si alguno de los slots ya fue reservado por otra persona */
  const checkSlotAvailability = useCallback(async (snap: ExpiredGraceSnapshot): Promise<boolean> => {
    try {
      const pitchId = snap.pitch?.id;
      if (!pitchId || !snap.selectedDate || !snap.selectedTimes?.length) return false;

      // Construir rango de fechas para el día seleccionado (UTC-5)
      const dayStart = `${snap.selectedDate}T00:00:00-05:00`;
      const dayEnd = `${snap.selectedDate}T23:59:59-05:00`;

      const { data, error } = await supabase
        .from('bookings')
        .select('start_time, status, expires_at')
        .eq('pitch_id', pitchId)
        .gte('start_time', dayStart)
        .lte('start_time', dayEnd)
        .in('status', ['confirmed', 'pending']);

      if (error || !data) return false;

      // Convertir los tiempos seleccionados a horas locales para comparar
      const bookedHours = new Set<number>();
      for (const b of data) {
        try {
          const d = new Date(b.start_time);
          const localH = (d.getUTCHours() - 5 + 24) % 24;
          bookedHours.add(localH);
        } catch { /* ignorar */ }
      }

      // Verificar si alguno de los selectedTimes ya está confirmado por alguien
      for (const t of snap.selectedTimes) {
        const str = String(t).trim();
        // Puede ser "7pm", "07:00", o "7"
        let hourNum = -1;
        const ampm = str.match(/^(\d+)(am|pm)$/i);
        if (ampm) {
          hourNum = parseInt(ampm[1], 10);
          if (ampm[2].toLowerCase() === 'pm' && hourNum !== 12) hourNum += 12;
          if (ampm[2].toLowerCase() === 'am' && hourNum === 12) hourNum = 0;
        } else if (str.includes(':')) {
          hourNum = parseInt(str.split(':')[0], 10);
        } else {
          hourNum = parseInt(str, 10);
        }

        if (hourNum >= 0 && bookedHours.has(hourNum)) {
          return true; // Al menos un slot ya está tomado
        }
      }

      return false;
    } catch {
      return false;
    }
  }, [supabase]);

  const dismissIfTaken = useCallback(async (snap: ExpiredGraceSnapshot) => {
    const taken = await checkSlotAvailability(snap);
    if (taken) {
      localStorage.removeItem(EXPIRED_GRACE_KEY);
      setSnapshot(null);
      setRemainingGrace(0);
    }
  }, [checkSlotAvailability]);

  // Cargar snapshot desde localStorage
  const checkSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(EXPIRED_GRACE_KEY);
      if (!saved) {
        setSnapshot(null);
        setRemainingGrace(0);
        return;
      }

      const parsed: ExpiredGraceSnapshot = JSON.parse(saved);
      const elapsedSeconds = Math.floor((Date.now() - parsed.expiredAt) / 1000);
      const left = GRACE_PERIOD_SECONDS - elapsedSeconds;

      if (left > 0) {
        setSnapshot(parsed);
        setRemainingGrace(left);
        // Verificar disponibilidad real con Supabase
        dismissIfTaken(parsed);
      } else {
        // Excedió los 4 minutos posteriores a los 5 minutos: eliminar y no mostrar
        localStorage.removeItem(EXPIRED_GRACE_KEY);
        setSnapshot(null);
        setRemainingGrace(0);
      }
    } catch {
      setSnapshot(null);
      setRemainingGrace(0);
    }
  }, [dismissIfTaken]);

  useEffect(() => {
    checkSnapshot();

    // Escuchar eventos de actualización del snapshot
    const handleUpdate = () => checkSnapshot();
    window.addEventListener('canchas-expired-grace-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('canchas-expired-grace-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [checkSnapshot]);

  // Suscripción realtime: cuando cambia un booking del pitch, verificar disponibilidad
  useEffect(() => {
    if (!snapshot?.pitch?.id) return;

    const channel = supabase
      .channel(`grace-banner-${snapshot.pitch.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `pitch_id=eq.${snapshot.pitch.id}`,
        },
        () => {
          // Alguien modificó una reserva de esta cancha: verificar si ya está tomada
          dismissIfTaken(snapshot);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [snapshot?.pitch?.id, dismissIfTaken, supabase]);

  // Contador regresivo de los 4 minutos de gracia
  useEffect(() => {
    if (!snapshot || remainingGrace <= 0) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - snapshot.expiredAt) / 1000);
      const left = GRACE_PERIOD_SECONDS - elapsed;

      if (left <= 0) {
        // Se acabaron los 4 minutos
        localStorage.removeItem(EXPIRED_GRACE_KEY);
        setSnapshot(null);
        setRemainingGrace(0);
        clearInterval(interval);
      } else {
        setRemainingGrace(left);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [snapshot, remainingGrace]);

  // Si hay una reserva activa en curso, no mostrar el banner de expirada
  if (activeBooking && secondsLeft > 0) {
    return null;
  }

  // Si no hay snapshot, se acabaron los 4 minutos o fue descartado manualmente
  if (!snapshot || remainingGrace <= 0 || dismissed) {
    return null;
  }

  const mins = Math.floor(remainingGrace / 60);
  const secs = remainingGrace % 60;
  const formattedCountdown = `${mins}:${secs.toString().padStart(2, '0')}`;

  // Formatear fecha legible en español sin año
  const formatDate = (dateVal: any): string => {
    if (!dateVal) return '';
    try {
      let dateObj: Date;
      if (typeof dateVal === 'string' && dateVal.includes('-')) {
        const clean = dateVal.split('T')[0];
        const parts = clean.split('-');
        dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      } else {
        dateObj = new Date(dateVal);
      }
      if (isNaN(dateObj.getTime())) return String(dateVal);

      const formatted = dateObj.toLocaleDateString('es-CO', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
      return formatted.replace('.', '');
    } catch {
      return String(dateVal);
    }
  };

  // Formatear horas a formato 12h (ej: 7pm, 8pm)
  const formatTime = (timeVal: any): string => {
    if (!timeVal && timeVal !== 0) return '';
    const str = String(timeVal).trim();
    if (/am|pm/i.test(str)) return str;
    const hourNum = parseInt(str, 10);
    if (isNaN(hourNum)) return str;
    const period = hourNum >= 12 ? 'pm' : 'am';
    const formattedHour = hourNum % 12 === 0 ? 12 : hourNum % 12;
    return `${formattedHour}${period}`;
  };

  const timesArray = Array.isArray(snapshot.selectedTimes) ? snapshot.selectedTimes : [snapshot.selectedTimes];
  const visibleTimes = timesArray.slice(0, 2).map(formatTime).join(', ');
  const extraCount = timesArray.length > 2 ? ` +${timesArray.length - 2}` : '';
  const dateFormatted = formatDate(snapshot.selectedDate);

  const handleResumeBooking = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('canchas_resume_grace_booking', JSON.stringify(snapshot));
      window.dispatchEvent(new CustomEvent('canchas-resume-grace-booking', { detail: snapshot }));
    }

    if (pathname !== '/') {
      router.push('/');
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(EXPIRED_GRACE_KEY);
    }
  };

  return (
    <aside
      aria-label="Aviso de reserva por completar"
      className="fixed bottom-[74px] sm:bottom-6 left-2 right-2 sm:left-auto sm:right-6 sm:max-w-md z-[990] animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="relative overflow-hidden rounded-2xl bg-card/98 border border-amber-500/50 shadow-2xl backdrop-blur-xl p-3.5 sm:p-4 text-foreground ring-1 ring-amber-500/20">
        {/* Glow sutil de fondo */}
        <div className="absolute -top-10 -right-10 w-28 h-28 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-start gap-3">
          {/* Ícono de alerta */}
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5 ring-1 ring-amber-500/30">
            <AlertTriangle size={20} className="animate-pulse" />
          </div>

          {/* Contenido principal */}
          <div className="flex-1 min-w-0">
            {/* Header con badge de tiempo restante de gracia */}
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono font-black text-[11px] sm:text-xs px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 whitespace-nowrap">
                ⏱ {formattedCountdown} restantes
              </span>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Tiempo Extra de 4 min
              </span>
            </div>

            {/* Mensaje de alerta */}
            <h4 className="text-xs sm:text-sm font-black text-foreground leading-tight">
              ¿Quieres terminar de completar tu reserva?
            </h4>

            {/* Datos: Complejo, Cancha y Horas */}
            <div className="mt-1 space-y-0.5">
              <p className="text-[11px] font-bold text-foreground truncate uppercase">
                {snapshot.complexName} · <span className="text-primary font-semibold  capitalize">{snapshot.pitchName}</span>
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                📅 {dateFormatted} · 🕒 {visibleTimes}{extraCount}
              </p>
            </div>

            <p className="text-[10px] text-muted-foreground/90 mt-1 leading-snug">
              Se acabó el tiempo pero aún tienes <strong className="text-amber-600 dark:text-amber-400 font-bold">{formattedCountdown}</strong> para subir tu comprobante de pago.
            </p>

            {/* Botones de acción */}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleResumeBooking}
                className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <span>Subir comprobante</span>
                <ArrowRight size={13} />
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="p-2 rounded-xl bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground text-xs font-semibold transition-colors cursor-pointer"
                title="Descartar"
                aria-label="Descartar"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
