'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowRight, Clock3, Heart, MapPin, ShieldCheck, CalendarDays, Calendar, CheckCircle, Loader2, Grid, X, ChevronLeft, ChevronRight, Trophy, CheckCircle2, Phone, Users, Building2, Layers, LandPlot } from 'lucide-react';
import { Pitch } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useToday } from '@/lib/use-today';
import { CustomMonthCalendar } from '../explore/CustomMonthCalendar';
import { useFavorites } from '@/lib/favorites-context';
import { useActiveBooking } from '@/lib/active-booking-context';
import { CustomAlertModal, AlertModalState } from '@/components/ui/CustomAlertModal';
import { Copy, Check } from "lucide-react";


interface PitchDetailProps {
  pitch: Pitch;
  onBack: () => void;
  onBook: (selectedTimes: string[], date: string, chosenPitch?: Pitch) => void;
  initialDate?: string;
  initialTimes?: string[];
  onSelectPitch?: (pitch: Pitch) => void;
}

const DEFAULT_TIME_SLOTS = [
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'
];

function Timer({ initialSeconds }: { initialSeconds: number }) {
  const [secs, setSecs] = useState(initialSeconds);
  useEffect(() => {
    setSecs(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (secs <= 0) return;
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secs]);

  if (secs <= 0) return <span className="text-[9px] text-amber-500 font-bold">Liberando...</span>;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return <span className="font-mono font-black tracking-widest">{m}:{s.toString().padStart(2, '0')}</span>;
}

const getYoutubeId = (url: string) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

export function PitchDetail({ pitch, onBack, onBook, initialDate, initialTimes, onSelectPitch }: PitchDetailProps) {
  const today = useToday();
  const [currentPitch, setCurrentPitch] = useState<Pitch>(pitch);
  const [siblingPitches, setSiblingPitches] = useState<Pitch[]>([]);
  const [complexInfo, setComplexInfo] = useState<{ id?: string; name?: string; address?: string | null; zone?: string | null; city?: string | null } | null>(
    (pitch as any)?.companies || (pitch as any)?.company || null
  );

  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [mobileGalleryIndex, setMobileGalleryIndex] = useState(0);
  const mobileGalleryRef = useRef<HTMLDivElement>(null);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [schools, setSchools] = useState<any[]>([]);

  const [alertState, setAlertState] = useState<AlertModalState>({
    isOpen: false,
    type: 'warning',
    title: '',
    message: ''
  });

  // Auth & Favorites & ActiveBooking hooks
  const { user, profile } = useAuth();
  const { isFavorite: checkFav, toggleFavorite: doToggleFav, isFavoriteComplex, toggleFavoriteComplex } = useFavorites();
  const complexId = currentPitch.company_id || (currentPitch as any)?.companies?.id || (currentPitch as any)?.company?.id;
  const isFavorite = complexId ? isFavoriteComplex(complexId) : checkFav(currentPitch.id);
  const [loadingFavorite, setLoadingFavorite] = useState(false);
  const { startLock, lockLoading, lockError, activeBooking } = useActiveBooking();

  const [showAllReviewsModal, setShowAllReviewsModal] = useState(false);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [submittingReview, setSubmittingReview] = useState(false);

  // Inicializar estado de fecha y hora
  const [selectedDate, setSelectedDate] = useState(initialDate || '');
  const [selectedTimes, setSelectedTimes] = useState<string[]>(initialTimes || []);
  const [activeTimeCategory, setActiveTimeCategory] = useState<'manana' | 'tarde' | 'noche'>('tarde');
  const [takenSlots, setTakenSlots] = useState<Map<string, { status: string, expires_at: string | null }>>(new Map());
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    setCurrentPitch(pitch);
    if ((pitch as any)?.companies || (pitch as any)?.company) {
      setComplexInfo((pitch as any).companies || (pitch as any).company);
    }
  }, [pitch]);

  useEffect(() => {
    const compId = currentPitch.company_id || (currentPitch as any)?.companies?.id || (currentPitch as any)?.company?.id;
    if (!compId) return;

    const loadSiblings = async () => {
      try {
        const { data, error } = await supabase
          .from('pitches')
          .select('*, companies(id, name, address, zone)')
          .eq('company_id', compId)
          .order('created_at', { ascending: true });

        if (!error && data) {
          setSiblingPitches(data);
          if (data[0]?.companies) {
            setComplexInfo(data[0].companies);
          }
        }
      } catch (err) {
        console.error('Error fetching sibling pitches:', err);
      }
    };

    loadSiblings();
  }, [currentPitch.company_id, supabase]);

  const handleSwitchPitch = (newPitch: Pitch) => {
    if (newPitch.id === currentPitch.id) return;
    setCurrentPitch(newPitch);
    setSelectedTimes([]);
    if (onSelectPitch) {
      onSelectPitch(newPitch);
    }
  };

  useEffect(() => {
    // Siempre arrancar desde el tope (importante en móvil)
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [currentPitch.id]);

  useEffect(() => {
    if (today && !selectedDate && !initialDate) {
      setSelectedDate(today);
    }
  }, [today, selectedDate, initialDate]);

  // Lógica de Precios Variables por Hora
  const pitchAny = currentPitch as any;
  const customPricing = pitchAny.custom_pricing || {};
  const basePrice = Number(pitchAny.price_per_hour || 0);

  // Redes sociales de la cancha
  const fbUrl = pitchAny.facebook_url || pitchAny.custom_pricing?.facebook_url || pitchAny.custom_pricing?.social_links?.facebook || null;
  const igUrl = pitchAny.instagram_url || pitchAny.custom_pricing?.instagram_url || pitchAny.custom_pricing?.social_links?.instagram || null;
  const ttUrl = pitchAny.tiktok_url || pitchAny.custom_pricing?.tiktok_url || pitchAny.custom_pricing?.social_links?.tiktok || null;

  const formatSocialUrl = (url: string | null, platform: 'instagram' | 'tiktok' | 'facebook'): string => {
    if (!url) return '#';
    const trimmed = url.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    const cleanHandle = trimmed.replace(/^@/, '');
    if (platform === 'instagram') return `https://instagram.com/${cleanHandle}`;
    if (platform === 'tiktok') return `https://tiktok.com/@${cleanHandle}`;
    if (platform === 'facebook') return `https://facebook.com/${cleanHandle}`;
    return `https://${trimmed}`;
  };

  const getSlotPrice = (slot: string) => {
    return customPricing[slot] || basePrice;
  };

  const totalPrice = selectedTimes.reduce((sum, slot) => sum + getSlotPrice(slot), 0);

  useEffect(() => {
    if (!currentPitch.id) return;
    fetch(`/api/tournaments?pitch_id=${currentPitch.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setTournaments(data.data || []);
        }
      })
      .catch(err => console.error("Error fetching tournaments", err));

    fetch(`/api/schools?pitch_id=${currentPitch.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSchools(data.data || []);
        }
      })
      .catch(err => console.error("Error fetching schools", err));
  }, [currentPitch.id]);

  // Función para obtener los slots ocupados (llamada por useEffect y por botón de reserva)
  const fetchTakenSlots = useCallback(async (silent = false) => {
    if (!selectedDate || !currentPitch.id) return;
    if (!silent) setLoadingSlots(true);
    const dayStart = `${selectedDate}T00:00:00-05:00`;
    const dayEnd = `${selectedDate}T23:59:59-05:00`;

    const { data, error } = await supabase
      .from('bookings')
      .select('start_time, status, expires_at')
      .eq('pitch_id', currentPitch.id)
      .gte('start_time', dayStart)
      .lte('start_time', dayEnd)
      .neq('status', 'cancelled');

    if (!error && data) {
      const taken = new Map<string, { status: string, expires_at: string | null }>();
      data.forEach((b: any) => {
        if (b.status === 'draft' && b.expires_at && new Date(b.expires_at) < new Date()) {
          return;
        }
        try {
          const d = new Date(b.start_time);
          const localH = (d.getUTCHours() - 5 + 24) % 24;
          const h = `${String(localH).padStart(2, '0')}:00`;
          taken.set(h, { status: b.status, expires_at: b.expires_at });
        } catch (e) {
          if (b.start_time) taken.set(b.start_time.substring(11, 16), { status: b.status, expires_at: b.expires_at });
        }
      });
      setTakenSlots(taken);
    }
    if (!silent) setLoadingSlots(false);
  }, [selectedDate, currentPitch.id, supabase]);

  // Cargar slots ocupados cuando cambia la fecha y escuchar en tiempo real
  useEffect(() => {
    if (!selectedDate || !currentPitch.id) return;
    if (!initialTimes || initialTimes.length === 0) {
      setSelectedTimes([]);
    }

    fetchTakenSlots(false);

    // Polling continuo cada 3.5s silencioso sin parpadear la pantalla
    const pollInterval = setInterval(() => fetchTakenSlots(true), 3500);

    const channel = supabase
      .channel(`public:bookings:pitch_id=eq.${currentPitch.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `pitch_id=eq.${currentPitch.id}` },
        () => {
          fetchTakenSlots(true);
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [selectedDate, currentPitch.id, fetchTakenSlots, supabase, initialTimes]);

  // Load reviews
  useEffect(() => {
    if (!currentPitch.id) return;

    const fetchExtras = async () => {
      try {
        const { data: revData, error: revError } = await supabase
          .from('pitch_reviews')
          .select(`
            id, rating, comment, created_at, user_id,
            profiles (full_name, avatar_url)
          `)
          .eq('pitch_id', currentPitch.id)
          .order('created_at', { ascending: false });

        if (!revError && revData) setReviews(revData);
      } catch (e) {
        // Ignorar si la tabla aún no existe
      } finally {
        setLoadingReviews(false);
      }
    };

    fetchExtras();
  }, [currentPitch.id, supabase]);

  const toggleFavorite = async () => {
    if (!user) {
      setAlertState({
        isOpen: true,
        type: 'login_required',
        title: 'Inicia sesión',
        message: 'Debes iniciar sesión o crear una cuenta para guardar complejos en favoritos.'
      });
      return;
    }
    setLoadingFavorite(true);
    try {
      const cId = currentPitch.company_id || (currentPitch as any)?.companies?.id || (currentPitch as any)?.company?.id;
      if (cId) {
        await toggleFavoriteComplex(cId);
      } else {
        await doToggleFav(currentPitch.id);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingFavorite(false);
    }
  };
  // ... dentro de tu componente principal:
  const [copied, setCopied] = useState(false);
  function fmtSlot(slot: string) {
    const h = parseInt(slot.split(':')[0]);
    const ampm = h < 12 ? 'am' : 'pm';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:00 ${ampm}`;
  }
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
  const handleCopy = async (e: React.MouseEvent, text: string) => {
    e.preventDefault(); // Evita que dispare el enlace de llamada
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Error al copiar al portapapeles", err);
    }
  };
  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert("Debes iniciar sesión para dejar una reseña");
      return;
    }
    if (!reviewText.trim()) return;

    setSubmittingReview(true);
    try {
      const { data, error } = await supabase
        .from('pitch_reviews')
        .insert({
          pitch_id: pitch.id,
          user_id: user.id,
          rating: reviewRating,
          comment: reviewText.trim()
        })
        .select(`
          id, rating, comment, created_at, user_id,
          profiles (full_name, avatar_url)
        `)
        .single();

      if (error) {
        if (error.code === '23505') {
          alert('Ya dejaste una reseña en esta cancha.');
        } else {
          alert('Error al enviar la reseña.');
        }
      } else if (data) {
        setReviews([data, ...reviews]);
        setReviewText('');
        setReviewRating(5);
      }
    } catch (e) {
      alert('Error al enviar la reseña.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const formattedDate = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  const amenitiesList = Array.isArray(pitch.amenities)
    ? pitch.amenities
    : typeof pitchAny.amenities === 'string' && pitchAny.amenities
      ? pitchAny.amenities.split(',').map((a: string) => a.trim())
      : ['Luces LED', 'Parqueadero', 'Camerinos', 'Césped premium'];

  return (
    <section className="page-content detail-page fade-in">
      <CustomAlertModal alertState={alertState} onClose={() => setAlertState(prev => ({ ...prev, isOpen: false }))} />

      <button type="button" className="back-link flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6" onClick={onBack}>
        ← Volver a explorar
      </button>
      <div className="order-2 md:order-1 detail-header mb-5 -mx-1 p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-primary/10 via-card to-card border border-primary/15 shadow-sm md:mx-0 md:mb-4 md:rounded-2xl md:bg-card md:border-border w-full max-w-full min-w-0">

        <div className="flex items-start justify-between gap-3 w-full min-w-0">

          {/* Lado izquierdo: Nombres apilados pero muy compactos verticalmente */}
          <div className="space-y-1 min-w-0 flex-1">
            {/* Etiqueta decorativa o subtítulo superior */}
            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-primary">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
              <span>Detalles del Complejo</span>
            </div>
            {/* Nombre del Complejo */}
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/80 bg-clip-text text-transparent break-words leading-tight">
              {complexInfo?.name || currentPitch.name}
            </h1>

            {/* Nombre de la Cancha (Directamente abajo, sin divisiones y compacto) */}
            {complexInfo?.name && complexInfo.name !== currentPitch.name && (
              <p className="text-xs sm:text-sm md:text-base font-bold text-primary/90 tracking-wide truncate capitalize">
                {currentPitch.name}
              </p>
            )}
          </div>

          {/* Lado derecho: Calificación estilo badge moderno y limpio */}
          <div className="flex items-center shrink-0 pt-0.5">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 shadow-xs">
              <span className="text-amber-500 text-sm sm:text-base">★</span>
              <div className="flex items-baseline gap-1">
                <span className="font-black text-xs sm:text-sm text-foreground">
                  {pitchAny.rating || '5.0'}
                </span>
                <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">
                  ({reviews.length > 0 ? reviews.length : (pitchAny.reviews || 0)})
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Bloque reordenable: en móvil primero fotos, luego título, luego selector de canchas.
          En PC se mantiene el orden original: título, selector de canchas, fotos. */}
      <div className="flex flex-col">

        {/* Header con Nombre y Complejo */}

        <button
          type="button"
          onClick={toggleFavorite}
          disabled={loadingFavorite}
          className={`hidden md:inline-flex md:items-center md:justify-center shrink-0 p-3 rounded-full border shadow-sm transition-all duration-300 hover:scale-110 active:scale-90 disabled:opacity-50 ${isFavorite
            ? 'bg-green-50 border-green-200 text-green-500 shadow-md shadow-green-100/50 scale-105'
            : 'bg-background border-border text-muted-foreground hover:text-green-500 hover:bg-green-50/30 hover:border-green-100'
            }`}
          aria-label={isFavorite ? "Quitar complejo de favoritos" : "Guardar complejo en favoritos"}
        >
          <Heart
            size={22}
            className={`transition-all duration-300 transform sm:w-6 sm:h-6 ${isFavorite
              ? "fill-current scale-110 animate-[bounce_0.4s_ease-in-out_1]"
              : "scale-100"
              }`}
            strokeWidth={isFavorite ? 2 : 2.5}
          />
        </button>


        {/* Selector de Canchas Asociadas al Complejo */}
        {siblingPitches.length > 1 && (
          <div className="order-3 md:order-2 mb-6 p-4 sm:p-4 rounded-3xl sm:rounded-2xl bg-gradient-to-r from-emerald-500/10 via-primary/5 to-transparent border border-emerald-500/20 shadow-xs">
            {/* Encabezado */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 mb-3">
              <div className="flex items-center gap-2">
                <LandPlot size={17} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <h3 className="text-[11px] sm:text-sm font-black text-foreground uppercase tracking-wide">
                  Canchas en este complejo ({siblingPitches.length})
                </h3>
              </div>
              <span className="text-[10px] sm:text-[11px] text-muted-foreground font-medium">
                Desliza para ver más canchas
              </span>
            </div>

            {/* Contenedor con scroll horizontal */}
            <div className="flex items-center gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-none [-webkit-overflow-scrolling:touch] snap-x snap-mandatory">
              {siblingPitches.map((sp, idx: number) => {
                const isCurrent = sp.id === currentPitch.id;
                const spPrice = Number((sp as any).price_per_hour || (sp as any).price || 0);
                const spImg = (sp as any).media_urls?.[0] || (sp as any).image_url;

                return (
                  <button
                    key={sp.id || idx}
                    type="button"
                    onClick={() => handleSwitchPitch(sp)}
                    className={`flex items-center gap-3 p-3 rounded-2xl sm:rounded-xl border text-left transition-all relative cursor-pointer shrink-0 snap-start w-[220px] sm:w-[260px] ${isCurrent
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
                    </div>

                    {/* Información de la cancha */}
                    <div className="min-w-0 flex-1 flex flex-col justify-center">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <p className={`text-xs font-black uppercase truncate ${isCurrent ? 'text-white' : 'text-foreground'}`}>
                          {sp.name}
                        </p>
                        {isCurrent && (
                          <span className="text-[8.5px] font-black uppercase px-1.5 py-0.5 rounded bg-white text-emerald-700 tracking-wider shrink-0 shadow-2xs">
                            Viendo
                          </span>
                        )}
                      </div>
                      <p className={`text-[11px] truncate ${isCurrent ? 'text-emerald-100' : 'text-muted-foreground'}`}>
                        {sp.type || 'Fútbol 5'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Galería estilo Airbnb */}
        {(() => {
          const mediaUrls = Array.isArray(pitchAny.media_urls) && pitchAny.media_urls.length > 0
            ? pitchAny.media_urls
            : pitchAny.image_url ? [pitchAny.image_url] : [];

          if (mediaUrls.length === 0) return null;

          const gridClasses = mediaUrls.length >= 5
            ? 'grid-cols-1 md:grid-cols-4 md:grid-rows-2 md:h-[450px] lg:h-[500px]'
            : mediaUrls.length === 4
              ? 'grid-cols-1 md:grid-cols-3 md:grid-rows-2 md:h-[450px] lg:h-[500px]'
              : mediaUrls.length === 3
                ? 'grid-cols-1 md:grid-cols-3 md:grid-rows-1 md:h-[400px]'
                : mediaUrls.length === 2
                  ? 'grid-cols-1 md:grid-cols-2 md:grid-rows-1 md:h-[400px]'
                  : 'grid-cols-1 md:h-[450px] lg:h-[500px]';

          return (
            <div className="order-1 md:order-3 relative mb-8 sm:mb-10 rounded-3xl sm:rounded-2xl overflow-hidden group border border-border shadow-lg shadow-black/5 sm:shadow-none">
              {/* Corazón flotante — solo móvil, sobre la foto para que no quede "solo" */}
              <button
                type="button"
                onClick={toggleFavorite}
                disabled={loadingFavorite}
                className={`md:hidden absolute top-3 left-3 z-30 p-2.5 rounded-full border shadow-lg backdrop-blur-md transition-all duration-300 hover:scale-110 active:scale-90 disabled:opacity-50 ${isFavorite
                  ? 'bg-green-50/95 border-green-200 text-green-500'
                  : 'bg-black/40 border-white/25 text-white hover:text-green-400'
                  }`}
                aria-label={isFavorite ? "Quitar complejo de favoritos" : "Guardar complejo en favoritos"}
              >
                <Heart
                  size={20}
                  className={`transition-all duration-300 transform ${isFavorite
                    ? "fill-current scale-110 animate-[bounce_0.4s_ease-in-out_1]"
                    : "scale-100"
                    }`}
                  strokeWidth={isFavorite ? 2 : 2.5}
                />
              </button>

              {/* Carrusel deslizable — solo móvil: muestra TODAS las fotos, no solo la primera */}
              <div className="md:hidden">
                <div
                  ref={mobileGalleryRef}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const idx = Math.round(el.scrollLeft / el.clientWidth);
                    if (idx !== mobileGalleryIndex) setMobileGalleryIndex(idx);
                  }}
                  className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none [-webkit-overflow-scrolling:touch] h-[300px] sm:h-[280px]"
                >
                  {mediaUrls.map((url: string, idx: number) => (
                    <div
                      key={idx}
                      className="relative w-full h-full shrink-0 snap-center cursor-pointer bg-black"
                      onClick={() => { setActiveMediaIndex(idx); setShowGalleryModal(true); }}
                    >
                      {getYoutubeId(url) ? (
                        <>
                          <iframe src={`https://www.youtube.com/embed/${getYoutubeId(url)}`} className="w-full h-full object-cover pointer-events-none" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                          <div className="absolute inset-0 bg-transparent cursor-pointer z-10" />
                        </>
                      ) : (
                        <img src={url} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                      )}
                    </div>
                  ))}
                </div>

                {/* Puntos indicadores + contador */}
                {mediaUrls.length > 1 && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
                    {mediaUrls.map((_: string, idx: number) => (
                      <span
                        key={idx}
                        className={`h-1.5 rounded-full transition-all ${idx === mobileGalleryIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/50'}`}
                      />
                    ))}
                  </div>
                )}
                <div className="absolute top-3 right-3 bg-black/60 text-white text-[11px] font-bold px-2 py-0.5 rounded-full z-10">
                  {mobileGalleryIndex + 1}/{mediaUrls.length}
                </div>
              </div>

              {/* Grilla estilo Airbnb — solo escritorio */}
              <div className={`hidden md:grid gap-2 ${gridClasses}`}>
                <div
                  className={`relative w-full h-full cursor-pointer hover:opacity-90 transition-opacity bg-black ${mediaUrls.length >= 5 ? 'md:col-span-2 md:row-span-2' : mediaUrls.length >= 3 ? 'md:col-span-2 md:row-span-2' : ''}`}
                  onClick={() => { setActiveMediaIndex(0); setShowGalleryModal(true); }}
                >
                  {getYoutubeId(mediaUrls[0]) ? (
                    <>
                      <iframe src={`https://www.youtube.com/embed/${getYoutubeId(mediaUrls[0])}`} className="w-full h-full object-cover pointer-events-none" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                      <div className="absolute inset-0 bg-transparent cursor-pointer z-10" />
                    </>
                  ) : (
                    <img src={mediaUrls[0]} alt="Foto principal" className="w-full h-full object-cover" />
                  )}
                </div>

                {mediaUrls.slice(1, 5).map((url: string, idx: number) => (
                  <div
                    key={idx}
                    className="relative w-full h-full cursor-pointer hover:opacity-90 transition-opacity hidden md:block bg-black"
                    onClick={() => { setActiveMediaIndex(idx + 1); setShowGalleryModal(true); }}
                  >
                    {getYoutubeId(url) ? (
                      <>
                        <iframe src={`https://www.youtube.com/embed/${getYoutubeId(url)}`} className="w-full h-full object-cover pointer-events-none" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                        <div className="absolute inset-0 bg-transparent cursor-pointer z-10" />
                      </>
                    ) : (
                      <img src={url} alt={`Foto ${idx + 2}`} className="w-full h-full object-cover" />
                    )}
                  </div>
                ))}
              </div>

              {/* <button
                type="button"
                onClick={() => { setActiveMediaIndex(mobileGalleryIndex); setShowGalleryModal(true); }}
                className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 bg-white/95 dark:bg-zinc-900/95 text-foreground px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 sm:gap-2 shadow-lg border border-border/50 hover:scale-105 active:scale-95 transition-transform"
              >
                <Grid size={14} className="sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Mostrar todas las fotos</span><span className="sm:hidden">Ver fotos</span>
              </button> */}
            </div>
          );
        })()}

      </div>

      <div className="flex flex-col md:flex-row gap-6 md:gap-10">
        <div className="order-2 md:order-1 flex-1 w-full max-w-full md:max-w-[55%] lg:max-w-[65%] space-y-6 md:space-y-10">
          <div className="bg-card px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-8 rounded-[28px] md:rounded-2xl border border-border shadow-sm shadow-black/[0.03] md:shadow-sm">
            <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-foreground">Sobre esta cancha</h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              {pitchAny.description || 'Cancha de alto rendimiento perfecta para partidos entre amigos, entrenamientos y torneos locales. Espacio cuidado, iluminado y listo para jugar.'}
            </p>
            <div className="flex flex-wrap gap-2 sm:gap-3 mt-4 sm:mt-5">
              {amenitiesList.slice(0, 4).map((a: string, i: number) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-bold bg-emerald-50 text-emerald-800 px-3.5 py-2 sm:px-3.5 sm:py-1.5 rounded-full sm:rounded-lg border border-emerald-200 shadow-sm transition-all"
                >
                  <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                  {a}
                </span>
              ))}

              {amenitiesList.length > 4 && (
                <span className="inline-flex items-center text-[11px] sm:text-xs text-emerald-800 font-extrabold px-2 py-1.5 bg-emerald-100/60 rounded-lg border border-emerald-200/40">
                  +{amenitiesList.length - 4} más
                </span>
              )}
            </div>



          </div>

          <div className="bg-card px-4 py-5 sm:p-6 md:p-8 rounded-[28px] md:rounded-2xl border border-border shadow-sm shadow-black/[0.03] md:shadow-sm">
            <h2 className="text-base sm:text-lg md:text-xl font-black mb-3 sm:mb-4 text-foreground">
              Detalles Técnicos
            </h2>

            {/* GRID DE DETALLES */}
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 mt-3 sm:mt-4 w-full">
              {[
                ['Tipo', currentPitch.type || 'Fútbol 5'],
                ['Superficie', currentPitch.surface || 'Sintética'],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="p-3.5 sm:p-3.5 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-2xl sm:rounded-xl border border-emerald-500/10 dark:border-emerald-500/20 shadow-xs flex flex-col items-center justify-center text-center transition-all hover:scale-[1.02] duration-200 w-full"
                >
                  <p className="text-[9px] sm:text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">
                    {k}
                  </p>
                  <p className="font-black text-xs sm:text-sm text-emerald-700 dark:text-emerald-400 leading-tight">
                    {v}
                  </p>
                </div>
              ))}
            </div>

            {/* CONTENEDOR DEL TELÉFONO CENTRADO */}
            {pitchAny.contact_phone && (
              <div className="mt-3 sm:mt-4 p-4 sm:p-3.5 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/15 dark:border-emerald-500/20 rounded-3xl sm:rounded-2xl group relative">

                {/* Enlace para llamar */}
                <a
                  href={`tel:${pitchAny.contact_phone.replace(/\s/g, '')}`}
                  className="flex items-center justify-center gap-2.5 sm:gap-3 w-full pb-1"
                >
                  {/* Ícono de Teléfono */}
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                    <Phone size={17} className="sm:w-[18px] sm:h-[18px] text-emerald-600 dark:text-emerald-400" />
                  </div>

                  {/* Texto centrado con respecto al bloque */}
                  <div className="flex flex-col items-start">
                    <p className="text-[9px] sm:text-[10px] font-bold text-emerald-700 dark:text-emerald-400/80 uppercase tracking-wider">
                      Teléfono de contacto
                    </p>
                    <p className="font-extrabold text-sm sm:text-base text-foreground tracking-wider leading-tight mt-0.5">
                      {pitchAny.contact_phone}
                    </p>
                  </div>
                </a>

                {/* Botón de copiar compacto en la esquina inferior derecha */}
                <button
                  type="button"
                  onClick={(e) => handleCopy(e, pitchAny.contact_phone)}
                  className={`absolute bottom-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-[-5px] font-bold transition-all border ${copied
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-background hover:bg-muted text-muted-foreground border-border/60 shadow-xs active:scale-95'
                    }`}
                  title="Copiar número"
                >
                  {copied ? (
                    <>
                      <Check size={9} />
                      <span>¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={9} />
                      <span>Copiar</span>
                    </>
                  )}
                </button>

              </div>
            )}

            {/* REDES SOCIALES DE LA CANCHA */}
            {(igUrl || ttUrl || fbUrl) && (
              <div className="mt-3 sm:mt-4 p-4 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/15 dark:border-emerald-500/20 rounded-3xl sm:rounded-2xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">🌐</span>
                    <h4 className="text-[10px] sm:text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">
                      Redes Sociales
                    </h4>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-full">
                    Oficiales
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Instagram */}
                  {igUrl && (
                    <a
                      href={formatSocialUrl(igUrl, 'instagram')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-pink-500/20 bg-gradient-to-r from-pink-500/10 via-rose-500/5 to-amber-500/10 hover:border-pink-500/40 hover:shadow-md transition-all active:scale-95 cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] uppercase font-bold text-pink-600 dark:text-pink-400">Instagram</span>
                        <span className="text-xs font-extrabold text-foreground truncate group-hover:text-pink-600 transition-colors">
                          {igUrl.replace(/^https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, '')}
                        </span>
                      </div>
                    </a>
                  )}

                  {/* TikTok */}
                  {ttUrl && (
                    <a
                      href={formatSocialUrl(ttUrl, 'tiktok')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-100/90 dark:bg-neutral-900/90 hover:border-black dark:hover:border-white hover:shadow-md transition-all active:scale-95 cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center text-white shrink-0 shadow-xs group-hover:scale-105 transition-transform border border-neutral-800">
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] uppercase font-bold text-neutral-800 dark:text-neutral-300">TikTok</span>
                        <span className="text-xs font-extrabold text-foreground truncate group-hover:text-black dark:group-hover:text-white transition-colors">
                          {ttUrl.replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/, '@').replace(/\/$/, '')}
                        </span>
                      </div>
                    </a>
                  )}

                  {/* Facebook */}
                  {fbUrl && (
                    <a
                      href={formatSocialUrl(fbUrl, 'facebook')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-blue-500/20 bg-blue-500/10 hover:border-[#1877F2]/50 hover:shadow-md transition-all active:scale-95 cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#1877F2] flex items-center justify-center text-white shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] uppercase font-bold text-[#1877F2]">Facebook</span>
                        <span className="text-xs font-extrabold text-foreground truncate group-hover:text-[#1877F2] transition-colors">
                          {fbUrl.replace(/^https?:\/\/(www\.)?facebook\.com\//, '').replace(/\/$/, '')}
                        </span>
                      </div>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="bg-card px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-8 rounded-[28px] md:rounded-2xl border border-border/60 md:border-0 shadow-sm shadow-black/[0.03] md:shadow-none">
            <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-foreground">Ubicación</h2>
            {pitchAny.lat && pitchAny.lng ? (
              <div className="rounded-xl overflow-hidden border border-border">
                <iframe
                  width="100%"
                  height="200"
                  style={{ border: 0 }}
                  loading="lazy"
                  allowFullScreen
                  src={`https://maps.google.com/maps?q=${pitchAny.lat},${pitchAny.lng}&z=15&output=embed`}
                ></iframe>
                <div className="p-3 bg-card flex justify-between items-center">
                  <div className="flex items-center gap-2">
                  </div>
                  <button
                    type="button"
                    onClick={() => window.open(`https://maps.google.com/maps?q=${pitchAny.lat},${pitchAny.lng}`, '_blank')}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    Abrir en Google Maps
                  </button>
                </div>
              </div>
            ) : (
              <div className="location-preview p-4 bg-secondary rounded-xl flex items-center gap-3">
                <MapPin size={20} className="text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Fácil acceso</p>
                </div>
              </div>
            )}
          </div>

          {tournaments.length > 0 && (
            <div className="bg-card px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-8 rounded-[28px] md:rounded-2xl border border-border shadow-sm shadow-black/[0.03] md:shadow-sm mt-6 w-full max-w-full min-w-0">
              <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-5 flex items-center gap-2 text-foreground">
                <Trophy size={20} className="sm:w-[22px] sm:h-[22px] text-emerald-600 shrink-0" /> Campeonatos en esta cancha
              </h2>
              {/* Cambiado a grid de 2 columnas en pantallas medianas o superior, o se acomodan horizontalmente */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-3.5 w-full min-w-0">
                {tournaments.map(t => (
                  <Link href="/tournaments" key={t.id} className="block group w-full min-w-0">
                    <div className="flex items-center gap-3 p-3.5 sm:p-4 bg-emerald-50/30 rounded-2xl sm:rounded-xl border border-border/60 hover:border-emerald-500/50 hover:bg-emerald-50/60 shadow-sm transition-all duration-200 w-full min-w-0">

                      {/* Contenedor de Imagen o Icono */}
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shrink-0 shadow-sm group-hover:scale-105 transition-transform overflow-hidden">
                        {t.media_urls?.[0] ? (
                          <img src={t.media_urls[0]} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Trophy size={22} className="shrink-0" />
                        )}
                      </div>

                      {/* Información del Torneo */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-extrabold capitalize text-sm sm:text-base text-foreground truncate group-hover:text-emerald-700 transition-colors">
                          {t.name}
                        </h4>
                        <p className="text-[11px] sm:text-xs font-medium text-muted-foreground mt-0.5 truncate">
                          Inicia: {new Date(t.start_date + 'T12:00:00').toLocaleDateString('es-CO')}
                        </p>
                      </div>

                      {/* Premio Mayor Destacado (Adaptado para verse limpio horizontalmente) */}
                      {(t.prize || (t.prize_value && t.prize_value > 0)) && (
                        <div className="flex flex-col items-end justify-center bg-emerald-100/50 border border-emerald-200/60 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl shrink-0 text-right shadow-xs group-hover:bg-emerald-100 transition-colors">
                          <p className="text-[9px] sm:text-[10px] font-bold text-emerald-800/80 uppercase tracking-wider">Premio</p>
                          <p className="text-xs sm:text-sm font-black text-emerald-700 tracking-tight mt-0.5 whitespace-nowrap">
                            {t.prize_value && t.prize_value > 0 ? `$${Number(t.prize_value).toLocaleString('es-CO')}` : t.prize}
                          </p>
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {schools.length > 0 && (
            <div className="bg-card px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-8 rounded-[28px] md:rounded-2xl border border-border shadow-sm shadow-black/[0.03] md:shadow-sm mt-6 w-full max-w-full min-w-0">
              <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-5 flex items-center gap-2 text-foreground">
                <Users size={20} className="sm:w-[22px] sm:h-[22px] text-primary shrink-0" /> Escuelas de formación
              </h2>

              {/* Distribución en grilla horizontal de 2 columnas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-3.5 w-full min-w-0">
                {schools.map(s => (
                  <Link href="/schools" key={s.id} className="block group w-full min-w-0">
                    {/* Cambiado a items-start para que si la descripción crece, el logo y las categorías no se desalineen */}
                    <div className="flex items-start gap-3 p-3.5 sm:p-4 bg-secondary/30 rounded-2xl sm:rounded-xl border border-border/60 hover:border-primary/50 hover:bg-secondary/60 shadow-sm transition-all duration-200 w-full min-w-0">

                      {/* Logo de la escuela */}
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-card border border-border/80 flex items-center justify-center text-muted-foreground shrink-0 shadow-sm group-hover:scale-105 transition-transform overflow-hidden mt-0.5">
                        {s.logo_url ? (
                          <img src={s.logo_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Users size={22} className="shrink-0" />
                        )}
                      </div>

                      {/* Información central (Nombre y Descripción con límite de líneas) */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-extrabold capitalize text-sm sm:text-base text-foreground truncate group-hover:text-primary transition-colors">
                          {s.name}
                        </h4>

                        {/* Usamos line-clamp-2 para que soporte texto largo pero corte con puntos suspensivos a las 2 líneas */}
                        <p className="text-[11px] sm:text-xs font-medium text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                          {s.description || s.categories || 'Formación deportiva'}
                        </p>
                      </div>

                      {/* Insignia de Categorías a la derecha */}
                      <div className="flex flex-col items-end justify-center bg-emerald-100/50 border border-emerald-200/60 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl shrink-0 text-right shadow-xs group-hover:bg-emerald-100 transition-colors">
                        <p className="text-[9px] sm:text-[10px] font-bold text-emerald-800/80 uppercase tracking-wider">Categorias</p>
                        <p className="text-xs sm:text-sm font-black text-emerald-700 tracking-tight mt-0.5 whitespace-nowrap">
                          {s.categories || 'General'}
                        </p>
                      </div>

                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Módulo lateral de Disponibilidad y Reserva */}
        <aside className="order-1 md:order-2 w-full md:w-[45%] lg:w-[35%]">
          <div className="bg-card p-4 sm:p-6 rounded-[28px] md:rounded-2xl border-2 border-primary/15 md:border md:border-border shadow-xl md:shadow-2xl shadow-primary/10 md:shadow-black/10 space-y-4 sm:space-y-5 md:sticky md:top-24">
            <p className="eyebrow accent-label text-[11px] sm:text-xs font-bold text-primary uppercase tracking-wider">DISPONIBILIDAD</p>
            <div className="space-y-2 p-4 rounded-2xl bg-card border border-border shadow-xs w-full max-w-full min-w-0">

              {/* Encabezado y subtítulo de la sección */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 w-full min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-foreground tracking-tight">Consultar horarios</h2>
                <span className="text-xs text-muted-foreground font-medium">
                  Selecciona una fecha en el calendario
                </span>
              </div>

              {/* Tarjeta compacta que unifica el Complejo y la Cancha elegantemente */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-secondary/50 border border-border/60 w-full min-w-0">
                <div className="w-2 h-2 rounded-full bg-primary shrink-0 animate-pulse" />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0 flex-1">
                  <span className="text-xs sm:text-sm font-black text-foreground truncate max-w-full">
                    {complexInfo?.name}
                  </span>
                  {complexInfo?.name && complexInfo.name !== currentPitch.name && (
                    <>
                      <span className="text-muted-foreground font-light text-xs shrink-0"></span>
                      <span className="text-xs sm:text-sm font-semibold text-primary truncate max-w-full">
                        {currentPitch.name}
                      </span>
                    </>
                  )}
                </div>
              </div>

            </div>

            {/* Selector de fecha con Calendario Custom */}
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between mb-3 gap-2">
                <span className="flex items-center gap-1 shrink-0"><CalendarDays size={12} /> Fecha</span>
                {selectedDate && (
                  <span className="text-primary font-bold text-xs sm:text-sm capitalize text-right truncate">
                    {formattedDate}
                  </span>
                )}
              </label>

              {!showCalendar ? (
                <button
                  type="button"
                  onClick={() => setShowCalendar(true)}
                  className="w-full py-2.5 sm:py-3 bg-secondary/50 hover:bg-secondary text-foreground font-bold rounded-xl border border-border transition-colors flex items-center justify-center gap-2 text-sm"
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

            <div className="flex items-center gap-2.5 sm:gap-3 text-[9px] sm:text-[10px] text-muted-foreground mt-4 uppercase font-bold tracking-wider flex-wrap">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-primary/20 border border-primary/40 inline-block" /> Libre</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300 inline-block" /> Res.</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-100 border border-red-300 inline-block" /> Ocup.</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2 gap-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Clock3 size={12} /> Hora(s) disponibles
                </label>
                {selectedTimes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedTimes([])}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline shrink-0"
                  >
                    Limpiar
                  </button>
                )}
              </div>

              {selectedTimes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {[...selectedTimes].sort().map(s => (
                    <span key={s} className="inline-flex items-center gap-1 bg-primary text-white text-[10px] sm:text-[11px] font-bold px-2 sm:px-2.5 py-1 rounded-full">
                      ⏰ {fmtSlot(s)} (${getSlotPrice(s).toLocaleString('es-CO')})
                      <button type="button" onClick={() => toggleTime(s)} className="opacity-70 hover:opacity-100 ml-1">✕</button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex bg-secondary p-1.5 sm:p-1 rounded-2xl sm:rounded-xl border border-border gap-1">
                {([
                  { key: 'manana', title: 'Mañana' },
                  { key: 'tarde', title: 'Tarde' },
                  { key: 'noche', title: 'Noche' }
                ] as const).map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setActiveTimeCategory(cat.key)}
                    className={`flex-1 py-2 sm:py-1.5 text-[11px] sm:text-xs font-bold rounded-xl sm:rounded-lg transition-all ${activeTimeCategory === cat.key ? 'bg-card text-primary shadow-xs' : 'text-muted-foreground'}`}
                  >
                    {cat.title}
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-border bg-background p-2.5 sm:p-3 min-h-[130px] sm:min-h-[140px] flex items-center justify-center relative">
                {loadingSlots && takenSlots.size === 0 && (
                  <div className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center">
                    <Loader2 size={12} className="animate-spin text-muted-foreground/50" />
                  </div>
                )}
                {(() => {
                  const allowedTimeSlots: string[] = Array.from(new Set<string>((pitchAny.custom_pricing?.time_slots as string[]) || DEFAULT_TIME_SLOTS));

                  const currentCatSlots = allowedTimeSlots.filter(slot => {
                    const h = parseInt(slot.split(':')[0]);
                    if (activeTimeCategory === 'manana') return h >= 0 && h < 12;
                    if (activeTimeCategory === 'tarde') return h >= 12 && h < 18;
                    if (activeTimeCategory === 'noche') return h >= 18 && h <= 23;
                    return false;
                  });

                  if (currentCatSlots.length === 0) {
                    return (
                      <div className="text-center p-4">
                        <p className="text-xs text-muted-foreground">No hay horas de operación en este bloque.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2 w-full">
                      {currentCatSlots.map((slot) => {
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

                        let btnClass = 'bg-card hover:bg-primary/10 border-border text-foreground';
                        if (isSel) {
                          btnClass = 'bg-primary text-white border-primary shadow-md';
                        } else if (isTaken) {
                          if (isDraft) {
                            btnClass = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/40 ring-1 ring-amber-500/20 cursor-not-allowed';
                          } else {
                            btnClass = 'bg-red-500/10 text-red-400 border-red-500/20 cursor-not-allowed opacity-60';
                          }
                        }

                        return (
                          <button
                            key={`${activeTimeCategory}-${slot}`}
                            disabled={isTaken}
                            type="button"
                            onClick={() => {
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
                            }}
                            className={`p-2 sm:p-2 rounded-2xl sm:rounded-xl border text-center transition-all select-none font-bold text-[11px] sm:text-xs relative overflow-hidden ${btnClass}`}
                          >
                            <span className="block leading-tight">{h12}:00</span>
                            <span className="text-[9px] uppercase opacity-75">{ampm}</span>
                            {!isTaken && (
                              <span className={`text-[9px] block mt-0.5 ${isSel ? 'text-white/90' : 'text-primary'}`}>
                                ${slotPrice.toLocaleString('es-CO')}
                              </span>
                            )}

                            {/* Overlay de estado de reserva con cronómetro */}
                            {isTaken && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/90 dark:bg-card/95 backdrop-blur-[1px] rounded-xl p-1 text-center">
                                {isDraft ? (
                                  <div className="flex flex-col items-center justify-center gap-0.5 text-amber-600 dark:text-amber-400">
                                    <span className="text-[8px] font-black uppercase tracking-wider flex items-center gap-1">
                                      <Clock3 size={10} className="animate-spin text-amber-500" /> Reservando
                                    </span>
                                    <span className="text-[10px] font-mono font-black tracking-tight bg-amber-500/15 px-1.5 py-0.5 rounded">
                                      <Timer initialSeconds={secondsLeft} />
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-[10px] font-black tracking-widest text-red-500 -rotate-6">
                                    OCUPADO
                                  </span>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()
                }
              </div>
            </div>

            {/* Desglose dinámico de precios seleccionados */}
            {selectedTimes.length > 0 && (
              <div className="space-y-2 p-2.5 sm:p-3 bg-secondary/50 rounded-xl border border-border">
                <p className="text-xs font-bold text-foreground">Desglose de selección:</p>
                {selectedTimes.map(slot => (
                  <div key={slot} className="flex justify-between text-xs text-muted-foreground">
                    <span>{fmtSlot(slot)} </span>
                    <span className="font-semibold text-foreground">${getSlotPrice(slot).toLocaleString('es-CO')}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-border flex justify-between text-xs font-bold text-foreground">
                  <span>Total estimado:</span>
                  <span className="text-primary">${totalPrice.toLocaleString('es-CO')}</span>
                </div>
              </div>
            )}

            <button
              type="button"
              className="w-full py-4 sm:py-3.5 rounded-2xl sm:rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/25 sm:shadow-md"
              onClick={async () => {
                if (selectedTimes.length === 0) return;

                if (!user) {
                  setAlertState({
                    isOpen: true,
                    type: 'login_required',
                    title: 'Inicia sesión para reservar',
                    message: 'Debes iniciar sesión o crear una cuenta para poder reservar esta cancha.',
                  });
                  return;
                }

                if (activeBooking) {
                  setAlertState({
                    isOpen: true,
                    type: 'warning',
                    title: 'Reserva en proceso',
                    message: 'Tienes una reserva pendiente de pago o confirmación.\n\nPara iniciar una nueva reserva, primero debes completar o cancelar la actual.',
                    showCancel: true,

                    // Botón Izquierdo: Ir a la reserva (Principal)
                    confirmText: 'Ir a mi reserva',
                    confirmButtonClassName: 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl flex-1 shadow-sm transition-colors text-center text-sm cursor-pointer',

                    // Botón Derecho: Cerrar (Rojo)
                    cancelText: 'Cerrar',
                    cancelButtonClassName: 'bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2.5 rounded-xl flex-1 shadow-sm transition-colors text-center text-sm cursor-pointer',

                    onConfirm: () => {
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('resume-active-booking', { detail: activeBooking }));
                      }
                    }
                  });
                  return;
                }

                const formattedDate = selectedDate ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }) : '';

                const fmtSlotLocal = (slot: string) => {
                  const [h] = slot.split(':');
                  const d = new Date();
                  d.setHours(parseInt(h, 10));
                  return d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }).toLowerCase();
                };

                let abonoPrice = 0;
                if (pitchAny.custom_pricing?.booking_type === 'fixed') {
                  abonoPrice = (pitchAny.custom_pricing.booking_fixed || 0) * selectedTimes.length;
                } else {
                  abonoPrice = (totalPrice * Number(pitchAny.booking_percentage || 50)) / 100;
                }

                const messageNode = (
                  <div className="flex flex-col gap-2.5 items-center text-center mt-2">
                    <p className="text-sm text-muted-foreground">Estás a punto de iniciar una reserva en:</p>
                    <div className="w-full py-3 px-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex flex-col items-center justify-center gap-1">
                      {/* Nombre del Complejo (Ahora es el elemento más grande y protagonista) */}
                      {((pitch as any).companies?.name || (pitch as any).company?.name) && (
                        <span className="text-base sm:text-lg font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300 text-center truncate max-w-full">
                          {((pitch as any).companies?.name || (pitch as any).company?.name)}
                        </span>
                      )}

                      {/* Nombre de la Cancha (Ahora actúa como un subtítulo secundario más pequeño) */}
                      <div className="flex items-center justify-center gap-2 max-w-full">
                        <span className="text-xs sm:text-sm font-bold uppercase text-muted-foreground tracking-wider truncate">
                          {pitch.name}
                        </span>
                      </div>
                    </div>
                    <div className="bg-secondary/60 border border-border rounded-xl p-3.5 w-full space-y-2 mt-1">
                      <p className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground font-bold flex items-center gap-1"><Calendar size={13} /> Fecha</span>
                        <span className="font-bold text-foreground capitalize">{formattedDate}</span>
                      </p>
                      <div className="summary-line flex-col items-start gap-1.5">
                        <span>Desglose de Horas</span>
                        <div className="w-full space-y-1 mt-1">
                          {[...selectedTimes].sort().map(t => {
                            const slotPrice = Number(pitchAny.custom_pricing?.[t] || currentPitch.price_per_hour);
                            return (
                              <div key={t} className="flex justify-between text-xs bg-primary/5 px-2 py-1 rounded-md">
                                <span className="font-bold text-primary">{fmtSlotLocal(t)}</span>
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
                        {pitchAny.custom_pricing?.booking_type === 'fixed' ? (
                          <p className="text-[11px] text-muted-foreground text-center mt-2">
                            Abono fijo de <strong>${Number(pitchAny.custom_pricing.booking_fixed || 0).toLocaleString('es-CO')}</strong> por hora para confirmar
                          </p>
                        ) : (pitchAny.booking_percentage || 50) ? (
                          <p className="text-[11px] text-muted-foreground text-center mt-2">
                            Abono del <strong>{pitchAny.booking_percentage || 50}%</strong> del valor total para confirmar
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
                    const ok = await startLock(currentPitch, selectedDate, selectedTimes);
                    if (ok) {
                      onBook(selectedTimes, selectedDate, currentPitch);
                    } else {
                      fetchTakenSlots();
                      setAlertState({
                        isOpen: true,
                        type: 'error',
                        title: 'Horario no disponible',
                        message: lockError || 'Una de las horas seleccionadas está siendo reservada por otra persona en este momento. Por favor elige otro horario.',
                      });
                    }
                  }
                });
              }}
              disabled={selectedTimes.length === 0 || lockLoading}
            >
              {lockLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Bloqueando horario...
                </span>
              ) : selectedTimes.length > 0 ? (
                <>
                  {pitchAny.custom_pricing?.booking_type === 'fixed' ? (
                    <span>
                      {`Reservar ${selectedTimes.length}h ($${Number((pitchAny.custom_pricing.booking_fixed || 0) * selectedTimes.length).toLocaleString('es-CO')})`}
                    </span>
                  ) : pitchAny.booking_percentage ? (
                    <span>
                      {`Reservar ${selectedTimes.length}h ($${Number((pitchAny.booking_percentage * totalPrice) / 100 || 0).toLocaleString('es-CO')})`}
                    </span>
                  ) : (
                    <span>{`Reservar ${selectedTimes.length}h`}</span>
                  )}
                  <ArrowRight size={16} className="ml-2 inline" />
                </>
              ) : (
                <span className="flex items-center gap-2">
                  Elige una hora para reservar
                  <ArrowRight size={16} />
                </span>
              )}

            </button>

            {/* <div className="pt-3 border-t border-border flex justify-between items-center text-xs">
              <span className="text-muted-foreground font-medium">Total Estimado</span>
              <span className="font-extrabold text-primary text-base">
                <span className="text-primary">${totalPrice.toLocaleString('es-CO')}</span>

              </span>
            </div> */}

            {pitchAny.custom_pricing?.booking_type === 'fixed' ? (
              <p className="text-[11px] text-muted-foreground text-center mt-2">
                Abono fijo de <strong>${Number(pitchAny.custom_pricing.booking_fixed || 0).toLocaleString('es-CO')}</strong> por hora para confirmar
              </p>
            ) : pitchAny.booking_percentage ? (
              <p className="text-[11px] text-muted-foreground text-center mt-2">
                Abono del <strong>{pitchAny.booking_percentage}%</strong> del valor total para confirmar
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      {/* Sección de Reseñas (Final de la página) */}
      <div className="bg-card px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-8 rounded-[28px] md:rounded-2xl border border-border shadow-sm shadow-black/[0.03] md:shadow-sm mt-6 mb-8">
        <div className="flex items-center justify-between mb-5 sm:mb-6 gap-2">
          <h2 className="text-lg sm:text-2xl font-bold text-foreground">Reseñas ({reviews.length})</h2>
          {reviews.length > 3 && (
            <button
              onClick={() => setShowAllReviewsModal(true)}
              className="text-xs sm:text-sm font-bold text-primary hover:underline shrink-0"
            >
              Ver todas las reseñas
            </button>
          )}
        </div>

        {user ? (
          <form onSubmit={submitReview} className="mb-6 sm:mb-8 bg-secondary/30 p-3.5 sm:p-4 rounded-xl border border-border">
            <h3 className="text-sm font-bold mb-3">Deja tu opinión</h3>
            <div className="flex items-center gap-2 mb-3">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setReviewRating(star)}
                  className={`text-2xl ${reviewRating >= star ? 'text-amber-500' : 'text-muted-foreground opacity-30'}`}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="¿Qué tal te pareció esta cancha?"
              className="w-full bg-background border border-border rounded-xl p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none min-h-[80px]"
              required
            />
            <button
              type="submit"
              disabled={submittingReview || !reviewText.trim()}
              className="mt-3 btn-primary text-xs py-2 px-4 rounded-lg"
            >
              {submittingReview ? 'Enviando...' : 'Publicar reseña'}
            </button>
          </form>
        ) : (
          <div className="mb-8 p-4 bg-secondary/50 rounded-xl text-center border border-border">
            <p className="text-sm text-muted-foreground">Debes iniciar sesión para dejar una reseña.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {loadingReviews ? (
            <div className="flex justify-center p-4 col-span-full"><Loader2 className="animate-spin text-primary" /></div>
          ) : reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center p-4 col-span-full">Aún no hay reseñas. ¡Sé el primero en opinar!</p>
          ) : (
            reviews.slice(0, 4).map(review => (
              <div key={review.id} className="p-3.5 sm:p-4 border border-border rounded-2xl sm:rounded-xl bg-background shadow-sm hover:border-primary/40 transition-colors">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                      {review.profiles?.avatar_url ? (
                        <img src={review.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-primary font-bold text-sm">
                          {review.profiles?.full_name?.substring(0, 2).toUpperCase() || 'U'}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <Link href={`/profile/${review.user_id}`} className="font-bold text-sm text-foreground hover:text-primary transition-colors truncate block">
                        {review.profiles?.full_name || 'Usuario'}
                      </Link>
                      <div className="flex items-center gap-1">
                        <span className="text-amber-500 text-xs">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(review.created_at).toLocaleDateString('es-CO')}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-3 line-clamp-3">{review.comment}</p>
              </div>
            ))
          )}
        </div>

        {reviews.length > 4 && (
          <div className="mt-6 text-center">
            <button
              onClick={() => setShowAllReviewsModal(true)}
              className="px-6 py-2.5 rounded-xl border border-primary text-primary font-bold text-sm hover:bg-primary hover:text-white transition-all"
            >
              Ver las {reviews.length} reseñas
            </button>
          </div>
        )}
      </div>

      {/* Modal de Todas las Reseñas */}
      {showAllReviewsModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-card w-full max-w-2xl max-h-[85vh] sm:max-h-[80vh] flex flex-col rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95">
            <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-secondary/30">
              <h2 className="text-base sm:text-lg font-bold">Todas las reseñas ({reviews.length})</h2>
              <button
                onClick={() => setShowAllReviewsModal(false)}
                className="p-2 bg-background hover:bg-secondary rounded-full transition-colors text-muted-foreground shrink-0"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3 sm:space-y-4">
              {reviews.map(review => (
                <div key={review.id} className="p-3.5 sm:p-4 border border-border rounded-xl bg-background">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                        {review.profiles?.avatar_url ? (
                          <img src={review.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-primary font-bold text-sm">
                            {review.profiles?.full_name?.substring(0, 2).toUpperCase() || 'U'}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <Link href={`/profile/${review.user_id}`} onClick={() => setShowAllReviewsModal(false)} className="font-bold text-sm text-foreground hover:text-primary transition-colors truncate block">
                          {review.profiles?.full_name || 'Usuario'}
                        </Link>
                        <div className="flex items-center gap-1">
                          <span className="text-amber-500 text-xs">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(review.created_at).toLocaleDateString('es-CO')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-3">{review.comment}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Galería Pantalla Completa */}
      {showGalleryModal && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-200">
          <div className="p-3 sm:p-4 flex items-center justify-between shrink-0">
            <div className="text-white font-bold text-xs sm:text-sm">
              {activeMediaIndex + 1} / {(pitchAny.media_urls?.length || 1)}
            </div>
            <button
              type="button"
              onClick={() => setShowGalleryModal(false)}
              className="p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            >
              <X size={22} className="sm:w-6 sm:h-6" />
            </button>
          </div>
          <div className="flex-1 relative flex items-center justify-center p-2 sm:p-4 min-h-0">
            {(() => {
              const mediaUrls = Array.isArray(pitchAny.media_urls) && pitchAny.media_urls.length > 0
                ? pitchAny.media_urls
                : pitchAny.image_url ? [pitchAny.image_url] : [];

              return (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveMediaIndex(prev => Math.max(0, prev - 1))}
                    disabled={activeMediaIndex === 0}
                    className="absolute left-1.5 sm:left-4 p-2.5 sm:p-4 text-white bg-black/50 hover:bg-black/80 rounded-full disabled:opacity-30 transition-all z-10"
                  >
                    <ChevronLeft size={22} className="sm:w-8 sm:h-8" />
                  </button>

                  {getYoutubeId(mediaUrls[activeMediaIndex]) ? (
                    <iframe src={`https://www.youtube.com/embed/${getYoutubeId(mediaUrls[activeMediaIndex])}`} className="max-h-[80vh] sm:max-h-[85vh] w-full max-w-4xl object-contain shadow-2xl" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                  ) : (
                    <img
                      src={mediaUrls[activeMediaIndex]}
                      alt={`Foto ${activeMediaIndex + 1}`}
                      className="max-h-[80vh] sm:max-h-[85vh] max-w-full object-contain"
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => setActiveMediaIndex(prev => Math.min(mediaUrls.length - 1, prev + 1))}
                    disabled={activeMediaIndex === mediaUrls.length - 1}
                    className="absolute right-1.5 sm:right-4 p-2.5 sm:p-4 text-white bg-black/50 hover:bg-black/80 rounded-full disabled:opacity-30 transition-all z-10"
                  >
                    <ChevronRight size={22} className="sm:w-8 sm:h-8" />
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </section>
  );
}