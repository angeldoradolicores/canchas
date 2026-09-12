'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Upload, CheckCircle2, Loader2, Image as ImageIcon, CalendarDays, Clock3, XCircle, Copy, CheckCheck, X } from 'lucide-react';
import { Pitch } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import { useToday } from '@/lib/use-today';
import { CustomMonthCalendar } from '../explore/CustomMonthCalendar';
import { useActiveBooking } from '@/lib/active-booking-context';
import { CancelBookingModal } from '@/components/booking/CancelBookingModal';
import { CustomAlertModal, AlertModalState } from '@/components/ui/CustomAlertModal';


const DEFAULT_TIME_SLOTS = [
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'
];

const TIME_CATEGORIES = [
  { key: 'manana', icon: '', label: 'Mañana' },
  { key: 'tarde', icon: '', label: 'Tarde' },
  { key: 'noche', icon: '', label: 'Noche' },
] as const;

function TimeLeft({ expiresAt }: { expiresAt: string }) {
  const [secs, setSecs] = useState(() => {
    const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  useEffect(() => {
    const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
    setSecs(Math.max(0, diff));
  }, [expiresAt]);

  useEffect(() => {
    if (secs <= 0) return;
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secs]);

  if (secs <= 0) return <span className="text-[8px] text-amber-500 font-bold">Liberando...</span>;

  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return (
    <span className="font-mono font-black text-[9px] tracking-tight text-amber-600 dark:text-amber-400">
      {m}:{s.toString().padStart(2, '0')}
    </span>
  );
}

function fmtSlot(slot: string) {
  const h = parseInt(slot.split(':')[0]);
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:00 ${ampm}`;
}

function PaymentMethodCard({ pm }: { pm: { type: string; label: string; number: string; name: string } }) {
  const [copied, setCopied] = useState(false);
  const icons: Record<string, string> = { nequi: '🟣', daviplata: '🔴', bancolombia: '🔵', transferencia: '🏦' };


  const handleCopy = () => {
    navigator.clipboard.writeText(pm.number).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={`flex items-center justify-between p-3.5 rounded-xl border ${'bg-secondary border-border text-foreground'}`}>
      <div>
        <div className="flex items-center gap-2 font-bold text-sm">
          <span>{icons[pm.type] || '💳'}</span>
          <span>{pm.label}</span>
        </div>
        <div className="font-mono font-bold text-base tracking-wider mt-0.5">{pm.number}</div>
        {pm.name && <div className="text-xs opacity-70 mt-0.5">A nombre de: {pm.name}</div>}
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="ml-3 flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white/70 hover:bg-white rounded-lg text-xs font-bold border border-current/25 transition-all"
        title="Copiar número"
      >
        {copied ? <><CheckCheck size={14} /> Copiado!</> : <><Copy size={14} /> Copiar</>}
      </button>
    </div>
  );
}

interface BookingFlowProps {
  pitch: Pitch;
  onBack: (times?: string[], date?: string) => void;
  onFinish?: () => void;
  preselectedTimes?: string[];
  preselectedDate?: string;
}

export function BookingFlow({ pitch, onBack, onFinish, preselectedTimes = [], preselectedDate = '' }: BookingFlowProps) {
  const today = useToday();
  const normalizeTime = (t: string) => t ? t.substring(0, 5) : '';

  const [step, setStep] = useState(preselectedTimes.length > 0 ? 2 : 1);
  const [selectedDate, setSelectedDate] = useState(preselectedDate || today || '');
  const [selectedTimes, setSelectedTimes] = useState<string[]>(
    preselectedTimes.map(normalizeTime)
  );
  const [activeCategory, setActiveCategory] = useState<'manana' | 'tarde' | 'noche'>('noche');

  useEffect(() => {
    if (today && !selectedDate && !preselectedDate) setSelectedDate(today);
  }, [today, selectedDate, preselectedDate]);

  const [takenSlots, setTakenSlots] = useState<Map<string, { status: string, expires_at: string | null }>>(new Map());
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [alertState, setAlertState] = useState<AlertModalState>({
    isOpen: false,
    type: 'info',
    title: '',
    message: ''
  });



  const { user, profile } = useAuth();
  const supabase = createClient();
  const {
    activeBooking,
    secondsLeft,
    startLock,
    cancelActiveBooking,
    clearActiveBooking,
    setIsFloating,
    lockError,
  } = useActiveBooking();
  const router = useRouter();

  const [showCancelPrompt, setShowCancelPrompt] = useState(false);

  // Control del temporizador flotante automático
  useEffect(() => {
    setIsFloating(false);
    return () => {
      setIsFloating(true);
    };
  }, [setIsFloating]);

  // Si entra con horas preseleccionadas y no hay bloqueo activo, bloquear automáticamente
  useEffect(() => {
    if (preselectedTimes.length > 0 && selectedDate && (!activeBooking || activeBooking.pitch.id !== pitch.id)) {
      startLock(pitch, selectedDate, preselectedTimes.map(normalizeTime));
    }
  }, [pitch.id, selectedDate, preselectedTimes]); // eslint-disable-line react-hooks/exhaustive-deps

  const isExpiredAlertRef = useRef(false);
  const hadActiveLockRef = useRef(false);

  // Registrar si hubo un bloqueo activo para esta cancha
  useEffect(() => {
    if (activeBooking && activeBooking.pitch.id === pitch.id) {
      hadActiveLockRef.current = true;
    }
  }, [activeBooking, pitch.id]);

  useEffect(() => {
    if (!selectedDate || !pitch.id) return;
    setLoadingSlots(true);

    const fetchTaken = async (silent = false) => {
      if (!silent) setLoadingSlots(true);
      const dayStart = `${selectedDate}T00:00:00-05:00`;
      const dayEnd = `${selectedDate}T23:59:59-05:00`;

      const { data } = await supabase
        .from('bookings')
        .select('start_time, status, expires_at')
        .eq('pitch_id', pitch.id)
        .gte('start_time', dayStart)
        .lte('start_time', dayEnd)
        .neq('status', 'cancelled');

      const taken = new Map<string, { status: string, expires_at: string | null }>();
      (data || []).forEach((b: any) => {
        if (b.status === 'draft' && b.expires_at && new Date(b.expires_at) < new Date()) {
          return;
        }
        try {
          const d = new Date(b.start_time);
          const localH = (d.getUTCHours() - 5 + 24) % 24;
          const h = `${String(localH).padStart(2, '0')}:00`;
          taken.set(h, { status: b.status, expires_at: b.expires_at });
        } catch (e) {
          if (b.start_time) {
            taken.set(b.start_time.substring(11, 16), { status: b.status, expires_at: b.expires_at });
          }
        }
      });
      setTakenSlots(taken);
      if (!silent) setLoadingSlots(false);
    };

    fetchTaken(false);

    // Polling continuo cada 3.5s silencioso en segundo plano sin interrumpir ni mostrar loaders
    const pollInterval = setInterval(() => fetchTaken(true), 3500);

    const channel = supabase
      .channel(`public:bookings:flow:pitch_id=eq.${pitch.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `pitch_id=eq.${pitch.id}` },
        () => {
          fetchTaken(true);
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [selectedDate, pitch.id, supabase]);

  const formattedDate = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  const pricePerHour = pitch.price_per_hour;
  const customPricing = (pitch as any).custom_pricing || {};

  const getSlotPrice = (time: string) => {
    return customPricing[time] || pricePerHour;
  };

  const calculateTotal = (times: string[]) => {
    return times.reduce((total, time) => total + getSlotPrice(time), 0);
  };

  const totalHours = selectedTimes.length;
  const totalPrice = calculateTotal(selectedTimes);

  let abonoPrice = 0;
  if (customPricing.booking_type === 'fixed') {
    abonoPrice = (customPricing.booking_fixed || 0) * totalHours;
  } else {
    abonoPrice = (totalPrice * Number((pitch as any).booking_percentage || 50)) / 100;
  }

  // Manejo de expiración del temporizador con salida garantizada
  const triggerExpiredAlert = useCallback(() => {
    if (isExpiredAlertRef.current) return;
    isExpiredAlertRef.current = true;

    setAlertState({
      isOpen: true,
      type: 'warning',
      title: '¡Tiempo de reserva agotado!',
      message: (
        <div className="text-center space-y-2">
          <p className="text-sm font-semibold text-foreground">
            El tiempo de <strong className="text-primary">5 minutos</strong> para completar el pago ha expirado.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Las horas han sido liberadas automáticamente para que otros jugadores puedan reservarlas. Te redirigiremos a la cancha.
          </p>
        </div>
      ),
      confirmText: 'Volver a Canchas',
      confirmButtonClassName: 'btn-primary w-full shadow-md',
      onConfirm: () => {
        isExpiredAlertRef.current = false;
        setAlertState(prev => ({ ...prev, isOpen: false }));
        onBack();
      },
    });

    // Auto-redirección de seguridad a los 4 segundos si el usuario no interactúa
    setTimeout(() => {
      if (isExpiredAlertRef.current) {
        isExpiredAlertRef.current = false;
        setAlertState(prev => ({ ...prev, isOpen: false }));
        onBack();
      }
    }, 4500);
  }, [onBack]);

  // Escuchar evento del temporizador activo cuando expira a 0
  useEffect(() => {
    const handleExpiredEvent = (e: any) => {
      const pitchId = e.detail?.pitchId;
      if (!pitchId || pitchId === pitch.id) {
        triggerExpiredAlert();
      }
    };

    window.addEventListener('active-booking-expired', handleExpiredEvent);
    return () => {
      window.removeEventListener('active-booking-expired', handleExpiredEvent);
    };
  }, [pitch.id, triggerExpiredAlert]);

  // Si estaba en el paso de confirmación y el tiempo llegó a 0
  useEffect(() => {
    if (step === 2 && hadActiveLockRef.current && secondsLeft <= 0) {
      triggerExpiredAlert();
    }
  }, [step, secondsLeft, triggerExpiredAlert]);

  const toggleTime = (slot: string) => {
    if (selectedTimes.includes(slot)) {
      setSelectedTimes(prev => prev.filter(s => s !== slot));
    } else if (selectedTimes.length >= 4) {
      setAlertState({
        isOpen: true,
        type: 'warning',
        title: '⏰ Límite de horas alcanzado',
        message: 'Solo puedes reservar un máximo de 4 horas por transacción. Si necesitas más tiempo, crea una nueva reserva.',
      });
    } else {
      setSelectedTimes(prev => [...prev, slot].sort());
    }
  };


  const handleLockBooking = async () => {
    if (selectedTimes.length === 0 || !selectedDate) {
      setError('Por favor selecciona al menos una hora.');
      return;
    }

    const messageNode = (
      <div className="flex flex-col gap-3 items-center text-center mt-2">
        <p className="text-sm text-muted-foreground">Estás a punto de iniciar una reserva en:</p>
        <p className="text-xl font-black uppercase text-primary bg-primary/10 px-5 py-2.5 rounded-xl border border-primary/20 tracking-wider w-full shadow-sm">
          {pitch.name}
        </p>
        <div className="bg-secondary/60 border border-border rounded-xl p-3.5 w-full space-y-2 mt-1">
          <p className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground font-bold flex items-center gap-1"><CalendarDays size={13} /> Fecha</span>
            <span className="font-bold text-foreground capitalize">{formattedDate}</span>
          </p>
          <div className="summary-line flex-col items-start gap-1.5">
            <span>Desglose de Horas</span>
            <div className="w-full space-y-1 mt-1">
              {[...selectedTimes].sort().map(t => {
                const slotPrice = Number(customPricing[t] || pricePerHour);
                return (
                  <div key={t} className="flex justify-between text-xs bg-primary/5 px-2 py-1 rounded-md">
                    <span className="font-bold text-primary">{fmtSlot(t)}</span>
                    <span className="font-semibold">${slotPrice.toLocaleString('es-CO')}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="border-t border-border/60 mt-2 pt-2 flex justify-between items-center">
            <span className="text-muted-foreground font-bold uppercase text-[10px] tracking-wider">Total Estimado</span>
            <span className="font-black text-emerald-600 dark:text-emerald-400 text-base">${totalPrice.toLocaleString('es-CO')}</span>
          </div>
          <div className="flex flex-col justify-between items-center text-xs bg-amber-500/10 p-2 rounded-lg mt-1 border border-amber-500/20">
            <span className="text-amber-700 dark:text-amber-400 font-bold uppercase text-[10px] tracking-wider flex items-center gap-1">
              Abono Requerido
            </span>

            <span className="font-black text-amber-700 dark:text-amber-400 text-sm">
              ${abonoPrice.toLocaleString('es-CO')}
            </span>

            {customPricing?.booking_type === 'fixed' ? (
              <p className="text-[11px] text-muted-foreground text-center mt-2">
                Abono fijo de <strong>${Number(customPricing.booking_fixed || 0).toLocaleString('es-CO')}</strong> por hora para confirmar
              </p>
            ) : (customPricing?.booking_percentage || (pitch as any).booking_percentage) ? (
              <p className="text-[11px] text-muted-foreground text-center mt-2">
                Abono del <strong>{customPricing?.booking_percentage || (pitch as any).booking_percentage || 50}%</strong> del valor total para confirmar
              </p>
            ) : null}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
          La cancha se bloqueará por 5 minutos para que completes el pago de tu reserva de manera segura.
        </p>
      </div>
    );

    setAlertState({
      isOpen: true,
      type: 'info',
      title: 'Confirmar Reserva',
      message: messageNode,
      showCancel: true,
      confirmText: 'Bloquear y Continuar',
      cancelText: 'Cancelar',
      cancelButtonClassName: 'flex-1 h-12 rounded-xl font-bold flex items-center justify-center transition-all bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-500/10 dark:text-red-500 dark:hover:bg-red-500/20',
      onConfirm: async () => {
        setAlertState(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        setError('');
        const success = await startLock(pitch, selectedDate, selectedTimes);
        setLoading(false);

        if (success) {
          setStep(2);
        } else {
          setAlertState({
            isOpen: true,
            type: 'error',
            title: 'Horario no disponible',
            message: lockError || 'Una de las horas seleccionadas está siendo reservada por otra persona en este momento. Por favor elige otro horario.',
          });
        }
      }
    });
  };

  const handleBooking = async () => {
    if (!user) {
      setAlertState({
        isOpen: true,
        type: 'login_required',
        title: 'Inicia Sesión',
        message: 'Debes iniciar sesión para confirmar tu reserva.',
      });
      return;
    }
    if (selectedTimes.length === 0) { setError('Por favor selecciona al menos una hora'); return; }
    if (!file) { setError('Por favor sube el comprobante de pago'); return; }

    setLoading(true);
    setError('');

    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_booking',
          payload: {
            pitch_id: pitch.id,
            user_id: user.id,
            booking_ids: activeBooking?.bookingIds || [],
            customer_name: profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Jugador',
            customer_phone: (profile as any)?.phone || user.user_metadata?.phone || '',
            selected_date: selectedDate,
            selected_times: selectedTimes,
            file_name: file.name,
            file_base64: fileBase64,
            total_price: totalPrice,
            deposit_amount: abonoPrice,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al procesar la reserva.');
      }

      clearActiveBooking();
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Error al procesar la reserva');
    } finally {
      setLoading(false);
    }
  };

  if (step === 3) {
    const sortedTimes = [...selectedTimes].sort();
    return (
      <div className="booking-success slide-up">
        <div className="success-icon"><Check size={32} /></div>
        <p className="eyebrow accent-label">RESERVA SOLICITADA</p>
        <h1>¡Comprobante enviado!</h1>
        <p>Tu solicitud para <strong>{pitch.name.toUpperCase()}</strong> ha sido enviada. El dueño validará tu abono y te confirmará pronto.</p>
        <div className="confirmation-card">
          <div
            className="w-12 h-12 rounded-lg flex-shrink-0 overflow-hidden bg-muted"
          >
            {((pitch as any).media_urls?.[0] || (pitch as any).image_url) ? (
              <img
                src={(pitch as any).media_urls?.[0] || (pitch as any).image_url}
                alt={pitch.name.toUpperCase()}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className={`w-full h-full ${(pitch as any).tone || 'field-emerald'}`} />
            )}
          </div>          <div className="flex-1 min-w-0">
            <strong className="block text-sm truncate">{pitch.name.toUpperCase()}</strong>
            <span className="text-xs text-muted-foreground">{formattedDate}</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {sortedTimes.map(t => (
                <span key={t} className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-full">
                  {fmtSlot(t)} (${getSlotPrice(t).toLocaleString('es-co')})
                </span>
              ))}
            </div>
          </div>
          <span className="status pending text-xs">Pendiente</span>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => router.push(`/reservations`)}
        >
          Ir a mis reservas
        </button>      </div>
    );
  }

  const allowedTimeSlots: string[] = Array.from(new Set<string>((pitch as any).custom_pricing?.time_slots || DEFAULT_TIME_SLOTS));
  const currentCatSlots = allowedTimeSlots.filter((slot: string) => {
    const h = parseInt(slot.split(':')[0]);
    if (activeCategory === 'manana') return h >= 0 && h < 12;
    if (activeCategory === 'tarde') return h >= 12 && h < 18;
    if (activeCategory === 'noche') return h >= 18 && h <= 23;
    return false;
  });

  return (
    <div className="page-content fade-in max-w-5xl mx-auto px-4 sm:px-8 md:px-12 pb-24">
      <CustomAlertModal
        alertState={alertState}
        onClose={() => {
          const wasExpired = isExpiredAlertRef.current;
          setAlertState(s => ({ ...s, isOpen: false }));
          if (wasExpired) {
            isExpiredAlertRef.current = false;
            onBack();
          }
        }}
      />

      <button
        type="button"
        onClick={() => {
          if (activeBooking && secondsLeft > 0) {
            setShowCancelPrompt(true);
          } else {
            // Redirige al perfil de la cancha
            router.push(`/cancha/${pitch.id || (pitch as any).pitch_id}`);
          }
        }}
        className="back-link flex items-center gap-2 mb-6 cursor-pointer text-sm font-semibold hover:text-primary transition-colors"
      >
        <ArrowLeft size={15} /> Volver al perfil de la cancha
      </button>

      <div className="booking-layout">
        <div className="booking-main">
          <div className="flex items-center gap-3 mb-6 bg-secondary/40 p-2.5 rounded-2xl border border-border/60 max-w-md">
            {[1, 2].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black transition-all shadow-xs ${step >= s ? 'bg-primary text-white shadow-primary/20' : 'bg-secondary text-muted-foreground'}`}>{s}</div>
                <span className={`text-xs font-bold ${step === s ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {s === 1 ? 'Fecha y hora' : 'Confirmar pago'}
                </span>
                {s < 2 && <div className={`flex-1 h-px w-8 ${step > s ? 'bg-primary' : 'bg-border'}`} />}
              </div>
            ))}
          </div>

          <div className={`booking-hero ${(pitch as any).tone || 'field-emerald'}`}>
            <div className="pitch-lines" />
            <span>{pitch.name.toUpperCase()}</span>
          </div>

          {/* Banner: ya hay una reserva activa de OTRA cancha */}
          {activeBooking && activeBooking.pitch.id !== pitch.id && secondsLeft > 0 && (
            <div className="mt-4 p-3.5 rounded-xl border border-amber-400/40 bg-amber-500/10 flex items-start gap-3">
              <span className="text-amber-500 text-lg flex-shrink-0">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-0.5">
                  Tienes una reserva en proceso
                </p>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  <strong className="text-foreground">{activeBooking.pitch.name}</strong> — {activeBooking.selectedDate}<br />
                  Para reservar esta cancha, primero <strong>completa</strong> la reserva actual o <strong>cancélala</strong>.
                </p>
                <div className="flex gap-2 mt-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsFloating(false);
                      setTimeout(() => window.dispatchEvent(new CustomEvent('resume-active-booking')), 50);
                    }}
                    className="text-[11px] font-bold px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg transition-colors"
                  >
                    Completar actual
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await cancelActiveBooking();
                      router.push('/');
                    }}
                    className="text-[11px] font-bold px-3 py-1.5 bg-secondary hover:bg-red-500/20 text-muted-foreground hover:text-red-500 rounded-lg transition-colors border border-border"
                  >
                    Cancelar y liberar
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="slide-up mt-6 space-y-5">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <CalendarDays size={12} /> Selecciona la fecha del partido
                </label>


              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between mb-3">
                  <span className="flex items-center gap-1"><CalendarDays size={12} /> Fecha</span>
                  {selectedDate && (
                    <span className="text-primary font-bold text-sm capitalize">
                      {formattedDate}
                    </span>
                  )}
                </label>

                {!showCalendar ? (
                  <button
                    type="button"
                    onClick={() => setShowCalendar(true)}
                    className="w-full py-3 bg-secondary/50 hover:bg-secondary text-foreground font-bold rounded-xl border border-border transition-colors flex items-center justify-center gap-2"
                  >
                    <CalendarDays size={18} className="text-primary" />
                    Ver Calendario
                  </button>
                ) : (
                  <div className="relative">
                    <button
                      onClick={() => setShowCalendar(false)}
                      className="absolute -top-3 -right-3 w-8 h-8 bg-white border border-border rounded-full flex items-center justify-center shadow-md text-muted-foreground hover:text-foreground z-10"
                    >
                      <X size={16} />
                    </button>
                    <CustomMonthCalendar
                      selectedDate={selectedDate}
                      onSelectDate={(date) => {
                        setSelectedDate(date);
                        setSelectedTimes([]); // reset times when changing date
                        setShowCalendar(false); // Ocultar al seleccionar
                      }}
                      minDate={today}
                    />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Clock3 size={12} /> Hora(s) disponibles
                  </label>
                  {selectedTimes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedTimes([])}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                {selectedTimes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {[...selectedTimes].sort().map(s => (
                      <span key={s} className="inline-flex items-center gap-1 bg-primary text-white text-[11px] font-bold px-2.5 py-1 rounded-full">
                        ⏰ {fmtSlot(s)} (${getSlotPrice(s).toLocaleString()})
                        <button type="button" onClick={() => toggleTime(s)} className="opacity-70 hover:opacity-100 ml-1">✕</button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex bg-secondary/50 p-1 rounded-xl border border-border gap-1 mb-3">
                  {TIME_CATEGORIES.map(cat => {
                    const isActive = activeCategory === cat.key;
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setActiveCategory(cat.key)}
                        className={`flex-1 py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${isActive ? 'bg-card text-primary shadow-sm border border-border/60' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        <span>{cat.icon}</span>
                        <span>{cat.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-xl border border-border bg-card p-3 shadow-inner">
                  {loadingSlots && takenSlots.size === 0 ? (
                    <div className="flex justify-center py-6">
                      <Loader2 size={24} className="animate-spin text-primary" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {currentCatSlots.map((slot: string) => {
                        const slotData = takenSlots.get(slot);
                        let isTaken = !!slotData;
                        const isDraft = slotData?.status === 'draft';
                        const isSel = selectedTimes.includes(slot);
                        const hNum = parseInt(slot.split(':')[0]);
                        const ampm = hNum < 12 ? 'am' : 'pm';
                        const h12 = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum;
                        const slotPrice = getSlotPrice(slot);

                        let secondsLeft = 0;
                        if (isDraft && slotData?.expires_at) {
                          secondsLeft = Math.floor((new Date(slotData.expires_at).getTime() - Date.now()) / 1000);
                          if (secondsLeft <= 0) {
                            isTaken = false;
                          }
                        }

                        return (
                          <button
                            key={`${activeCategory}-${slot}`}
                            disabled={isTaken}
                            type="button"
                            onClick={() => toggleTime(slot)}
                            className={`p-2.5 rounded-xl border text-center transition-all select-none font-bold relative ${isTaken ? (isDraft ? 'bg-orange-50 text-orange-400 border-orange-200 cursor-not-allowed overflow-hidden' : 'bg-red-50 text-red-300 border-red-200 cursor-not-allowed overflow-hidden') : (isSel ? 'bg-primary text-white border-primary shadow-md ring-2 ring-primary/30 scale-105' : 'bg-card hover:bg-primary/10 border-border text-foreground hover:border-primary/40')}`}
                          >
                            {isTaken ? (
                              <div className="flex flex-col items-center justify-center">
                                {isDraft ? (
                                  <>
                                    <Clock3 size={16} className="mx-auto opacity-70 mb-1" />
                                    <span className="text-[8px] leading-tight absolute bottom-1 w-full text-center">
                                      <TimeLeft expiresAt={slotData?.expires_at || ''} />
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-[10px] font-black tracking-widest text-red-500 -rotate-6">
                                    OCUPADO
                                  </span>
                                )}
                              </div>
                            ) : (
                              <>
                                <span className="text-sm block leading-tight">{h12}:00</span>
                                <span className="text-[9px] uppercase opacity-70">{ampm}</span>
                                <span className="text-[9px] block text-primary mt-0.5 font-semibold">${slotPrice.toLocaleString()}</span>
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {error && <p className="auth-error">{error}</p>}

              <button
                className="btn-primary w-full"
                disabled={loading}
                onClick={handleLockBooking}
              >
                {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : `Reservar ${selectedTimes.length > 0 ? `(${selectedTimes.length}h) ` : ''}`}
              </button>
              {/* {pitch.custom_pricing?.booking_type === 'fixed' ? (
                <p className="text-[11px] text-muted-foreground text-center mt-2">
                  Abono fijo de <strong>${Number(pitch.custom_pricing.booking_fix || 0).toLocaleString('es-CO')}</strong> por hora para confirmar
                </p>
              ) : pitch.custom_pricing?.booking_type === 'percentage' ? (
                <p className="text-[11px] text-muted-foreground text-center mt-2">
                  Abono del <strong>{pitch.custom_pricing.booking_percentage}%</strong> del valor total para confirmar
                </p>
              ) : null} */}
            </div>
          )}

          {step === 2 && (
            <div className="slide-up mt-6">
              {(() => {
                const isCritical = secondsLeft <= 50;
                return (
                  <div className={`flex justify-between items-center p-3.5 rounded-2xl mb-5 border transition-all ${isCritical
                    ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/40 ring-2 ring-red-500/20 animate-pulse'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                    }`}>
                    <span className="text-xs sm:text-sm font-bold flex items-center gap-2">
                      <Clock3 size={16} className={`animate-spin ${isCritical ? 'text-red-500' : 'text-amber-500'}`} />
                      <span>Tiempo para confirmar reserva:</span>
                    </span>
                    <div className="flex items-center gap-3">
                      <span className={`font-mono font-black text-sm sm:text-base px-2.5 py-1 rounded-xl shadow-xs ${isCritical
                        ? 'bg-red-500 text-white dark:bg-red-600'
                        : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                        }`}>
                        {Math.floor(Math.max(0, secondsLeft) / 60)}:{(Math.max(0, secondsLeft) % 60).toString().padStart(2, '0')}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowCancelPrompt(true)}
                        className={`text-xs font-bold underline transition-colors ${isCritical ? 'text-red-600 hover:text-red-700 dark:text-red-300' : 'text-red-500 hover:text-red-600'
                          }`}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                );
              })()}

              <p className="text-sm text-muted-foreground mb-5">
                Para asegurar tu reserva, realiza un abono de <strong>${abonoPrice.toLocaleString('es-CO')}</strong> a la cuenta de la cancha y sube el comprobante.
              </p>

              {(() => {
                const paymentMethods: Array<{ type: string; label: string; number: string; name: string }> = (pitch as any).payment_methods || [];
                if (paymentMethods.length === 0) {
                  return (
                    <div className="bg-secondary p-4 rounded-xl mb-5 border border-border">
                      <p className="text-xs text-muted-foreground mb-1">Cuenta autorizada</p>
                      <strong className="text-sm block">{pitch.name.toUpperCase()}</strong>
                      <p className="text-xs text-muted-foreground mt-1">Consulta con el establecimiento el método de pago.</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-3 mb-5">
                    <p className="text-xs font-bold text-muted-foreground uppercase">Métodos de Pago Disponibles</p>
                    {paymentMethods.map(pm => <PaymentMethodCard key={pm.type} pm={pm} />)}
                  </div>
                );
              })()}

              <div className="auth-field mb-5">
                <span className="font-semibold text-sm mb-2 block">Sube tu comprobante de transferencia</span>
                {!file ? (
                  <label className="border-2 border-dashed border-primary/40 bg-primary/5 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-primary/10 transition-colors">
                    <Upload size={28} className="text-primary mb-3" />
                    <span className="font-semibold text-sm text-primary">Adjuntar PDF o Imagen</span>
                    <span className="text-xs text-muted-foreground mt-1">Captura de pantalla o PDF</span>
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
                  </label>
                ) : (
                  <div className="border border-primary/30 rounded-xl p-4 flex items-center justify-between bg-primary/5">
                    <div className="flex items-center gap-3 truncate">
                      <ImageIcon size={20} className="text-primary flex-shrink-0" />
                      <span className="text-sm font-medium truncate">{file.name}</span>
                    </div>
                    <button type="button" onClick={() => setFile(null)} className="text-xs font-bold text-primary hover:underline px-2">Cambiar</button>
                  </div>
                )}
              </div>

              <p className="flex items-center gap-1.5 text-xs text-muted-foreground mb-5">
                <CheckCircle2 size={12} className="text-green-600" /> Abono protegido
              </p>

              {error && <p className="auth-error mb-4">{error}</p>}

              <div className="flex gap-3">
                {/* <button className="btn-primary bg-secondary text-foreground hover:bg-border" onClick={() => setStep(1)} disabled={loading}>
                  ← Atrás
                </button> */}
                <button className="btn-primary flex-1" onClick={handleBooking} disabled={loading}>
                  {loading ? <Loader2 size={18} className="animate-spin" /> : 'Confirmar Reserva ✓'}
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="booking-aside bg-white dark:bg-zinc-900 p-5 rounded-2xl shadow-sm border border-emerald-100 dark:border-zinc-800">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white pb-3 border-b border-zinc-100 dark:border-zinc-800">
            Resumen de Reserva
          </h2>

          <div className="space-y-3.5 mt-4 text-sm">
            <div className="summary-line flex justify-between items-center">
              <span className="text-zinc-500 font-medium">Cancha</span>
              <strong className="uppercase font-semibold text-zinc-800 dark:text-zinc-200">{pitch.name}</strong>
            </div>

            <div className="summary-line flex justify-between items-center">
              <span className="text-zinc-500 font-medium">Fecha</span>
              <strong className="font-semibold text-zinc-800 dark:text-zinc-200">{formattedDate || '-'}</strong>
            </div>

            <div className="summary-line flex flex-col items-start gap-1.5 pt-1">
              <span className="text-zinc-500 font-medium">Desglose de Horas</span>
              {selectedTimes.length === 0 ? (
                <strong className="text-zinc-400 font-normal">-</strong>
              ) : (
                <div className="w-full space-y-1.5 mt-1">
                  {[...selectedTimes].sort().map(t => (
                    <div key={t} className="flex justify-between items-center text-xs bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/50 px-2.5 py-1.5 rounded-lg">
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">{fmtSlot(t)}</span>
                      <span className="font-bold text-zinc-700 dark:text-zinc-300">${getSlotPrice(t).toLocaleString('es-CO')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="summary-line flex justify-between items-center pt-1">
              <span className="text-zinc-500 font-medium">Duración</span>
              <strong className="font-semibold text-zinc-800 dark:text-zinc-200">
                {totalHours > 0 ? `${totalHours} hora${totalHours > 1 ? 's' : ''}` : '-'}
              </strong>
            </div>

            <div className="summary-line flex justify-between items-center pt-2 border-t border-dashed border-zinc-200 dark:border-zinc-800">
              <span className="text-zinc-600 font-medium">Precio total</span>
              <strong className="text-base font-bold text-zinc-900 dark:text-white">
                ${totalPrice > 0 ? totalPrice.toLocaleString('es-CO') : '-'}
              </strong>
            </div>

            {/* Sección de Abono Requerido estilizada y minimalista */}
            <div className="mt-4 p-3.5 bg-emerald-500/10 border border-emerald-600/20 rounded-xl space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-emerald-950 dark:text-emerald-200">
                  Abono requerido
                </span>
                <strong className="text-lg font-extrabold text-emerald-700 dark:text-emerald-400">
                  ${totalPrice > 0 ? abonoPrice.toLocaleString('es-CO') : '-'}
                </strong>
              </div>

            </div>
          </div>

          <p className="text-xs text-zinc-500 mt-3 text-center">
            El valor restante se paga directamente en la cancha
          </p>
        </aside>
      </div>

      <CancelBookingModal
        isOpen={showCancelPrompt}
        onClose={() => setShowCancelPrompt(false)}
        onStayInBooking={() => setShowCancelPrompt(false)}
        onMinimizeToFloating={() => {
          setShowCancelPrompt(false);
          setIsFloating(true);
          onBack(selectedTimes, selectedDate);
        }}
      />
    </div>
  );
}