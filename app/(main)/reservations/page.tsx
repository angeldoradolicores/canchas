'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { Loader2, CalendarDays, MapPin, X, Share2, Ticket, Clock, CheckCircle, XCircle, AlertCircle, LayoutGrid, ChevronDown, Sparkles, Download, Info, Sparkles as SparklesIcon, CalendarCheck2, Search } from 'lucide-react';
import Link from 'next/link';
import { toPng } from 'html-to-image';

type TabKey = 'proximas' | 'pasadas' | 'todas';
type StatusKey = 'todas' | 'confirmed' | 'pending' | 'cancelled';

/** Día (YYYY-MM-DD) en hora de Colombia. */
function ymdBogota(d: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(d));
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n, 12));
  return dt.toISOString().slice(0, 10);
}

/** Encabezado de cada día de la lista: "Hoy", "Mañana", "Ayer" o "Sábado 21 de noviembre". */
function dayHeading(ymd: string, today: string): string {
  if (ymd === today) return 'Hoy';
  if (ymd === addDays(today, 1)) return 'Mañana';
  if (ymd === addDays(today, -1)) return 'Ayer';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const sameYear = ymd.slice(0, 4) === today.slice(0, 4);
  return dt.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC' });
}

const normalize = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

interface BookingBanner {
  type: 'today' | 'other_date';
  bookingDate: Date;
  bookingDateStr: string;
  pitchName: string;
}

