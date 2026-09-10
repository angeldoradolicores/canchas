'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import {
  Loader2, CheckCircle, XCircle, FileText, CalendarDays,
  LayoutList, Calendar as CalendarIcon, Plus, X, Download, Clock,
  ChevronLeft, ChevronRight, Wrench, Search, AlertTriangle
} from 'lucide-react';
import { useToday } from '@/lib/use-today';
import { ManualBookingModal } from '@/components/booking/ManualBookingModal';
import { CustomMonthCalendar } from '@/components/explore/CustomMonthCalendar';

const TIME_SLOTS = [
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'
];

type CalendarView = 'day' | 'week' | 'biweek' | 'month';

// Convierte cualquier fecha/ISO a "YYYY-MM-DD" respetando la zona horaria de Colombia
function getLocalDateString(dateInput: string | Date): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}


export default function BookingsPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [pitches, setPitches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const supabase = createClient();
  const today = useToday();

  const [viewMode, setViewMode] = useState<'list' | 'schedule'>('list');
  const [calView, setCalView] = useState<CalendarView>('day');
  const [selectedDate, setSelectedDate] = useState('');
  const [showManualBooking, setShowManualBooking] = useState(false);
  const [proofUrl, setProofUrl] = useState('');

  // Estados de Filtros
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [listDateFilter, setListDateFilter] = useState<'all' | 'selected'>('selected');

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (today && !selectedDate) setSelectedDate(today);
  }, [today]);

  useEffect(() => {
    if (user) fetchBookingsAndPitches();
  }, [user]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setIsCalendarOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchBookingsAndPitches = useCallback(async () => {
    try {
      setLoading(true);
      const { data: company } = await supabase
        .from('companies')
        .select('id')
        .eq('owner_id', user!.id)
        .single();

      if (company) {
        const { data: pitchesData } = await supabase
          .from('pitches')
          .select('*')
          .eq('company_id', company.id);
        if (pitchesData) setPitches(pitchesData);

        const { data: bookingsData } = await supabase
          .from('bookings')
          .select(`*, pitches!inner (name, company_id)`)
          .eq('pitches.company_id', company.id)
          .neq('status', 'draft')
          .order('start_time', { ascending: false });

        if (bookingsData) setBookings(bookingsData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user, supabase]);

  const [cancelConfirm, setCancelConfirm] = useState<{ id: string; name: string; time: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const updateStatus = async (id: string, newStatus: 'confirmed' | 'cancelled') => {
    const updatePayload: Record<string, any> = {
      status: newStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user!.id,
    };
    if (newStatus === 'confirmed') updatePayload.payment_status = 'verified';
    if (newStatus === 'cancelled') updatePayload.payment_status = 'rejected';

    const { error } = await supabase.from('bookings').update(updatePayload).eq('id', id);
    if (!error) {
      setBookings(prev => prev.map(b => b.id === id ? { ...b, ...updatePayload } : b));

      // Notificar al cliente inmediatamente a través de la tabla de notificaciones
      const target = bookings.find(b => b.id === id);
      if (target?.user_id) {
        try {
          const isApproved = newStatus === 'confirmed';
          const startTime = new Date(target.start_time);
          const timeStr = startTime.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
          const dateStr = startTime.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' });

          await supabase.from('notifications').insert({
            user_id: target.user_id,
            sender_id: user?.id,
            title: isApproved ? '🎉 ¡Reserva Confirmada!' : '⚠️ Reserva Cancelada',
            message: isApproved
              ? `Tu reserva para el ${dateStr} a las ${timeStr} fue confirmada por el dueño. ¡A jugar!`
              : `Tu solicitud de reserva para el ${dateStr} a las ${timeStr} fue cancelada por el establecimiento.`,
            type: 'booking_status',
            is_read: false,
          });
        } catch (notifErr) {
          console.error('[Notification insert error]', notifErr);
        }
      }
    } else {
      alert('Error: ' + error.message);
    }
  };

  const handleCancelRequest = (booking: any) => {
    const startTime = new Date(booking.start_time);
    const timeStr = startTime.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
    const dateStr = startTime.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
    setCancelConfirm({
      id: booking.id,
      name: booking.customer_name || 'Anónimo',
      time: `${dateStr} · ${timeStr}`,
    });
  };

  const confirmCancel = async () => {
    if (!cancelConfirm) return;
    setCancelling(true);
    await updateStatus(cancelConfirm.id, 'cancelled');
    setCancelling(false);
    setCancelConfirm(null);
  };

  // Genera el rango de fechas continuas "YYYY-MM-DD" sin errores de zona horaria
  const getDaysRange = useCallback((startDate: string, view: CalendarView): string[] => {
    if (!startDate || view === 'month') return [];
    const count = view === 'day' ? 1 : view === 'week' ? 7 : 15;
    const result: string[] = [];

    const [y, m, d] = startDate.split('-').map(Number);
    const baseDate = new Date(y, m - 1, d);

    for (let i = 0; i < count; i++) {
      const nextDate = new Date(baseDate);
      nextDate.setDate(baseDate.getDate() + i);
      result.push(getLocalDateString(nextDate));
    }
    return result;
  }, []);

  // Filtrado Unificado para la Lista
  const filteredBookings = useMemo(() => {
    const rangeDates = getDaysRange(selectedDate, calView);

    return bookings.filter(b => {
      // 1. Filtro por estado / origen
      let matchStatus = true;
      if (filterStatus === 'manual') {
        matchStatus = b.source === 'owner_panel';
      } else if (filterStatus !== 'all') {
        matchStatus = b.status === filterStatus;
      }

      // 2. Filtro por Fecha con Zona Horaria Exacta
      let matchDate = true;
      if (listDateFilter === 'selected' && selectedDate) {
        const bookingDateStr = getLocalDateString(b.start_time);

        if (calView === 'month') {
          matchDate = bookingDateStr.substring(0, 7) === selectedDate.substring(0, 7);
        } else {
          matchDate = rangeDates.includes(bookingDateStr);
        }
      }

      // 3. Búsqueda por Texto
      let matchQuery = true;
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const customerName = (b.customer_name || '').toLowerCase();
        const customerPhone = (b.customer_phone || '').toLowerCase();
        const pitchName = (b.pitches?.name || '').toLowerCase();

        matchQuery = customerName.includes(query) || customerPhone.includes(query) || pitchName.includes(query);
      }

      return matchStatus && matchDate && matchQuery;
    });
  }, [bookings, filterStatus, listDateFilter, selectedDate, calView, searchQuery, getDaysRange]);

  const formatSelectedDateText = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-4 space-y-4">
      {/* Header Principal */}
      <div className="card-heading flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Gestión de Reservas</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Administra abonos, estados y disponibilidad de tus canchas.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
          <div className="flex bg-secondary p-1 rounded-xl border border-border flex-1 sm:flex-initial">
            <button
              onClick={() => setViewMode('list')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-card text-primary shadow-sm border border-border/60' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <LayoutList size={15} /> Lista
            </button>
            <button
              onClick={() => setViewMode('schedule')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'schedule' ? 'bg-card text-primary shadow-sm border border-border/60' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <CalendarIcon size={15} /> Horarios
            </button>
          </div>
          <button
            onClick={() => setShowManualBooking(true)}
            className="btn-primary py-2 px-4 flex items-center justify-center gap-2 text-xs font-bold rounded-xl w-full sm:w-auto"
          >
            <Plus size={16} /> Nueva Reserva
          </button>
        </div>
      </div>

      {/* Control Superior de Fecha y Filtros de Rango */}
      <div className="bg-card p-3 rounded-2xl border border-border shadow-sm flex flex-wrap items-center justify-between gap-3">
        {/* Selector de Fecha Flotante */}
        <div className="relative" ref={calendarRef}>
          <button
            onClick={() => setIsCalendarOpen(!isCalendarOpen)}
            className="flex items-center gap-2 px-3 py-2 bg-secondary/80 hover:bg-secondary border border-border rounded-xl text-xs font-bold transition-all"
          >
            <CalendarIcon size={16} className="text-primary" />
            <span>Fecha: <strong className="text-foreground capitalize">{selectedDate ? formatSelectedDateText(selectedDate) : 'Seleccionar'}</strong></span>
          </button>

          {isCalendarOpen && (
            <div className="absolute top-full left-0 mt-2 z-50 bg-card p-4 rounded-2xl border border-border shadow-2xl min-w-[280px] sm:min-w-[310px] animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-border">
                <span className="text-xs font-bold text-muted-foreground uppercase">Seleccionar Fecha</span>
                <button onClick={() => setIsCalendarOpen(false)} className="p-1 text-muted-foreground hover:text-foreground rounded-lg">
                  <X size={16} />
                </button>
              </div>

              <CustomMonthCalendar
                selectedDate={selectedDate}
                onSelectDate={(date) => {
                  setSelectedDate(date);
                  setListDateFilter('selected');
                  setIsCalendarOpen(false);
                }}
                minDate={undefined}
              />

              {viewMode === 'list' && (
                <div className="pt-3 border-t border-border mt-2 flex gap-2">
                  <button
                    onClick={() => { setListDateFilter('all'); setIsCalendarOpen(false); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all ${listDateFilter === 'all' ? 'bg-primary text-white border-primary' : 'bg-secondary text-muted-foreground'}`}
                  >
                    Ver Todas
                  </button>
                  <button
                    onClick={() => { setListDateFilter('selected'); setIsCalendarOpen(false); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all ${listDateFilter === 'selected' ? 'bg-primary text-white border-primary' : 'bg-secondary text-muted-foreground'}`}
                  >
                    Filtrar por Rango
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Botones de Rango (Día, Semana, 15 Días, Mes) */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          {[
            { key: 'day', label: 'Día', icon: '' },
            { key: 'week', label: 'Semana', icon: '' },
            { key: 'biweek', label: '15 Días', icon: '' },
            { key: 'month', label: 'Mes', icon: '' },
          ].map(v => (
            <button
              key={v.key}
              onClick={() => {
                setCalView(v.key as CalendarView);
                if (listDateFilter === 'all') setListDateFilter('selected');
              }}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${calView === v.key ? 'bg-primary/10 border-primary text-primary shadow-sm' : 'bg-secondary/40 border-transparent text-muted-foreground hover:bg-secondary'}`}
            >
              <span>{v.icon}</span>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 size={30} className="animate-spin text-primary" /></div>
      ) : viewMode === 'list' ? (
        /* Vista de Lista */
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-card p-2 rounded-2xl border border-border shadow-sm">
            {/* Buscador */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
              <input
                type="text"
                placeholder="Buscar cliente, teléfono o cancha..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-secondary/50 border border-border rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            {/* Pills de Estado */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {[
                { key: 'all', label: 'Todas' },
                { key: 'pending', label: 'Pendientes', color: 'bg-amber-500' },
                { key: 'confirmed', label: 'Confirmadas', color: 'bg-emerald-500' },
                { key: 'manual', label: 'Manuales', color: 'bg-purple-500' },
                { key: 'cancelled', label: 'Canceladas', color: 'bg-rose-500' },
              ].map((st) => {
                const isActive = filterStatus === st.key;
                const rangeDates = getDaysRange(selectedDate, calView);

                const count = bookings.filter(b => {
                  const matchSt = st.key === 'manual' ? b.source === 'owner_panel' : st.key === 'all' || b.status === st.key;
                  let matchDt = true;

                  if (listDateFilter === 'selected' && selectedDate) {
                    const bDate = getLocalDateString(b.start_time);
                    if (calView === 'month') {
                      matchDt = bDate.substring(0, 7) === selectedDate.substring(0, 7);
                    } else {
                      matchDt = rangeDates.includes(bDate);
                    }
                  }
                  return matchSt && matchDt;
                }).length;

                return (
                  <button
                    key={st.key}
                    onClick={() => setFilterStatus(st.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap border ${isActive
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-secondary/40 border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'
                      }`}
                  >
                    {st.color && <span className={`w-2 h-2 rounded-full ${st.color}`} />}
                    {st.label}
                    <span className="opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cards de Reservas — responsivo sin tabla */}
          {filteredBookings.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border text-center py-16 p-4">
              <p className="text-sm text-muted-foreground">No se encontraron reservas con los filtros seleccionados.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredBookings.map(b => {
                const startTime = new Date(b.start_time);
                const isManual = b.source === 'owner_panel';
                const statusColors = {
                  confirmed: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
                  pending: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
                  cancelled: 'bg-red-100 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
                };
                return (
                  <div key={b.id} className="bg-card rounded-2xl border border-border shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* Indicador de estado (izquierda en desktop) */}
                    <div className={`w-1.5 hidden sm:block self-stretch rounded-full flex-shrink-0 ${b.status === 'confirmed' ? 'bg-green-500' : b.status === 'pending' ? 'bg-amber-500' : 'bg-red-400'}`} />

                    {/* Info principal */}
                    <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
                      <div className="col-span-2 sm:col-span-1">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Cliente</p>
                        <p className="font-bold text-sm text-foreground capitalize">{b.customer_name || 'Anónimo'}</p>
                        {b.customer_phone && <p className="text-[11px] text-muted-foreground">{b.customer_phone}</p>}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Cancha</p>
                        <p className="font-semibold text-sm">{b.pitches?.name.toUpperCase() || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Fecha y Hora</p>
                        <p className="font-bold text-sm capitalize text-foreground">
                          {startTime.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Bogota' })}
                        </p>
                        <p className="text-xs text-primary font-bold">
                          {startTime.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })}
                        </p>
                      </div>
                    </div>

                    {/* Badges y acciones */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {isManual && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-md">
                          <Wrench size={10} /> Manual
                        </span>
                      )}
                      {b.payment_proof_url && (
                        <button onClick={() => setProofUrl(b.payment_proof_url)} className="inline-flex items-center gap-1 text-[10px] font-bold text-primary border border-primary/20 bg-primary/5 hover:bg-primary/15 px-2 py-0.5 rounded-md transition-colors">
                          <FileText size={10} /> Comprobante
                        </button>
                      )}
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg border ${statusColors[b.status as keyof typeof statusColors] || statusColors.cancelled}`}>
                        {b.status === 'pending' ? <><Clock size={10} /> Pendiente</> : b.status === 'confirmed' ? <><CheckCircle size={10} /> Confirmada</> : <><XCircle size={10} /> Cancelada</>}
                      </span>
                      {b.status === 'pending' && (
                        <div className="flex gap-1">
                          <button onClick={() => updateStatus(b.id, 'confirmed')} className="p-2 bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 rounded-xl transition-colors" title="Confirmar">
                            <CheckCircle size={16} />
                          </button>
                          <button onClick={() => handleCancelRequest(b)} className="p-2 bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 rounded-xl transition-colors" title="Rechazar">
                            <XCircle size={16} />
                          </button>
                        </div>
                      )}
                      {b.status === 'confirmed' && (
                        <button onClick={() => handleCancelRequest(b)} className="p-2 bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 rounded-xl transition-colors" title="Cancelar reserva">
                          <XCircle size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      ) : (
        /* Vista de Horarios (Día individual o Matriz Vertical de Horas x Columnas de Días) */
        <div className="space-y-4">
          {calView === 'month' ? (
            <div className="bg-card p-4 rounded-2xl border border-border shadow-sm">
              <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><CalendarDays size={16} className="text-primary" /> Resumen Mensual</h3>
              <p className="text-xs text-muted-foreground mb-4">Haz clic sobre cualquier día para inspeccionar el horario de ese día.</p>
              <div className="grid grid-cols-7 gap-1">
                <MonthlyBookingSummary bookings={bookings} selectedDate={selectedDate} onSelectDate={(d) => { setSelectedDate(d); setCalView('day'); }} />
              </div>
            </div>
          ) : (
            <>
              {calView === 'day' && (
                <div className="flex items-center justify-between bg-card p-2 px-3 rounded-2xl border border-border shadow-sm">
                  <button onClick={() => {
                    const [y, m, d] = selectedDate.split('-').map(Number);
                    const dt = new Date(y, m - 1, d - 1);
                    setSelectedDate(getLocalDateString(dt));
                  }} className="p-1.5 rounded-xl border border-border hover:bg-secondary transition-colors">
                    <ChevronLeft size={16} />
                  </button>
                  <p className="text-xs sm:text-sm font-bold capitalize text-foreground">
                    {selectedDate ? formatSelectedDateText(selectedDate) : ''}
                  </p>
                  <button onClick={() => {
                    const [y, m, d] = selectedDate.split('-').map(Number);
                    const dt = new Date(y, m - 1, d + 1);
                    setSelectedDate(getLocalDateString(dt));
                  }} className="p-1.5 rounded-xl border border-border hover:bg-secondary transition-colors">
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}

              {pitches.map(pitch => (
                calView === 'day' ? (
                  <PitchScheduleCard
                    key={pitch.id}
                    pitch={pitch}
                    selectedDate={selectedDate}
                    supabase={supabase}
                    onCancel={updateStatus}
                    onCancelRequest={handleCancelRequest}
                    onViewProof={(url: string) => setProofUrl(url)}
                  />
                ) : (
                  <PitchGridMatrixCard
                    key={pitch.id}
                    pitch={pitch}
                    dates={getDaysRange(selectedDate, calView)}
                    supabase={supabase}
                    onDayClick={(dateStr: string) => { setSelectedDate(dateStr); setCalView('day'); }}
                    onViewProof={(url: string) => setProofUrl(url)}
                  />
                )
              ))}
              {pitches.length === 0 && (
                <div className="text-center py-12 text-sm text-muted-foreground bg-card rounded-2xl border border-border">No hay canchas registradas.</div>
              )}
            </>
          )}
        </div>
      )}

      {showManualBooking && (
        <ManualBookingModal
          pitches={pitches}
          onClose={() => setShowManualBooking(false)}
          onSuccess={() => { setShowManualBooking(false); fetchBookingsAndPitches(); }}
        />
      )}

      {/* ── Modal de Confirmación de Cancelación ── */}
      {cancelConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card w-full max-w-md rounded-3xl shadow-2xl border border-border p-6 sm:p-7 animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center shrink-0">
                <AlertTriangle size={24} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-black text-lg text-foreground tracking-tight">¿Cancelar reserva?</h3>
                <p className="text-xs text-muted-foreground">El horario se liberará de inmediato</p>
              </div>
            </div>

            <div className="bg-secondary/50 rounded-2xl p-4 border border-border/60 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-semibold">Cliente:</span>
                <span className="font-black text-foreground capitalize text-sm">{cancelConfirm.name}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-semibold">Fecha y Hora:</span>
                <span className="font-bold text-primary">{cancelConfirm.time}</span>
              </div>
              <p className="text-[11px] text-muted-foreground/90 pt-2 border-t border-border/50 leading-relaxed">
                Esta acción cancelará la reserva en el calendario y permitirá que el espacio vuelva a estar disponible para nuevos partidos o reservas manuales.
              </p>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={confirmCancel}
                disabled={cancelling}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 active:scale-98 text-white text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                {cancelling ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                <span>{cancelling ? 'Cancelando...' : 'Sí, cancelar'}</span>
              </button>
              <button
                type="button"
                onClick={() => setCancelConfirm(null)}
                disabled={cancelling}
                className="flex-1 py-3 rounded-xl border border-border bg-secondary/80 hover:bg-secondary active:scale-98 text-foreground text-xs sm:text-sm font-bold transition-all text-center"
              >
                No, mantener
              </button>
            </div>
          </div>
        </div>
      )}

      {proofUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="absolute top-4 right-4 flex gap-2">
            <a href={proofUrl} download="comprobante" target="_blank" rel="noreferrer" className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors" title="Descargar">
              <Download size={20} />
            </a>
            <button onClick={() => setProofUrl('')} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
              <X size={20} />
            </button>
          </div>
          <img src={proofUrl} alt="Comprobante" className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}

function MonthlyBookingSummary({ bookings, selectedDate, onSelectDate }: { bookings: any[], selectedDate: string, onSelectDate: (d: string) => void }) {
  if (!selectedDate) return null;
  const [year, month] = selectedDate.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();

  const bookingsByDate: Record<string, number> = {};
  bookings.forEach(b => {
    if (b.status === 'cancelled') return;
    const dateStr = getLocalDateString(b.start_time);
    if (dateStr) bookingsByDate[dateStr] = (bookingsByDate[dateStr] || 0) + 1;
  });

  const WEEKDAYS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  return (
    <>
      {WEEKDAYS.map(w => <div key={w} className="text-center text-[10px] font-bold text-muted-foreground py-1">{w}</div>)}
      {Array(firstWeekday).fill(null).map((_, i) => <div key={`b${i}`} />)}
      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
        const monthStr = month.toString().padStart(2, '0');
        const dayStr = day.toString().padStart(2, '0');
        const dateStr = `${year}-${monthStr}-${dayStr}`;
        const count = bookingsByDate[dateStr] || 0;
        const isSelected = selectedDate === dateStr;
        return (
          <button key={dateStr} onClick={() => onSelectDate(dateStr)}
            className={`relative p-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center border ${isSelected ? 'bg-primary text-white border-primary shadow-sm' : 'border-border/40 hover:bg-secondary text-foreground'}`}>
            {day}
            {count > 0 && <span className={`w-1.5 h-1.5 rounded-full mt-1 ${isSelected ? 'bg-white' : 'bg-primary'}`} />}
          </button>
        );
      })}
    </>
  );
}

// ─── Mini countdown timer para slots en proceso ───────────────────────────
function SlotCountdown({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [secs, setSecs] = useState(() => {
    const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  useEffect(() => {
    if (secs <= 0) { onExpire(); return; }
    const id = setInterval(() => setSecs(s => {
      if (s <= 1) { onExpire(); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(id);
  }, []);

  if (secs <= 0) return <span className="text-[8px] text-orange-500 font-bold">Liberando...</span>;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return (
    <span className="font-mono font-black text-[9px] text-orange-600 dark:text-orange-400">
      {m}:{s.toString().padStart(2, '0')}
    </span>
  );
}

function PitchScheduleCard({ pitch, selectedDate, supabase, onCancel, onCancelRequest, onViewProof }: any) {
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [realtimeOk, setRealtimeOk] = useState(false);

  const fetchSlots = useCallback(async () => {
    if (!selectedDate) return;
    setLoading(true);
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('pitch_id', pitch.id)
      .gte('start_time', `${selectedDate}T00:00:00-05:00`)
      .lte('start_time', `${selectedDate}T23:59:59-05:00`)
      .neq('status', 'cancelled');
    setSlots(data || []);
    setLastRefresh(new Date());
    setLoading(false);
  }, [selectedDate, pitch.id, supabase]);

  // Carga inicial
  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  // Auto-refresh cada 2 segundos (crítico para evitar doble reserva)
  useEffect(() => {
    const interval = setInterval(() => { fetchSlots(); }, 2000);
    return () => clearInterval(interval);
  }, [fetchSlots]);

  // Supabase Realtime — cambios inmediatos sin esperar el polling
  useEffect(() => {
    const channel = supabase
      .channel(`schedule:${pitch.id}:${selectedDate}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `pitch_id=eq.${pitch.id}` },
        () => { fetchSlots(); }
      )
      .subscribe((status: string) => {
        setRealtimeOk(status === 'SUBSCRIBED');
      });
    return () => { supabase.removeChannel(channel); };
  }, [pitch.id, selectedDate, supabase, fetchSlots]);

  return (
    <div className="bg-card p-4 rounded-2xl border border-border shadow-sm">
      <div className="flex items-center justify-between mb-3 border-b border-border pb-2.5">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <div className="w-2 h-4 bg-primary rounded-full" /> {pitch.name}
        </h3>
      <div className="flex items-center gap-2">
          {loading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
          <button
            onClick={fetchSlots}
            title="Actualizar disponibilidad"
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
          >
            <Clock size={13} />
          </button>
          <div className="flex items-center gap-1.5">
            <span
              title={realtimeOk ? 'Tiempo real activo' : 'Tiempo real desconectado'}
              className={`w-2 h-2 rounded-full ${realtimeOk ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/40'}`}
            />
            <span className="text-[9px] text-muted-foreground hidden sm:block">
              {lastRefresh.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-2 mb-3 text-[9px] font-bold uppercase tracking-wide">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary/10 border border-primary/40 inline-block" />Reservado</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-50 border border-purple-300 dark:bg-purple-950/40 inline-block" />Manual</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-300 dark:bg-amber-950/30 inline-block" />Pendiente</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-50 border border-orange-300 dark:bg-orange-950/30 inline-block" />En proceso</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-card border border-border/80 inline-block" />Libre</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {TIME_SLOTS.map(slot => {
          const slotBooking = slots.find(b => {
            const bDate = new Date(b.start_time);
            const parts = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(bDate);
            let hh = parts.find(p => p.type === 'hour')?.value;
            const mm = parts.find(p => p.type === 'minute')?.value;
            if (hh === '24') hh = '00';
            return `${hh}:${mm}` === slot;
          });

          const hNum = parseInt(slot.split(':')[0]);
          const h12 = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum;
          const ampm = hNum < 12 ? 'am' : 'pm';

          const isDraft = slotBooking?.status === 'draft';
          const draftExpired = isDraft && slotBooking?.expires_at && new Date(slotBooking.expires_at) < new Date();
          const effectiveBooking = isDraft && draftExpired ? null : slotBooking;
          const isManual = effectiveBooking?.source === 'owner_panel';

          const allowedSlots = pitch.custom_pricing?.time_slots || TIME_SLOTS;
          const isOperating = allowedSlots.includes(slot);

          let bgClass = 'bg-card border-border/80';
          if (!isOperating && !effectiveBooking) {
            bgClass = 'bg-red-50/50 border-red-200/50 dark:bg-red-950/20';
          } else if (effectiveBooking) {
            if (effectiveBooking.status === 'draft') bgClass = 'bg-orange-50 border-orange-300 dark:bg-orange-950/30';
            else if (effectiveBooking.status === 'pending') bgClass = 'bg-amber-50 border-amber-300 dark:bg-amber-950/30';
            else if (isManual) bgClass = 'bg-purple-50 border-purple-300 dark:bg-purple-950/30';
            else bgClass = 'bg-primary/10 border-primary/40';
          }

          return (
            <div key={slot} className={`relative p-2 rounded-xl border text-center transition-all flex flex-col justify-center min-h-[72px] ${bgClass}`}>
              <span className={`font-bold text-xs block leading-tight ${effectiveBooking ? 'text-foreground' : (!isOperating ? 'text-red-400/50' : 'text-muted-foreground')}`}>{h12}:00</span>
              <span className={`text-[9px] uppercase opacity-60 font-semibold ${!isOperating && !effectiveBooking ? 'text-red-400/50' : ''}`}>{ampm}</span>

              {!isOperating && !effectiveBooking && (
                <div className="mt-1 text-[9px] font-bold text-red-500/60 leading-tight">Cerrado</div>
              )}

              {effectiveBooking?.status === 'draft' && effectiveBooking.expires_at && (
                <div className="mt-1 flex flex-col items-center gap-0.5">
                  <Clock size={10} className="text-orange-500 animate-pulse" />
                  <SlotCountdown
                    expiresAt={effectiveBooking.expires_at}
                    onExpire={fetchSlots}
                  />
                  <span className="text-[8px] text-orange-500/80 font-semibold">En proceso</span>
                </div>
              )}

              {effectiveBooking && effectiveBooking.status !== 'draft' && (
                <div className="mt-1 text-[10px] font-semibold leading-tight space-y-0.5">
                  <div className="truncate text-foreground font-bold text-[9px]" title={effectiveBooking.customer_name}>
                    {effectiveBooking.customer_name || '—'}
                  </div>
                  {isManual ? (
                    <div className="flex items-center gap-0.5 text-purple-600 dark:text-purple-400 justify-center text-[9px]">
                      <Wrench size={8} /> Manual
                    </div>
                  ) : (
                    <div className={`rounded px-1 py-0.5 inline-block text-[9px] font-bold ${effectiveBooking.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-primary/20 text-primary'}`}>
                      {effectiveBooking.status === 'pending' ? 'Pend.' : 'OK'}
                    </div>
                  )}
                  {effectiveBooking.payment_proof_url && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewProof?.(effectiveBooking.payment_proof_url);
                      }}
                      className="w-full flex items-center justify-center gap-1 text-[8px] font-bold text-primary border border-primary/20 bg-primary/10 hover:bg-primary/20 rounded py-0.5 transition-colors mt-0.5"
                      title="Ver comprobante de pago"
                    >
                      <FileText size={8} /> Comprobante
                    </button>
                  )}
                  {(effectiveBooking.status === 'confirmed' || effectiveBooking.status === 'pending') && (
                    <button
                      onClick={() => {
                        if (onCancelRequest) {
                          onCancelRequest(effectiveBooking);
                        } else {
                          onCancel(effectiveBooking.id, 'cancelled').then(() => fetchSlots());
                        }
                      }}
                      className="w-full text-[8px] bg-red-100 text-red-600 dark:bg-red-950/50 hover:bg-red-200 rounded py-0.5 transition-colors font-bold mt-1"
                      title="Cancelar"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


/* Matriz de Horarios en Grilla: Filas = Horas | Columnas = Días */
function PitchGridMatrixCard({ pitch, dates, supabase, onDayClick, onViewProof }: any) {
  const [allSlots, setAllSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!dates.length) return;
    const fetch = async () => {
      setLoading(true);
      const startDate = dates[0];
      const endDate = dates[dates.length - 1];

      const { data } = await supabase
        .from('bookings')
        .select('*')
        .eq('pitch_id', pitch.id)
        .gte('start_time', `${startDate}T00:00:00-05:00`)
        .lte('start_time', `${endDate}T23:59:59-05:00`)
        .neq('status', 'cancelled');

      setAllSlots(data || []);
      setLoading(false);
    };
    fetch();
  }, [dates, pitch.id, supabase]);

  return (
    <div className="bg-card p-4 rounded-2xl border border-border shadow-sm">
      <div className="flex items-center justify-between mb-3 border-b border-border pb-2.5">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <div className="w-2 h-4 bg-primary rounded-full" /> {pitch.name}
        </h3>
        {loading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Encabezado de Columnas por Días */}
          <div
            className="grid gap-1 pb-2 border-b border-border sticky top-0 bg-card z-10"
            style={{ gridTemplateColumns: `60px repeat(${dates.length}, minmax(90px, 1fr))` }}
          >
            <div className="text-[10px] font-bold text-muted-foreground flex items-center justify-center">HORA</div>
            {dates.map((dateStr: string) => {
              const [y, m, d] = dateStr.split('-').map(Number);
              const dt = new Date(y, m - 1, d);
              const dayName = dt.toLocaleDateString('es-CO', { weekday: 'short' });

              return (
                <button
                  key={dateStr}
                  onClick={() => onDayClick(dateStr)}
                  className="p-1 rounded-xl hover:bg-secondary transition-colors text-center border border-border/40"
                >
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">{dayName}</div>
                  <div className="text-xs font-bold text-primary">{d}/{m}</div>
                </button>
              );
            })}
          </div>

          {/* Filas por Horas de 06:00 a 23:00 */}
          <div className="divide-y divide-border/40 text-xs">
            {TIME_SLOTS.map((slot) => {
              const hNum = parseInt(slot.split(':')[0]);
              const h12 = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum;
              const ampm = hNum < 12 ? 'am' : 'pm';

              return (
                <div
                  key={slot}
                  className="grid gap-1 py-1 items-center hover:bg-secondary/20 transition-colors"
                  style={{ gridTemplateColumns: `60px repeat(${dates.length}, minmax(90px, 1fr))` }}
                >
                  {/* Etiqueta de la hora a la izquierda */}
                  <div className="text-[10px] font-bold text-muted-foreground text-center">
                    {h12}:00 <span className="text-[8px] uppercase">{ampm}</span>
                  </div>

                  {/* Celdas de cada día para esa hora específica */}
                  {dates.map((dateStr: string) => {
                    const slotBooking = allSlots.find(b => {
                      const bDateStr = getLocalDateString(b.start_time);
                      if (bDateStr !== dateStr) return false;

                      const bDate = new Date(b.start_time);
                      const parts = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(bDate);
                      let hh = parts.find(p => p.type === 'hour')?.value;
                      const mm = parts.find(p => p.type === 'minute')?.value;
                      if (hh === '24') hh = '00';
                      return `${hh}:${mm}` === slot;
                    });

                    const isManual = slotBooking?.source === 'owner_panel';
                    const allowedSlots = pitch.custom_pricing?.time_slots || TIME_SLOTS;
                    const isOperating = allowedSlots.includes(slot);

                    let cellClass = 'bg-secondary/10 border-border/30 text-muted-foreground/40';
                    if (!isOperating && !slotBooking) {
                      cellClass = 'bg-red-50/50 border-red-200/50 text-red-500/50 dark:bg-red-950/20';
                    } else if (slotBooking) {
                      cellClass = isManual
                        ? 'bg-purple-100 dark:bg-purple-950/40 border-purple-300 text-purple-900 dark:text-purple-200'
                        : 'bg-primary/10 border-primary/40 text-foreground';
                    }

                    return (
                      <div
                        key={`${dateStr}-${slot}`}
                        className={`min-h-[36px] p-1 rounded-lg border flex flex-col justify-center text-center transition-all ${cellClass}`}
                      >
                        {slotBooking ? (
                          <div className="flex flex-col items-center">
                            <div className="text-[10px] font-bold leading-tight truncate w-full" title={slotBooking.customer_name}>
                              {slotBooking.customer_name || 'Reservado'}
                            </div>
                            {slotBooking.payment_proof_url && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onViewProof?.(slotBooking.payment_proof_url);
                                }}
                                className="mt-0.5 text-[8px] font-bold text-primary hover:underline flex items-center gap-0.5"
                                title="Ver comprobante de pago"
                              >
                                <FileText size={8} /> Comprobante
                              </button>
                            )}
                          </div>
                        ) : !isOperating ? (
                          <span className="text-[9px] font-bold leading-tight">Cerrado</span>
                        ) : (
                          <span className="text-[9px] opacity-20 font-medium">—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}