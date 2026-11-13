'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  X,
  FileText,
  Calendar,
  Clock,
  User,
  Phone,
  StickyNote,
  ChevronRight,
  Check,
  Loader2,
  AlertCircle,
  Repeat,
  DollarSign,
  Building2,
  AlertTriangle,
  Sparkles,
  Layers,
  CreditCard,
  Wallet,
} from 'lucide-react';
import { Pitch } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { fetchOccupancy } from '@/lib/occupancy';
import { getLinkedPitchIds } from '@/lib/combined-pitch-utils';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ContractBookingModalProps {
  pitches: Pitch[];
  onClose: () => void;
  onSuccess: () => void;
  initialEntityName?: string;
  initialClientType?: 'standard' | 'entity' | 'school';
  existingBookings?: any[];
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = [
  { key: 0, label: 'Dom', full: 'Domingo' },
  { key: 1, label: 'Lun', full: 'Lunes' },
  { key: 2, label: 'Mar', full: 'Martes' },
  { key: 3, label: 'Mié', full: 'Miércoles' },
  { key: 4, label: 'Jue', full: 'Jueves' },
  { key: 5, label: 'Vie', full: 'Viernes' },
  { key: 6, label: 'Sáb', full: 'Sábado' },
];

const ALL_SLOTS = [
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
];

const DURATIONS = [
  { key: '15d', label: '15 Días', desc: 'Quincenal (2 semanas)', weeks: 2 },
  { key: '1m', label: '1 Mes', desc: 'Mensualidad (4 semanas)', weeks: 4 },
  { key: '3m', label: 'Trimestre', desc: '3 Meses (13 semanas)', weeks: 13 },
  { key: '6m', label: 'Semestral', desc: '6 Meses (26 semanas)', weeks: 26 },
  { key: '1y', label: 'Anual (12 Meses)', desc: '1 Año (52 semanas)', weeks: 52 },
  { key: 'custom', label: 'Personalizado', desc: 'Semanas libres', weeks: 0 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export type BillingScheme =
  | 'mes_anticipado'
  | 'mes_vencido'
  | 'por_sesion'
  | 'quincenal_anticipado'
  | 'quincenal_vencido'
  | 'total_anticipado';

interface BillingSchemeOption {
  key: BillingScheme;
  label: string;
  badge: string;
  desc: string;
  defaultMethod: 'cuenta_cobrar' | 'transferencia' | 'efectivo' | 'credito';
}

const BILLING_SCHEMES: BillingSchemeOption[] = [
  {
    key: 'mes_anticipado',
    label: 'Mensualidad Anticipada',
    badge: 'Recomendado',
    desc: 'El cliente cancela el mes completo por adelantado antes de iniciar cada ciclo.',
    defaultMethod: 'transferencia',
  },
  {
    key: 'mes_vencido',
    label: 'Mensualidad Vencida (Crédito)',
    badge: 'Cuenta por Cobrar',
    desc: 'Se acumulan los turnos jugados y se factura a final de cada mes.',
    defaultMethod: 'cuenta_cobrar',
  },
  {
    key: 'por_sesion',
    label: 'Pago por Sesión / Partido',
    badge: 'Por Fecha',
    desc: 'El cliente cancela en caja o por transferencia cada día que asiste a jugar.',
    defaultMethod: 'efectivo',
  },
  {
    key: 'quincenal_anticipado',
    label: 'Quincenal Anticipado',
    badge: 'Día 1 y 16',
    desc: 'Pago por adelantado al comenzar cada quincena.',
    defaultMethod: 'transferencia',
  },
  {
    key: 'quincenal_vencido',
    label: 'Quincenal Vencido (Crédito)',
    badge: 'Cuenta por Cobrar',
    desc: 'Cobro acumulado a crédito al cumplirse cada quincena.',
    defaultMethod: 'cuenta_cobrar',
  },
  {
    key: 'total_anticipado',
    label: 'Pago Total Anticipado',
    badge: 'Contrato Completo',
    desc: 'Cancela el 100% de la totalidad de partidos antes de empezar.',
    defaultMethod: 'transferencia',
  },
];

function fmt12(slot: string) {
  const h = parseInt(slot.split(':')[0]);
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:00 ${ampm}`;
}

function formatCOP(n: number) {
  return `$${Math.round(n || 0).toLocaleString('es-CO')}`;
}

function formatDateFriendly(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d, 12, 0, 0);
    return date.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export interface ContractSession {
  key: string;
  weekNum: number;
  baseDate: string;
  date: string;
  dayKey: number;
  baseSlot: string;
  slot: string;
  isCustomized: boolean;
}

/** Genera todas las fechas para un día de semana específico, desde 'from' durante 'weeks' semanas */
function generateDates(dayOfWeek: number, fromDate: Date, weeks: number): string[] {
  const dates: string[] = [];
  const start = new Date(fromDate);
  // Avanza hasta el próximo día de semana elegido
  const diff = (dayOfWeek - start.getDay() + 7) % 7;
  start.setDate(start.getDate() + diff);

  for (let i = 0; i < weeks; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i * 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${day}`);
  }
  return dates;
}

// ─── Pasos en el orden natural solicitado por el dueño de complejo ──────────────
// 1. Tipo & Cliente/Entidad -> 2. Cancha -> 3. Horarios/Duración -> 4. Confirmar
type Step = 'entity' | 'pitch' | 'schedule' | 'confirm';

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: 'entity', label: '1. Entidad / Escuela', icon: <Building2 size={14} /> },
  { key: 'pitch', label: '2. Cancha', icon: <span className="text-base">⚽</span> },
  { key: 'schedule', label: '3. Días & Horas', icon: <Clock size={14} /> },
  { key: 'confirm', label: '4. Confirmar', icon: <Check size={14} /> },
];

// ─── Componente Principal ─────────────────────────────────────────────────────

export interface SavedEntityRecord {
  id?: string;
  name: string;
  clientType: 'standard' | 'entity' | 'school';
  contactName: string;
  contactPhone: string;
  customRate?: string | number;
  billingScheme?: BillingScheme;
  paymentMethod?: 'cuenta_cobrar' | 'transferencia' | 'efectivo' | 'credito';
  pitchId?: string;
}

