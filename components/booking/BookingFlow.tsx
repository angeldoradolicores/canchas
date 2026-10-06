'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Upload, CheckCircle2, Loader2, Image as ImageIcon, CalendarDays, Clock3, XCircle, Copy, CheckCheck, X, LandPlot, Lock, Percent, Layers, Zap, Phone, User, ShieldCheck, FileText, Sparkles, CreditCard, Receipt, FileUp, Trash2, ArrowRight } from 'lucide-react';
import { Pitch } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import { useToday } from '@/lib/use-today';
import { CustomMonthCalendar } from '../explore/CustomMonthCalendar';
import { useActiveBooking } from '@/lib/active-booking-context';
import { CancelBookingModal } from '@/components/booking/CancelBookingModal';
import { CustomAlertModal, AlertModalState } from '@/components/ui/CustomAlertModal';
import { isCombinedPitch, getLinkedPitchIds, getConflictingPitchIds } from '@/lib/combined-pitch-utils';


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

async function compressImageIfNeeded(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1200;
        let width = img.width;
        let height = img.height;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
    <div className="flex items-center justify-between p-3.5 rounded-2xl border bg-card/90 hover:bg-secondary/40 border-border text-foreground transition-all shadow-2xs">
      <div className="min-w-0 pr-2">
        <div className="flex items-center gap-2 font-black text-xs sm:text-sm">
          <span className="text-base">{icons[pm.type] || '💳'}</span>
          <span className="uppercase tracking-wide">{pm.label}</span>
        </div>
        <div className="font-mono font-black text-sm sm:text-base tracking-wider text-foreground mt-0.5 select-all">
          {pm.number}
        </div>
        {pm.name && <div className="text-[11px] text-muted-foreground truncate mt-0.5">Titular: {pm.name}</div>}
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className={`ml-2 flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${copied
          ? 'bg-emerald-600 text-white shadow-emerald-600/30'
          : 'bg-secondary hover:bg-primary hover:text-white border border-border text-foreground'
          }`}
        title="Copiar número de cuenta"
      >
        {copied ? <><CheckCheck size={14} /> ¡Copiado!</> : <><Copy size={14} /> Copiar</>}
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
  initialStep?: number;
  onSelectPitch?: (pitch: Pitch) => void;
}

