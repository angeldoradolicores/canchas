'use client';

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useToday, BOOKING_HOURS } from '@/lib/use-today';
import { CalendarDays, Grid2X2, ListFilter, Loader2, Search, Clock3, ChevronRight, ChevronDown, CheckCircle2 } from 'lucide-react';
import { Pitch } from '@/lib/types';
import { pitches as mockPitches } from '@/lib/mock-data';
import { DiscoverRail } from './DiscoverRail';
import { CustomMonthCalendar } from './CustomMonthCalendar';
import { CustomAlertModal, AlertModalState } from '@/components/ui/CustomAlertModal';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { Calendar, Clock } from "lucide-react";
const DEFAULT_TIME_SLOTS = [
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'
];

const DynamicMap = dynamic(() => import('./DynamicMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full rounded-2xl bg-[#e9f0e8] flex items-center justify-center border border-border" style={{ height: '420px' }}>
      <Loader2 size={32} className="animate-spin text-primary" />
    </div>
  ),
});

interface ExploreViewProps {
  onBook: (pitch: Pitch, preselectedTime?: string | string[], preselectedDate?: string) => void;
  onOpen: (pitch: Pitch) => void;
}
function fmtSlot(slot: string) {
  const h = parseInt(slot.split(':')[0]);
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:00 ${ampm}`;
}

function QuickTimer({ expiresAt }: { expiresAt: string }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));

  useEffect(() => {
    const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
    setSecs(Math.max(0, diff));
  }, [expiresAt]);

  useEffect(() => {
    if (secs <= 0) return;
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secs]);

  if (secs <= 0) return <span className="text-[10px] text-amber-500 font-bold">Liberando...</span>;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return <span className="font-mono font-black text-xs">{m}:{s.toString().padStart(2, '0')}</span>;
}

export function ExploreView({ onBook, onOpen }: ExploreViewProps) {
  const { user } = useAuth();
  const today = useToday();
  const supabase = createClient();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Todos');
  const [format, setFormat] = useState('Todos');
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCity, setSelectedCity] = useState('Pasto');
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]); // Inicializa como arreglo vacío

  const handleFormatToggle = (format: string) => {
    if (format === 'Todos') {
      setSelectedFormats([]); // Limpia el filtro para mostrar todos
      return;
    }

    setSelectedFormats(prev => {
      // Si ya está seleccionado, lo quitamos de la lista
      if (prev.includes(format)) {
        return prev.filter(f => f !== format);
      }
      // Si no está, lo agregamos a la lista
      return [...prev, format];
    });
  };

  const [alertState, setAlertState] = useState<AlertModalState>({ isOpen: false, type: 'info', title: '', message: '' });
  const handleSearchRef = useRef<(silent?: boolean) => void>(() => { });

  const handleBook = useCallback((pitch: Pitch, preselectedTime?: string | string[], preselectedDate?: string) => {
    if (!user) {
      setAlertState({
        isOpen: true,
        type: 'login_required',
        title: 'Inicia sesión para reservar',
        message: 'Debes iniciar sesión o crear una cuenta para poder reservar esta cancha.',
      });
      return;
    }

    if (preselectedTime && Array.isArray(preselectedTime) && preselectedDate) {
      const hoursCount = preselectedTime.length;
      const customPricing = (pitch as any).custom_pricing || {};
      const basePrice = Number((pitch as any).price_per_hour || 0);

      const total = preselectedTime.reduce((sum, h) => {
        return sum + Number(customPricing[h] || basePrice);
      }, 0);

      const formattedDate = new Date(preselectedDate + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

      // let abonoPrice = 0;
      // const isFixed = customPricing && customPricing.booking_fixed;
      // if (isFixed) {
      //   abonoPrice = (customPricing.booking_fixed || 0) * hoursCount;
      // } else {
      //   abonoPrice = (total * Number((pitch as any).booking_percentage || 50)) / 100;
      // }
      // const abonoText = isFixed
      //   ? `(Fijo: $${(customPricing.booking_fixed || 0).toLocaleString('es-CO')}/h)`
      //   : `(${Number((pitch as any).booking_percentage || 50)}%)`;
      let abonoPrice = 0;
      // 1. Validamos si el tipo de abono es explícitamente 'fixed'
      const isFixed = customPricing?.booking_type === 'fixed';

      if (isFixed) {
        // Multiplica la tarifa fija por la cantidad de horas seleccionadas
        abonoPrice = Number(customPricing.booking_fixed || 0) * hoursCount;
      } else {
        // Si no es fijo, usa el porcentaje asignado o falla de vuelta a 50% por defecto
        const percentage = Number(customPricing?.booking_percentage || (pitch as any).booking_percentage || 50);
        abonoPrice = (total * percentage) / 100;
      }

      // 2. Construimos el texto dinámico usando exactamente tu misma lógica de renderizado
      const abonoText = isFixed
        ? `(Fijo: $${Number(customPricing.booking_fixed || 0).toLocaleString('es-CO')}/h)`
        : `(${Number(customPricing?.booking_percentage || (pitch as any).booking_percentage || 50)}%)`;


      const messageNode = (
        <div className="flex flex-col gap-3 items-center text-center mt-2">
          <p className="text-sm text-muted-foreground">Estás a punto de iniciar una reserva en:</p>
          <p className="text-xl font-black uppercase text-primary bg-primary/10 px-5 py-2.5 rounded-xl border border-primary/20 tracking-wider w-full shadow-sm">
            {pitch.name}
          </p>
          <div className="bg-secondary/60 border border-border rounded-xl p-3.5 w-full space-y-2 mt-1">
            <p className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground font-bold flex items-center gap-1"><Calendar size={13} /> Fecha</span>
              <span className="font-bold text-foreground capitalize">{formattedDate}</span>
            </p>
            <div className="summary-line flex-col items-start gap-1.5">
              <span>Desglose de Horas</span>
              {preselectedTime.length === 0 ? (
                <strong className="text-muted-foreground">-</strong>
              ) : (
                <div className="w-full space-y-1 mt-1">
                  {[...preselectedTime].sort().map(t => {
                    const slotPrice = Number(customPricing[t] || basePrice);
                    return (
                      <div key={t} className="flex justify-between text-xs bg-primary/5 px-2 py-1 rounded-md">
                        <span className="font-bold text-primary">{fmtSlot(t)}</span>
                        <span className="font-semibold">${slotPrice.toLocaleString('es-CO')}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* <p className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground font-bold flex items-center gap-1"><Clock size={13} /> Horas</span>
              <span className="font-bold text-foreground">{preselectedTime.join(', ')} ({hoursCount}h)</span>
            </p> */}
            <div className="border-t border-border/60 mt-2 pt-2 flex justify-between items-center">
              <span className="text-muted-foreground font-bold uppercase text-[10px] tracking-wider">Total Estimado</span>
              <span className="font-black text-emerald-600 dark:text-emerald-400 text-base">${total.toLocaleString('es-CO')}</span>
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
              ) : (customPricing?.booking_percentage || (pitch as any).booking_percentage) ? ( // 👈 Cambiado aquí
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

          // Verificación de conflicto en tiempo real antes de iniciar la reserva
          if (preselectedDate && Array.isArray(preselectedTime) && preselectedTime.length > 0) {
            const dayStartISO = `${preselectedDate}T00:00:00-05:00`;
            const dayEndISO = `${preselectedDate}T23:59:59-05:00`;

            const { data: conflicts } = await supabase
              .from('bookings')
              .select('start_time, status, expires_at')
              .eq('pitch_id', pitch.id)
              .gte('start_time', dayStartISO)
              .lte('start_time', dayEndISO)
              .neq('status', 'cancelled');

            const now = new Date();
            const isTaken = (conflicts || []).some((b: any) => {
              let bHour: string;
              try {
                const d = new Date(b.start_time);
                const localH = (d.getUTCHours() - 5 + 24) % 24;
                bHour = `${String(localH).padStart(2, '0')}:00`;
              } catch {
                bHour = b.start_time?.substring(11, 16) || '';
              }

              if (preselectedTime.includes(bHour)) {
                if (b.status === 'confirmed' || b.status === 'pending') return true;
                if (b.status === 'draft' && b.expires_at && new Date(b.expires_at) > now) return true;
              }
              return false;
            });

            if (isTaken) {
              setAlertState({
                isOpen: true,
                type: 'error',
                title: 'Horario no disponible',
                message: 'Lo sentimos, esta cancha acaba de ser reservada o bloqueada por otro usuario. Hemos actualizado la disponibilidad.',
              });
              handleSearchRef.current(true);
              return;
            }
          }

          onBook(pitch, preselectedTime, preselectedDate);
        }
      });
      return;
    }

    onBook(pitch, preselectedTime, preselectedDate);
  }, [user, onBook, supabase]);

  const showAlert = (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => {
    setAlertState({ isOpen: true, type, title, message });
  };

  const closeAlert = () => {
    setAlertState(prev => ({ ...prev, isOpen: false }));
  };

  // Leer la ciudad seleccionada al montar y escuchar cambios
  useEffect(() => {
    const saved = localStorage.getItem('selectedCity');
    if (saved) setSelectedCity(saved);

    const handler = (e: any) => {
      if (e.detail) setSelectedCity(e.detail);
    };
    window.addEventListener('cityChange', handler);
    return () => window.removeEventListener('cityChange', handler);
  }, []);

  // Reserva rápida
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedHours, setSelectedHours] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<Pitch[] | null>(null);
  const [inProgressResults, setInProgressResults] = useState<Array<Pitch & { expiresAt: string; slot: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [showCalendarWidget, setShowCalendarWidget] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<'format' | null>(null);
  const [activeTimeCategory, setActiveTimeCategory] = useState<'manana' | 'tarde' | 'noche'>('noche');

  // Próximas 6 fechas rápidas desde hoy
  const nextDays = useMemo(() => {
    if (!today) return [];
    const days = [];
    const base = new Date(today + 'T12:00:00');
    for (let i = 0; i < 6; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = i === 0 ? 'Hoy' : d.toLocaleDateString('es-CO', { weekday: 'short' });
      const dayNumber = d.getDate();
      const monthName = d.toLocaleDateString('es-CO', { month: 'short' });
      days.push({ dateStr, dayName, dayNumber, monthName, isToday: i === 0 });
    }
    return days;
  }, [today]);

  // Sincronizar fecha inicial con hoy (solo cliente)
  useEffect(() => {
    if (today && !selectedDate) setSelectedDate(today);
  }, [today]);

  useEffect(() => {
    const fetchPitches = async () => {
      const { data, error } = await supabase.from('pitches').select('*, companies(name, zone, lat, lng)');
      if (data && !error && data.length > 0) {
        const mapped = data.map((p: any) => ({
          ...p,
          zone: p.companies?.zone || 'Norte',
          distance: '1.2 km',
          rating: '4.8',
          reviews: 120,
          open: true,
          price: `$${p.price_per_hour?.toLocaleString('es-CO')}`,
          image: (Array.isArray(p.media_urls) && p.media_urls.length > 0)
            ? p.media_urls[0]
            : p.image_url || '/pasto-pitch-collection.png',
          amenity: p.amenities || 'Luces LED',
        }));
        setPitches(mapped as any);
      }
    };
    fetchPitches();
  }, []);

  const filtered = useMemo(() =>
    pitches.filter(p => {
      const pZone = ((p as any).zone || 'Norte').toLowerCase();
      let pCity = 'Pasto';

      const matchesCity = selectedCity === 'Todas' || pCity === selectedCity;
      const matchesQuery = `${p.name} ${(p as any).zone} ${(p as any).amenity} ${p.type}`
        .toLowerCase().includes(query.toLowerCase());

      // Filtro multi-modalidad: la cancha debe soportar AL MENOS UNO de los formatos seleccionados
      const pitchTypes: string[] = Array.isArray((p as any).supported_types)
        ? (p as any).supported_types
        : [p.type];
      const matchesFormat = selectedFormats.length === 0 ||
        selectedFormats.some(sf => pitchTypes.includes(sf));

      return matchesCity && matchesQuery && matchesFormat;
    }), [query, selectedFormats, pitches, selectedCity]);

  // ── Buscar disponibilidad (multi-hora) ────────────────────────────────────
  const handleSearch = useCallback(async (silent = false) => {
    if (!selectedDate) {
      if (!silent) showAlert('warning', 'Fecha requerida', 'Por favor selecciona la fecha.');
      return;
    }
    if (selectedHours.length === 0) {
      if (!silent) showAlert('warning', 'Hora requerida', 'Por favor selecciona al menos una hora.');
      return;
    }

    if (!silent) {
      setSearching(true);
      setSearchResults(null);
    }

    // Traer todas las reservas del día seleccionado (no canceladas)
    // Usar rango amplio del día completo para evitar problemas con offset horario
    const dayStartISO = `${selectedDate}T00:00:00-05:00`;
    const dayEndISO = `${selectedDate}T23:59:59-05:00`;

    const { data: bookings } = await supabase
      .from('bookings')
      .select('pitch_id, start_time, status, expires_at')
      .gte('start_time', dayStartISO)
      .lte('start_time', dayEndISO)
      .neq('status', 'cancelled');

    const now = new Date();
    const confirmedPitchIds = new Set<string>();
    const draftPitchMap = new Map<string, { expiresAt: string; slot: string }>();

    (bookings || []).forEach((b: any) => {
      let bHour: string;
      try {
        const d = new Date(b.start_time);
        const localH = (d.getUTCHours() - 5 + 24) % 24;
        bHour = `${String(localH).padStart(2, '0')}:00`;
      } catch {
        bHour = b.start_time?.substring(11, 16) || '';
      }

      if (selectedHours.includes(bHour)) {
        if (b.status === 'confirmed' || b.status === 'pending') {
          confirmedPitchIds.add(b.pitch_id);
        } else if (b.status === 'draft') {
          if (b.expires_at && new Date(b.expires_at) > now) {
            draftPitchMap.set(b.pitch_id, { expiresAt: b.expires_at, slot: bHour });
          }
        }
      }
    });

    const filteredByFormat = pitches.filter(p => {
      // Filtro multi-modalidad en reserva rápida: la cancha soporta al menos uno de los formatos elegidos
      if (selectedFormats.length > 0) {
        const pitchTypes: string[] = Array.isArray((p as any).supported_types)
          ? (p as any).supported_types
          : [p.type];
        const supportsAny = selectedFormats.some(sf => pitchTypes.includes(sf));
        if (!supportsAny) return false;
      }

      // Validar horarios operativos
      const allowedSlots = ((p as any).custom_pricing?.time_slots as string[]) || DEFAULT_TIME_SLOTS;
      const operatesInAllSelected = selectedHours.every(h => allowedSlots.includes(h));
      if (!operatesInAllSelected) return false;

      return true;
    });

    // Canchas disponibles: NO tienen reservas confirmadas ni borradores activos en las horas seleccionadas
    let available = filteredByFormat.filter(p => !confirmedPitchIds.has(p.id) && !draftPitchMap.has(p.id));
    if (!silent) {
      available = available.sort(() => Math.random() - 0.5);
    }

    // Canchas que están siendo reservadas con cronómetro activo
    let inProgress = filteredByFormat
      .filter(p => draftPitchMap.has(p.id) && !confirmedPitchIds.has(p.id))
      .map(p => ({
        ...p,
        expiresAt: draftPitchMap.get(p.id)!.expiresAt,
        slot: draftPitchMap.get(p.id)!.slot,
      }));

    if (!silent) {
      inProgress = inProgress.sort(() => Math.random() - 0.5);
    }

    setSearchResults(available);
    setInProgressResults(inProgress);

    // Auto-remove selected hours that are now taken (slot being reserved)
    // if (!silent) {
    //   const takenSlots = new Set<string>();
    //   (bookings || []).forEach((b: any) => {
    //     let bHour: string;
    //     try {
    //       const d = new Date(b.start_time);
    //       const localH = (d.getUTCHours() - 5 + 24) % 24;
    //       bHour = `${String(localH).padStart(2, '0')}:00`;
    //     } catch {
    //       bHour = b.start_time?.substring(11, 16) || '';
    //     }
    //     if (b.status === 'confirmed' || b.status === 'pending') {
    //       takenSlots.add(bHour);
    //     } else if (b.status === 'draft' && b.expires_at && new Date(b.expires_at) > now) {
    //       takenSlots.add(bHour);
    //     }
    //   });
    //   setSelectedHours(prev => prev.filter(h => !takenSlots.has(h)));
    // }

    if (!silent) {
      setSearching(false);
      if (available.length === 0 && inProgress.length === 0) {
        showAlert(
          'info',
          'Sin disponibilidad',
          'Todas las canchas están ocupadas en las horas seleccionadas. Prueba con otra fecha u horario.'
        );
      }

      setTimeout(() => {
        document.getElementById('search-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [selectedDate, selectedHours, pitches, selectedFormats, supabase]);

  useEffect(() => {
    handleSearchRef.current = handleSearch;
  }, [handleSearch]);

  // Sincronización en TIEMPO REAL sin recargar la página
  const hasResults = searchResults !== null;
  useEffect(() => {
    if (!hasResults || !selectedDate || selectedHours.length === 0) return;

    // Canal en tiempo real para escuchar cambios de reservas
    const channel = supabase
      .channel(`realtime:explore:bookings:${selectedDate}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => {
          handleSearchRef.current(true);
        }
      )
      .subscribe();

    // Verificación continua cada 5 segundos para reflejar expiración de borradores
    const interval = setInterval(() => {
      handleSearchRef.current(true);
    }, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
    // searchResults is intentionally excluded from deps to avoid remounting on every update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasResults, selectedDate, selectedHours, supabase]);

  const formattedSelectedDate = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  return (
    <section className="page-content explore-page">
      <CustomAlertModal alertState={alertState} onClose={closeAlert} />

      <div className="page-heading">
        <div>
          <p className="eyebrow accent-label">DESCUBRE TU PRÓXIMO PARTIDO</p>
          <h1>Encuentra tu cancha</h1>
          <p className="lead">Reserva espacios deportivos cerca de ti y arma el partido perfecto.</p>
        </div>
      </div>

      {/* Buscador */}
      <div className="search-row relative z-50">
        <div className="search-box w-full">
          <Search size={18} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar canchas o complejos"
          />
        </div>
        <div className="filter-pills">
          {['Todos', 'Fútbol 5', 'Fútbol 6', 'Fútbol 7', 'Fútbol 11'].map(f => {
            const isActive = f === 'Todos' ? selectedFormats.length === 0 : selectedFormats.includes(f);
            return (
              <button key={f} onClick={() => handleFormatToggle(f)}
                className={isActive ? 'pill-active' : ''}>{f}</button>
            );
          })}
        </div>


        {/* Tarjetas de coincidencia instantánea debajo del buscador */}
        {query.trim().length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-2xl shadow-xl p-4 max-h-[320px] overflow-y-auto z-50 flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Resultados de búsqueda ({filtered.length})</p>
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 text-center">No se encontraron coincidencias.</p>
            ) : (
              filtered.map(pitch => (
                <div
                  key={pitch.id}
                  onClick={() => onOpen(pitch)}
                  className="flex items-center gap-3 p-2 hover:bg-primary/5 rounded-xl cursor-pointer transition-all border border-transparent hover:border-primary/10"
                >
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
                  </div>
                  <div className="flex-1 min-w-0 pr-2">
                    <h4 className="font-bold text-xs text-foreground break-words whitespace-normal">
                      {pitch.name.toUpperCase()}
                    </h4>
                    <p className="text-xs text-muted-foreground break-words whitespace-normal">
                      {pitch.type}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBook(pitch);
                    }}
                    className="px-3 py-1.5 bg-primary text-white text-[11px] font-bold rounded-lg hover:bg-primary/95 transition-colors shrink-0"
                  >
                    Reservar
                  </button>

                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Carrusel de canchas destacadas */}
      <div className="discovery-stack flex flex-col gap-4 my-2">
        <DiscoverRail
          title="Cerca de ti"
          subtitle="Canchas a menos de 2 km"
          items={pitches}
          onOpen={onOpen}
          onBook={handleBook}
        />
        <DiscoverRail
          title="Populares en Pasto"
          subtitle="Las más reservadas esta semana"
          items={[...pitches].reverse()}
          onOpen={onOpen}
          onBook={handleBook}
        />
      </div>

      {/* Layout: Reserva rápida + Mapa */}
      <div className="explore-layout">
        <div className="map-column">

          {/* ═══ RESERVA INMEDIATA ═══ */}
          <div className="bg-card rounded-2xl border border-border shadow-md p-6 mb-6">
            {/* Header */}
            <div className="mb-5 pb-4 border-b border-border">
              <p className="eyebrow accent-label flex items-center gap-2 mb-1">
                <Clock3 size={13} /> RESERVA INMEDIATA
              </p>
              <h2 className="text-xl font-bold tracking-tight">¿Cuándo quieres jugar?</h2>
              <p className="text-muted-foreground text-sm mt-0.5">
                Selecciona fecha y una o varias horas para ver disponibilidad.
              </p>
            </div>

            {/* Calendario expandible */}
            {showCalendarWidget && (
              <div className="mb-5 flex flex-col items-center">
                <CustomMonthCalendar
                  selectedDate={selectedDate}
                  onSelectDate={(dateStr) => {
                    setSelectedDate(dateStr);
                    setSearchResults(null);
                    setShowCalendarWidget(false);
                  }}
                  minDate={today}
                />
              </div>
            )}

            <div className="space-y-5">

              {/* ── Fecha elegida + botón calendario ── */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <CalendarDays size={13} /> Fecha elegida
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCalendarWidget(v => !v)}
                    className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-bold border rounded-lg px-3 py-1.5 transition-all ${showCalendarWidget
                      ? 'bg-primary text-white border-primary'
                      : 'text-primary bg-primary/10 hover:bg-primary hover:text-white border-primary/30 hover:border-primary'
                      }`}
                  >
                    <CalendarDays size={13} />
                    {showCalendarWidget ? 'Cerrar calendario' : 'Ver calendario'}
                  </button>
                </div>

                <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide snap-x">
                  {nextDays.map(d => {
                    const isSel = selectedDate === d.dateStr;
                    return (
                      <button
                        key={d.dateStr}
                        type="button"
                        onClick={() => { setSelectedDate(d.dateStr); setSearchResults(null); }}
                        className={`flex-shrink-0 snap-start min-w-[70px] p-2.5 rounded-xl border text-center transition-all ${isSel
                          ? 'bg-primary text-white border-primary shadow-md scale-105 ring-2 ring-primary/30'
                          : d.isToday
                            ? 'bg-primary/10 border-primary/40 text-primary hover:bg-primary/20'
                            : 'bg-card hover:bg-primary/10 border-border text-foreground hover:border-primary/40'
                          }`}
                      >
                        <span className="text-[10px] uppercase font-bold tracking-wider block">{d.dayName}</span>
                        <span className="text-base font-extrabold block leading-tight">{d.dayNumber}</span>
                        <span className="text-[9px] capitalize block opacity-70">{d.monthName}</span>
                      </button>
                    );
                  })}
                </div>
                {selectedDate && (
                  <span key={selectedDate} className="inline-flex w-fit items-center gap-1 bg-primary text-white text-[11px] font-bold px-2.5 py-1 rounded-full">
                    📅 {formattedSelectedDate}
                    <button
                      type="button"
                      onClick={() => setShowCalendarWidget(v => !v)}
                      className="ml-0.5 opacity-70 hover:opacity-100 text-white"
                    >✕</button>
                  </span>
                )}
              </div>

              {/* ── Selector de hora: pestañas y un solo recuadro ── */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Clock3 size={12} /> Hora(s) de juego
                  </label>
                  {selectedHours.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedHours([])}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline"
                    >
                      Limpiar selección
                    </button>
                  )}
                </div>

                {/* Horas seleccionadas (badges) */}
                {selectedHours.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {[...selectedHours].sort().map(h => {
                      const hNum = parseInt(h.split(':')[0]);
                      const ampm = hNum < 12 ? 'am' : 'pm';
                      const h12 = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum;
                      return (
                        <span key={h} className="inline-flex items-center gap-1 bg-primary text-white text-[11px] font-bold px-2.5 py-1 rounded-full">
                          ⏰ {h12}:00 {ampm}
                          <button
                            type="button"
                            onClick={() => setSelectedHours(prev => prev.filter(x => x !== h))}
                            className="ml-0.5 opacity-70 hover:opacity-100 text-white"
                          >✕</button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Filtros / Pestañas de Categorías */}
                <div className="flex bg-secondary/50 p-1.5 rounded-xl border border-border gap-1">
                  {([
                    { key: 'manana', icon: '', title: 'Mañana' },
                    { key: 'tarde', icon: '', title: 'Tarde' },
                    { key: 'noche', icon: '', title: 'Noche' }
                  ] as const).map(cat => {
                    const isActive = activeTimeCategory === cat.key;
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setActiveTimeCategory(cat.key)}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${isActive
                          ? 'bg-card text-primary shadow-sm border border-border/60 scale-[1.02]'
                          : 'text-muted-foreground hover:text-foreground'
                          }`}
                      >
                        <span>{cat.icon}</span>
                        <span>{cat.title}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Recuadro único de horas según categoría activa */}
                <div className="rounded-xl border border-border bg-card p-3 shadow-inner">
                  {(() => {
                    const currentCat = (
                      [
                        { key: 'manana', slots: ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00'] },
                        { key: 'tarde', slots: ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00'] },
                        { key: 'noche', slots: ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00'] }
                      ] as const
                    ).find(c => c.key === activeTimeCategory);

                    if (!currentCat) return null;

                    return (
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 animate-in fade-in duration-200">
                        {currentCat.slots.map(slot => {
                          const isSel = selectedHours.includes(slot);
                          const hNum = parseInt(slot.split(':')[0]);
                          const ampm = hNum < 12 ? 'am' : 'pm';
                          const h12 = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum;
                          return (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => {
                                if (selectedHours.includes(slot)) {
                                  setSelectedHours(prev => prev.filter(x => x !== slot));
                                  setSearchResults(null);
                                } else if (selectedHours.length >= 4) {
                                  setAlertState({
                                    isOpen: true,
                                    type: 'warning',
                                    title: '⏰ Límite de horas alcanzado',
                                    message: 'Solo puedes reservar un máximo de 4 horas por transacción. Si necesitas más tiempo, crea una nueva reserva.',
                                  });
                                } else {
                                  setSelectedHours(prev => [...prev, slot]);
                                  setSearchResults(null);
                                }
                              }}
                              className={`p-2.5 rounded-xl border text-center transition-all select-none ${isSel
                                ? 'bg-primary text-white border-primary shadow-md ring-2 ring-primary/30'
                                : 'bg-card hover:bg-primary/10 border-border text-foreground hover:border-primary/40'
                                }`}
                            >
                              <span className="text-sm font-extrabold block leading-tight">{h12}:00</span>
                              <span className="text-[9px] uppercase font-bold opacity-70">{ampm}</span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Formato (Desplegable) */}
              <div className="flex flex-col gap-1.5 relative z-40">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Grid2X2 size={12} /> Formato
                </label>
                <button
                  type="button"
                  onClick={() => setOpenDropdown(openDropdown === 'format' ? null : 'format')}
                  className="w-full min-h-[46px] px-4 py-2 rounded-xl border text-sm font-bold transition-all flex justify-between items-center bg-card text-foreground border-border hover:border-primary/40 focus:ring-2 focus:ring-primary/30"
                >
                  <span className="truncate">
                    {selectedFormats.length === 0 ? 'Cualquier formato' : selectedFormats.join(', ')}
                  </span>
                  <ChevronDown size={16} className={`flex-shrink-0 transition-transform text-muted-foreground ${openDropdown === 'format' ? 'rotate-180' : ''}`} />
                </button>
                {openDropdown === 'format' && (
                  <div className="absolute top-[100%] mt-1 left-0 right-0 p-2 bg-card border border-border rounded-xl shadow-xl flex flex-col gap-1 animate-in fade-in slide-in-from-top-1 z-50 max-h-48 overflow-y-auto">
                    {['Todos', 'Fútbol 5', 'Fútbol 6', 'Fútbol 7', 'Fútbol 11'].map(f => {
                      const isActive = f === 'Todos' ? selectedFormats.length === 0 : selectedFormats.includes(f);
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() => handleFormatToggle(f)}
                          className={`py-2 px-3 rounded-lg text-sm font-bold text-left transition-all flex justify-between items-center ${isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-primary/5 hover:text-primary'
                            }`}
                        >
                          <span>{f === 'Todos' ? 'Cualquier formato' : f}</span>
                          {isActive && <CheckCircle2 size={16} className="text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Botón Buscar */}
            <button
              type="button"
              onClick={() => handleSearch()}
              disabled={!selectedDate || selectedHours.length === 0 || searching}
              className="w-full h-12 mt-5 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              {searching
                ? <><Loader2 size={18} className="animate-spin" /> Buscando canchas...</>
                : <><Search size={18} /> Buscar canchas disponibles {selectedHours.length > 0 ? `· ${selectedHours.length}h` : ''}</>
              }
            </button>
          </div>

          {/* ═══ RESULTADOS DE BÚSQUEDA ═══ */}
          {searchResults !== null && (
            <div id="search-results" className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-lg">
                    {searchResults.length > 0
                      ? `${searchResults.length} cancha${searchResults.length > 1 ? 's' : ''} disponible${searchResults.length > 1 ? 's' : ''}`
                      : 'Sin disponibilidad'}
                  </h3>
                  {/* <p className="text-sm text-muted-foreground capitalize">
                    📅 {formattedSelectedDate} <br /> 🕓 {[...selectedHours].sort().map(h => {
                      const hNum = parseInt(h.split(':')[0]);
                      const h12 = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum;
                      const ampm = hNum < 12 ? 'am' : 'pm';
                      return `${h12}:00 ${ampm}`;
                    }).join(', ')}
                  </p> */}
                </div>
                <button
                  type="button"
                  onClick={() => setSearchResults(null)}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Limpiar resultados
                </button>
              </div>

              {searchResults.length === 0 ? (
                <div className="p-8 bg-card border border-border rounded-2xl text-center">
                  <p className="text-4xl mb-3">😔</p>
                  <h4 className="font-bold mb-1">Todas las canchas están ocupadas</h4>
                  <p className="text-sm text-muted-foreground">Intenta con otras horas o fecha en el calendario.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {searchResults.map(pitch => {
                    const totalPrice = selectedHours.reduce(
                      (sum, h) => sum + Number((pitch as any).custom_pricing?.[h] || (pitch as any).price_per_hour || 0),
                      0
                    );

                    return (
                      <div
                        key={pitch.id}
                        className="p-3.5 bg-card border border-border rounded-2xl hover:border-primary/40 hover:shadow-sm transition-all flex flex-col gap-3"
                      >
                        {/* 1. Encabezado: Imagen + Info de Cancha */}
                        <div className="flex items-center gap-3">
                          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex-shrink-0 overflow-hidden bg-muted">
                            {((pitch as any).media_urls?.[0] || (pitch as any).image_url) ? (
                              <img
                                src={(pitch as any).media_urls?.[0] || (pitch as any).image_url}
                                alt={pitch.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className={`w-full h-full ${(pitch as any).tone || 'field-emerald'}`} />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-sm sm:text-base leading-tight uppercase text-foreground truncate">
                              {pitch.name}
                            </h4>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(Array.isArray((pitch as any).supported_types)
                                ? (pitch as any).supported_types
                                : [pitch.type]
                              ).map((type: string, index: number) => (
                                <span key={index} className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-md font-semibold uppercase">
                                  {type}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* 2. Bloque Resumen: Fecha, Hora(s) y Total Dinámico */}
                        <div className="bg-primary/5 border border-primary/15 rounded-xl p-3 flex items-center justify-between gap-3">
                          {/* Lado izquierdo: Fecha e Horas elegidas */}
                          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                            {/* Fecha con icono */}
                            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                              <Calendar size={13} className="text-primary shrink-0" />
                              <span className="capitalize truncate">
                                {selectedDate
                                  ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-CO', {
                                    weekday: 'short',
                                    day: 'numeric',
                                    month: 'short',
                                  })
                                  : 'Fecha no seleccionada'}
                              </span>
                            </div>

                            {/* Badges de Hora(s) */}
                            <div className="flex flex-wrap items-center gap-1">
                              {[...selectedHours].sort().map(h => {
                                const price = Number((pitch as any).custom_pricing?.[h] || (pitch as any).price_per_hour || 0);
                                return (
                                  <span
                                    key={h}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-card border border-border rounded-lg text-[11px] font-bold text-foreground shadow-2xs"
                                  >
                                    <Clock size={11} className="text-muted-foreground shrink-0" />
                                    <span>{fmtSlot(h)}</span>
                                    {selectedHours.length > 1 && (
                                      <span className="text-[10px] text-muted-foreground font-normal">
                                        (${price.toLocaleString('es-CO')})
                                      </span>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          </div>

                          {/* Lado derecho: Etiqueta y Precio Dinámico */}
                          <div className="text-right shrink-0 border-l border-primary/10 pl-3">
                            <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground leading-none mb-1">
                              {selectedHours.length > 1 ? `Total (${selectedHours.length} hrs)` : 'Precio'}
                            </span>
                            <span className="text-base font-black text-primary leading-none">
                              ${totalPrice.toLocaleString('es-CO')}
                            </span>
                          </div>
                        </div>

                        {/* 3. Botones de Acción */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => onOpen(pitch)}
                            className="h-10 bg-secondary text-foreground font-bold rounded-xl hover:bg-border transition-colors text-xs flex items-center justify-center"
                          >
                            Ver Cancha
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBook(pitch, selectedHours, selectedDate)}
                            className="h-10 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center shadow-sm"
                          >
                            Reservar
                          </button>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Canchas en proceso de reserva con Cronómetro ── */}
              {inProgressResults.length > 0 && (
                <div className="grid gap-3">
                  {/* Encabezado */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                    </span>
                    <h4 className="font-black text-xs sm:text-sm uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      Canchas siendo reservadas ({inProgressResults.length})
                    </h4>
                  </div>

                  <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                    Estas canchas tienen un bloqueo temporal por otro usuario. Si no confirman el pago antes de finalizar el cronómetro, se liberarán:
                  </p>

                  {/* Lista de Tarjetas */}
                  <div className="grid gap-3">
                    {inProgressResults.map(p => {
                      // Función auxiliar para formatear horas numéricas (ej: 7 o 19) a formato 12h (7am / 7pm)
                      const formatSlotHour = (slot: any) => {
                        if (!slot && slot !== 0) return '';
                        const strSlot = String(slot).trim();

                        // Si ya incluye am o pm, devolverlo directamente
                        if (/am|pm/i.test(strSlot)) return strSlot;

                        // Convertir hora numérica (ej: "19", "7", "19:00")
                        const hourNum = parseInt(strSlot, 10);
                        if (isNaN(hourNum)) return strSlot;

                        const period = hourNum >= 12 ? 'pm' : 'am';
                        const formattedHour = hourNum % 12 === 0 ? 12 : hourNum % 12;
                        return `${formattedHour}${period}`;
                      };

                      return (
                        <div
                          key={p.id}
                          className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 bg-amber-500/5 border border-amber-500/30 rounded-2xl transition-all"
                        >
                          {/* Fila Superior en Móvil: Imagen + Nombre y Timer */}
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex-shrink-0 overflow-hidden bg-muted">
                              {((p as any).media_urls?.[0] || (p as any).image_url) ? (
                                <img
                                  src={(p as any).media_urls?.[0] || (p as any).image_url}
                                  alt={p.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className={`w-full h-full ${(p as any).tone || 'field-emerald'}`} />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between sm:justify-start gap-1.5 flex-wrap mb-1">
                                <h4 className="font-bold text-sm text-foreground truncate">{p.name}</h4>
                                <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center gap-1 flex-shrink-0">
                                  ⏱️ <QuickTimer expiresAt={p.expiresAt} />
                                </span>
                              </div>

                              <p className="text-xs text-muted-foreground truncate">
                                Hora: <strong className="text-foreground">{formatSlotHour(p.slot)}</strong>
                              </p>
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold block mt-0.5">
                                Bloqueo de seguridad activo
                              </span>
                            </div>
                          </div>

                          {/* Botón Acción */}
                          <button
                            type="button"
                            onClick={() => onOpen(p)}
                            className="w-full sm:w-auto px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-xs rounded-xl transition-colors cursor-pointer text-center flex-shrink-0 border border-amber-500/20"
                          >
                            Ver cancha
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ MAPA ═══ */}
          <div className="mb-6 relative z-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">Mapa de canchas</h3>
              <span className="text-xs text-muted-foreground">{filtered.length} canchas</span>
            </div>
            <DynamicMap
              pitches={filtered}
              onMarkerClick={pitch => onOpen(pitch)}
            />
          </div>

          {/* Resumen */}
          <div className="map-summary">
            <span className="green-dot" /> {filtered.length} canchas encontradas{' '}
            <span className="summary-separator" /> Ordenado por <strong>Cercanía</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