export function ContractBookingModal({
  pitches,
  onClose,
  onSuccess,
  initialEntityName,
  initialClientType,
  existingBookings,
}: ContractBookingModalProps) {
  const supabase = createClient();

  // Paso actual (inicia por la clasificación de Entidad / Escuela)
  const [step, setStep] = useState<Step>('entity');

  // 1. Tipo de Turno Fijo & Datos Financieros
  const [clientType, setClientType] = useState<'standard' | 'entity' | 'school'>(initialClientType || 'entity');
  const [clientEntityName, setClientEntityName] = useState(initialEntityName || '');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customRate, setCustomRate] = useState<string>('');
  const [billingScheme, setBillingScheme] = useState<BillingScheme>('mes_anticipado');
  const [paymentMethod, setPaymentMethod] = useState<'cuenta_cobrar' | 'transferencia' | 'efectivo' | 'credito'>('transferencia');
  const [paymentChannel, setPaymentChannel] = useState<string>('transferencia_nequi');
  const [customerNote, setCustomerNote] = useState('');

  // Autocompletado y guardado de entidades/escuelas/particulares
  const [savedEntities, setSavedEntities] = useState<SavedEntityRecord[]>([]);
  const [showEntitySuggestions, setShowEntitySuggestions] = useState(false);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [entitySavedNotice, setEntitySavedNotice] = useState<string | null>(null);

  // 2. Cancha
  const [selectedPitch, setSelectedPitch] = useState<Pitch | null>(pitches[0] || null);

  // 3. Duración & Horarios
  const [duration, setDuration] = useState<string>('1m');
  const [customWeeks, setCustomWeeks] = useState<number>(8);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [selectedDays, setSelectedDays] = useState<number[]>([6]); // Sábado por defecto
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]); // Vacío por defecto para que elija viendo disponibilidad previa

  // Estado de personalización por fecha/semana específica (para mover fechas u horas ocupadas)
  const [sessionOverrides, setSessionOverrides] = useState<Record<string, { date?: string; slot?: string }>>({});
  const [editingSessionKey, setEditingSessionKey] = useState<string | null>(null);
  const [showAllDatesList, setShowAllDatesList] = useState(false);

  // Estado para verificación de horas ocupadas en la base de datos
  const [occupiedSlotCounts, setOccupiedSlotCounts] = useState<Record<string, number>>({});
  const [occupiedDateSlots, setOccupiedDateSlots] = useState<Set<string>>(new Set());
  const [loadingOccupied, setLoadingOccupied] = useState(false);

  // Envío
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Cargar entidades guardadas desde localStorage y desde historial de reservas existentes
  useEffect(() => {
    let stored: SavedEntityRecord[] = [];
    try {
      const raw = localStorage.getItem('canchas_saved_entities');
      if (raw) stored = JSON.parse(raw);
    } catch { /* noop */ }

    const map = new Map<string, SavedEntityRecord>();
    stored.forEach(e => {
      if (e.name) map.set(e.name.trim().toLowerCase(), e);
    });

    if (Array.isArray(existingBookings) && existingBookings.length > 0) {
      existingBookings.forEach((b: any) => {
        const entName = (b.client_entity_name || '').trim();
        const custName = (b.customer_name || '').trim();
        const phone = (b.customer_phone || '').trim();
        const cType: 'standard' | 'entity' | 'school' = b.client_type === 'school' ? 'school' : (b.client_type === 'entity' ? 'entity' : 'standard');

        if (entName && !map.has(entName.toLowerCase())) {
          map.set(entName.toLowerCase(), {
            name: entName,
            clientType: cType !== 'standard' ? cType : 'entity',
            contactName: custName,
            contactPhone: phone,
            customRate: b.custom_rate || b.total_price,
            billingScheme: b.billing_scheme,
            paymentMethod: b.payment_method,
            pitchId: b.pitch_id,
          });
        } else if (custName && (b.booking_type === 'contract' || b.contract_id || b.note?.includes('CID:'))) {
          const cleanName = custName
            .replace(/\[(Turno Fijo|Contrato|ENTIDAD|ESCUELA)[^\]]*\]/gi, '')
            .replace(/CID:[a-zA-Z0-9_-]+/gi, '')
            .trim();
          if (cleanName && cleanName.length >= 2 && !map.has(cleanName.toLowerCase())) {
            map.set(cleanName.toLowerCase(), {
              name: cleanName,
              clientType: cType,
              contactName: cleanName,
              contactPhone: phone,
              customRate: b.custom_rate || b.total_price,
              billingScheme: b.billing_scheme,
              paymentMethod: b.payment_method,
              pitchId: b.pitch_id,
            });
          }
        }
      });
    }

    setSavedEntities(Array.from(map.values()));
  }, [existingBookings]);

  // Guardar entidad manualmente
  const handleSaveCurrentEntity = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    const primary = (clientType !== 'standard' ? clientEntityName : customerName).trim();
    if (!primary) {
      setError('Escribe el nombre antes de guardar.');
      return;
    }
    const record: SavedEntityRecord = {
      name: primary,
      clientType,
      contactName: customerName.trim(),
      contactPhone: customerPhone.trim(),
      customRate: effectiveRate,
      billingScheme,
      paymentMethod,
      pitchId: selectedPitch?.id,
    };
    try {
      const existing = savedEntities.filter(s => s.name.toLowerCase() !== primary.toLowerCase());
      const next = [record, ...existing].slice(0, 100);
      setSavedEntities(next);
      localStorage.setItem('canchas_saved_entities', JSON.stringify(next));
      setEntitySavedNotice(`¡${primary} guardado exitosamente para futuros contratos!`);
      setTimeout(() => setEntitySavedNotice(null), 3000);
    } catch { /* noop */ }
  };

  // Seleccionar entidad sugerida y autocompletar formulario
  const handleSelectEntity = (item: SavedEntityRecord) => {
    if (item.clientType && item.clientType !== clientType) {
      setClientType(item.clientType);
    }
    if (item.clientType !== 'standard') {
      setClientEntityName(item.name);
    }
    if (item.contactName) setCustomerName(item.contactName);
    if (item.contactPhone) setCustomerPhone(item.contactPhone);
    if (item.customRate) setCustomRate(String(item.customRate));
    if (item.billingScheme) setBillingScheme(item.billingScheme);
    if (item.paymentMethod) setPaymentMethod(item.paymentMethod);
    if (item.pitchId) {
      const matchPitch = pitches.find(p => p.id === item.pitchId);
      if (matchPitch) setSelectedPitch(matchPitch);
    }
    setShowEntitySuggestions(false);
    setShowCustomerSuggestions(false);
  };

  const durationObj = DURATIONS.find(d => d.key === duration) || DURATIONS[1];
  const effectiveWeeks = duration === 'custom' ? Math.max(1, customWeeks || 1) : durationObj.weeks;

  // Precio por hora de la cancha y tarifa acordada
  const pricePerHour = useMemo(() => {
    if (!selectedPitch) return 0;
    return selectedPitch.price_per_hour || 0;
  }, [selectedPitch]);

  const effectiveRate = useMemo(() => {
    if (customRate && !isNaN(Number(customRate)) && Number(customRate) > 0) {
      return Number(customRate);
    }
    return pricePerHour;
  }, [customRate, pricePerHour]);

  // Fechas base del contrato según días y duración (disponibles antes de seleccionar horario)
  const contractDates = useMemo(() => {
    if (selectedDays.length === 0 || effectiveWeeks <= 0) return [];
    const from = new Date(startDate + 'T12:00:00');
    const dates: string[] = [];
    selectedDays.forEach(d => {
      generateDates(d, from, effectiveWeeks).forEach(dt => dates.push(dt));
    });
    return Array.from(new Set(dates)).sort();
  }, [selectedDays, startDate, effectiveWeeks]);

  // Generación detallada de todas las sesiones individuales (con soporte para cambiar fechas u horas específicas)
  const allSessions: ContractSession[] = useMemo(() => {
    if (selectedDays.length === 0 || effectiveWeeks <= 0 || selectedSlots.length === 0) return [];
    const from = new Date(startDate + 'T12:00:00');
    const list: ContractSession[] = [];

    for (let w = 0; w < effectiveWeeks; w++) {
      selectedDays.forEach(dKey => {
        const start = new Date(from);
        const diff = (dKey - start.getDay() + 7) % 7;
        start.setDate(start.getDate() + diff + w * 7);
        const y = start.getFullYear();
        const m = String(start.getMonth() + 1).padStart(2, '0');
        const day = String(start.getDate()).padStart(2, '0');
        const baseDate = `${y}-${m}-${day}`;

        selectedSlots.forEach(s => {
          const key = `w_${w}_d_${dKey}_s_${s}`;
          const ov = sessionOverrides[key] || {};
          list.push({
            key,
            weekNum: w + 1,
            baseDate,
            date: ov.date || baseDate,
            dayKey: dKey,
            baseSlot: s,
            slot: ov.slot || s,
            isCustomized: !!(ov.date || ov.slot),
          });
        });
      });
    }

    return list.sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot));
  }, [selectedDays, effectiveWeeks, startDate, selectedSlots, sessionOverrides]);

  // Lista única de fechas que abarca el turno fijo (usa contractDates si aún no hay slots elegidos)
  const allDates = useMemo(() => {
    if (allSessions.length > 0) {
      return Array.from(new Set(allSessions.map(s => s.date))).sort();
    }
    return contractDates;
  }, [allSessions, contractDates]);

  const totalSessions = allSessions.length;
  const totalPrice = totalSessions * effectiveRate;

  // Sesiones con cruce de horario en la base de datos (ocupadas por reservas previas)
  const occupiedSessions = useMemo(() => {
    return allSessions.filter(s => occupiedDateSlots.has(`${s.date}_${s.slot}`));
  }, [allSessions, occupiedDateSlots]);

  const toggleDay = (d: number) => {
    setError('');
    setSelectedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const toggleSlot = (s: string) => {
    if (selectedSlots.includes(s)) {
      setError('');
      setSelectedSlots(prev => prev.filter(x => x !== s));
      return;
    }

    const takenInDates = contractDates.filter(dt => occupiedDateSlots.has(`${dt}_${s}`));
    if (takenInDates.length >= contractDates.length && contractDates.length > 0) {
      setError(`⚠️ La hora ${fmt12(s)} ya está 100% ocupada en todas las fechas seleccionadas.`);
      return;
    } else if (takenInDates.length > 0) {
      setError(`⚠️ La hora ${fmt12(s)} ya tiene ${takenInDates.length} de ${contractDates.length} fechas ocupadas. Deberás cambiar la hora o día de esas semanas en conflicto.`);
    } else {
      setError('');
    }

    setSelectedSlots(prev => [...prev, s]);
  };

  const pitchAllowedSlots: string[] | null = useMemo(() => {
    const slots = (selectedPitch as any)?.custom_pricing?.time_slots;
    if (Array.isArray(slots) && slots.length > 0) return slots;
    return null;
  }, [selectedPitch]);

  // ── Verificación en tiempo real de horas ocupadas en la base de datos ─────────
  const targetDatesKey = useMemo(() => {
    const dates = allDates.length > 0 ? allDates : contractDates;
    return dates.join(',');
  }, [allDates, contractDates]);

  useEffect(() => {
    const targetDates = allDates.length > 0 ? allDates : contractDates;
    if (!selectedPitch || targetDates.length === 0) {
      setOccupiedSlotCounts({});
      setOccupiedDateSlots(new Set());
      return;
    }

    let isMounted = true;
    setLoadingOccupied(true);

    const checkOccupied = async () => {
      try {
        const pitchIds = [selectedPitch.id, ...getLinkedPitchIds(selectedPitch)];
        const minDate = targetDates[0];
        const maxDate = targetDates[targetDates.length - 1];

        const data = await fetchOccupancy(
          supabase,
          pitchIds,
          `${minDate}T00:00:00-05:00`,
          `${maxDate}T23:59:59-05:00`,
        );

        if (!data) return;

        const counts: Record<string, number> = {};
        const dateSlotSet = new Set<string>();
        const now = new Date();
        const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' });
        const hourFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Bogota',
          hour: '2-digit',
          hourCycle: 'h23',
        });

        data.forEach((b: any) => {
          if (b.status === 'draft' && b.expires_at && new Date(b.expires_at) < now) return;
          try {
            let bDate = '';
            let hourSlot = '';
            if (typeof b.start_time === 'string' && b.start_time.includes('T')) {
              const [datePart, rest] = b.start_time.split('T');
              if (b.start_time.includes('-05:00')) {
                bDate = datePart;
                const timePart = rest.split('-05:00')[0];
                const h = timePart.split(':')[0];
                hourSlot = `${h.padStart(2, '0')}:00`;
              }
            }
            if (!bDate || !hourSlot) {
              const d = new Date(b.start_time);
              bDate = dateFormatter.format(d);
              const parts = hourFormatter.formatToParts(d);
              const h = parts.find(p => p.type === 'hour')?.value || '';
              hourSlot = `${h.padStart(2, '0')}:00`;
            }

            if (!targetDates.includes(bDate)) return;

            counts[hourSlot] = (counts[hourSlot] || 0) + 1;
            dateSlotSet.add(`${bDate}_${hourSlot}`);
          } catch { }
        });

        if (isMounted) {
          setOccupiedSlotCounts(counts);
          setOccupiedDateSlots(dateSlotSet);
        }
      } catch (err) {
        console.warn('[checkOccupied error]:', err);
      } finally {
        if (isMounted) setLoadingOccupied(false);
      }
    };

    checkOccupied();
    return () => { isMounted = false; };
  }, [selectedPitch?.id, targetDatesKey, supabase]);

  // ── Enviar y Guardar en la Base de Datos ────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!selectedPitch) return;
    if (selectedDays.length === 0) return setError('Selecciona al menos un día de la semana');
    if (selectedSlots.length === 0) return setError('Selecciona al menos un horario');
    if (allSessions.length === 0) return setError('No se generaron fechas para el turno fijo');

    if (occupiedSessions.length > 0) {
      const c = occupiedSessions[0];
      return setError(`⚠️ No se puede registrar: El ${formatDateFriendly(c.date)} a las ${fmt12(c.slot)} (Semana ${c.weekNum}) ya está ocupado en esta cancha. Cambia la hora o el día para poder continuar.`);
    }

    const primaryName = clientEntityName.trim() || customerName.trim();
    if (!primaryName) {
      return setError('Ingresa el nombre de la entidad, escuela o cliente');
    }

    setLoading(true);
    setError('');

    try {
      const { data: sessData } = await supabase.auth.getSession();
      const token = sessData?.session?.access_token;
      if (!token) throw new Error('No autorizado');

      const daysText = DAYS_OF_WEEK.filter(d => selectedDays.includes(d.key)).map(d => d.label).join(', ');
      const slotsText = selectedSlots.map(fmt12).join(', ');
      const entityLabel = clientType === 'entity'
        ? `[ENTIDAD: ${clientEntityName.trim() || customerName.trim()}] `
        : clientType === 'school'
          ? `[ESCUELA: ${clientEntityName.trim() || customerName.trim()}] `
          : '';

      const displayName = customerName.trim() ? customerName.trim() : primaryName;
      const contractCustomerName = `${entityLabel}${displayName} [Turno Fijo: ${daysText} ${slotsText}]`;

      const schemeObj = BILLING_SCHEMES.find(b => b.key === billingScheme);
      const billingSchemeLabel = schemeObj ? schemeObj.label : 'Mensualidad';

      // Identificador único del contrato y cálculos financieros
      const contractId = `ct_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const sessionsPerWeek = Math.max(1, selectedDays.length * selectedSlots.length);
      const sessionsPerMonth = sessionsPerWeek * 4;
      const monthPlanPrice = sessionsPerMonth * effectiveRate;
      const contractTotalPrice = allSessions.length * effectiveRate;

      const contractTag = `[TURNO FIJO / CONTRATO · CID:${contractId} · ESQUEMA:${billingScheme} · PLAN_TOTAL:${contractTotalPrice} · MES_TOTAL:${monthPlanPrice} · TARIFA:${effectiveRate} · SESIONES:${allSessions.length} · ${clientType === 'entity' ? 'ENTIDAD: ' + (clientEntityName || customerName) : clientType === 'school' ? 'ESCUELA: ' + (clientEntityName || customerName) : 'PARTICULAR'} · Cobro: ${billingSchemeLabel} · Canal: ${paymentChannel} · Tarifa: ${formatCOP(effectiveRate)}/h · ${DAYS_OF_WEEK.filter(d => selectedDays.includes(d.key)).map(d => d.full).join(', ')} · ${slotsText}]`;
      const noteWithTag = `${contractTag}${customerNote ? ` · ${customerNote}` : ''}`;

      setSuccessMsg(`Guardando ${allSessions.length} reservas en un solo proceso...`);

      const res = await fetch('/api/admin-actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'create_contract_batch',
          payload: {
            pitch_id: selectedPitch.id,
            dates: allDates,
            selected_times: selectedSlots,
            sessions: allSessions.map(s => ({ date: s.date, slot: s.slot, time: s.slot })),
            strict: true,
            customer_name: contractCustomerName.slice(0, 100),
            customer_phone: customerPhone,
            note: noteWithTag,
            client_type: clientType,
            client_entity_name: clientEntityName.trim() || undefined,
            payment_method: paymentMethod,
            billing_scheme: billingScheme,
            custom_rate: effectiveRate,
            total_price: effectiveRate,
            contract_id: contractId,
            plan_total_price: contractTotalPrice,
            month_plan_price: monthPlanPrice,
            total_sessions: allSessions.length,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al crear el turno fijo. Verifica los horarios seleccionados.');
      }

      const totalCreated: number = data.total_created ?? (data.booking_ids?.length ?? 0);

      if (totalCreated === 0) {
        throw new Error(
          `No se pudo registrar: todos los horarios seleccionados ya están reservados en el sistema para esta cancha en esas fechas.`
        );
      }

      const finishMsg = `✅ Turno fijo registrado exitosamente: ${totalCreated} partidos agendados para ${primaryName}.`;

      // Auto-guardar entidad en localStorage para que en futuros contratos se autocomplete
      try {
        const entName = (clientType !== 'standard' ? clientEntityName : customerName).trim();
        if (entName) {
          const raw = localStorage.getItem('canchas_saved_entities');
          const stored: any[] = raw ? JSON.parse(raw) : [];
          const filtered = stored.filter(s => s.name.toLowerCase() !== entName.toLowerCase());
          const newRec = {
            name: entName,
            clientType,
            contactName: customerName.trim(),
            contactPhone: customerPhone.trim(),
            customRate: effectiveRate,
            billingScheme,
            paymentMethod,
            pitchId: selectedPitch?.id,
          };
          localStorage.setItem('canchas_saved_entities', JSON.stringify([newRec, ...filtered].slice(0, 100)));
        }
      } catch { /* noop */ }

      setSuccessMsg(finishMsg);
      setTimeout(() => {
        onSuccess();
      }, 1800);
    } catch (err: any) {
      setError(err.message || 'Error al crear el turno fijo');
    } finally {
      setLoading(false);
    }
  }, [selectedPitch, selectedDays, selectedSlots, customerName, customerPhone, customerNote, allDates, allSessions, effectiveRate, clientType, clientEntityName, paymentMethod, paymentChannel, billingScheme, occupiedSessions, supabase, onSuccess]);

  // ── Navegación entre pasos ──────────────────────────────────────────────────

  const canGoNext: Record<Step, boolean> = {
    entity: (clientType === 'standard' && customerName.trim().length >= 2) ||
      (clientType !== 'standard' && (clientEntityName.trim().length >= 2 || customerName.trim().length >= 2)),
    pitch: !!selectedPitch,
    schedule: selectedDays.length > 0 &&
      selectedSlots.length > 0 &&
      allSessions.length > 0 &&
      occupiedSessions.length === 0,
    confirm: occupiedSessions.length === 0,
  };

  const nextStep: Record<Step, Step | null> = {
    entity: 'pitch',
    pitch: 'schedule',
    schedule: 'confirm',
    confirm: null,
  };

  const prevStep: Record<Step, Step | null> = {
    entity: null,
    pitch: 'entity',
    schedule: 'pitch',
    confirm: 'schedule',
  };

  const stepIdx = STEPS.findIndex(s => s.key === step);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-background border border-border rounded-3xl shadow-2xl w-full max-w-2xl max-h-[94vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0 bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/15 text-violet-600 dark:text-violet-400 rounded-2xl shrink-0">
              <Repeat size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-foreground">Turno Fijo & Mensualidades</h2>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30 uppercase">
                  Contratos
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Configura entidades, escuelas, tarifas fijas y recurrencias</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Indicador de Pasos */}
        <div className="px-5 pt-3.5 pb-2.5 shrink-0 border-b border-border bg-secondary/15">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center gap-1 flex-1 last:flex-initial">
                <button
                  type="button"
                  onClick={() => i <= stepIdx && setStep(s.key)}
                  className={`flex items-center gap-1.5 text-xs font-bold transition-colors py-1 px-2 rounded-xl whitespace-nowrap ${step === s.key
                    ? 'text-violet-600 dark:text-violet-400 bg-violet-500/10'
                    : i < stepIdx
                      ? 'text-emerald-600 dark:text-emerald-400 cursor-pointer hover:bg-secondary'
                      : 'text-muted-foreground/50 cursor-not-allowed'
                    }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0 border ${step === s.key
                    ? 'bg-violet-600 border-violet-600 text-white'
                    : i < stepIdx
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'border-border bg-card text-muted-foreground'
                    }`}>
                    {i < stepIdx ? <Check size={10} /> : i + 1}
                  </span>
                  <span>{s.label}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <ChevronRight size={12} className="text-border mx-0.5 flex-1" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Contenido Principal */}
        <div className="flex-1 overflow-y-auto p-5">

          {successMsg && (
            <div className="mb-4 p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-emerald-700 dark:text-emerald-300 text-sm font-bold text-center animate-in fade-in">
              {successMsg}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 dark:text-red-400 text-sm flex items-center gap-2 animate-shake">
              <AlertCircle size={16} className="shrink-0" /> {error}
            </div>
          )}

          {/* ═══════════════ PASO 1: ENTIDAD / ESCUELA / PRECIO & PAGO ═══════════════ */}
          {step === 'entity' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-black text-foreground">1. ¿Para quién es el Turno Fijo?</h3>
                <p className="text-xs text-muted-foreground">Define si es una entidad corporativa, escuela de fútbol o grupo particular</p>
              </div>

              {/* Selector de 3 opciones */}
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { key: 'entity', label: 'Entidad / Club', icon: '', desc: 'Empresa o Institución' },
                  { key: 'school', label: 'Escuela de Fútbol', icon: '', desc: 'Formativo / Entrenamientos' },
                  { key: 'standard', label: 'Particular / Grupo', icon: '', desc: 'Grupo de amigos semanal' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setClientType(opt.key as any);
                      if (opt.key === 'standard') setClientEntityName('');
                    }}
                    className={`flex flex-col items-center gap-1 p-3 rounded-2xl border-2 text-xs font-bold transition-all text-center cursor-pointer ${clientType === opt.key
                      ? 'bg-violet-500/15 border-violet-500 text-violet-700 dark:text-violet-300 shadow-sm ring-1 ring-violet-500/30'
                      : 'border-border bg-card text-muted-foreground hover:border-violet-400/40 hover:bg-secondary/40'
                      }`}
                  >
                    <span className="text-2xl">{opt.icon}</span>
                    <span className="font-extrabold">{opt.label}</span>
                    <span className="text-[9px] text-muted-foreground font-normal line-clamp-1">{opt.desc}</span>
                  </button>
                ))}
              </div>

              {/* Aviso cuando se guarda una entidad */}
              {entitySavedNotice && (
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold text-center animate-in fade-in">
                  {entitySavedNotice}
                </div>
              )}

              {/* Nombre de la entidad / escuela con Autocompletado */}
              {clientType !== 'standard' ? (
                <div className="relative">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Building2 size={13} className="text-violet-500" />
                      {clientType === 'entity' ? 'Nombre de la Entidad o Empresa *' : 'Nombre de la Escuela de Fútbol *'}
                    </label>
                    <button
                      type="button"
                      onClick={handleSaveCurrentEntity}
                      className="text-[10px] font-bold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 cursor-pointer"
                      title="Guardar esta entidad para autocompletar en futuros contratos"
                    >
                      <Sparkles size={11} /> Guardar entidad
                    </button>
                  </div>
                  <input
                    type="text"
                    value={clientEntityName}
                    onChange={e => {
                      setClientEntityName(e.target.value);
                      setShowEntitySuggestions(true);
                    }}
                    onFocus={() => setShowEntitySuggestions(true)}
                    placeholder={clientType === 'entity' ? 'Ej: Club Deportivo Nariño (escribe para autocompletar)' : 'Ej: Escuela Formativa Semilleros FC (escribe para autocompletar)'}
                    className="w-full border border-border bg-card rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500"
                  />

                  {/* Dropdown de Sugerencias de Entidades */}
                  {showEntitySuggestions && (
                    (() => {
                      const q = clientEntityName.trim().toLowerCase();
                      const list = q
                        ? savedEntities.filter(e => e.name.toLowerCase().includes(q) || (e.contactName && e.contactName.toLowerCase().includes(q))).slice(0, 8)
                        : savedEntities.filter(e => e.clientType !== 'standard').slice(0, 6);

                      if (list.length === 0) return null;

                      return (
                        <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-card border border-border rounded-2xl shadow-xl overflow-hidden divide-y divide-border/60 animate-in fade-in slide-in-from-top-1 duration-150">
                          <div className="p-2 bg-secondary/40 text-[10px] font-bold text-muted-foreground flex items-center justify-between">
                            <span>✨ Entidades y Escuelas Registradas ({list.length})</span>
                            <button
                              type="button"
                              onClick={() => setShowEntitySuggestions(false)}
                              className="hover:text-foreground text-[10px] underline cursor-pointer"
                            >
                              Cerrar
                            </button>
                          </div>
                          <div className="max-h-52 overflow-y-auto">
                            {list.map((ent, i) => (
                              <div
                                key={i}
                                onClick={() => handleSelectEntity(ent)}
                                className="p-2.5 hover:bg-violet-500/10 cursor-pointer flex items-center justify-between gap-2 transition-colors text-xs"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <strong className="font-extrabold text-foreground truncate">{ent.name}</strong>
                                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-violet-500/15 text-violet-700 dark:text-violet-300">
                                      {ent.clientType === 'school' ? 'Escuela' : (ent.clientType === 'entity' ? 'Entidad' : 'Particular')}
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-muted-foreground block truncate">
                                    Responsable: {ent.contactName || '—'} {ent.contactPhone ? `· 📞 ${ent.contactPhone}` : ''}
                                  </span>
                                </div>
                                {ent.customRate ? (
                                  <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 shrink-0">
                                    ${Number(ent.customRate).toLocaleString('es-CO')}/h
                                  </span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              ) : null}

              {/* Persona de Contacto & Teléfono */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <User size={12} /> Responsable *
                    </label>
                    {clientType === 'standard' && (
                      <button
                        type="button"
                        onClick={handleSaveCurrentEntity}
                        className="text-[10px] font-bold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 cursor-pointer"
                        title="Guardar este particular para futuros contratos"
                      >
                        <Sparkles size={11} /> Guardar particular
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => {
                      setCustomerName(e.target.value);
                      if (clientType === 'standard') setShowCustomerSuggestions(true);
                    }}
                    onFocus={() => {
                      if (clientType === 'standard') setShowCustomerSuggestions(true);
                    }}
                    placeholder="Nombre del encargado o particular"
                    className="w-full border border-border bg-card rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500"
                  />

                  {/* Dropdown de Sugerencias para Particular */}
                  {clientType === 'standard' && showCustomerSuggestions && (
                    (() => {
                      const q = customerName.trim().toLowerCase();
                      const list = q
                        ? savedEntities.filter(e => e.name.toLowerCase().includes(q) || (e.contactName && e.contactName.toLowerCase().includes(q))).slice(0, 8)
                        : savedEntities.slice(0, 6);

                      if (list.length === 0) return null;

                      return (
                        <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-card border border-border rounded-2xl shadow-xl overflow-hidden divide-y divide-border/60 animate-in fade-in slide-in-from-top-1 duration-150">
                          <div className="p-2 bg-secondary/40 text-[10px] font-bold text-muted-foreground flex items-center justify-between">
                            <span>✨ Clientes / Particulares Guardados ({list.length})</span>
                            <button
                              type="button"
                              onClick={() => setShowCustomerSuggestions(false)}
                              className="hover:text-foreground text-[10px] underline cursor-pointer"
                            >
                              Cerrar
                            </button>
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {list.map((cust, i) => (
                              <div
                                key={i}
                                onClick={() => handleSelectEntity(cust)}
                                className="p-2.5 hover:bg-violet-500/10 cursor-pointer flex items-center justify-between gap-2 transition-colors text-xs"
                              >
                                <div className="min-w-0">
                                  <strong className="font-extrabold text-foreground truncate block">{cust.name}</strong>
                                  <span className="text-[11px] text-muted-foreground block truncate">
                                    {cust.contactPhone ? `📞 ${cust.contactPhone}` : ''}
                                  </span>
                                </div>
                                {cust.customRate ? (
                                  <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 shrink-0">
                                    ${Number(cust.customRate).toLocaleString('es-CO')}/h
                                  </span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1.5">
                    <Phone size={12} /> Teléfono / WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={e => {
                      // Reemplaza todo lo que no sea número por nada
                      const numeroSolo = e.target.value.replace(/\D/g, "");
                      // Limita la entrada a un máximo de 10 dígitos
                      if (numeroSolo.length <= 10) {
                        setCustomerPhone(numeroSolo);
                      }
                    }}
                    placeholder="3001234567"
                    className="w-full border border-border bg-card rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500"
                  />

                  {/* Mensaje indicador cuando llega a los 10 dígitos colobianos */}
                  {customerPhone.length === 10 && (
                    <p className="text-[11px] text-emerald-600 font-medium mt-1 animate-pulse">
                      ✓ Los 10 dígitos están completos
                    </p>
                  )}
                </div>

              </div>

              {/* Tarifa Acordada y Forma de Pago */}
              <div className="p-4 rounded-2xl bg-secondary/30 border border-border space-y-3.5">
                <div className="flex items-center gap-1.5 text-xs font-black text-foreground">
                  <DollarSign size={14} className="text-violet-500" />
                  <span>Condiciones Financieras y Forma de Pago</span>
                </div>

                {/* Selector de Modalidad de Cobro */}
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    ¿Cómo va a ser la forma de pago? *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {BILLING_SCHEMES.map(b => {
                      const isSel = billingScheme === b.key;
                      return (
                        <button
                          key={b.key}
                          type="button"
                          onClick={() => {
                            setBillingScheme(b.key);
                            setPaymentMethod(b.defaultMethod);
                          }}
                          className={`p-2.5 rounded-xl text-left border-2 transition-all cursor-pointer ${isSel
                            ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500 shadow-xs ring-1 ring-violet-500/30'
                            : 'bg-card border-border text-muted-foreground hover:bg-secondary/40 hover:border-violet-400/40'
                            }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-black text-xs text-foreground">{b.label}</span>
                            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md ${isSel ? 'bg-violet-600 text-white' : 'bg-secondary text-muted-foreground'
                              }`}>
                              {b.badge}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 font-medium leading-tight">
                            {b.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1.5">
                      <Phone size={12} /> Teléfono / WhatsApp
                    </label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={e => {
                        // .replace() nos asegura que el resultado final sigue siendo un string
                        const numeroSolo: string = e.target.value.replace(/\D/g, "");

                        if (numeroSolo.length <= 10) {
                          setCustomerPhone(numeroSolo); // Ahora TS no se quejará
                        }
                      }}
                      placeholder="3001234567"
                      className="w-full border border-border bg-card rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500"
                    />

                    {customerPhone.length === 10 && (
                      <p className="text-[11px] text-emerald-600 font-medium mt-1">
                        ✓ Los 10 dígitos están completos
                      </p>
                    )}
                  </div>



                  <div>
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                      Medio o Canal de Recepción
                    </label>
                    <select
                      value={paymentChannel}
                      onChange={e => setPaymentChannel(e.target.value)}
                      className="w-full border border-border bg-card rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      <option value="transferencia_nequi">Transferencia Nequi / Daviplata</option>
                      <option value="bancolombia">Cuenta Bancolombia / Transferencia</option>
                      <option value="efectivo_caja">Efectivo en recepción / caja</option>
                      <option value="cuenta_cobrar">Facturación / Cuenta por cobrar</option>
                      <option value="tarjeta_datafono">Tarjeta Débito / Crédito (Datáfono)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1.5">
                  <StickyNote size={12} /> Notas o Acuerdos Especiales
                </label>
                <textarea
                  value={customerNote}
                  onChange={e => setCustomerNote(e.target.value)}
                  placeholder="Ej: Turno fijo martes y jueves, pagan los primeros 5 días de cada mes..."
                  rows={2}
                  className="w-full border border-border bg-card rounded-xl px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500"
                />
              </div>
            </div>
          )}

          {/* ═══════════════ PASO 2: SELECCIÓN DE CANCHA ═══════════════ */}
          {step === 'pitch' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-black text-foreground">2. Selecciona la Cancha a Utilizar</h3>
                <p className="text-xs text-muted-foreground">Elige la cancha donde jugará la entidad o escuela</p>
              </div>

              <div className="space-y-2.5">
                {pitches.map(p => {
                  const img = (p as any).media_urls?.[0] || (p as any).image_url;
                  const isSel = selectedPitch?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPitch(p)}
                      className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer ${isSel
                        ? 'border-violet-500 bg-violet-500/10 shadow-md ring-1 ring-violet-500/30'
                        : 'border-border bg-card hover:border-violet-400/40 hover:bg-secondary/40'
                        }`}
                    >
                      <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-secondary border border-border">
                        {img ? (
                          <img src={img} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl">⚽</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-black text-sm uppercase text-foreground">{p.name}</p>
                          {(p as any).is_combined && (
                            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/25">
                              COMBINADA
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {(p as any).type || 'Fútbol 5'} · {(p as any).surface || 'Sintética'}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-bold text-[#008744]">
                            Base: {formatCOP(p.price_per_hour || 0)}/h
                          </span>
                          {customRate && Number(customRate) !== p.price_per_hour && (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-700 dark:text-violet-300">
                              Pactado: {formatCOP(Number(customRate))}/h
                            </span>
                          )}
                        </div>
                      </div>
                      {isSel && (
                        <div className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                          <Check size={12} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══════════════ PASO 3: DURACIÓN, DÍAS Y HORARIOS CON HORAS OCUPADAS ═══════════════ */}
          {step === 'schedule' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-black text-foreground">3. Duración, Días y Horarios</h3>
                <p className="text-xs text-muted-foreground">
                  El sistema detecta automáticamente en tiempo real las horas que ya están ocupadas
                </p>
              </div>

              {/* Selector de Duración: 15 días, mes, trimestre, semestral, anual o personalizado */}
              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                  Período del Turno Fijo
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DURATIONS.map(d => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => setDuration(d.key)}
                      className={`p-2.5 rounded-xl text-left border-2 transition-all cursor-pointer ${duration === d.key
                        ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500 shadow-xs'
                        : 'bg-card border-border text-muted-foreground hover:border-violet-400/40 hover:bg-secondary/40'
                        }`}
                    >
                      <span className="block font-black text-xs text-foreground">{d.label}</span>
                      <span className="block text-[10px] text-muted-foreground mt-0.5 font-medium">{d.desc}</span>
                    </button>
                  ))}
                </div>

                {/* Opción personalizada */}
                {duration === 'custom' && (
                  <div className="mt-2.5 p-3 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center gap-3">
                    <span className="text-xs font-bold text-foreground">Cantidad de semanas:</span>
                    <input
                      type="number"
                      min={1}
                      max={104}
                      value={customWeeks}
                      onChange={e => setCustomWeeks(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-20 px-2.5 py-1.5 rounded-lg border border-border bg-card text-center font-black text-sm"
                    />
                    <span className="text-xs text-muted-foreground font-semibold">
                      ({customWeeks * selectedDays.length} turnos aprox.)
                    </span>
                  </div>
                )}
              </div>

              {/* Fecha de inicio */}
              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Fecha del Primer Partido
                </label>
                <input
                  type="date"
                  value={startDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setStartDate(e.target.value)}
                  className="border border-border bg-card rounded-xl px-3 py-2 text-xs font-semibold"
                />
              </div>

              {/* Días de la semana */}
              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Días de la semana en que juegan
                </label>
                <div className="grid grid-cols-7 gap-1.5">
                  {DAYS_OF_WEEK.map(d => {
                    const isSel = selectedDays.includes(d.key);
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => toggleDay(d.key)}
                        className={`py-2 rounded-xl text-xs font-black border-2 transition-all cursor-pointer text-center ${isSel
                          ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                          : 'bg-card border-border text-muted-foreground hover:border-violet-400/40'
                          }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Horas del turno con indicador visual de disponibilidad PREVIA */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Horario(s) del partido
                  </label>
                  {loadingOccupied ? (
                    <span className="text-[10px] text-violet-400 flex items-center gap-1 font-semibold">
                      <Loader2 size={11} className="animate-spin" /> Verificando disponibilidad...
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground font-medium">
                      Verificado en {contractDates.length} fechas
                    </span>
                  )}
                </div>

                {/* Barra de leyenda y estado antes de seleccionar */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-secondary/50 border border-border mb-2.5">
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="inline-flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-sm" /> Libre ({contractDates.length} fechas)
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-sm" /> Cruce parcial
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-bold text-red-600 dark:text-red-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block shadow-sm" /> 100% Ocupada
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {ALL_SLOTS.filter(s => !pitchAllowedSlots || pitchAllowedSlots.includes(s)).map(slot => {
                    const isSel = selectedSlots.includes(slot);
                    const totalTargetDates = contractDates.length;
                    const occupiedInDates = contractDates.filter(dt => occupiedDateSlots.has(`${dt}_${slot}`)).length;
                    const isFullyOccupied = occupiedInDates >= totalTargetDates && totalTargetDates > 0;
                    const isPartiallyOccupied = occupiedInDates > 0 && occupiedInDates < totalTargetDates;
                    const hasConflict = isSel && occupiedInDates > 0;

                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => toggleSlot(slot)}
                        className={`relative p-2.5 rounded-xl text-xs font-bold border-2 transition-all text-left flex flex-col justify-between gap-1.5 cursor-pointer ${isSel && hasConflict
                          ? 'bg-red-600 text-white border-red-500 shadow-md ring-2 ring-red-500/50'
                          : isSel
                            ? 'bg-violet-600 text-white border-violet-600 shadow-md ring-2 ring-violet-500/30'
                            : isFullyOccupied
                              ? 'bg-red-500/15 border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/25'
                              : isPartiallyOccupied
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25'
                                : 'bg-card border-border text-foreground hover:border-emerald-500/40 hover:bg-emerald-500/5'
                          }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-black text-xs">{fmt12(slot)}</span>
                          {isSel ? (
                            <Check size={12} className="shrink-0 text-white" />
                          ) : isFullyOccupied ? (
                            <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-600 dark:text-red-400">
                              Ocupada
                            </span>
                          ) : isPartiallyOccupied ? (
                            <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
                              {occupiedInDates} Cruce{occupiedInDates > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                              Libre
                            </span>
                          )}
                        </div>

                        {/* Indicador de disponibilidad ANTES de seleccionar */}
                        <div className="text-[9px] font-extrabold leading-none">
                          {isSel && hasConflict ? (
                            <span className="text-white font-black">
                              ⚠️ Cruce ({occupiedInDates} fecha{occupiedInDates > 1 ? 's' : ''})
                            </span>
                          ) : isFullyOccupied ? (
                            <span className={isSel ? 'text-white/90' : 'text-red-600 dark:text-red-400'}>
                              🔴 100% Ocupada ({occupiedInDates}/{totalTargetDates})
                            </span>
                          ) : isPartiallyOccupied ? (
                            <span className={isSel ? 'text-white/90' : 'text-amber-700 dark:text-amber-400 font-bold'}>
                              ⚠️ {occupiedInDates} de {totalTargetDates} ocupada{occupiedInDates > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className={isSel ? 'text-white/90' : 'text-emerald-600 dark:text-emerald-400 font-bold'}>
                              🟢 Libre ({totalTargetDates} fechas)
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Banner de alerta prominente ante conflictos de cruce */}
              {occupiedSessions.length > 0 && (
                <div className="p-4 bg-red-500/15 border-2 border-red-500/50 rounded-2xl text-red-600 dark:text-red-400 text-xs space-y-3 animate-in fade-in">
                  <div className="font-black flex items-center justify-between text-sm text-red-700 dark:text-red-300">
                    <span className="flex items-center gap-2">
                      <AlertTriangle size={18} className="text-red-600 dark:text-red-400 shrink-0" />
                      ⚠️ Fechas Ocupadas Detectadas ({occupiedSessions.length} de {allSessions.length} partidos)
                    </span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-red-600 text-white">
                      Bloqueo Activo
                    </span>
                  </div>

                  <p className="font-semibold text-xs leading-relaxed text-red-800 dark:text-red-300">
                    No se pueden omitir turnos ni permitir sobreventas. Las siguientes fechas ya tienen reservas previas en esta cancha:
                  </p>

                  {/* Lista de fechas en conflicto con opción de cambiar hora o día específico */}
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {occupiedSessions.map((s) => {
                      const isEditing = editingSessionKey === s.key;
                      return (
                        <div key={s.key} className="bg-background/80 border border-red-500/30 rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                              <span className="text-[10px] font-bold text-muted-foreground uppercase block">
                                Semana {s.weekNum}
                              </span>
                              <p className="font-black text-xs text-foreground">
                                🔴 {formatDateFriendly(s.date)} · <span className="text-red-600 dark:text-red-400">{fmt12(s.slot)}</span>
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => setEditingSessionKey(isEditing ? null : s.key)}
                              className="px-2.5 py-1 text-[11px] font-extrabold rounded-lg bg-red-500/15 text-red-700 dark:text-red-300 hover:bg-red-500/25 transition-colors cursor-pointer border border-red-500/30"
                            >
                              {isEditing ? 'Cerrar ajuste' : 'Cambiar hora o día →'}
                            </button>
                          </div>

                          {/* Editor individual de hora o día para esta semana */}
                          {isEditing && (
                            <div className="pt-2 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                              <div>
                                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                                  Cambiar hora de este día:
                                </label>
                                <select
                                  value={s.slot}
                                  onChange={(e) => {
                                    const newSlot = e.target.value;
                                    setSessionOverrides(prev => ({
                                      ...prev,
                                      [s.key]: { ...(prev[s.key] || {}), slot: newSlot }
                                    }));
                                  }}
                                  className="w-full border border-border bg-card rounded-lg px-2 py-1.5 text-xs font-bold"
                                >
                                  {ALL_SLOTS.map(sl => (
                                    <option key={sl} value={sl}>
                                      {fmt12(sl)}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                                  Mover fecha a otro día:
                                </label>
                                <input
                                  type="date"
                                  value={s.date}
                                  onChange={(e) => {
                                    const newDate = e.target.value;
                                    if (!newDate) return;
                                    setSessionOverrides(prev => ({
                                      ...prev,
                                      [s.key]: { ...(prev[s.key] || {}), date: newDate }
                                    }));
                                  }}
                                  className="w-full border border-border bg-card rounded-lg px-2 py-1 text-xs font-semibold"
                                />
                              </div>

                              {s.isCustomized && (
                                <div className="sm:col-span-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSessionOverrides(prev => {
                                        const next = { ...prev };
                                        delete next[s.key];
                                        return next;
                                      });
                                    }}
                                    className="text-[10px] font-bold text-muted-foreground hover:text-foreground underline cursor-pointer"
                                  >
                                    Restablecer a fecha y hora original ({formatDateFriendly(s.baseDate)} {fmt12(s.baseSlot)})
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-[11px] text-red-800 dark:text-red-300/80 font-semibold pt-1 border-t border-red-500/25">
                    💡 Puedes seleccionar otra hora general en la cuadrícula de arriba, o usar el botón "Cambiar hora o día" en cada fecha ocupada para reprogramarla a un horario disponible.
                  </p>
                </div>
              )}

              {/* Toggle para ver todas las fechas del turno fijo */}
              {allSessions.length > 0 && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowAllDatesList(prev => !prev)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-border bg-card hover:bg-secondary/40 text-xs font-bold text-foreground transition-all cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Calendar size={13} className="text-violet-500" />
                      <span>Ver todas las {allSessions.length} fechas programadas</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground font-semibold">
                      {showAllDatesList ? 'Ocultar calendario ▲' : 'Mostrar lista ▼'}
                    </span>
                  </button>

                  {showAllDatesList && (
                    <div className="p-3 bg-secondary/20 border border-border rounded-2xl max-h-56 overflow-y-auto space-y-1.5 animate-in fade-in">
                      {allSessions.map(s => {
                        const isOcc = occupiedDateSlots.has(`${s.date}_${s.slot}`);
                        return (
                          <div
                            key={s.key}
                            className={`flex items-center justify-between p-2 rounded-xl text-xs border ${isOcc
                              ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300 font-bold'
                              : 'bg-card border-border text-foreground font-medium'
                              }`}
                          >
                            <div>
                              <span className="text-[10px] text-muted-foreground mr-1.5">Sem. {s.weekNum}</span>
                              <span className="font-bold">{formatDateFriendly(s.date)}</span>
                              <span className="ml-2 font-black text-violet-600 dark:text-violet-400">{fmt12(s.slot)}</span>
                              {s.isCustomized && (
                                <span className="ml-1.5 text-[9px] px-1 py-0.2 rounded bg-violet-500/15 text-violet-600 font-extrabold">
                                  Ajustado
                                </span>
                              )}
                            </div>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${isOcc ? 'bg-red-600 text-white' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              }`}>
                              {isOcc ? '🔴 Ocupada' : '🟢 Libre'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Resumen en vivo */}
              {allDates.length > 0 && (
                <div className="bg-violet-500/10 border border-violet-500/30 rounded-2xl p-4 space-y-1.5">
                  <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-black text-violet-700 dark:text-violet-300">
                    <span>📋 Resumen de Calendario: {allSessions.length} partidos programados</span>
                    <span className="text-sm font-black text-foreground">{formatCOP(totalPrice)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    📅 Desde el <strong>{allDates[0]}</strong> hasta el <strong>{allDates[allDates.length - 1]}</strong>
                  </p>
                  <p className="text-[11px] text-muted-foreground font-medium">
                    Tarifa: <strong>{formatCOP(effectiveRate)} por partido/hora</strong> · Modalidad: <strong>{BILLING_SCHEMES.find(b => b.key === billingScheme)?.label}</strong>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ PASO 4: CONFIRMACIÓN Y TRAZABILIDAD ═══════════════ */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-black text-foreground">4. Confirmación del Turno Fijo</h3>
                <p className="text-xs text-muted-foreground">Verifica los datos antes de registrar las reservas automáticas</p>
              </div>

              {/* Tarjeta Ejecutiva de Resumen */}
              <div className="bg-gradient-to-br from-violet-500/15 via-violet-500/10 to-transparent border border-violet-500/30 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs">
                {/* Entidad / Escuela Badge */}
                <div className="flex items-center justify-between gap-2 border-b border-violet-500/20 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{clientType === 'entity' ? '' : clientType === 'school' ? '' : ''}</span>
                    <div>
                      <p className="font-black text-sm uppercase text-foreground">
                        {clientEntityName || customerName}
                      </p>
                      <p className="text-xs text-muted-foreground font-semibold">
                        {clientType === 'entity' ? 'Entidad Corporativa' : clientType === 'school' ? 'Escuela de Fútbol' : 'Grupo Particular'}
                        {customerName && clientEntityName ? ` · Resp: ${customerName}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-xl bg-violet-600 text-white uppercase">
                    {BILLING_SCHEMES.find(b => b.key === billingScheme)?.badge.toUpperCase() || 'TURNO FIJO'}
                  </span>
                </div>

                {/* Datos de Cancha y Días */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground uppercase font-bold text-[10px] block">Cancha</span>
                    <p className="font-extrabold text-foreground text-sm uppercase">{selectedPitch?.name}</p>
                    <p className="text-muted-foreground text-[11px]">{(selectedPitch as any)?.type || 'Fútbol 5'}</p>
                  </div>

                  <div>
                    <span className="text-muted-foreground uppercase font-bold text-[10px] block">Horarios</span>
                    <p className="font-extrabold text-foreground text-sm">
                      {selectedSlots.map(fmt12).join(', ')}
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      {DAYS_OF_WEEK.filter(d => selectedDays.includes(d.key)).map(d => d.full).join(', ')}
                    </p>
                  </div>

                  <div>
                    <span className="text-muted-foreground uppercase font-bold text-[10px] block">Período & Duración</span>
                    <p className="font-extrabold text-foreground">{durationObj.label}</p>
                    <p className="text-muted-foreground text-[11px]">
                      Del {allDates[0]} al {allDates[allDates.length - 1]}
                    </p>
                  </div>

                  <div>
                    <span className="text-muted-foreground uppercase font-bold text-[10px] block">Total Partidos</span>
                    <p className="font-extrabold text-violet-600 dark:text-violet-400 text-sm">
                      {totalSessions} partidos / horas
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      {formatCOP(effectiveRate)} / partido
                    </p>
                  </div>
                </div>

                {/* Total financiero y Forma de Pago */}
                <div className="pt-3 border-t border-violet-500/20 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">
                      Valor Total a Facturar
                    </span>
                    <p className="text-xl font-black text-violet-600 dark:text-violet-400">
                      {formatCOP(totalPrice)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">
                      Forma de Cobro
                    </span>
                    <span className="text-xs font-black text-foreground block">
                      {BILLING_SCHEMES.find(b => b.key === billingScheme)?.label || 'Mensualidad'}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-semibold">
                      {BILLING_SCHEMES.find(b => b.key === billingScheme)?.desc}
                    </span>
                  </div>
                </div>
              </div>

              {/* Mensaje de Disponibilidad y Estado de Cruces */}
              {occupiedSessions.length > 0 ? (
                <div className="bg-red-500/15 border-2 border-red-500/50 rounded-2xl p-4 flex items-start gap-3">
                  <AlertTriangle size={20} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div className="space-y-1.5 text-xs text-red-800 dark:text-red-300">
                    <p className="font-black text-sm text-red-700 dark:text-red-300">
                      ⛔ No se puede registrar: Hay {occupiedSessions.length} fecha(s) ocupada(s)
                    </p>
                    <p className="font-semibold leading-relaxed">
                      No se pueden omitir reservas ni permitir sobreventas. Las siguientes fechas ya tienen reservas previas en esta cancha:
                    </p>
                    <ul className="list-disc list-inside font-bold space-y-0.5">
                      {occupiedSessions.slice(0, 5).map((s, idx) => (
                        <li key={idx}>
                          {formatDateFriendly(s.date)} a las {fmt12(s.slot)} (Semana {s.weekNum})
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] font-medium pt-1 border-t border-red-500/20 text-red-800 dark:text-red-300">
                      Regresa al paso 3 para cambiar la hora o el día de la(s) fecha(s) ocupada(s) antes de continuar.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-start gap-3">
                  <Check size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 text-xs text-emerald-800 dark:text-emerald-300">
                    <p className="font-black text-sm text-emerald-700 dark:text-emerald-300">
                      ✅ Disponibilidad 100% Verificada ({allSessions.length} partidos)
                    </p>
                    <p className="font-medium">
                      Todas las fechas y horarios están totalmente libres en esta cancha. Ningún horario será omitido y se registrarán todos los partidos de forma segura.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer con Botones de Navegación */}
        <div className="px-5 py-3.5 border-t border-border bg-card shrink-0 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              const prev = prevStep[step];
              if (prev) setStep(prev);
              else onClose();
            }}
            className="px-4 py-2 border border-border text-muted-foreground hover:text-foreground text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            {prevStep[step] ? 'Atrás' : 'Cancelar'}
          </button>

          <div className="flex items-center gap-3">
            {step === 'schedule' && occupiedSessions.length > 0 && (
              <span className="text-[11px] font-extrabold text-red-600 dark:text-red-400 hidden sm:inline-flex items-center gap-1 bg-red-500/10 px-2.5 py-1 rounded-lg border border-red-500/25">
                <AlertTriangle size={13} /> {occupiedSessions.length} fecha(s) en conflicto
              </span>
            )}

            {step !== 'confirm' ? (
              <button
                type="button"
                onClick={() => {
                  if (!canGoNext[step]) return;
                  const next = nextStep[step];
                  if (next) setStep(next);
                }}
                disabled={!canGoNext[step]}
                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm active:scale-95"
              >
                Siguiente <ChevronRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || !!successMsg || occupiedSessions.length > 0}
                className="px-6 py-2.5 bg-[#008744] hover:bg-[#006633] disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md active:scale-95"
              >
                {loading ? (
                  <><Loader2 size={14} className="animate-spin" /> Guardando Turno Fijo…</>
                ) : (
                  <><FileText size={14} /> Registrar Turno Fijo</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