export function BookingFlow({ pitch, onBack, onFinish, preselectedTimes = [], preselectedDate = '', initialStep, onSelectPitch }: BookingFlowProps) {
  const today = useToday();
  const normalizeTime = (t: string) => t ? t.substring(0, 5) : '';

  const [currentPitch, setCurrentPitch] = useState<Pitch>(pitch);
  const [siblingPitches, setSiblingPitches] = useState<Pitch[]>([]);
  const [complexInfo, setComplexInfo] = useState<{ id: string; name: string; address?: string; zone?: string } | null>(null);

  useEffect(() => {
    setCurrentPitch(pitch);
  }, [pitch]);

  // En móvil al entrar aquí, que salga siempre el inicio de la página (scroll to top)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, []);

  const [step, setStep] = useState(initialStep || 1);

  // Sincronizar estado de paso para saber si el usuario está en subida de comprobante (step 2)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (step === 2) {
        sessionStorage.setItem('canchas_booking_in_step_2', 'true');
      } else {
        sessionStorage.removeItem('canchas_booking_in_step_2');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [step]);

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
  const [filePreview, setFilePreview] = useState<string | null>(null);

  // Crear vista previa de la captura de pantalla o comprobante adjunto
  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      return;
    }
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setFilePreview(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setFilePreview(null);
    }
  }, [file]);

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

  // Datos de contacto del jugador (autocompletado para invitados o usuarios logueados)
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const paramName = urlParams.get('name') || urlParams.get('nombre') || '';
    const paramPhone = urlParams.get('phone') || urlParams.get('tel') || '';

    const savedName = localStorage.getItem('cancheros_customer_name') || '';
    const savedPhone = localStorage.getItem('cancheros_customer_phone') || '';

    const initialName = profile?.full_name || user?.user_metadata?.full_name || paramName || savedName || '';
    const initialPhone = (profile as any)?.phone || user?.user_metadata?.phone || paramPhone || savedPhone || '';

    if (initialName && !customerName) setCustomerName(initialName);
    if (initialPhone && !customerPhone) setCustomerPhone(initialPhone);
  }, [user, profile]);
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
  const isSubmittedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('canchas_booking_in_step_3');
      }
    };
  }, []);

  // Cargar canchas asociadas al complejo deportivo
  useEffect(() => {
    const compId =
      currentPitch.company_id ||
      (currentPitch as any)?.companies?.id ||
      (currentPitch as any)?.company?.id;

    const loadSiblings = async () => {
      try {
        // Si tenemos company_id, buscar directamente
        if (compId) {
          const { data, error } = await supabase
            .from('pitches')
            .select('*, companies(id, name, address, zone)')
            .eq('company_id', compId)
            .order('created_at', { ascending: true });

          if (!error && data && data.length > 0) {
            setSiblingPitches(data);
            if (data[0]?.companies) setComplexInfo(data[0].companies);
            return;
          }
        }

        // Fallback: buscar por el id del pitch actual para obtener su company_id
        const { data: selfData } = await supabase
          .from('pitches')
          .select('*, companies(id, name, address, zone)')
          .eq('id', currentPitch.id)
          .single();

        if (selfData?.company_id) {
          const { data: siblings } = await supabase
            .from('pitches')
            .select('*, companies(id, name, address, zone)')
            .eq('company_id', selfData.company_id)
            .order('created_at', { ascending: true });

          if (siblings && siblings.length > 0) {
            setSiblingPitches(siblings);
            if (siblings[0]?.companies) setComplexInfo(siblings[0].companies);
          } else {
            // Al menos mostrar la cancha actual
            setSiblingPitches([{ ...currentPitch, companies: selfData.companies } as any]);
            if (selfData.companies) setComplexInfo(selfData.companies);
          }
        }
      } catch (err) {
        console.error('Error cargando canchas del complejo en BookingFlow:', err);
      }
    };

    loadSiblings();
  }, [currentPitch.id, currentPitch.company_id, supabase]);

  // Cambiar cancha dentro del mismo complejo
  const handleSwitchPitch = (newPitch: Pitch) => {
    if (newPitch.id === currentPitch.id) return;

    // Al subir el comprobante no se puede cambiar de cancha y sale aviso de reserva en curso
    if (step === 2 || (activeBooking && secondsLeft > 0)) {
      setAlertState({
        isOpen: true,
        type: 'warning',
        title: 'Tienes una reserva en curso',
        message: 'Tienes una reserva en proceso de pago para esta cancha. Para cambiar de cancha o elegir otra, primero debes completar o cancelar la reserva actual.',
      });
      return;
    }

    setCurrentPitch(newPitch);
    setSelectedTimes([]);
    setError('');
    if (onSelectPitch) {
      onSelectPitch(newPitch);
    }
  };

  // Si la cancha es liberada o cancelada desde otra pestaña, otro dispositivo o el timer flotante, salir inmediatamente
  useEffect(() => {
    const handleCancelled = () => {
      // Si ya se envió el comprobante y estamos en confirmación (step 3), NUNCA salirse
      if (
        isSubmittedRef.current ||
        step === 3 ||
        (typeof window !== 'undefined' && sessionStorage.getItem('canchas_booking_in_step_3') === 'true')
      ) {
        return;
      }
      onBack();
    };
    window.addEventListener('cancel-active-booking', handleCancelled);
    window.addEventListener('active-booking-expired', handleCancelled);
    return () => {
      window.removeEventListener('cancel-active-booking', handleCancelled);
      window.removeEventListener('active-booking-expired', handleCancelled);
    };
  }, [onBack, step]);

  // Control del temporizador flotante automático
  useEffect(() => {
    setIsFloating(false);
    return () => {
      setIsFloating(true);
    };
  }, [setIsFloating]);

  // Si entra con horas preseleccionadas Y ya existe un lock activo válido para esta cancha,
  // pasar directamente al paso 2 (el lock se hizo previamente con éxito).
  useEffect(() => {
    if (
      preselectedTimes.length > 0 &&
      activeBooking &&
      activeBooking.pitch.id === currentPitch.id &&
      activeBooking.selectedDate === (preselectedDate || today) &&
      Math.max(0, Math.floor((new Date(activeBooking.expiresAt).getTime() - Date.now()) / 1000)) > 0
    ) {
      setStep(2);
    }
  }, [currentPitch.id, activeBooking, preselectedTimes, preselectedDate, today]);

  const isExpiredAlertRef = useRef(false);
  const hadActiveLockRef = useRef(false);

  // Registrar si hubo un bloqueo activo para esta cancha
  useEffect(() => {
    if (activeBooking && activeBooking.pitch.id === currentPitch.id) {
      hadActiveLockRef.current = true;
    }
  }, [activeBooking, currentPitch.id]);

  // Auto-deseleccionar horas que mientras el usuario las tiene marcadas pasan a ser
  // bloqueadas por otra persona (draft activo, pendiente o confirmada).
  // Se dispara cada vez que takenSlots se actualiza (polling cada 3.5s o realtime).
  // useEffect(() => {
  //   if (takenSlots.size === 0) return;
  //   const now = new Date();
  //   setSelectedTimes(prev => {
  //     const cleaned = prev.filter(slot => {
  //       const slotData = takenSlots.get(slot);
  //       if (!slotData) return true; // sigue disponible, mantener
  //       // Expirado → ya no está realmente tomado, mantener selección
  //       if (
  //         slotData.status === 'draft' &&
  //         slotData.expires_at &&
  //         new Date(slotData.expires_at) <= now
  //       ) {
  //         return true;
  //       }
  //       // Activo (draft vigente, pendiente o confirmado) → deseleccionar
  //       return false;
  //     });
  //     // Solo actualizar estado si algo cambió (evitar renders innecesarios)
  //     return cleaned.length === prev.length ? prev : cleaned;
  //   });
  // }, [takenSlots]);

  useEffect(() => {
    if (!selectedDate || !currentPitch.id) return;
    setLoadingSlots(true);

    const fetchTaken = async (silent = false) => {
      if (!silent) setLoadingSlots(true);
      const dayStart = `${selectedDate}T00:00:00-05:00`;
      const dayEnd = `${selectedDate}T23:59:59-05:00`;

      // ── Obtener TODOS los IDs en conflicto (bidireccional: hija↔combinada) ──
      // Paso 1: IDs hijas directas desde custom_pricing (dirección combinada→hija)
      const directLinkedIds: string[] = Array.isArray((currentPitch as any).custom_pricing?.linked_pitch_ids)
        ? (currentPitch as any).custom_pricing.linked_pitch_ids
        : [];

      // Paso 2: Buscar canchas padre que nos contengan (dirección hija→combinada)
      // Solo si tenemos company_id para limitar la búsqueda
      const compId =
        currentPitch.company_id ||
        (currentPitch as any)?.companies?.id ||
        (currentPitch as any)?.company?.id;

      let parentIds: string[] = [];
      if (compId && directLinkedIds.length === 0) {
        // Solo buscar padres si no somos ya una cancha combinada
        const { data: siblings } = await supabase
          .from('pitches')
          .select('id, custom_pricing')
          .eq('company_id', compId);

        if (siblings) {
          parentIds = siblings
            .filter((p: any) => {
              const linkedList: string[] = Array.isArray(p.custom_pricing?.linked_pitch_ids)
                ? p.custom_pricing.linked_pitch_ids
                : [];
              return linkedList.includes(currentPitch.id);
            })
            .map((p: any) => p.id);
        }
      }

      // Unión: cancha actual + hijas + padres combinados
      const pitchIds = Array.from(new Set([currentPitch.id, ...directLinkedIds, ...parentIds]));

      const { data } = await supabase
        .from('bookings')
        .select('start_time, status, expires_at, pitch_id')
        .in('pitch_id', pitchIds)
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
          if (!taken.has(h)) {
            taken.set(h, { status: b.status, expires_at: b.expires_at });
          } else {
            const existing = taken.get(h)!;
            const priority: Record<string, number> = { confirmed: 3, pending: 2, draft: 1 };
            if ((priority[b.status] || 0) > (priority[existing.status] || 0)) {
              taken.set(h, { status: b.status, expires_at: b.expires_at });
            }
          }
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

    // Canal realtime: escuchar cambios en cualquier pitch vinculado
    const channel = supabase
      .channel(`public:bookings:flow:${currentPitch.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        (payload: any) => {
          // Solo refrescar si el cambio afecta a alguna cancha relacionada
          fetchTaken(true);
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [selectedDate, currentPitch.id, currentPitch.company_id, supabase]);

  const formattedDate = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  const pricePerHour = currentPitch.price_per_hour;
  const customPricing = (currentPitch as any).custom_pricing || {};

  const getSlotPrice = (time: string) => {
    return customPricing[time] || pricePerHour;
  };

  const calculateTotal = (times: string[]) => {
    return times.reduce((total, time) => total + getSlotPrice(time), 0);
  };

  const totalHours = selectedTimes.length;
  const totalPrice = calculateTotal(selectedTimes);

  const isFixedPricing = customPricing.booking_type === 'fixed';
  const activePercentage = Number((currentPitch as any).booking_percentage || 50);
  let abonoPrice = 0;
  if (isFixedPricing) {
    abonoPrice = (customPricing.booking_fixed || 0) * totalHours;
  } else {
    abonoPrice = (totalPrice * activePercentage) / 100;
  }

  // Manejo de expiración del temporizador con salida garantizada
  const triggerExpiredAlert = useCallback(() => {
    if (
      isExpiredAlertRef.current ||
      isSubmittedRef.current ||
      step === 3 ||
      (typeof window !== 'undefined' && sessionStorage.getItem('canchas_booking_in_step_3') === 'true')
    ) {
      return;
    }
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
            Tienes <strong className="text-amber-600 dark:text-amber-400 font-bold">4 minutos adicionales de gracia</strong> para terminar tu reserva y subir tu comprobante antes de perder tu turno.
          </p>
        </div>
      ),
      confirmText: 'Entendido',
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
  }, [onBack, step]);

  // Escuchar evento del temporizador activo cuando expira a 0
  useEffect(() => {
    const handleExpiredEvent = (e: any) => {
      if (
        isSubmittedRef.current ||
        loading ||
        step === 3 ||
        (typeof window !== 'undefined' && sessionStorage.getItem('canchas_booking_in_step_3') === 'true')
      ) {
        return;
      }
      const pitchId = e.detail?.pitchId;
      if (!pitchId || pitchId === currentPitch.id) {
        triggerExpiredAlert();
      }
    };

    window.addEventListener('active-booking-expired', handleExpiredEvent);
    return () => {
      window.removeEventListener('active-booking-expired', handleExpiredEvent);
    };
  }, [currentPitch.id, triggerExpiredAlert, loading, step]);

  // Si estaba en el paso de confirmación y el tiempo llegó a 0
  useEffect(() => {
    if (
      isSubmittedRef.current ||
      loading ||
      step === 3 ||
      (typeof window !== 'undefined' && sessionStorage.getItem('canchas_booking_in_step_3') === 'true')
    ) {
      return;
    }

    if (step === 2 && hadActiveLockRef.current && secondsLeft <= 0 && activeBooking) {
      triggerExpiredAlert();
    }
  }, [step, secondsLeft, loading, activeBooking, triggerExpiredAlert]);

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

  const complexDisplayName =
    complexInfo?.name ||
    currentPitch.companies?.name ||
    (currentPitch as any)?.company?.name ||
    'Complejo Deportivo';

  const handleLockBooking = async () => {
    if (selectedTimes.length === 0 || !selectedDate) {
      setError('Por favor selecciona al menos una hora.');
      return;
    }

    const messageNode = (
      <div className="flex flex-col gap-3 items-center text-center mt-2">
        <p className="text-sm text-muted-foreground">Estás a punto de iniciar una reserva en:</p>
        <div className="w-full py-3 px-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex flex-col items-center justify-center gap-1">
          {/* Nombre del Complejo (Ahora es el elemento más grande y protagonista) */}
          <span className="text-base sm:text-lg font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300 text-center truncate max-w-full">
            {complexDisplayName}
          </span>

          {/* Nombre de la Cancha */}
          <div className="flex items-center justify-center gap-2 max-w-full">
            <span className="text-xs sm:text-sm font-bold uppercase text-muted-foreground tracking-wider truncate">
              {currentPitch.name}
            </span>
          </div>
        </div>
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
            ) : (customPricing?.booking_percentage || (currentPitch as any).booking_percentage) ? (
              <p className="text-[11px] text-muted-foreground text-center mt-2">
                Abono del <strong>{customPricing?.booking_percentage || (currentPitch as any).booking_percentage || 50}%</strong> del valor total para confirmar
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
        const success = await startLock(currentPitch, selectedDate, selectedTimes);
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
    const finalName = customerName.trim() || profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || '';
    const finalPhone = customerPhone.replace(/\D/g, '') || (profile as any)?.phone || user?.user_metadata?.phone || '';

    if (!finalName || finalName.length < 2) {
      setError('Por favor ingresa tu nombre completo para la reserva.');
      return;
    }
    if (!finalPhone || finalPhone.length !== 10) {
      setError('Por favor ingresa un número de celular/WhatsApp válido de 10 dígitos (ej: 3123456789).');
      return;
    }
    if (selectedTimes.length === 0) { setError('Por favor selecciona al menos una hora'); return; }
    if (!file) { setError('Por favor sube el comprobante de pago'); return; }

    setLoading(true);
    setError('');
    isExpiredAlertRef.current = true;
    setAlertState(prev => ({ ...prev, isOpen: false }));

    try {
      const fileBase64 = await compressImageIfNeeded(file);

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_booking',
          payload: {
            pitch_id: currentPitch.id,
            user_id: user?.id || null,
            booking_ids: activeBooking?.bookingIds || [],
            customer_name: finalName,
            customer_phone: finalPhone,
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

      // Guardar datos en localStorage y sessionStorage para que en futuras reservas ya esté todo listo
      if (typeof window !== 'undefined') {
        localStorage.setItem('cancheros_customer_name', finalName);
        localStorage.setItem('cancheros_customer_phone', finalPhone);

        const newIds = data.data ? (Array.isArray(data.data) ? data.data.map((b: any) => b.id) : [data.data.id]) : [];
        if (newIds.length > 0) {
          const oldList = JSON.parse(localStorage.getItem('cancheros_guest_booking_ids') || '[]');
          const merged = Array.from(new Set([...oldList, ...newIds]));
          localStorage.setItem('cancheros_guest_booking_ids', JSON.stringify(merged));
          sessionStorage.setItem('cancheros_recent_booking_ids', JSON.stringify(merged));
        }
      }

      // Si el usuario tiene sesión y no tenía teléfono en profiles, sincronizarlo
      if (user && !(profile as any)?.phone) {
        try {
          await supabase.from('profiles').update({ phone: finalPhone }).eq('id', user.id);
        } catch { }
      }

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('canchas_booking_in_step_3', 'true');
        sessionStorage.removeItem('canchas_booking_in_step_2');
        localStorage.removeItem('canchas_expired_grace_booking');
      }
      isSubmittedRef.current = true;
      setAlertState(prev => ({ ...prev, isOpen: false }));
      setStep(3);
      clearActiveBooking();
    } catch (err: any) {
      isExpiredAlertRef.current = false;
      setError(err.message || 'Error al procesar la reserva');
    } finally {
      setLoading(false);
    }
  };

  if (step === 3) {
    const sortedTimes = [...selectedTimes].sort();
    return (
      <div className="booking-success slide-up max-w-md mx-auto px-4 py-6 flex flex-col items-center text-center">
        <div className="success-icon w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-3 shadow-inner">
          <Check size={32} />
        </div>

        <p className="eyebrow accent-label text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">
          RESERVA SOLICITADA
        </p>

        <h1 className="text-2xl sm:text-3xl font-black text-foreground mb-2">
          ¡Comprobante enviado!
        </h1>

        <p className="text-xs sm:text-sm text-muted-foreground mb-6 max-w-sm leading-relaxed">
          Tu solicitud para <strong className="text-foreground uppercase">{currentPitch.name}</strong> ha sido enviada. El dueño validará tu abono y te confirmará pronto.
        </p>

        {/* Tarjeta de Confirmación Limpia y Estilizada para Móvil */}
        <div className="confirmation-card w-full bg-card border border-border/80 rounded-2xl p-4 sm:p-5 shadow-sm text-left flex flex-col gap-4 mb-6 relative overflow-hidden">

          {/* Fila Superior: Info Principal + Badge Pendiente */}
          <div className="flex items-start justify-between gap-3 min-w-0">

            {/* Contenedor Imagen + Textos */}
            <div className="flex items-start gap-3 min-w-0 flex-1">
              {/* Imagen */}
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl shrink-0 overflow-hidden bg-muted border border-border/50 shadow-xs">
                {((currentPitch as any).media_urls?.[0] || (currentPitch as any).image_url) ? (
                  <img
                    src={(currentPitch as any).media_urls?.[0] || (currentPitch as any).image_url}
                    alt={currentPitch.name.toUpperCase()}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className={`w-full h-full ${(currentPitch as any).tone || 'field-emerald'}`} />
                )}
              </div>

              {/* Textos del Complejo y Cancha */}
              <div className="flex-1 min-w-0">
                {/* Nombre del Complejo */}
                <span className="block text-[11px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 truncate">
                  {complexDisplayName.toUpperCase()}
                </span>

                {/* Nombre de la Cancha Completo (Sin cortar) */}
                <h3 className="text-sm sm:text-base font-black text-foreground uppercase leading-snug break-words mt-0.5">
                  {currentPitch.name}
                </h3>

                {/* Badge Cancha Combinada */}
                {isCombinedPitch(currentPitch as any) && (
                  <div className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-extrabold uppercase tracking-wide">
                    Cancha Combinada
                  </div>
                )}

                {/* Fecha */}
                <p className="text-xs text-muted-foreground font-semibold capitalize mt-1 flex items-center gap-1">
                  <span>📅</span> {formattedDate}
                </p>
              </div>
            </div>

            {/* Badge de Estado "Pendiente" en la esquina superior derecha */}
            <div className="shrink-0 pt-0.5">
              <span className="text-[10px] sm:text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 whitespace-nowrap">
                Pendiente
              </span>
            </div>
          </div>

          <hr className="border-border/60 my-0" />

          {/* Horas y Precios */}
          <div className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Horas seleccionadas:
            </span>
            <div className="flex flex-wrap gap-2">
              {sortedTimes.map(t => (
                <span key={t} className="text-xs bg-primary/10 text-primary font-bold px-3 py-1.5 rounded-xl border border-primary/20 flex items-center gap-1.5">
                  <span>{fmtSlot(t)}</span>
                  <span className="text-[10px] opacity-80 font-normal">(${getSlotPrice(t).toLocaleString('es-co')})</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn-primary w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm shadow-md cursor-pointer active:scale-95 transition-all"
          onClick={() => {
            if (typeof window !== 'undefined') {
              sessionStorage.removeItem('canchas_booking_in_step_3');
            }
            const guestIds = typeof window !== 'undefined'
              ? JSON.parse(localStorage.getItem('cancheros_guest_booking_ids') || '[]')
              : [];
            const queryParam = guestIds.length > 0 ? `?ids=${guestIds.join(',')}` : '';
            router.push(`/reservations${queryParam}`);
          }}
        >
          Ir a mis reservas
        </button>
      </div>
    );
  }

  const allowedTimeSlots: string[] = Array.from(new Set<string>((currentPitch as any).custom_pricing?.time_slots || DEFAULT_TIME_SLOTS));
  const currentCatSlots = allowedTimeSlots.filter((slot: string) => {
    const h = parseInt(slot.split(':')[0]);
    if (activeCategory === 'manana') return h >= 0 && h < 12;
    if (activeCategory === 'tarde') return h >= 12 && h < 18;
    if (activeCategory === 'noche') return h >= 18 && h <= 23;
    return false;
  });

  return (
    <div className="page-content fade-in max-w-5xl mx-auto pb-28 px-3 sm:px-6 w-full max-w-full overflow-x-hidden min-w-0">
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
            router.push(`/cancha/${currentPitch.id || (currentPitch as any).pitch_id}`);
          }
        }}
        className="back-link flex items-center gap-2 mb-4 cursor-pointer text-sm font-semibold hover:text-primary transition-colors py-1"
      >
        <ArrowLeft size={15} /> Volver
      </button>

      <div className="booking-layout">
        <div className="booking-main">
          {/* Indicador de pasos */}
          <div className="flex items-center gap-2 mb-4 bg-secondary/40 p-2 rounded-xl border border-border/60">
            {[1, 2].map(s => (
              <div key={s} className="flex items-center gap-1.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black transition-all shadow-xs ${step >= s ? 'bg-primary text-white shadow-primary/20' : 'bg-secondary text-muted-foreground'}`}>{s}</div>
                <span className={`text-xs font-bold ${step === s ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {s === 1 ? 'Fecha y hora' : 'Pago'}
                </span>
                {s < 2 && <div className={`flex-1 h-px w-6 ${step > s ? 'bg-primary' : 'bg-border'}`} />}
              </div>
            ))}
          </div>

          {/* Hero con Complejo y Cancha claramente destacados */}
          <div className={`booking-hero ${(currentPitch as any).tone || 'field-emerald'}`}>
            <div className="pitch-lines" />
            <div className="relative z-10 flex flex-col items-center justify-center text-center px-3 py-1.5 w-full max-w-full min-w-0 overflow-hidden">
              <span className="text-[11px] sm:text-xs font-black tracking-widest text-emerald-100 uppercase mb-0.5 drop-shadow truncate max-w-full block">
                {complexDisplayName}
              </span>
              <span className="text-sm sm:text-2xl font-black text-white uppercase tracking-tight drop-shadow-md truncate max-w-full block">
                {currentPitch.name}
              </span>
            </div>
          </div>

          {/* Selector de Canchas Asociadas al Complejo (Solo visible en el Paso 1 de Selección de Horarios) */}
          {step === 1 && siblingPitches.length > 1 && (
            <div className="mt-4 mb-4 p-3.5 rounded-2xl bg-secondary/60 border border-border shadow-xs overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-3">
                <div className="flex items-center gap-2">
                  <LandPlot size={17} className="text-primary shrink-0" />
                  <h3 className="text-xs sm:text-sm font-black text-foreground uppercase tracking-wide">
                    Canchas de este complejo ({siblingPitches.length})
                  </h3>
                </div>
                <span className="text-[10px] sm:text-[11px] text-muted-foreground font-medium">
                  Toca para cambiar de cancha y ver sus horarios
                </span>
              </div>

              {/* Contenedor con scroll horizontal */}
              <div className="flex items-center gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-none [-webkit-overflow-scrolling:touch] snap-x snap-mandatory w-full max-w-full min-w-0">
                {siblingPitches.map((sp, idx: number) => {
                  const isCurrent = sp.id === currentPitch.id;
                  const spPrice = Number((sp as any).price_per_hour || (sp as any).price || 0);
                  const spImg = (sp as any).media_urls?.[0] || (sp as any).image_url;
                  const spIsCombined = isCombinedPitch(sp);

                  return (
                    <button
                      key={sp.id || idx}
                      type="button"
                      onClick={() => handleSwitchPitch(sp)}
                      className={`flex items-center gap-2.5 p-2.5 sm:p-3 rounded-2xl sm:rounded-xl border text-left transition-all relative cursor-pointer shrink-0 snap-start w-[190px] sm:w-[240px] ${isCurrent
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/25 ring-2 ring-emerald-600/30'
                        : 'bg-card text-foreground border-border hover:border-emerald-500/50 hover:bg-secondary/60'
                        }`}
                    >
                      {/* Imagen miniatura de la cancha */}
                      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg overflow-hidden shrink-0 bg-secondary/50 border border-white/15 relative">
                        {spImg ? (
                          <img src={spImg} alt={sp.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className={`w-full h-full ${(sp as any).tone || 'field-emerald'} flex items-center justify-center text-xs opacity-60`}>
                            ⚽
                          </div>
                        )}
                        {isCurrent && (
                          <div className="absolute inset-0 bg-emerald-950/50 flex items-center justify-center">
                            <CheckCircle2 size={16} className="text-white drop-shadow" />
                          </div>
                        )}
                        {/* {spIsCombined && !isCurrent && (
                          <div className="absolute top-0 right-0 bg-amber-500 text-white text-[7px] font-black px-1 py-0.5 rounded-bl-lg rounded-tr-lg leading-none">
                            ⚡
                          </div>
                        )} */}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1 flex flex-col justify-center">
                        {/* Fila superior: Badge arriba para dejar todo el ancho al título */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className={`text-[11px] truncate ${isCurrent ? 'text-emerald-100' : 'text-muted-foreground'}`}>
                            {sp.type || 'Fútbol 5'}
                          </p>

                          <div className="flex items-center gap-1 shrink-0">
                            {isCurrent && (
                              <span className="text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded bg-white text-emerald-700 tracking-wider shrink-0 shadow-2xs whitespace-nowrap">
                                Viendo
                              </span>
                            )}
                            {spIsCombined && !isCurrent && (
                              <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-400 shrink-0 whitespace-nowrap">
                                COMBINADA
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Nombre de la cancha con ancho completo y sin partir palabras por la mitad */}
                        <p className={`text-xs sm:text-sm font-black uppercase leading-snug break-normal min-w-0 w-full ${isCurrent ? 'text-white' : 'text-foreground'}`}>
                          {sp.name}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Banner: Cancha Combinada seleccionada */}
          {isCombinedPitch(currentPitch as any) && (() => {
            const linkedIds = getLinkedPitchIds(currentPitch as any);
            const linkedNames = linkedIds
              .map(id => siblingPitches.find(p => p.id === id)?.name)
              .filter(Boolean);
            return (
              <div className="mt-3 mb-2 flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <Layers size={15} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black text-amber-800 dark:text-amber-300"> Cancha Combinada / Modular</p>
                  {linkedNames.length > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Une <strong className="text-foreground">{linkedNames.join(' + ')}</strong>. Puedes reservar el espacio completo.
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Banner: ya hay una reserva activa de OTRA cancha */}
          {activeBooking && activeBooking.pitch.id !== currentPitch.id && secondsLeft > 0 && (
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
            <div className="slide-up mt-4 space-y-4">
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
                        ⏰ {fmtSlot(s)} (${getSlotPrice(s).toLocaleString('es-CO')})
                        <button type="button" onClick={() => toggleTime(s)} className="opacity-70 hover:opacity-100 ml-1">✕</button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-3 bg-secondary/50 p-1 rounded-xl border border-border gap-1 mb-3 w-full max-w-full">
                  {TIME_CATEGORIES.map(cat => {
                    const isActive = activeCategory === cat.key;
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setActiveCategory(cat.key)}
                        className={`py-2 px-1 rounded-lg text-xs font-bold transition-all flex items-center justify-center text-center truncate ${isActive ? 'bg-card text-primary shadow-sm border border-border/60' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        <span className="truncate">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-xl border border-border bg-card p-2.5 sm:p-3 shadow-inner w-full max-w-full overflow-hidden">
                  {loadingSlots && takenSlots.size === 0 ? (
                    <div className="flex justify-center py-6">
                      <Loader2 size={24} className="animate-spin text-primary" />
                    </div>
                  ) : (
                    <div className="time-slots-grid grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2 w-full max-w-full">
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
                            className={`p-2 sm:p-2.5 rounded-xl border text-center transition-all select-none font-bold relative min-w-0 flex flex-col items-center justify-center ${isTaken ? (isDraft ? 'bg-orange-50 text-orange-400 border-orange-200 cursor-not-allowed overflow-hidden' : 'bg-red-50 text-red-300 border-red-200 cursor-not-allowed overflow-hidden') : (isSel ? 'bg-primary text-white border-primary shadow-md ring-2 ring-primary/30 scale-105' : 'bg-card hover:bg-primary/10 border-border text-foreground hover:border-primary/40')}`}
                          >
                            {isTaken ? (
                              <div className="flex flex-col items-center justify-center w-full">
                                {isDraft ? (
                                  <>
                                    <Clock3 size={15} className="mx-auto opacity-70 mb-0.5" />
                                    <span className="text-[8px] leading-tight block w-full text-center">
                                      <TimeLeft expiresAt={slotData?.expires_at || ''} />
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-[9.5px] sm:text-[10px] font-black tracking-wide text-red-500 uppercase truncate max-w-full">
                                    OCUPADO
                                  </span>
                                )}
                              </div>
                            ) : (
                              <>
                                <span className="text-xs sm:text-sm block leading-tight">{h12}:00</span>
                                <span className="text-[8.5px] sm:text-[9px] uppercase opacity-70">{ampm}</span>
                                <span className={`text-[8.5px] sm:text-[9px] block mt-0.5 font-semibold ${isSel ? 'text-white/90 font-bold' : 'text-primary'}`}>
                                  ${slotPrice.toLocaleString('es-CO')}
                                </span>                              </>
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
              {/* Lógica de Abono Fijo o Porcentaje Blindada */}

            </div>
          )}

          {step === 2 && (
            <div className="slide-up mt-6 space-y-5">
              {/* Temporizador de bloqueo activo */}
              {(() => {
                const isCritical = secondsLeft <= 50;
                return (
                  <div className={`flex justify-between items-center p-3.5 sm:p-4 rounded-2xl border transition-all shadow-xs ${isCritical
                    ? 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/40 ring-2 ring-red-500/20 animate-pulse'
                    : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                    }`}>
                    <span className="text-xs sm:text-sm font-bold flex items-center gap-2">
                      <Clock3 size={17} className={`animate-spin ${isCritical ? 'text-red-500' : 'text-amber-500'}`} />
                      <span>Tiempo para completar tu abono:</span>
                    </span>
                    <div className="flex items-center gap-3">
                      <span className={`font-mono font-black text-sm sm:text-base px-3 py-1 rounded-xl shadow-xs ${isCritical
                        ? 'bg-red-500 text-white dark:bg-red-600'
                        : 'bg-amber-500/25 text-amber-800 dark:text-amber-200'
                        }`}>
                        {Math.floor(Math.max(0, secondsLeft) / 60)}:{(Math.max(0, secondsLeft) % 60).toString().padStart(2, '0')}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowCancelPrompt(true)}
                        className={`text-xs font-bold underline transition-colors ${isCritical ? 'text-red-600 hover:text-red-700 dark:text-red-300' : 'text-red-500 hover:text-red-600'}`}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-4 max-w-2xl mx-auto w-full pb-6">

                {/* ── BARRA DE PROGRESO / ESTILO E-COMMERCE ── */}
                {/* <div className="bg-card border border-border/80 rounded-2xl p-3 sm:p-4 shadow-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-black text-sm">
                      ⚡
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-black text-foreground">Checkout Rápido de Cancha</h4>
                      <p className="text-[11px] text-muted-foreground">Completa los 3 pasos para asegurar tu turno</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-600 text-white shadow-xs">
                    Paso final
                  </span>
                </div> */}
                {/* ── PASO 1: DATOS DEL CLIENTE (Estilo Formulario Amigable) ── */}
                <div className="bg-card border border-border/80 rounded-3xl p-4 sm:p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-border/60">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                        1
                      </span>
                      <div>
                        <h3 className="text-xs sm:text-sm font-black text-foreground uppercase tracking-wide">
                          Tus Datos
                        </h3>
                        <p className="text-[11px] text-muted-foreground">Recibirás la confirmación de tu reserva por WhatsApp</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                        <User size={12} className="text-primary" />
                        <span>Tu Nombre Completo *</span>
                      </label>
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Ej: Carlos Eraso"
                        className="w-full px-4 py-3 bg-background border border-border rounded-2xl text-xs sm:text-sm font-medium outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                        <Phone size={12} className="text-emerald-500" />
                        <span>Tu WhatsApp (10 dígitos) *</span>
                      </label>
                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="Ej: 3123456789"
                        className="w-full px-4 py-3 bg-background border border-border rounded-2xl text-xs sm:text-sm font-medium outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-4 w-full">

                  {/* ── PASO DE PAGO Y COMPROBANTE UNIFICADO ── */}
                  <div className="bg-card border border-border/80 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">

                    {/* Cabecera */}
                    <div className="flex items-center justify-between pb-3 border-b border-border/60">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                          2
                        </span>
                        <div>
                          <h3 className="text-xs sm:text-sm font-black text-foreground uppercase tracking-wide">
                            Pago y Comprobante de Reserva
                          </h3>
                          <p className="text-[11px] text-muted-foreground">Transfiere el abono y adjunta tu captura</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-wider shrink-0">
                        Paso Final
                      </span>
                    </div>

                    {/* 1. Monto del Abono Centrado y Elegante (Sin verde saturado) */}
                    <div className="text-center bg-secondary/40 border border-border/60 rounded-2xl p-4 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                        Total abono a transferir
                      </span>
                      <div className="text-3xl sm:text-4xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                        ${abonoPrice.toLocaleString('es-CO')}
                      </div>
                      <p className="text-[11px] text-muted-foreground pt-0.5">
                        El saldo restante se paga directamente en la cancha.
                      </p>
                    </div>

                    {/* 2. Cuentas Disponibles */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <CreditCard size={13} className="text-primary" />
                        <span>Cuentas disponibles para transferir:</span>
                      </p>
                      {(() => {
                        const paymentMethods: Array<{ type: string; label: string; number: string; name: string }> = (currentPitch as any).payment_methods || [];
                        if (paymentMethods.length === 0) {
                          return (
                            <div className="bg-secondary/60 p-3.5 rounded-xl border border-border">
                              <p className="text-xs text-muted-foreground mb-1">Cuenta autorizada</p>
                              <strong className="text-xs sm:text-sm block">{currentPitch.name.toUpperCase()}</strong>
                              <p className="text-[11px] text-muted-foreground">Consulta directamente con el administrador.</p>
                            </div>
                          );
                        }
                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {paymentMethods.map(pm => <PaymentMethodCard key={pm.type} pm={pm} />)}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Divisor sutil */}
                    <div className="relative flex py-0.5 items-center">
                      <div className="flex-grow border-t border-border/60"></div>
                      <span className="flex-shrink mx-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-card px-2">
                        Sube tu comprobante aquí 👇
                      </span>
                      <div className="flex-grow border-t border-border/60"></div>
                    </div>

                    {/* 3. Área para Subir el Comprobante (Con aviso de revisión y etiqueta obligatorio) */}
                    <div className="space-y-2">
                      <div className={`relative rounded-2xl p-3.5 sm:p-4 transition-all duration-300 ${file
                        ? 'border-2 border-emerald-500 bg-emerald-500/5 ring-2 ring-emerald-500/10'
                        : 'border-2 border-dashed border-emerald-500/50 hover:border-emerald-500 bg-secondary/20'
                        }`}>

                        {/* 🏷️ Etiqueta de Obligatorio en la esquina superior derecha */}
                        {!file && (
                          <span className="absolute top-3 right-3 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-red-500 text-white shadow-xs z-10">
                            Obligatorio
                          </span>
                        )}

                        {!file ? (
                          <label className="group relative flex flex-col items-center justify-center p-3 sm:p-4 cursor-pointer text-center pt-2">
                            <input
                              type="file"
                              accept="image/*,.pdf"
                              className="hidden"
                              onChange={e => setFile(e.target.files?.[0] || null)}
                            />

                            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 group-hover:bg-emerald-500/20 text-emerald-600 flex items-center justify-center mb-2 transition-transform group-hover:scale-105">
                              <Upload size={20} className="animate-bounce" />
                            </div>

                            <div className="mb-1">
                              <span className="text-xs sm:text-sm font-black text-foreground tracking-tight">
                                Sube tu comprobante de pago
                              </span>
                            </div>

                            <p className="text-[10px] text-muted-foreground max-w-xs mb-2.5">
                              Nequi, Daviplata, Bancolombia
                            </p>

                            <div className="flex flex-wrap items-center justify-center gap-1.5">
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-background text-foreground/80 border border-border shadow-xs">
                                Nequi / Daviplata / Bancolombia / Otros
                              </span>
                            </div>
                          </label>
                        ) : (
                          <div className="bg-background border border-emerald-500/40 rounded-xl p-3 shadow-xs space-y-2.5">
                            <div className="flex items-center justify-between pb-2 border-b border-border/60">
                              <div className="flex items-center gap-1.5 text-emerald-600 font-extrabold text-xs">
                                <CheckCircle2 size={15} className="shrink-0" />
                                <span>¡Comprobante adjuntado!</span>
                              </div>
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
                                Listo
                              </span>
                            </div>

                            <div className="flex items-center gap-3 w-full">
                              {filePreview ? (
                                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border border-emerald-500/40 shrink-0 bg-secondary">
                                  <img src={filePreview} alt="Comprobante" className="w-full h-full object-cover" />
                                </div>
                              ) : (
                                <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center text-primary shrink-0">
                                  <FileText size={22} />
                                </div>
                              )}

                              <div className="flex-1 min-w-0 w-full space-y-1">
                                <p className="font-extrabold text-xs text-foreground truncate w-full">
                                  {file.name}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {(file.size / 1024).toFixed(1)} KB
                                </p>
                                <div className="flex items-center gap-2 pt-0.5">
                                  <label className="text-[11px] font-bold text-primary hover:underline cursor-pointer bg-primary/10 px-2.5 py-0.5 rounded-lg transition-all">
                                    <span>Cambiar</span>
                                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => setFile(null)}
                                    className="text-[11px] font-bold text-red-600 hover:text-red-700 bg-red-500/10 px-2.5 py-0.5 rounded-lg transition-all"
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Nota informativa de revisión */}
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px]">
                        <p>El administrador revisará el comprobante para confirmar y aprobar tu solicitud de reserva.</p>
                      </div>
                    </div>
                  </div>

                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-xs font-bold text-red-600 flex items-center gap-2">
                    <XCircle size={16} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* ── BOTÓN DE ACCIÓN FIJO / GIGANTE ESTILO TEMU/MERCADOLIBRE ── */}
                <div className="pt-2 sticky bottom-4 z-20">
                  <button
                    type="button"
                    onClick={handleBooking}
                    disabled={loading}
                    className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.99] text-white font-black text-sm sm:text-base transition-all shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        <span>Verificando y enviando reserva...</span>
                      </>
                    ) : (
                      <>
                        <span>¡Confirmar Reserva Ahora!</span>
                        <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                  <div className="flex items-center justify-center gap-1.5 mt-2 bg-background/80 backdrop-blur-xs py-1 rounded-lg">
                    <ShieldCheck size={13} className="text-emerald-500" />
                    <span className="text-[11px] text-muted-foreground font-medium">Tus datos y horario quedan asegurados al instante</span>
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>

        <aside className="booking-aside">
          {/* Título compacto en móvil */}
          <h2 className="text-sm sm:text-base font-bold pb-3 border-b border-border">
            Resumen de Reserva
          </h2>

          <div className="space-y-0 mt-3 text-sm">
            <div className="summary-line flex justify-between items-center">
              <span className="text-muted-foreground font-medium">Complejo</span>
              <strong className="uppercase font-black text-foreground text-right max-w-[55%] truncate text-xs">{complexDisplayName}</strong>
            </div>

            <div className="summary-line flex justify-between items-center">
              <span className="text-muted-foreground font-medium">Cancha</span>
              <strong className="uppercase font-black text-emerald-600 dark:text-emerald-400 text-right text-xs">{currentPitch.name}</strong>
            </div>

            <div className="summary-line flex justify-between items-center">
              <span className="text-muted-foreground font-medium">Fecha</span>
              <strong className="font-semibold text-foreground text-right text-xs capitalize">{formattedDate || '-'}</strong>
            </div>

            <div className="summary-line flex flex-col items-start gap-1 pt-1">
              <span className="text-muted-foreground font-medium">Horas ({totalHours}h)</span>
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
              <span className="text-muted-foreground font-medium">Duración</span>
              <strong className="font-semibold text-foreground">
                {totalHours > 0 ? `${totalHours}h` : '-'}
              </strong>
            </div>

            <div className="summary-line flex justify-between items-center pt-2 border-t border-dashed border-border">
              <span className="text-muted-foreground font-medium">Total</span>
              <strong className="text-sm font-bold text-foreground">
                ${totalPrice > 0 ? totalPrice.toLocaleString('es-CO') : '-'}
              </strong>
            </div>

            <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-600/20 rounded-xl flex justify-between items-center">
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">Abono requerido</span>
              <strong className="text-base font-extrabold text-emerald-700 dark:text-emerald-400">
                ${totalPrice > 0 ? abonoPrice.toLocaleString('es-CO') : '-'}
              </strong>
            </div>
            {customPricing?.booking_type === 'fixed' ? (
              <p className="text-[11px] text-muted-foreground text-center mt-2">
                Abono fijo de <strong>${Number(customPricing.booking_fixed || 0).toLocaleString('es-CO')}</strong> por hora para confirmar
              </p>
            ) : (customPricing?.booking_percentage || (currentPitch as any).booking_percentage) ? (
              <p className="text-[11px] text-muted-foreground text-center mt-2">
                Abono del <strong>{customPricing?.booking_percentage || (currentPitch as any).booking_percentage || 50}%</strong> del valor total para confirmar
              </p>
            ) : null}
          </div>

          <p className="text-[10px] text-muted-foreground mt-2 text-center leading-relaxed">
            El valor restante se paga en la cancha
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