export default function UserReservationsPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  // null = todavía no se eligió: se abre en "Próximas" si hay, si no en "Pasadas".
  const [tab, setTab] = useState<TabKey | null>(null);
  const [exactDay, setExactDay] = useState('');
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusKey>('todas');
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [notification, setNotification] = useState<{ show: boolean; title: string; message: string; status: string } | null>(null);
  // Banner para reservas recién creadas
  const [newBookingBanner, setNewBookingBanner] = useState<BookingBanner | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const ticketRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const supabase = createClient();

  // Detectar si venimos de una reserva recién creada (parámetro ?newBooking=1&date=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const isNew = params.get('newBooking');
    const rawDate = params.get('date');
    const pitchName = params.get('pitch') || 'tu cancha';
    if (isNew && rawDate) {
      const bookingDate = new Date(rawDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const bDay = new Date(bookingDate);
      bDay.setHours(0, 0, 0, 0);
      const isToday = bDay.getTime() === today.getTime();
      const bookingDateStr = bookingDate.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
      setNewBookingBanner({ type: isToday ? 'today' : 'other_date', bookingDate, bookingDateStr, pitchName });
      // Limpiar params sin recargar
      const url = new URL(window.location.href);
      url.searchParams.delete('newBooking');
      url.searchParams.delete('date');
      url.searchParams.delete('pitch');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setAuthChecked(true);
      if (!user) setLoading(false);
    }, 100);
    return () => clearTimeout(t);
  }, [user]);

  // Carga inicial (usuarios registrados e invitados con reservas en este navegador)
  useEffect(() => {
    setAuthChecked(true);
    fetchMyBookings(false);
  }, [user]);

  // Sincronización en TIEMPO REAL: actualización inmediata cuando el dueño aprueba o cancela
  useEffect(() => {
    if (!user) {
      // Para usuarios invitados: sondeo silencioso cada 25 segundos
      const guestInterval = setInterval(() => fetchMyBookings(true), 25000);
      return () => clearInterval(guestInterval);
    }

    const channel = supabase
      .channel(`user-reservations:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          if (payload.eventType === 'UPDATE' && payload.new) {
            const oldStatus = payload.old?.status;
            const newStatus = payload.new.status;

            if (newStatus && newStatus !== oldStatus) {
              const statusMap: Record<string, { label: string; text: string }> = {
                confirmed: {
                  label: '¡Reserva Aprobada! 🎉',
                  text: 'El dueño de la cancha ha aprobado tu reserva. ¡Tu partido está confirmado!',
                },
                cancelled: {
                  label: 'Reserva Cancelada ❌',
                  text: 'Tu solicitud de reserva ha sido cancelada.',
                },
                pending: {
                  label: 'Reserva en Revisión ⏳',
                  text: 'Tu comprobante está en proceso de validación.',
                },
              };

              const info = statusMap[newStatus] || {
                label: 'Reserva Actualizada',
                text: `El estado de tu reserva ahora es: ${newStatus}.`,
              };

              setNotification({
                show: true,
                title: info.label,
                message: info.text,
                status: newStatus,
              });

              setTimeout(() => {
                setNotification(prev => (prev ? { ...prev, show: false } : null));
              }, 7000);
            }
          }

          // Refrescar reservas silenciosamente en tiempo real sin recargar la pantalla
          fetchMyBookings(true);
        }
      )
      .subscribe();

    // Sondeo de respaldo silencioso cada 30 segundos (el WebSocket de Realtime ya hace el trabajo instantáneo)
    const interval = setInterval(() => fetchMyBookings(true), 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [user, supabase]);

  const areBookingsEqual = (prev: any[], next: any[]): boolean => {
    if (prev.length !== next.length) return false;
    for (let i = 0; i < prev.length; i++) {
      const p = prev[i];
      const n = next[i];
      if (!n || p.id !== n.id || p.status !== n.status || p.payment_proof_url !== n.payment_proof_url) {
        return false;
      }
    }
    return true;
  };

  const fetchMyBookings = async (isSilent = false) => {
    try {
      if (user?.id) {
        const { data, error } = await supabase
          .from('bookings')
          .select(`
            *,
            pitches (
              name,
              image_url,
              media_urls,
              tone,
              type,
              custom_pricing,
              companies (name, zone, address)
            )
          `)
          .eq('user_id', user.id)
          .order('start_time', { ascending: false });

        if (!error && data) {
          setBookings(prev => areBookingsEqual(prev, data) ? prev : data);
        }
      } else {
        let guestIds: string[] = [];
        if (typeof window !== 'undefined') {
          try {
            const urlParams = new URLSearchParams(window.location.search);
            const paramIds = urlParams.get('ids') ? urlParams.get('ids')!.split(',').map(s => s.trim()).filter(Boolean) : [];
            const localIds: string[] = JSON.parse(localStorage.getItem('cancheros_guest_booking_ids') || '[]');
            const sessionIds: string[] = JSON.parse(sessionStorage.getItem('cancheros_recent_booking_ids') || '[]');
            guestIds = Array.from(new Set([...paramIds, ...localIds, ...sessionIds]));

            // Si llegaron IDs por URL, persistirlos en localStorage para no perderlos
            if (paramIds.length > 0 && guestIds.length > 0) {
              localStorage.setItem('cancheros_guest_booking_ids', JSON.stringify(guestIds));
            }
          } catch { }
        }

        if (guestIds.length > 0) {
          const res = await fetch(`/api/bookings?ids=${guestIds.join(',')}`);
          const resJson = await res.json();
          if (resJson.success && Array.isArray(resJson.data)) {
            const nextData = resJson.data;
            setBookings(prev => areBookingsEqual(prev, nextData) ? prev : nextData);
          } else {
            console.error('[fetchMyBookings guest error]', resJson);
          }
        } else {
          setBookings([]);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  if (!authChecked || loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <Loader2 size={32} className="animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Cargando tus reservas...</p>
      </div>
    );
  }

  if (!user && bookings.length === 0) {
    return (
      <div className="page-content fade-in max-w-xl mx-auto text-center py-20 px-4">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 text-primary border border-primary/20">
          <Ticket size={36} />
        </div>
        <h2 className="text-2xl font-bold mb-3">Tus Reservas</h2>
        <p className="text-muted-foreground mb-6 text-sm">
          No tienes reservas activas en este dispositivo. Si ya tienes una cuenta registrada, inicia sesión para ver todo tu historial de partidos.
        </p>
        <Link href="/login" className="btn-primary w-full max-w-xs mx-auto block py-3">
          Iniciar Sesión o Registrarme
        </Link>
      </div>
    );
  }

  const handleDownloadTicket = async (b: any) => {
    if (!ticketRef.current) return;
    setIsDownloading(true);
    try {
      const dataUrl = await toPng(ticketRef.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement('a');
      a.href = dataUrl;
      const cleanName = b.pitches?.name?.replace(/\s+/g, '-') || 'reserva';
      a.download = `ticket-${cleanName}.png`;
      a.click();
    } catch (error) {
      console.error('Error downloading ticket', error);
      alert('Hubo un error al descargar el ticket. Intenta nuevamente.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShareWhatsApp = async (b: any) => {
    if (!ticketRef.current) return;
    setIsSharing(true);

    try {
      const dataUrl = await toPng(ticketRef.current, { pixelRatio: 2, cacheBust: true });
      const blob = await (await fetch(dataUrl)).blob();
      const cleanName = b.pitches?.name?.replace(/\s+/g, '-') || 'reserva';
      const fileName = `ticket-${cleanName}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      const pitchUrl = `${window.location.origin}/cancha/${b.pitch_id}`;

      // Lógica dinámica para el encabezado según el estado de la reserva
      let statusHeader = '⚽ ¡Reserva de partido!';
      if (b.status === 'confirmed') {
        statusHeader = '⚽ ¡Partido confirmado!';
      } else if (b.status === 'pending') {
        statusHeader = '⏳ Partido en revisión por el dueño de la cancha';
      } else if (b.status === 'cancelled') {
        statusHeader = '❌ Cancelado por el dueño';
      }

      const complexName = b.pitches?.companies?.name || b.bookings?.[0]?.pitches?.companies?.name;
      const pitchTitle = (b.displayPitchName || b.pitches?.name || '').toUpperCase();
      const complexLine = complexName ? `${complexName.toUpperCase()}\n` : '';
      const hoursList = b.bookings && b.bookings.length > 0
        ? b.bookings.map((xb: any) => {
          const t = new Date(xb.start_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
          return b.displayPitchName?.includes('+') && xb.pitches?.name ? `${xb.pitches.name} (${t})` : t;
        }).join(', ')
        : new Date(b.start_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

      const text = `${statusHeader}\n\n${complexLine} 📍${pitchTitle}\n📅 Fecha: ${new Date(b.start_time).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}\n⏰ Horarios: ${hoursList}\n\nVer cancha y ubicación: ${pitchUrl}`;

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Ticket de Reserva', text });
          return;
        } catch (shareErr: any) {
          if (shareErr.name === 'AbortError') return;
        }
      }

      // Fallback para navegadores sin Web Share de archivos: descargar imagen y abrir WhatsApp
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fileName;
      a.click();

      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text + '\n\n(La imagen del ticket se descargó en tu dispositivo para que puedas adjuntarla)')}`;
      window.open(waUrl, '_blank');
    } catch (error) {
      console.error('Error generating image', error);
      alert('Hubo un error al preparar el ticket. Puedes descargarlo directamente.');
    } finally {
      setIsSharing(false);
    }
  };

  const statusConfig: Record<string, { label: string; icon: React.ReactNode; classes: string; dot: string }> = {
    confirmed: {
      label: 'Aprobada',
      icon: <CheckCircle size={13} />,
      classes: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
      dot: 'bg-emerald-500',
    },
    pending: {
      label: 'En revisión',
      icon: <AlertCircle size={13} />,
      classes: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
      dot: 'bg-amber-500',
    },
    cancelled: {
      label: 'Cancelada',
      icon: <XCircle size={13} />,
      classes: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
      dot: 'bg-red-500',
    },
  };

  const normalizedSearch = normalize(searchText.trim());
  const todayYmd = ymdBogota(new Date());
  // Búsqueda (complejo, cancha, zona, dirección o fecha escrita: "21 nov", "sábado"), estado y día exacto.
  const filteredBookings = bookings.filter(b => {
    if (statusFilter !== 'todas' && b.status !== statusFilter) return false;
    if (exactDay && ymdBogota(b.start_time) !== exactDay) return false;
    if (!normalizedSearch) return true;
    const when = new Date(b.start_time).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' });
    const haystack = normalize([b.pitches?.name, b.pitches?.companies?.name, b.pitches?.companies?.zone, b.pitches?.companies?.address, when]
      .filter(Boolean).join(' '));
    return haystack.includes(normalizedSearch);
  });

  const groupedMyBookings = (() => {
    const groups: any[] = [];

    // Ordenar reservas cronológicamente para agrupar las hechas en el mismo momento
    const sorted = [...filteredBookings].sort(
      (a: any, b: any) => new Date(b.created_at || b.start_time).getTime() - new Date(a.created_at || a.start_time).getTime()
    );

    sorted.forEach((b: any) => {
      const bTime = new Date(b.created_at || b.start_time).getTime();
      const bProof = b.payment_proof_url?.trim() || null;

      // Buscar si ya existe un grupo con el que fue reservada EN EL MISMO MOMENTO
      const existingGroup = groups.find((g: any) => {
        if (g.pitch_id !== b.pitch_id || g.status !== b.status) return false;

        // 1. Mismo comprobante de pago subido en el checkout
        if (bProof && g.payment_proof_url) {
          return bProof === g.payment_proof_url;
        }

        // Si uno tiene comprobante y el otro no, son reservas distintas
        if (Boolean(bProof) !== Boolean(g.payment_proof_url)) {
          return false;
        }

        // 2. Si no hay comprobante: verificar si se crearon en el mismo instante (< 3 minutos) y misma fecha
        const gTime = new Date(g.created_at || g.start_time).getTime();
        const diffMs = Math.abs(bTime - gTime);
        const bDate = new Date(b.start_time).toDateString();
        const gDate = new Date(g.start_time).toDateString();
        return bDate === gDate && diffMs <= 3 * 60 * 1000;
      });

      const tPrice = b.total_price || b.pitches?.price_per_hour || 80000;
      let dAmount = b.deposit_amount || 0;
      if (dAmount === 0 && b.pitches) {
        const customPricing = b.pitches.custom_pricing || {};
        const isFixed = customPricing.booking_type === 'fixed';
        const pct = customPricing.booking_percentage || b.pitches.booking_percentage || 50;
        const hoursCount = 1;
        if (isFixed) {
          dAmount = Number(customPricing.booking_fixed || 0) * hoursCount;
        } else {
          dAmount = (tPrice * Number(pct)) / 100;
        }
      }

      if (existingGroup) {
        existingGroup.bookings.push(b);
        existingGroup.total_price += tPrice;
        existingGroup.deposit_amount += dAmount;
        if (new Date(b.start_time) < new Date(existingGroup.start_time)) {
          existingGroup.start_time = b.start_time;
        }
      } else {
        groups.push({
          ...b,
          bookings: [b],
          total_price: tPrice,
          deposit_amount: dAmount,
        });
      }
    });

    // Ordenar horas dentro de cada grupo y consolidar nombres de canchas
    groups.forEach(g => {
      g.bookings.sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      const pitchNames = Array.from(new Set(g.bookings.map((xb: any) => xb.pitches?.name).filter(Boolean)));
      g.displayPitchName = pitchNames.join(' + ') || g.pitches?.name;
    });

    return groups.sort((a: any, b: any) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  })();

  // Próximas = partidos de hoy en adelante; Pasadas = días anteriores.
  const upcomingGroups = groupedMyBookings.filter((g: any) => ymdBogota(g.start_time) >= todayYmd);
  const pastGroups = groupedMyBookings.filter((g: any) => ymdBogota(g.start_time) < todayYmd);
  const activeTab: TabKey = exactDay ? 'todas' : (tab ?? (upcomingGroups.length > 0 || bookings.length === 0 ? 'proximas' : 'pasadas'));
  const visibleGroups = activeTab === 'proximas'
    ? [...upcomingGroups].sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    : activeTab === 'pasadas' ? pastGroups : groupedMyBookings;

  // Secciones por día del partido.
  const daySections: { ymd: string; items: any[] }[] = [];
  visibleGroups.forEach((g: any) => {
    const ymd = ymdBogota(g.start_time);
    const last = daySections[daySections.length - 1];
    if (last && last.ymd === ymd) last.items.push(g);
    else daySections.push({ ymd, items: [g] });
  });

  const hasFilters = !!normalizedSearch || statusFilter !== 'todas' || !!exactDay;
  const clearFilters = () => { setSearchText(''); setStatusFilter('todas'); setExactDay(''); };

  const BookingCard = ({ b }: { b: any }) => {
    const status = statusConfig[b.status] || statusConfig.pending;
    const pitchImage = b.pitches?.media_urls?.[0] || b.pitches?.image_url;
    const date = new Date(b.start_time);

    return (
      <div className="group bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-200">
        {/* Contenedor principal: siempre en línea recta horizontal */}
        <div className="flex w-full items-stretch">

          {/* CONTENEDOR DE IMAGEN: El fondo ahora es el color exacto de la tarjeta (bg-card) o transparente */}
          <div className="w-24 sm:w-36 md:w-44 flex-shrink-0 relative overflow-hidden bg-card border-r border-border/40 flex items-center justify-center">
            {pitchImage ? (
              <img
                src={pitchImage}
                alt={b.pitches?.name}
                // object-contain muestra la foto 100% COMPLETA sin recortes y se funde con el fondo de tu página
                className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className={`w-full h-full min-h-[110px] ${b.pitches?.tone || 'field-emerald'} flex items-center justify-center`}>
                <div className="pitch-lines w-full h-full opacity-20" />
              </div>
            )}

            {/* Status dot overlay */}
            <div className="absolute top-2 left-2 bg-black/10 backdrop-blur-xs p-0.5 rounded-full z-20">
              <span className={`w-2 h-2 rounded-full block ${status.dot} shadow-md`} />
            </div>
          </div>

          {/* CONTENIDO DEL LADO DERECHO */}
          <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col justify-between gap-3">
            <div>
              {(() => {
                const compName = b.pitches?.companies?.name || b.bookings?.[0]?.pitches?.companies?.name;
                return compName ? (
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mb-1 truncate">
                    <span></span> {compName}
                  </p>
                ) : null;
              })()}

              {/* Título y Estado: flex-wrap permite que si el nombre es largo, el estado baje elegantemente sin cortarse */}
              <div className="flex flex-wrap items-start justify-between gap-2 mb-1.5">
                {/* CORRECCIÓN: Quitamos 'truncate' para que el nombre se lea completo en varias líneas si es largo */}
                <div className="flex-1 min-w-[120px] flex flex-col gap-1">
                  <h3 className="font-bold text-sm sm:text-base leading-tight text-foreground">
                    {(b.displayPitchName || b.pitches?.name)?.toUpperCase()}
                  </h3>
                  {(b.pitches?.custom_pricing?.is_combined || b.bookings?.[0]?.pitches?.custom_pricing?.is_combined) && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 w-fit">
                      Combinada
                    </span>
                  )}
                </div>


                {/* CORRECCIÓN: Quitamos los cortes ocultos, el texto "Aprobado" o "En revisión" se verá 100% completo siempre */}
                <span className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold flex-shrink-0 whitespace-nowrap ${status.classes}`}>
                  {status.icon}
                  <span>{status.label}</span>
                </span>
              </div>


            </div>

            {/* FILA INFERIOR: Se adapta inteligentemente si el espacio horizontal es muy reducido */}
            <div className="pt-2 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">

              {/* Contenedor de Fecha y Hora */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground">
                  <CalendarDays size={12} className="text-primary flex-shrink-0" />
                  <span className="font-semibold capitalize whitespace-nowrap">
                    {date.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <div className="flex items-start gap-1 text-[11px] sm:text-xs text-muted-foreground min-w-0">
                  <Clock size={12} className="text-primary flex-shrink-0 mt-0.5" />
                  <span className="font-bold text-primary break-words leading-tight">
                    {(() => {
                      if (!b.bookings || b.bookings.length === 0) {
                        return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
                      }

                      // Extraer las horas ordenadas cronológicamente
                      const sortedBookings = [...b.bookings].sort((a: any, c: any) =>
                        new Date(a.start_time).getTime() - new Date(c.start_time).getTime()
                      );

                      // Verificar si hay múltiples canchas distintas
                      const uniquePitchNames = Array.from(new Set(
                        sortedBookings.map((xb: any) => xb.pitches?.name).filter(Boolean)
                      ));
                      const hasMultiplePitches = uniquePitchNames.length > 1;

                      // Formato de hora de cada reserva
                      const timeParts = sortedBookings.map((xb: any) => {
                        const t = new Date(xb.start_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
                        // Si hay múltiples canchas, prefijar el nombre de cada cancha
                        return hasMultiplePitches && xb.pitches?.name
                          ? `${xb.pitches.name} (${t})`
                          : t;
                      });

                      return timeParts.join(', ');
                    })()}
                  </span>
                </div>
              </div>

              {/* Botón de Ver Ticket */}
              <button
                onClick={() => setSelectedTicket(b)}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-xl text-[11px] font-bold transition-all active:scale-95 flex-shrink-0"
              >
                <Ticket size={12} /> <span>Ver Ticket</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    );
  };


  const DaySection = ({ ymd, items }: { ymd: string; items: any[] }) => {
    const isToday = ymd === todayYmd;
    return (
      <section>
        <div className="py-1 mb-2 flex items-center gap-2">
          <h2 className={`text-xs font-black uppercase tracking-wider capitalize ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
            {dayHeading(ymd, todayYmd)}
          </h2>
          {isToday && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
          <span className="flex-1 h-px bg-border" />
          <span className="text-[10px] font-bold text-muted-foreground">{items.length} {items.length === 1 ? 'reserva' : 'reservas'}</span>
        </div>
        <div className="flex flex-col gap-3">
          {items.map(b => <BookingCard key={b.id} b={b} />)}
        </div>
      </section>
    );
  };

  return (
    <div className="page-content fade-in max-w-3xl mx-auto">
      {/* ── Banner inteligente de nueva reserva ── */}
      {newBookingBanner && !bannerDismissed && (
        <div className={`mb-5 rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 animate-in slide-in-from-top-4 duration-300 shadow-sm ${
          newBookingBanner.type === 'today'
            ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/50'
            : 'bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-800/50'
        }`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            newBookingBanner.type === 'today'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
              : 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300'
          }`}>
            {newBookingBanner.type === 'today' ? <CalendarCheck2 size={20} /> : <Info size={20} />}
          </div>

          <div className="flex-1 min-w-0">
            {newBookingBanner.type === 'today' ? (
              <>
                <p className="font-black text-sm text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  ¡Reserva confirmada para hoy!
                </p>
                <p className="text-xs text-emerald-700/80 dark:text-emerald-300/70 mt-0.5">
                  Tu reserva en <strong>{newBookingBanner.pitchName}</strong> está visible aquí abajo. El dueño la revisará pronto.
                </p>
              </>
            ) : (
              <>
                <p className="font-black text-sm text-sky-800 dark:text-sky-200">
                  ¡Reserva realizada con éxito! 🎉
                </p>
                <p className="text-xs text-sky-700/80 dark:text-sky-300/70 mt-0.5">
                  Tu reserva en <strong>{newBookingBanner.pitchName}</strong> es para el <strong className="capitalize">{newBookingBanner.bookingDateStr}</strong>.
                  La encuentras en «Próximas».
                </p>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {newBookingBanner.type === 'other_date' && (
              <button
                onClick={() => { setTab('proximas'); clearFilters(); setBannerDismissed(true); }}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
              >
                Ver próximas
              </button>
            )}
            <button
              onClick={() => setBannerDismissed(true)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Notificación Flotante en Tiempo Real */}
      {notification?.show && (
        <div className="fixed top-20 right-4 sm:right-8 z-[1000] max-w-md w-full animate-in slide-in-from-top-4 duration-300">
          <div className="bg-card/95 backdrop-blur-xl border border-primary/40 rounded-2xl shadow-2xl p-4 flex items-start gap-3 text-foreground ring-1 ring-primary/20">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${notification.status === 'confirmed'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
              : notification.status === 'cancelled'
                ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
              }`}>
              {notification.status === 'confirmed' ? (
                <CheckCircle size={22} className="animate-bounce" />
              ) : notification.status === 'cancelled' ? (
                <XCircle size={22} />
              ) : (
                <AlertCircle size={22} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-black text-sm text-foreground">{notification.title}</h4>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{notification.message}</p>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Encabezado ── */}
      <div className="page-header-banner bg-[#DCE7DE] border border-[#C8DACB] rounded-3xl p-4 sm:p-5 mb-4 shadow-xs">
        <div className="flex items-center gap-2.5">
          <CalendarDays className="page-header-text-primary text-[#054D27]" size={24} strokeWidth={2.5} />
          <h1 className="page-header-text-primary text-2xl sm:text-3xl font-black text-[#054D27] uppercase tracking-tight">
            Mis Reservas
          </h1>
        </div>
        <p className="page-header-text-secondary text-xs sm:text-sm text-[#4D715B] font-medium mt-1">
          Revisa el estado de tus partidos y comparte el ticket con tus compañeros.
        </p>

        {/* Pestañas: Próximas · Pasadas · Todas */}
        <div className="page-filter-bar mt-4 bg-[#CDE0D1]/70 border border-[#BACFC0] rounded-2xl p-1 grid grid-cols-3 gap-1" role="tablist">
          {([
            { id: 'proximas', label: 'Próximas', count: upcomingGroups.length },
            { id: 'pasadas', label: 'Pasadas', count: pastGroups.length },
            { id: 'todas', label: 'Todas', count: groupedMyBookings.length },
          ] as const).map(t => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => { setTab(t.id); setExactDay(''); setBannerDismissed(true); }}
                className={`page-filter-btn py-2 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-1.5 ${isActive
                  ? 'page-filter-btn-active bg-[#DCE7DE] text-[#054D27] shadow-xs border border-[#BACFC0]'
                  : 'text-[#4D715B] hover:text-[#054D27]'}`}
              >
                {t.label}
                <span className={`text-[10px] min-w-5 px-1.5 py-0.5 rounded-full ${isActive ? 'bg-[#054D27] text-white' : 'bg-[#DCE7DE]/70 text-[#4D715B]'}`}>{t.count}</span>
              </button>
            );
          })}
        </div>

        {/* Búsqueda + estado + ir a un día, en una sola fila */}
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4D715B] pointer-events-none" />
            <input
              type="search"
              value={searchText}
              onChange={(e) => { setSearchText(e.target.value); setBannerDismissed(true); }}
              placeholder="Buscar complejo, cancha, zona o fecha (ej. 21 nov)"
              className="w-full rounded-xl border border-[#BACFC0] bg-[#DCE7DE] pl-9 pr-3 py-2 text-sm font-semibold text-[#054D27] placeholder:text-[#4D715B]/70 outline-none focus:ring-2 focus:ring-[#008744]/20"
            />
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1 sm:flex-none sm:w-40">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusKey)}
                aria-label="Estado de la reserva"
                className="w-full appearance-none cursor-pointer outline-none text-xs font-black rounded-xl pl-3 pr-8 py-2.5 border bg-[#DCE7DE] text-[#054D27] border-[#BACFC0] focus:ring-2 focus:ring-[#008744]/20"
              >
                <option value="todas">Todos los estados</option>
                <option value="confirmed">Aprobadas</option>
                <option value="pending">En revisión</option>
                <option value="cancelled">Canceladas</option>
              </select>
              <ChevronDown size={14} strokeWidth={2.5} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#054D27]" />
            </div>
            <label className="relative flex-1 sm:flex-none sm:w-40 flex items-center rounded-xl border border-[#BACFC0] bg-[#DCE7DE] px-2.5 focus-within:ring-2 focus-within:ring-[#008744]/20">
              <CalendarDays size={14} className="text-[#4D715B] shrink-0" />
              <input
                type="date"
                value={exactDay}
                onChange={(e) => { setExactDay(e.target.value); setBannerDismissed(true); }}
                aria-label="Ir a un día"
                title="Ir a un día"
                className="w-full min-w-0 bg-transparent pl-1.5 py-2 text-xs font-black text-[#054D27] outline-none"
              />
            </label>
          </div>
        </div>

        {hasFilters && (
          <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] font-bold text-[#4D715B]">
            <span>
              {visibleGroups.length} {visibleGroups.length === 1 ? 'resultado' : 'resultados'}
              {exactDay ? ` el ${dayHeading(exactDay, todayYmd).toLowerCase()}` : ''}
            </span>
            <button type="button" onClick={clearFilters} className="underline underline-offset-2 hover:text-[#054D27]">
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {bookings.length === 0 ? (
        <div className="dashboard-card text-center py-20 border-dashed border-2">
          <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4 text-primary">
            <CalendarDays size={28} />
          </div>
          <h3 className="font-bold text-lg mb-2">No tienes reservas</h3>
          <p className="text-sm text-muted-foreground mb-6">Aún no has armado partido. ¡Explora las canchas y reserva tu próximo encuentro!</p>
          <Link href="/" className="btn-primary">Buscar Canchas</Link>
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="dashboard-card text-center py-12 border-dashed border-2">
          <p className="font-bold text-sm mb-1">
            {hasFilters ? 'No hay reservas con esa búsqueda' : activeTab === 'proximas' ? 'No tienes partidos próximos' : 'No tienes partidos pasados'}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            {hasFilters ? 'Prueba con otra palabra, otro estado u otro día.' : activeTab === 'proximas' ? 'Tus reservas anteriores están en «Pasadas».' : 'Cuando juegues, tus partidos quedarán aquí.'}
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {hasFilters && (
              <button type="button" onClick={clearFilters} className="btn-primary text-xs px-4 py-2">Limpiar filtros</button>
            )}
            {!hasFilters && activeTab === 'proximas' && pastGroups.length > 0 && (
              <button type="button" onClick={() => setTab('pasadas')} className="btn-primary text-xs px-4 py-2">Ver pasadas</button>
            )}
            {!hasFilters && activeTab === 'proximas' && (
              <Link href="/" className="px-4 py-2 rounded-xl border border-border text-xs font-bold hover:bg-secondary">Buscar canchas</Link>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {daySections.map(sec => <DaySection key={sec.ymd} ymd={sec.ymd} items={sec.items} />)}
        </div>
      )}

      {/* TICKET MODAL */}
      {selectedTicket && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-[340px] flex flex-col gap-4 relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setSelectedTicket(null)}
              className="absolute -top-12 right-0 p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors"
            >
              <X size={20} />
            </button>

            <div
              ref={ticketRef}
              style={{ borderRadius: 28, overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', background: '#1A1F26', fontFamily: 'system-ui, -apple-system, sans-serif' }}
            >
              {/* Header */}
              <div style={{
                padding: '24px 24px 36px',
                background: selectedTicket.status === 'confirmed' ? '#1DB954' : selectedTicket.status === 'pending' ? '#F59E0B' : '#EF4444',
                color: selectedTicket.status === 'pending' ? '#000000' : '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center'
              }}>
                {/* Logo Grande Vectorial Adaptativo */}
                <div style={{
                  marginBottom: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  color: selectedTicket.status === 'pending' ? '#000000' : '#ffffff'
                }}>
                  {/* Ícono de la Ubicación con Cancha */}
                  <svg width="68" height="68" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>

                  {/* Nombre de la Marca Grande */}
                  <span style={{
                    fontWeight: 900,
                    fontSize: 20,
                    letterSpacing: '0.18em',
                    lineHeight: 1,
                    marginTop: -4
                  }}>
                    CANCHEROS
                  </span>
                  <span style={{
                    fontSize: 8,
                    fontWeight: 800,
                    letterSpacing: '0.25em',
                    opacity: 0.8
                  }}>
                  </span>
                </div>

                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', opacity: 0.85, marginTop: 12, marginBottom: 4 }}>TICKET DE RESERVA</p>
                {(() => {
                  const compName = selectedTicket.pitches?.companies?.name || selectedTicket.bookings?.[0]?.pitches?.companies?.name;
                  return compName ? (
                    <div style={{
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: '0.12em',
                      color: selectedTicket.status === 'pending' ? '#111827' : '#A7F3D0',
                      textTransform: 'uppercase',
                      marginBottom: 3
                    }}>
                    </div>
                  ) : null;
                })()}
                <h2 style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.1, marginBottom: 8 }}>
                  {(selectedTicket.pitches?.companies?.name || selectedTicket.bookings?.[0]?.pitches?.companies?.name || 'CANCHA').toUpperCase()}
                </h2>
                <h4 style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.1, marginBottom: 8 }}>
                  {(selectedTicket.displayPitchName || selectedTicket.pitches?.name || 'CANCHA').toUpperCase()}
                </h4>

                {/* {(selectedTicket.pitches?.custom_pricing?.is_combined || selectedTicket.bookings?.[0]?.pitches?.custom_pricing?.is_combined) && (
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'rgba(245, 158, 11, 0.25)',
                    border: '1px solid rgba(245, 158, 11, 0.5)',
                    color: selectedTicket.status === 'pending' ? '#78350F' : '#FDE68A',
                    borderRadius: 6,
                    padding: '3px 8px',
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: '0.08em',
                    marginBottom: 10,
                    textTransform: 'uppercase'
                  }}>

                  </div>
                )} */}

                <p style={{ fontSize: 13, fontWeight: 600, opacity: 0.9, marginBottom: 16 }}>⚽ {selectedTicket.pitches?.type || 'Fútbol 11'}</p>

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: selectedTicket.status === 'pending' ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.2)', borderRadius: 999, padding: '4px 14px' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: selectedTicket.status === 'pending' ? '#000' : '#fff' }} />
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em' }}>
                    {selectedTicket.status === 'pending' ? 'PENDIENTE' : selectedTicket.status === 'confirmed' ? 'CONFIRMADA' : 'RECHAZADA'}
                  </span>
                </div>
              </div>

              {/* Tear line */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 8px', background: '#1A1F26', marginTop: -12 }}>
                {Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: '#000', flexShrink: 0 }} />
                ))}
              </div>

              {/* Body */}
              <div className="p-4 sm:p-6 bg-[#1A1F26] text-white rounded-b-2xl">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 mb-5">

                  {/* JUGADOR */}
                  <div className="min-w-0">
                    <p className="text-[9px] font-extrabold text-gray-400 tracking-wider mb-1 uppercase">
                      JUGADOR
                    </p>
                    <p className="font-bold text-sm sm:text-base text-white capitalize break-words">
                      {selectedTicket.customer_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Jugador'}
                    </p>
                  </div>

                  {/* ESTADO */}
                  <div className="min-w-0">
                    <p className="text-[9px] font-extrabold text-gray-400 tracking-wider mb-1 uppercase">
                      ESTADO
                    </p>
                    <p className={`font-bold text-sm sm:text-base ${selectedTicket.status === 'confirmed' ? 'text-emerald-400' : selectedTicket.status === 'pending' ? 'text-amber-400' : 'text-red-400'
                      }`}>
                      {selectedTicket.status === 'pending' ? 'REVISIÓN' : selectedTicket.status === 'confirmed' ? 'CONFIRMADA ✓' : 'CANCELADA'}
                    </p>
                  </div>

                  {/* FECHA */}
                  <div className="min-w-0">
                    <p className="text-[9px] font-extrabold text-gray-400 tracking-wider mb-1 uppercase">
                      FECHA
                    </p>
                    <p className="font-bold text-xs sm:text-sm text-white capitalize break-words">
                      {new Date(selectedTicket.start_time).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                  </div>

                  {/* HORARIOS */}
                  <div className="min-w-0">
                    <p className="text-[9px] font-extrabold text-gray-400 tracking-wider mb-1.5 uppercase">
                      HORARIOS
                    </p>

                    {/* Adaptación dinámica con agrupación de nombre de cancha y horas */}
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTicket.bookings && selectedTicket.bookings.length > 0 ? (
                        (() => {
                          // Si no hay diferenciación por sub-canchas, listamos directamente cada hora
                          const pitchName = selectedTicket.displayPitchName?.includes('+')
                            ? selectedTicket.bookings[0]?.pitches?.name
                            : null;

                          if (pitchName) {
                            // Extraer todas las horas para esta cancha
                            const timesStr = selectedTicket.bookings
                              .map((xb: any) => new Date(xb.start_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }))
                              .join(', ');

                            return (
                              <span className="bg-white/10 text-white text-[10px] sm:text-[11px] font-bold px-2.5 py-1 rounded-md border border-white/15 text-center leading-tight max-w-full break-words">
                                {pitchName}: {timesStr}
                              </span>
                            );
                          }

                          // Si son horas individuales normales de una sola cancha
                          return selectedTicket.bookings.map((xb: any, index: number) => (
                            <span
                              key={index}
                              className="bg-white/10 text-white text-[10px] sm:text-[11px] font-bold px-2 py-1 rounded-md border border-white/15 text-center leading-tight"
                            >
                              {new Date(xb.start_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ));
                        })()
                      ) : (
                        <span className="bg-white/10 text-white text-[10px] sm:text-[11px] font-bold px-2 py-1 rounded-md border border-white/15 text-center leading-tight">
                          {new Date(selectedTicket.start_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleDownloadTicket(selectedTicket)}
                disabled={isSharing || isDownloading}
                className="py-3.5 bg-secondary hover:bg-secondary/80 text-foreground font-bold rounded-xl transition-colors flex items-center justify-center gap-2 text-xs border border-border disabled:opacity-50"
              >
                {isDownloading ? <Loader2 size={16} className="animate-spin text-primary" /> : <Download size={16} />}
                {isDownloading ? 'Descargando...' : 'Descargar'}
              </button>

              <button
                onClick={() => handleShareWhatsApp(selectedTicket)}
                disabled={isSharing || isDownloading}
                className="py-3.5 bg-[#25D366] hover:bg-[#20bd5a] disabled:opacity-50 text-white font-black rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg text-xs"
              >
                {isSharing ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                {isSharing ? 'Compartiendo...' : 'Compartir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
