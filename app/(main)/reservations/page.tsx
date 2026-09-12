'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { Loader2, CalendarDays, MapPin, X, Share2, Ticket, Clock, CheckCircle, XCircle, AlertCircle, LayoutGrid, ChevronDown, Sparkles, Download } from 'lucide-react';
import Link from 'next/link';
import { toPng } from 'html-to-image';

export default function UserReservationsPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [dateFilter, setDateFilter] = useState<'todas' | 'hoy' | 'pasados_3' | 'pasados_7' | 'historial'>('todas');
  const [statusFilter, setStatusFilter] = useState<'todas' | 'confirmed' | 'pending' | 'cancelled'>('todas');
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [notification, setNotification] = useState<{ show: boolean; title: string; message: string; status: string } | null>(null);
  const ticketRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const supabase = createClient();

  useEffect(() => {
    const t = setTimeout(() => {
      setAuthChecked(true);
      if (!user) setLoading(false);
    }, 100);
    return () => clearTimeout(t);
  }, [user]);

  // Carga inicial
  useEffect(() => {
    if (user) {
      setAuthChecked(true);
      fetchMyBookings();
    }
  }, [user]);

  // Sincronización en TIEMPO REAL: actualización inmediata cuando el dueño aprueba o cancela
  useEffect(() => {
    if (!user) return;

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

          // Refrescar reservas al instante
          fetchMyBookings();
        }
      )
      .subscribe();

    // Sondeo de respaldo cada 4 segundos
    const interval = setInterval(fetchMyBookings, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [user, supabase]);

  const fetchMyBookings = async () => {
    try {
      const { data } = await supabase
        .from('bookings')
        .select(`
          *,
          pitches (
            name,
            image_url,
            media_urls,
            tone,
            type,
            companies (name, zone, address)
          )
        `)
        .eq('user_id', user!.id)
        .order('start_time', { ascending: false });

      if (data) setBookings(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
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

  if (!user) {
    return (
      <div className="page-content fade-in max-w-xl mx-auto text-center py-20">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 text-primary border border-primary/20">
          <Ticket size={36} />
        </div>
        <h2 className="text-2xl font-bold mb-3">Inicia sesión para ver tus reservas</h2>
        <p className="text-muted-foreground mb-8">Debes tener una cuenta para poder gestionar tus partidos y ver los tickets de reserva.</p>
        <Link href="/login" className="btn-primary w-full max-w-xs mx-auto block py-3">Ingresar o Crear Cuenta</Link>
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

      const text = `${statusHeader}\n\n📍 ${b.pitches?.name?.toUpperCase() || ''}\n📅 Fecha: ${new Date(b.start_time).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}\n⏰ Hora: ${new Date(b.start_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}\n\nVer cancha y ubicación: ${pitchUrl}\n\n¡Allá nos vemos!`;

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

  const filteredBookings = bookings.filter(b => {
    if (dateFilter === 'todas') return true;

    const bookingDate = new Date(b.start_time);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const bookingDay = new Date(bookingDate);
    bookingDay.setHours(0, 0, 0, 0);

    {/* Cambiamos el orden de la resta para contar días hacia atrás de forma positiva */ }
    const diffTime = today.getTime() - bookingDay.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (dateFilter === 'hoy') return diffDays === 0;
    if (dateFilter === 'pasados_3') return diffDays >= 0 && diffDays <= 3;
    if (dateFilter === 'pasados_7') return diffDays >= 0 && diffDays <= 7;
    if (dateFilter === 'historial') return diffDays > 7;
    return true;
  }).filter(b => {
    if (statusFilter === 'todas') return true;
    return b.status === statusFilter;
  });

  const groupedMyBookings = (() => {
    const groups: Record<string, any> = {};

    filteredBookings.forEach((b: any) => {
      const dateStr = b.start_time.split('T')[0]; 
      const key = `${b.pitch_id}-${dateStr}-${b.status}`;

      if (!groups[key]) {
        groups[key] = {
           ...b,
           bookings: [],
           total_price: 0,
           deposit_amount: 0,
           start_time: b.start_time
        };
      }
      
      groups[key].bookings.push(b);
      if (new Date(b.start_time) < new Date(groups[key].start_time)) {
        groups[key].start_time = b.start_time;
      }
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
      groups[key].total_price += tPrice;
      groups[key].deposit_amount += dAmount;
    });

    Object.values(groups).forEach(g => {
      g.bookings.sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    });

    return Object.values(groups).sort((a: any, b: any) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  })();

  const confirmed = groupedMyBookings.filter((b: any) => b.status === 'confirmed');
  const pending = groupedMyBookings.filter((b: any) => b.status === 'pending');
  const cancelled = groupedMyBookings.filter((b: any) => b.status === 'cancelled');

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
              {/* Título y Estado: flex-wrap permite que si el nombre es largo, el estado baje elegantemente sin cortarse */}
              <div className="flex flex-wrap items-start justify-between gap-2 mb-1.5">
                {/* CORRECCIÓN: Quitamos 'truncate' para que el nombre se lea completo en varias líneas si es largo */}
                <h3 className="font-bold text-sm sm:text-base leading-tight text-foreground flex-1 min-w-[120px]">
                  {b.pitches?.name?.toUpperCase()}
                </h3>


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
                <div className="flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground">
                  <Clock size={12} className="text-primary flex-shrink-0" />
                  <span className="font-bold text-primary whitespace-nowrap">
                    {b.bookings ? b.bookings.map((xb: any) => new Date(xb.start_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })).join(', ') : date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
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


  const SectionGroup = ({ title, items, icon }: { title: string; items: any[]; icon: React.ReactNode }) => {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          {icon}
          <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">{title}</h2>
          <span className="text-xs font-bold bg-border text-muted-foreground px-2 py-0.5 rounded-full">{items.length}</span>
        </div>
        <div className="flex flex-col gap-3">
          {items.map(b => <BookingCard key={b.id} b={b} />)}
        </div>
      </div>
    );
  };

  return (
    <div className="page-content fade-in max-w-3xl mx-auto">
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

      {/* ── Contenedor Principal (Header + Filtros de Mis Reservas) ── */}
      <div className="bg-[#DCE7DE] border border-[#C8DACB] rounded-3xl p-4 sm:p-6 mb-8 shadow-xs">

        {/* Encabezado: Título y Contador / Badge Resumen */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-[#C8DACB]">
          <div>
            <div className="flex items-center gap-2.5">
              <CalendarDays className="text-[#054D27]" size={26} strokeWidth={2.5} />
              <h1 className="text-2xl sm:text-3xl font-black text-[#054D27] uppercase tracking-tight">
                Mis Reservas
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-[#4D715B] font-medium mt-1 leading-relaxed">
              Verifica el estado de tus reservas, comparte el ticket con los detalles de fecha, hora y dirección, y envíaselo a tus compañeros.            </p>
          </div>

          {/* Badge Resumen de Reservas */}
          {/* {filteredBookings.length > 0 && (
            <div className="flex items-center gap-2 bg-[#CDE0D1]/70 border border-[#BACFC0] px-4 py-2.5 rounded-xl shrink-0 self-start sm:self-auto">
              <span className="text-xs sm:text-sm font-black text-[#054D27]">
                {filteredBookings.length} {filteredBookings.length === 1 ? 'reserva' : 'reservas'} · {confirmed.length} {confirmed.length === 1 ? 'aprobada' : 'aprobadas'}
              </span>
            </div>
          )} */}
        </div>

        {/* Controles y Filtros */}
        <div className="flex flex-col gap-4">
          {/* Filtro por Estado */}
          <div>
            <h2 className="text-[10px] font-extrabold text-[#4D715B] uppercase tracking-wider mb-2 px-1">
              Filtrar por estado
            </h2>

            <div className="bg-[#CDE0D1]/70 border border-[#BACFC0] rounded-2xl p-1 mb-6">
              <div className="flex items-center w-full">
                {[
                  { id: 'todas', label: 'Todas', showIcon: true },
                  { id: 'confirmed', label: 'Aprobadas', showIcon: false },
                  { id: 'pending', label: 'Revisión', showIcon: false },
                  { id: 'cancelled', label: 'Canceladas', showIcon: false },
                ].map((f) => {
                  const isActive = statusFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setStatusFilter(f.id as any)}
                      className={`flex-1 py-2 px-1 sm:px-2 rounded-xl text-[11px] sm:text-xs font-black transition-all duration-200 select-none flex items-center justify-center gap-1 leading-tight text-center ${isActive
                          ? 'bg-[#DCE7DE] text-[#054D27] shadow-xs border border-[#BACFC0]'
                          : 'text-[#4D715B] hover:text-[#054D27] hover:bg-[#DCE7DE]/50'
                        }`}
                    >
                      {f.showIcon && (
                        <LayoutGrid
                          size={13}
                          strokeWidth={2.5}
                          className={`shrink-0 ${isActive ? 'text-[#008744]' : 'text-[#4D715B]'}`}
                        />
                      )}
                      <span>{f.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Selector de Fecha Estilizado */}
      <div className="flex items-center justify-between sm:justify-end gap-2 pt-1 px-1">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#4D715B] flex items-center gap-1">
        </span>

        <div className="relative inline-block min-w-[170px]">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as any)}
            className="w-full appearance-none cursor-pointer outline-none text-xs font-black rounded-xl pl-3 pr-8 py-2 transition-all shadow-xs border bg-[#CDE0D1]/70 text-[#054D27] border-[#BACFC0] hover:bg-[#CDE0D1] focus:ring-2 focus:ring-[#008744]/20"
          >
            <option value="todas" className="bg-[#DCE7DE] text-[#054D27] font-bold py-1.5">
              Cualquier fecha
            </option>
            <option value="hoy" className="bg-[#DCE7DE] text-[#054D27] font-bold py-1.5">
              Hoy
            </option>
            <option value="pasados_3" className="bg-[#DCE7DE] text-[#054D27] font-bold py-1.5">
              Últimos 3 días
            </option>
            <option value="pasados_7" className="bg-[#DCE7DE] text-[#054D27] font-bold py-1.5">
              Últimos 7 días
            </option>
          </select>

          <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-[#054D27]">
            <ChevronDown size={14} strokeWidth={2.5} />
          </div>
        </div>
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
      ) : (
        <div className="flex flex-col gap-8">
          <SectionGroup
            title="Aprobadas"
            items={confirmed}
            icon={<CheckCircle size={16} className="text-emerald-500" />}
          />
          <SectionGroup
            title="En Revisión"
            items={pending}
            icon={<AlertCircle size={16} className="text-amber-500" />}
          />
          <SectionGroup
            title="Canceladas"
            items={cancelled}
            icon={<XCircle size={16} className="text-red-500" />}
          />
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
                padding: '24px 24px 48px',
                background: selectedTicket.status === 'confirmed' ? '#1DB954' : selectedTicket.status === 'pending' ? '#F59E0B' : '#EF4444',
                color: '#ffffff',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, opacity: 0.9 }}>
                  <div style={{ width: 24, height: 24, background: '#fff', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#1DB954', fontWeight: 900, fontSize: 11 }}>H</span>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.1em' }}>HAYCANCHA</span>
                </div>
                {/* Imagen de la cancha en el ticket */}
                {/* {(selectedTicket.pitches?.media_urls?.[0] || selectedTicket.pitches?.image_url) && (
                  <div style={{ marginBottom: 16, borderRadius: 12, overflow: 'hidden', height: 160 }}>
                    <img
                      src={selectedTicket.pitches.media_urls?.[0] || selectedTicket.pitches.image_url}
                      alt={selectedTicket.pitches?.name?.toUpperCase() || 'Cancha'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }}
                    />
                  </div>
                )} */}
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', opacity: 0.8, marginBottom: 4 }}>TICKET DE RESERVA</p>
                <h2 style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.1, marginBottom: 8 }}>{selectedTicket.pitches.name.toUpperCase()}</h2>
                <p style={{ fontSize: 13, fontWeight: 600, opacity: 0.9, marginBottom: 16 }}>⚽ {selectedTicket.pitches.type || 'Fútbol'}</p>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.2)', borderRadius: 999, padding: '4px 12px' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em' }}>
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
              <div style={{ background: '#1A1F26', padding: '16px 24px 24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 16px', marginBottom: 20 }}>
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', marginBottom: 4 }}>JUGADOR</p>
                    <p style={{ fontWeight: 700, color: '#fff', textTransform: 'capitalize' }}>{selectedTicket.customer_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Jugador'}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', marginBottom: 4 }}>ESTADO</p>
                    <p style={{ fontWeight: 700, color: selectedTicket.status === 'confirmed' ? '#34D399' : selectedTicket.status === 'pending' ? '#FBBF24' : '#F87171' }}>
                      {selectedTicket.status === 'pending' ? 'REVISIÓN' : selectedTicket.status === 'confirmed' ? 'CONFIRMADA ✓' : 'CANCELADA'}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', marginBottom: 4 }}>FECHA</p>
                    <p style={{ fontWeight: 700, color: '#fff', fontSize: 13, textTransform: 'capitalize' }}>
                      {new Date(selectedTicket.start_time).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', marginBottom: 4 }}>HORARIOS</p>
                    <p style={{ fontWeight: 700, color: '#fff', fontSize: 13 }}>
                      {selectedTicket.bookings ? selectedTicket.bookings.map((xb: any) => new Date(xb.start_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })).join(', ') : new Date(selectedTicket.start_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                {/* <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: '#6B7280' }}>🔗</span>
                  <span style={{ fontSize: 10, color: '#1DB954', fontWeight: 600, letterSpacing: '0.02em' }}>
                    {typeof window !== 'undefined' ? window.location.hostname : 'haycancha.app'}/cancha/{selectedTicket.pitch_id?.split('-')[0] || '...'}
                  </span>
                </div> */}
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
                {isSharing ? 'Preparando...' : 'WhatsApp'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
