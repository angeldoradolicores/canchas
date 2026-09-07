'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { Loader2, CalendarDays, MapPin, X, Share2, Ticket, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { toPng } from 'html-to-image';

export default function UserReservationsPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [dateFilter, setDateFilter] = useState<'todas' | 'hoy' | 'pasados_3' | 'pasados_7' | 'historial'>('todas');
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [isSharing, setIsSharing] = useState(false);
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

  useEffect(() => {
    if (user) {
      setAuthChecked(true);
      fetchMyBookings();
    }
  }, [user]);

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

  const handleShareWhatsApp = async (b: any) => {
    if (!ticketRef.current) return;
    setIsSharing(true);
    try {
      const dataUrl = await toPng(ticketRef.current, { pixelRatio: 2 });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'ticket-reserva.png', { type: 'image/png' });
      const pitchUrl = `${window.location.origin}/cancha/${b.pitch_id}`;
      const text = `⚽ ¡Partido confirmado!\n\n📍 Cancha: ${b.pitches.name}\n🗓 Fecha: ${new Date(b.start_time).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}\n⏰ Hora: ${new Date(b.start_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}\n\n🔗 Ver cancha y ubicación: ${pitchUrl}\n\n¡Allá nos vemos!`;
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Ticket de Reserva', text });
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'ticket-reserva.png';
        a.click();
        const waUrl = `https://wa.me/?text=${encodeURIComponent(text + '\n\n(La imagen del ticket se descargó en tu dispositivo)')} `;
        window.open(waUrl, '_blank');
      }
    } catch (error) {
      console.error('Error generating image', error);
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
  });

  const confirmed = filteredBookings.filter(b => b.status === 'confirmed');
  const pending = filteredBookings.filter(b => b.status === 'pending');
  const cancelled = filteredBookings.filter(b => b.status === 'cancelled');

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
                    {date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
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
      <div className="page-heading mb-6">
        <div>
          <p className="eyebrow accent-label">MI ACTIVIDAD</p>
          <h1>Mis Reservas</h1>
          {filteredBookings.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {filteredBookings.length} reserva{filteredBookings.length !== 1 ? 's' : ''} · {confirmed.length} aprobada{confirmed.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      <div className="mb-8 overflow-x-auto pb-2 scrollbar-hide">
        <div className="flex items-center gap-2 min-w-max">
          {[
            { id: 'todas', label: 'Todas' },
            { id: 'hoy', label: 'Hoy' },
            { id: 'pasados_3', label: 'Últimos 3 días' },
            { id: 'pasados_7', label: 'Últimos 7 días' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setDateFilter(f.id as any)}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-all active:scale-95 ${dateFilter === f.id
                ? 'bg-primary text-white shadow-md'
                : 'bg-secondary text-foreground hover:bg-border border border-border'
                }`}
            >
              {f.label}
            </button>
          ))}
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
                {(selectedTicket.pitches?.media_urls?.[0] || selectedTicket.pitches?.image_url) && (
                  <div style={{ marginBottom: 16, borderRadius: 12, overflow: 'hidden', height: 160 }}>
                    <img
                      src={selectedTicket.pitches.media_urls?.[0] || selectedTicket.pitches.image_url}
                      alt={selectedTicket.pitches.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }}
                    />
                  </div>
                )}
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', opacity: 0.8, marginBottom: 4 }}>TICKET DE RESERVA</p>
                <h2 style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.1, marginBottom: 8 }}>{selectedTicket.pitches.name}</h2>
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
                    <p style={{ fontWeight: 700, color: '#fff', textTransform: 'capitalize' }}>{user?.email?.split('@')[0] || 'Usuario'}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', marginBottom: 4 }}>ESTADO</p>
                    <p style={{ fontWeight: 700, color: selectedTicket.status === 'confirmed' ? '#34D399' : selectedTicket.status === 'pending' ? '#FBBF24' : '#F87171' }}>
                      {selectedTicket.status === 'pending' ? 'Revisión...' : selectedTicket.status === 'confirmed' ? 'Confirmada ✓' : 'Cancelada'}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', marginBottom: 4 }}>FECHA</p>
                    <p style={{ fontWeight: 700, color: '#fff', fontSize: 13, textTransform: 'capitalize' }}>
                      {new Date(selectedTicket.start_time).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', marginBottom: 4 }}>HORARIO</p>
                    <p style={{ fontWeight: 700, color: '#fff', fontSize: 13 }}>
                      {new Date(selectedTicket.start_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: '#6B7280' }}>🔗</span>
                  <span style={{ fontSize: 10, color: '#1DB954', fontWeight: 600, letterSpacing: '0.02em' }}>
                    {typeof window !== 'undefined' ? window.location.hostname : 'haycancha.app'}/cancha/{selectedTicket.pitch_id?.split('-')[0] || '...'}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => handleShareWhatsApp(selectedTicket)}
              disabled={isSharing}
              className="w-full py-4 bg-[#1DB954] hover:bg-[#1DB954]/90 disabled:bg-[#1DB954]/60 text-white font-black rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg"
            >
              {isSharing ? <Loader2 size={18} className="animate-spin" /> : <Share2 size={18} />}
              {isSharing ? 'Generando ticket...' : 'Compartir por WhatsApp'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
