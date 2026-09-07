'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowRight, Clock3, Heart, MapPin, ShieldCheck, CalendarDays, CheckCircle, Loader2, Grid, X, ChevronLeft, ChevronRight, Trophy, CheckCircle2, Phone } from 'lucide-react';
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
  onBook: (selectedTimes: string[], date: string) => void;
  initialDate?: string;
  initialTimes?: string[];
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

export function PitchDetail({ pitch, onBack, onBook, initialDate, initialTimes }: PitchDetailProps) {
  const today = useToday();
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [tournaments, setTournaments] = useState<any[]>([]);

  const [alertState, setAlertState] = useState<AlertModalState>({
    isOpen: false,
    type: 'warning',
    title: '',
    message: ''
  });

  // Auth & Favorites & ActiveBooking hooks
  const { user, profile } = useAuth();
  const { isFavorite: checkFav, toggleFavorite: doToggleFav } = useFavorites();
  const isFavorite = checkFav(pitch.id);
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
    if (today && !selectedDate && !initialDate) {
      setSelectedDate(today);
    }
  }, [today, selectedDate, initialDate]);

  // Lógica de Precios Variables por Hora
  const pitchAny = pitch as any;
  const customPricing = pitchAny.custom_pricing || {};
  const basePrice = Number(pitchAny.price_per_hour || 0);

  const getSlotPrice = (slot: string) => {
    return customPricing[slot] || basePrice;
  };

  const totalPrice = selectedTimes.reduce((sum, slot) => sum + getSlotPrice(slot), 0);

  useEffect(() => {
    if (!pitch.id) return;
    fetch(`/api/tournaments?pitch_id=${pitch.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setTournaments(data.data || []);
        }
      })
      .catch(err => console.error("Error fetching tournaments", err));
  }, [pitch.id]);

  // Función para obtener los slots ocupados (llamada por useEffect y por botón de reserva)
  const fetchTakenSlots = useCallback(async () => {
    if (!selectedDate || !pitch.id) return;
    setLoadingSlots(true);
    const dayStart = `${selectedDate}T00:00:00-05:00`;
    const dayEnd = `${selectedDate}T23:59:59-05:00`;

    const { data, error } = await supabase
      .from('bookings')
      .select('start_time, status, expires_at')
      .eq('pitch_id', pitch.id)
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
    setLoadingSlots(false);
  }, [selectedDate, pitch.id, supabase]);

  // Cargar slots ocupados cuando cambia la fecha y escuchar en tiempo real
  useEffect(() => {
    if (!selectedDate || !pitch.id) return;
    if (!initialTimes || initialTimes.length === 0) {
      setSelectedTimes([]);
    }

    fetchTakenSlots();

    // Polling continuo cada 3.5s para garantizar actualización de cronómetros sin depender solo de websockets
    const pollInterval = setInterval(fetchTakenSlots, 3500);

    const channel = supabase
      .channel(`public:bookings:pitch_id=eq.${pitch.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `pitch_id=eq.${pitch.id}` },
        () => {
          fetchTakenSlots();
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [selectedDate, pitch.id, fetchTakenSlots, supabase, initialTimes]);

  // Load reviews
  useEffect(() => {
    if (!pitch.id) return;

    const fetchExtras = async () => {
      try {
        const { data: revData, error: revError } = await supabase
          .from('pitch_reviews')
          .select(`
            id, rating, comment, created_at, user_id,
            profiles (full_name, avatar_url)
          `)
          .eq('pitch_id', pitch.id)
          .order('created_at', { ascending: false });

        if (!revError && revData) setReviews(revData);
      } catch (e) {
        // Ignorar si la tabla aún no existe
      } finally {
        setLoadingReviews(false);
      }
    };

    fetchExtras();
  }, [pitch.id, supabase]);

  const toggleFavorite = async () => {
    if (!user) {
      setAlertState({
        isOpen: true,
        type: 'login_required',
        title: 'Inicia sesión',
        message: 'Debes iniciar sesión o crear una cuenta para guardar canchas en favoritos.'
      });
      return;
    }
    setLoadingFavorite(true);
    try {
      await doToggleFav(pitch.id);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingFavorite(false);
    }
  };
  // ... dentro de tu componente principal:
  const [copied, setCopied] = useState(false);

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

      <div className="detail-header flex justify-between items-start mb-6">
        <div>
          <p className="eyebrow accent-label text-xs font-bold text-primary uppercase">PERFIL DE LA CANCHA</p>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground">{pitch.name}</h1>
          <p className="lead flex items-center gap-2 text-sm text-muted-foreground mt-1">
            <span className="rating text-amber-500 font-bold flex items-center gap-1">
              <span>★</span> {pitchAny.rating || '4.8'} ({reviews.length > 0 ? reviews.length : (pitchAny.reviews || 0)} reseñas)
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={toggleFavorite}
          disabled={loadingFavorite}
          className={`p-3 rounded-full border shadow-sm transition-all duration-300 hover:scale-110 active:scale-90 disabled:opacity-50 ${isFavorite
            ? 'bg-green-50 border-green-200 text-green-500 shadow-md shadow-green-100/50 scale-105'
            : 'bg-background border-border text-muted-foreground hover:text-green-500 hover:bg-green-50/30 hover:border-green-100'
            }`}
          aria-label={isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
        >
          <Heart
            size={24}
            className={`transition-all duration-300 transform ${isFavorite
              ? "fill-current scale-110 animate-[bounce_0.4s_ease-in-out_1]"
              : "scale-100"
              }`}
            strokeWidth={isFavorite ? 2 : 2.5}
          />
        </button>

      </div>

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
          <div className="relative mb-10 rounded-2xl overflow-hidden group border border-border">
            <div className={`grid gap-2 h-[300px] ${gridClasses}`}>
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

            <button
              type="button"
              onClick={() => { setActiveMediaIndex(0); setShowGalleryModal(true); }}
              className="absolute bottom-4 right-4 bg-white/95 dark:bg-zinc-900/95 text-foreground px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg border border-border/50 hover:scale-105 active:scale-95 transition-transform"
            >
              <Grid size={16} /> Mostrar todas las fotos
            </button>
          </div>
        );
      })()}

      <div className="flex flex-col md:flex-row gap-10">
        <div className="flex-1 w-full max-w-full md:max-w-[55%] lg:max-w-[65%] space-y-10">
          <div className="bg-card px-6 py-6 md:px-8 md:py-8 rounded-2xl border border-border shadow-sm">
            <h2 className="text-xl font-bold mb-4 text-foreground">Sobre esta cancha</h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              {pitchAny.description || 'Cancha de alto rendimiento perfecta para partidos entre amigos, entrenamientos y torneos locales. Espacio cuidado, iluminado y listo para jugar.'}
            </p>
            <div className="flex flex-wrap gap-3 mt-5">
              {amenitiesList.slice(0, 4).map((a: string, i: number) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-2 text-xs font-bold bg-emerald-50 text-emerald-800 px-3.5 py-1.5 rounded-lg border border-emerald-200 shadow-sm transition-all"
                >
                  <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                  {a}
                </span>
              ))}

              {amenitiesList.length > 4 && (
                <span className="inline-flex items-center text-xs text-emerald-800 font-extrabold px-2 py-1.5 bg-emerald-100/60 rounded-lg border border-emerald-200/40">
                  +{amenitiesList.length - 4} más
                </span>
              )}
            </div>



          </div>

          <div className="bg-card px-4 py-5 sm:p-6 md:p-8 rounded-2xl border border-border shadow-sm">
            <h2 className="text-lg sm:text-xl font-black mb-4 text-foreground">
              Detalles Técnicos
            </h2>

            {/* GRID DE DETALLES: Cambiado a 1 columna en celulares muy mini para que nada se corte, y 3 en PC */}
            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
              {[
                ['Tipo', pitch.type || 'Fútbol 5'],
                ['Superficie', pitch.surface || 'Sintética'],
                ['Precio desde', `$${basePrice.toLocaleString('es-CO')}/hr`],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="p-3.5 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-xl border border-emerald-500/10 dark:border-emerald-500/20 shadow-xs flex flex-col items-center justify-center text-center transition-all hover:scale-[1.02] duration-200"
                >
                  {/* Agregado el título del detalle para dar contexto (Tipo, Superficie, etc.) */}
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">
                    {k}
                  </p>
                  <p className="font-black text-sm text-emerald-700 dark:text-emerald-400 leading-tight">
                    {v}
                  </p>
                </div>
              ))}
            </div>

            {/* CONTENEDOR DEL TELÉFONO */}
            {pitchAny.contact_phone && (
              <div className="mt-4 flex flex-col xs:flex-row xs:items-center justify-between gap-3 p-3.5 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/15 dark:border-emerald-500/20 rounded-2xl group relative">

                {/* Zona de enlace para LLAMAR directamente al tocar la caja */}
                <a
                  href={`tel:${pitchAny.contact_phone.replace(/\s/g, '')}`}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  {/* Icono de Teléfono */}
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                    <Phone size={18} className="text-emerald-600 dark:text-emerald-400" />
                  </div>

                  {/* Textos Informativos */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400/80 uppercase tracking-wider">
                      Teléfono de contacto
                    </p>

                    {/* CONTENEDOR HORIZONTAL: Alinea el número y el botón de copiar lado a lado */}
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <p className="font-extrabold text-base text-foreground tracking-wider break-words leading-tight">
                        {pitchAny.contact_phone}
                      </p>

                      {/* Botón interactivo de COPIAR puesto al lado del número */}
                      <button
                        type="button"
                        onClick={(e) => handleCopy(e, pitchAny.contact_phone)}
                        className={`flex items-center justify-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all border ${copied
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-background hover:bg-muted text-muted-foreground border-border active:scale-95'
                          }`}
                        title="Copiar número"
                      >
                        {copied ? (
                          <>
                            <Check size={11} />
                            <span>¡Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={11} />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </a>

                {/* Texto discreto indicador de "Llamar" a la derecha en pantallas medianas */}
                <span className="hidden xs:inline text-xs font-bold text-emerald-600 dark:text-emerald-400 group-hover:underline pointer-events-none pr-1">
                  Llamar
                </span>

              </div>

            )}
          </div>

          <div className="bg-card px-6 py-6 md:px-8 md:py-8 rounded-2xl ">
            <h2 className="text-xl font-bold mb-4 text-foreground">Ubicación</h2>
            {pitchAny.lat && pitchAny.lng ? (
              <div className="rounded-xl overflow-hidden border border-border">
                <iframe
                  width="100%"
                  height="220"
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
            <div className="bg-card px-6 py-6 md:px-8 md:py-8 rounded-2xl border border-border shadow-sm mt-6">
              <h2 className="text-xl font-bold mb-5 flex items-center gap-2 text-foreground">
                <Trophy size={22} className="text-emerald-600" /> Campeonatos en esta cancha
              </h2>
              <div className="grid gap-3.5">
                {tournaments.map(t => (
                  <Link href="/tournaments" key={t.id} className="block group">
                    <div className="flex items-center gap-4 p-4 bg-emerald-50/30 rounded-xl border border-border/60 hover:border-emerald-500/50 hover:bg-emerald-50/60 shadow-sm transition-all duration-200">
                      {/* Contenedor de Imagen o Icono */}
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                        {t.media_urls?.[0] ? (
                          <img src={t.media_urls[0]} alt="" className="w-full h-full object-cover rounded-xl" />
                        ) : (
                          <Trophy size={24} />
                        )}
                      </div>

                      {/* Información del Torneo */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-extrabold text-base text-foreground truncate group-hover:text-emerald-700 transition-colors">
                          {t.name}
                        </h4>
                        <p className="text-xs font-medium text-muted-foreground mt-0.5 truncate">
                          Inicia: {new Date(t.start_date + 'T12:00:00').toLocaleDateString('es-CO')}
                        </p>
                      </div>

                      {/* Premio Mayor Destacado */}
                      {(t.prize || (t.prize_value && t.prize_value > 0)) && (
                        <div className="hidden sm:flex flex-col items-end justify-center bg-emerald-100/50 border border-emerald-200/60 px-3.5 py-2 rounded-xl flex-shrink-0 text-right shadow-sm group-hover:bg-emerald-100 transition-colors">
                          <p className="text-[10px] font-bold text-emerald-800/80 uppercase tracking-wider">Premio mayor</p>
                          <p className="text-sm font-black text-emerald-700 tracking-tight mt-0.5">
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

        </div>

        {/* Módulo lateral de Disponibilidad y Reserva */}
        <aside className="w-full md:w-[45%] lg:w-[35%]">
          <div className="bg-card p-6 rounded-2xl border border-border shadow-2xl space-y-5 sticky top-24">
            <p className="eyebrow accent-label text-xs font-bold text-primary uppercase">DISPONIBILIDAD</p>
            <h2 className="text-lg font-bold">Consultar horarios</h2>
            <p className="text-xs text-muted-foreground">
              Selecciona una fecha en el calendario para ver los horarios disponibles en tiempo real.
            </p>

            {/* Selector de fecha con Calendario Custom */}
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

            <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-4 uppercase font-bold tracking-wider">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-primary/20 border border-primary/40 inline-block" /> Libre</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300 inline-block" /> Res.</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-100 border border-red-300 inline-block" /> Ocup.</span>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Clock3 size={12} /> Horas disponibles · {formattedDate}
              </p>

              <div className="flex bg-secondary p-1 rounded-xl border border-border gap-1">
                {([
                  { key: 'manana', title: 'Mañana' },
                  { key: 'tarde', title: 'Tarde' },
                  { key: 'noche', title: 'Noche' }
                ] as const).map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setActiveTimeCategory(cat.key)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTimeCategory === cat.key ? 'bg-card text-primary shadow-xs' : 'text-muted-foreground'}`}
                  >
                    {cat.title}
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-border bg-background p-3 min-h-[140px] flex items-center justify-center relative">
                {loadingSlots && (
                  <div className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center">
                    <Loader2 size={12} className="animate-spin text-muted-foreground/50" />
                  </div>
                )}
                {(() => {
                  const allowedTimeSlots = (pitchAny.custom_pricing?.time_slots as string[]) || DEFAULT_TIME_SLOTS;

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
                    <div className="grid grid-cols-3 gap-2 w-full">
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
                            key={slot}
                            disabled={isTaken}
                            type="button"
                            onClick={() => {
                              setSelectedTimes(prev =>
                                prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot].sort()
                              );
                            }}
                            className={`p-2 rounded-xl border text-center transition-all select-none font-bold text-xs relative overflow-hidden ${btnClass}`}
                          >
                            <span className="block leading-tight">{h12}:00</span>
                            <span className="text-[9px] uppercase opacity-75">{ampm}</span>
                            {!isTaken && (
                              <span className={`text-[9px] block mt-0.5 ${isSel ? 'text-white/90' : 'text-primary'}`}>
                                ${slotPrice.toLocaleString()}
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
              <div className="space-y-2 p-3 bg-secondary/50 rounded-xl border border-border">
                <p className="text-xs font-bold text-foreground">Desglose de selección:</p>
                {selectedTimes.map(slot => (
                  <div key={slot} className="flex justify-between text-xs text-muted-foreground">
                    <span>{slot} hs</span>
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
              className="w-full py-3.5 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
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
                    confirmText: 'Ir a mi reserva',
                    cancelText: 'Cerrar',
                    onConfirm: () => {
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('resume-active-booking', { detail: activeBooking }));
                      }
                    }
                  });
                  return;
                }

                const ok = await startLock(pitch, selectedDate, selectedTimes);
                if (ok) {
                  onBook(selectedTimes, selectedDate);
                } else {
                  fetchTakenSlots();
                  alert(lockError || 'Una de las horas seleccionadas está siendo reservada por otra persona en este momento.');
                }
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

            <div className="pt-3 border-t border-border flex justify-between items-center text-xs">
              <span className="text-muted-foreground font-medium">Total Estimado</span>
              <span className="font-extrabold text-primary text-base">
                <span className="text-primary">${totalPrice.toLocaleString('es-CO')}</span>

              </span>
            </div>

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
      <div className="bg-card px-6 py-6 md:px-8 md:py-8 rounded-2xl border border-border shadow-sm mt-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-foreground">Reseñas ({reviews.length})</h2>
          {reviews.length > 3 && (
            <button
              onClick={() => setShowAllReviewsModal(true)}
              className="text-sm font-bold text-primary hover:underline"
            >
              Ver todas las reseñas
            </button>
          )}
        </div>

        {user ? (
          <form onSubmit={submitReview} className="mb-8 bg-secondary/30 p-4 rounded-xl border border-border">
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
              <div key={review.id} className="p-4 border border-border rounded-xl bg-background shadow-sm hover:border-primary/40 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
                      {review.profiles?.avatar_url ? (
                        <img src={review.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-primary font-bold text-sm">
                          {review.profiles?.full_name?.substring(0, 2).toUpperCase() || 'U'}
                        </span>
                      )}
                    </div>
                    <div>
                      <Link href={`/profile/${review.user_id}`} className="font-bold text-sm text-foreground hover:text-primary transition-colors">
                        {review.profiles?.full_name || 'Usuario'}
                      </Link>
                      <div className="flex items-center gap-1">
                        <span className="text-amber-500 text-xs">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
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
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-card w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95">
            <div className="p-5 border-b border-border flex items-center justify-between bg-secondary/30">
              <h2 className="text-lg font-bold">Todas las reseñas ({reviews.length})</h2>
              <button
                onClick={() => setShowAllReviewsModal(false)}
                className="p-2 bg-background hover:bg-secondary rounded-full transition-colors text-muted-foreground"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {reviews.map(review => (
                <div key={review.id} className="p-4 border border-border rounded-xl bg-background">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
                        {review.profiles?.avatar_url ? (
                          <img src={review.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-primary font-bold text-sm">
                            {review.profiles?.full_name?.substring(0, 2).toUpperCase() || 'U'}
                          </span>
                        )}
                      </div>
                      <div>
                        <Link href={`/profile/${review.user_id}`} onClick={() => setShowAllReviewsModal(false)} className="font-bold text-sm text-foreground hover:text-primary transition-colors">
                          {review.profiles?.full_name || 'Usuario'}
                        </Link>
                        <div className="flex items-center gap-1">
                          <span className="text-amber-500 text-xs">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
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
          <div className="p-4 flex items-center justify-between">
            <div className="text-white font-bold text-sm">
              {activeMediaIndex + 1} / {(pitchAny.media_urls?.length || 1)}
            </div>
            <button
              type="button"
              onClick={() => setShowGalleryModal(false)}
              className="p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            >
              <X size={24} />
            </button>
          </div>
          <div className="flex-1 relative flex items-center justify-center p-4">
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
                    className="absolute left-4 p-4 text-white bg-black/50 hover:bg-black/80 rounded-full disabled:opacity-30 transition-all z-10"
                  >
                    <ChevronLeft size={32} />
                  </button>

                  {getYoutubeId(mediaUrls[activeMediaIndex]) ? (
                    <iframe src={`https://www.youtube.com/embed/${getYoutubeId(mediaUrls[activeMediaIndex])}`} className="max-h-[85vh] w-full max-w-4xl object-contain shadow-2xl" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                  ) : (
                    <img
                      src={mediaUrls[activeMediaIndex]}
                      alt={`Foto ${activeMediaIndex + 1}`}
                      className="max-h-[85vh] max-w-full object-contain"
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => setActiveMediaIndex(prev => Math.min(mediaUrls.length - 1, prev + 1))}
                    disabled={activeMediaIndex === mediaUrls.length - 1}
                    className="absolute right-4 p-4 text-white bg-black/50 hover:bg-black/80 rounded-full disabled:opacity-30 transition-all z-10"
                  >
                    <ChevronRight size={32} />
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