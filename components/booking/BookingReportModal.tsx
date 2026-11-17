'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  X,
  BarChart3,
  Download,
  TrendingUp,
  Clock,
  DollarSign,
  Trophy,
  Calendar,
  Building2,
  Printer,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Users,
  Filter,
  Percent,
  Layers,
  ArrowUpRight,
  Sparkles,
  CalendarDays,
  FileSpreadsheet,
  Search
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface BookingReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookings: any[];
  pitches: any[];
  companyName?: string;
  initialTab?: ReportTab;
  initialEntityTarget?: any;
}

type Period = 'today' | 'week' | 'fortnight' | 'month' | 'quarter' | 'year' | 'custom';
type ReportTab = 'overview' | 'pitches' | 'hours' | 'cancellations' | 'customers' | 'entities';

interface PeriodOption {
  key: Period;
  label: string;
  badge: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCOP(n: number) {
  const val = typeof n === 'number' && !isNaN(n) ? n : Number(n) || 0;
  return `$${Math.round(val).toLocaleString('es-CO')}`;
}

function pct(part: number, total: number) {
  if (!total || isNaN(total) || total <= 0) return '0%';
  if (!part || isNaN(part) || part <= 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function fmt12(h: number) {
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:00 ${ampm}`;
}

function getPeriodRange(period: Period, customFrom?: string, customTo?: string): { from: Date; to: Date } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  switch (period) {
    case 'today': {
      const from = new Date(y, m, d, 0, 0, 0, 0);
      const to = new Date(y, m, d, 23, 59, 59, 999);
      return { from, to };
    }
    case 'week': {
      // Semana natural de Lunes a Domingo
      const day = now.getDay(); // 0 = Domingo, 1 = Lunes, ...
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const from = new Date(y, m, d + diffToMonday, 0, 0, 0, 0);
      const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6, 23, 59, 59, 999);
      return { from, to };
    }
    case 'fortnight': {
      // Quincena natural: 1 al 15 o 16 al fin de mes
      if (d <= 15) {
        const from = new Date(y, m, 1, 0, 0, 0, 0);
        const to = new Date(y, m, 15, 23, 59, 59, 999);
        return { from, to };
      } else {
        const from = new Date(y, m, 16, 0, 0, 0, 0);
        const to = new Date(y, m + 1, 0, 23, 59, 59, 999);
        return { from, to };
      }
    }
    case 'month': {
      // Mes natural: Día 1 al último día del mes
      const from = new Date(y, m, 1, 0, 0, 0, 0);
      const to = new Date(y, m + 1, 0, 23, 59, 59, 999);
      return { from, to };
    }
    case 'quarter': {
      // Trimestre natural (Q1: Ene-Mar, Q2: Abr-Jun, Q3: Jul-Sep, Q4: Oct-Dic)
      const qIndex = Math.floor(m / 3);
      const qStartMonth = qIndex * 3;
      const from = new Date(y, qStartMonth, 1, 0, 0, 0, 0);
      const to = new Date(y, qStartMonth + 3, 0, 23, 59, 59, 999);
      return { from, to };
    }
    case 'year': {
      // Año natural: 1 de Enero al 31 de Diciembre
      const from = new Date(y, 0, 1, 0, 0, 0, 0);
      const to = new Date(y, 11, 31, 23, 59, 59, 999);
      return { from, to };
    }
    case 'custom': {
      const ago30 = new Date(y, m, d - 30, 0, 0, 0, 0);
      const from = customFrom ? new Date(customFrom + 'T00:00:00-05:00') : ago30;
      const to = customTo ? new Date(customTo + 'T23:59:59-05:00') : new Date(y, m, d, 23, 59, 59, 999);
      return { from, to };
    }
  }
}

const PERIOD_OPTIONS: PeriodOption[] = [
  { key: 'today', label: 'Hoy', badge: '24h' },
  { key: 'week', label: 'Esta Semana', badge: 'Lun – Dom' },
  { key: 'fortnight', label: 'Quincena', badge: '1-15 o 16-Fin' },
  { key: 'month', label: 'Este Mes', badge: 'Día 1 a Fin' },
  { key: 'quarter', label: 'Trimestre', badge: 'Trim. Natural' },
  { key: 'year', label: 'Año en Curso', badge: '1 Ene – 31 Dic' },
  { key: 'custom', label: 'Personalizado', badge: 'Rango libre' },
];

function getBookingIncome(b: any): number {
  if (!b) return 0;
  const val = Number(b.total_price ?? b.pitches?.price_per_hour ?? 0);
  return isNaN(val) ? 0 : val;
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export function BookingReportModal({ isOpen, onClose, bookings = [], pitches = [], companyName, initialTab = 'overview', initialEntityTarget }: BookingReportModalProps) {
  const [period, setPeriod] = useState<Period>('month');
  const [activeTab, setActiveTab] = useState<ReportTab>(initialTab);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Sincronizar tab si se abre con una pestaña específica
  useEffect(() => {
    if (initialTab && isOpen) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  const safeBookings = useMemo(() => Array.isArray(bookings) ? bookings : [], [bookings]);
  const safePitches = useMemo(() => Array.isArray(pitches) ? pitches : [], [pitches]);

  // ── Rango y filtrado ────────────────────────────────────────────────────────
  const { from, to } = useMemo(() => getPeriodRange(period, customFrom, customTo), [period, customFrom, customTo]);

  // Todas las reservas en el rango de fecha
  const inRangeBookings = useMemo(() => {
    return safeBookings.filter(b => {
      if (!b || b.status === 'draft') return false;
      const timeVal = b.start_time || b.created_at;
      if (!timeVal) return false;
      const d = new Date(timeVal);
      if (isNaN(d.getTime())) return false;
      return d >= from && d <= to;
    });
  }, [safeBookings, from, to]);

  // Clasificación por estado
  const confirmedBookings = useMemo(() => inRangeBookings.filter(b => b.status === 'confirmed'), [inRangeBookings]);
  const pendingBookings = useMemo(() => inRangeBookings.filter(b => b.status === 'pending'), [inRangeBookings]);
  const cancelledBookings = useMemo(() => inRangeBookings.filter(b => b.status === 'cancelled' || b.status === 'rejected'), [inRangeBookings]);

  // ── Métricas Financieras y Operativas ───────────────────────────────────────
  const totalRevenue = useMemo(() => {
    return confirmedBookings.reduce((sum, b) => sum + getBookingIncome(b), 0);
  }, [confirmedBookings]);

  const depositRevenue = useMemo(() => {
    return confirmedBookings.reduce((sum, b) => {
      let d = Number(b.deposit_amount || 0);
      if (d === 0 && b.source !== 'owner_panel' && b.pitches && !b.is_loyalty_free) {
        const customPricing = b.pitches.custom_pricing || {};
        const isFixed = customPricing.booking_type === 'fixed';
        const pct = customPricing.booking_percentage || b.pitches.booking_percentage || 50;
        const tPrice = getBookingIncome(b);
        d = isFixed ? Number(customPricing.booking_fixed || 0) : (tPrice * Number(pct)) / 100;
      }
      return sum + d;
    }, 0);
  }, [confirmedBookings]);

  const lostRevenue = useMemo(() => {
    return cancelledBookings.reduce((sum, b) => sum + getBookingIncome(b), 0);
  }, [cancelledBookings]);

  const pendingPotentialRevenue = useMemo(() => {
    return pendingBookings.reduce((sum, b) => sum + getBookingIncome(b), 0);
  }, [pendingBookings]);

  const totalBookingsCount = inRangeBookings.length;
  const confirmedCount = confirmedBookings.length;
  const cancelledCount = cancelledBookings.length;
  const pendingCount = pendingBookings.length;

  const successRate = totalBookingsCount > 0 ? Math.round((confirmedCount / totalBookingsCount) * 100) : 0;
  const cancellationRate = totalBookingsCount > 0 ? Math.round((cancelledCount / totalBookingsCount) * 100) : 0;
  const averageTicket = confirmedCount > 0 ? Math.round(totalRevenue / confirmedCount) : 0;

  // ── Desglose por Cancha ─────────────────────────────────────────────────────
  const byCourt = useMemo(() => {
    const map: Record<string, { id: string; name: string; count: number; revenue: number; cancelledCount: number; lostRevenue: number }> = {};

    safePitches.forEach(p => {
      map[p.id] = { id: p.id, name: p.name, count: 0, revenue: 0, cancelledCount: 0, lostRevenue: 0 };
    });

    inRangeBookings.forEach(b => {
      const id = b.pitch_id;
      const name = b.pitches?.name || safePitches.find(p => p.id === id)?.name || 'Cancha';
      if (!map[id]) {
        map[id] = { id, name, count: 0, revenue: 0, cancelledCount: 0, lostRevenue: 0 };
      }
      if (b.status === 'confirmed') {
        map[id].count++;
        map[id].revenue += getBookingIncome(b);
      } else if (b.status === 'cancelled' || b.status === 'rejected') {
        map[id].cancelledCount++;
        map[id].lostRevenue += getBookingIncome(b);
      }
    });

    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [inRangeBookings, safePitches]);

  const topCourt = byCourt.length > 0 && byCourt[0].revenue > 0 ? byCourt[0] : null;
  const maxCourtRevenue = Math.max(...byCourt.map(c => c.revenue), 1);

  // ── Horas Más Activas (Horarios Pico) ───────────────────────────────────────
  const byHour = useMemo(() => {
    const map: Record<number, { hour: number; label: string; count: number; revenue: number }> = {};
    for (let h = 6; h <= 23; h++) {
      map[h] = { hour: h, label: fmt12(h), count: 0, revenue: 0 };
    }

    confirmedBookings.forEach(b => {
      try {
        if (!b?.start_time) return;
        const d = new Date(b.start_time);
        if (isNaN(d.getTime())) return;
        const h = parseInt(d.toLocaleString('es-CO', { hour: 'numeric', hour12: false, timeZone: 'America/Bogota' }), 10);
        if (map[h]) {
          map[h].count++;
          map[h].revenue += getBookingIncome(b);
        }
      } catch { }
    });

    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [confirmedBookings]);

  const peakHour = byHour.length > 0 && byHour[0].count > 0 ? byHour[0] : null;
  const maxHourCount = Math.max(...byHour.map(h => h.count), 1);

  // Franjas de tiempo: Mañana (6-12), Tarde (12-18), Noche (18-24)
  const timeBlocks = useMemo(() => {
    let manana = 0;
    let tarde = 0;
    let noche = 0;

    confirmedBookings.forEach(b => {
      try {
        if (!b?.start_time) return;
        const d = new Date(b.start_time);
        if (isNaN(d.getTime())) return;
        const h = parseInt(d.toLocaleString('es-CO', { hour: 'numeric', hour12: false, timeZone: 'America/Bogota' }), 10);
        if (h >= 6 && h < 12) manana++;
        else if (h >= 12 && h < 18) tarde++;
        else if (h >= 18 && h <= 23) noche++;
      } catch { }
    });

    const total = manana + tarde + noche;
    return {
      manana: { count: manana, pct: pct(manana, total) },
      tarde: { count: tarde, pct: pct(tarde, total) },
      noche: { count: noche, pct: pct(noche, total) },
    };
  }, [confirmedBookings]);

  // ── Clientes Más Frecuentes (Top Clientes) ──────────────────────────────────
  const topCustomers = useMemo(() => {
    const map: Record<string, { name: string; phone?: string; bookingsCount: number; totalSpent: number; lastBooking: string }> = {};

    confirmedBookings.forEach(b => {
      const key = b.customer_phone || b.customer_name || 'Desconocido';
      if (!map[key]) {
        map[key] = {
          name: b.customer_name || 'Cliente',
          phone: b.customer_phone || '',
          bookingsCount: 0,
          totalSpent: 0,
          lastBooking: b.start_time,
        };
      }
      map[key].bookingsCount++;
      map[key].totalSpent += getBookingIncome(b);
      if (new Date(b.start_time) > new Date(map[key].lastBooking)) {
        map[key].lastBooking = b.start_time;
      }
    });

    return Object.values(map).sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10);
  }, [confirmedBookings]);

  const uniqueCustomersCount = useMemo(() => {
    const set = new Set(confirmedBookings.map(b => b.customer_phone || b.customer_name).filter(Boolean));
    return set.size;
  }, [confirmedBookings]);

  // ── Reporte Ejecutivo: Entidades, Escuelas y Turnos Fijos con Trazabilidad Anual/Mensual ───
  const [selectedEntityTrace, setSelectedEntityTrace] = useState<any | null>(null);

  const entitiesReport = useMemo(() => {
    const map: Record<string, {
      id: string;
      name: string;
      type: 'entity' | 'school' | 'contract';
      contractId: string | null;
      pitchId: string;
      pitchName: string;
      paymentMethod: string;
      customRate: number;
      totalBookings: number;
      confirmedBookings: number;
      pendingBookings: number;
      totalBilled: number;
      totalReceivable: number;
      daysPlayed: { date: string; time: string; status: string; pitch: string; iso: string; price: number }[];
      allTimeHistory: {
        totalMatches: number;
        totalBilled: number;
        totalReceivable: number;
        byYear: Record<number, {
          year: number;
          matches: number;
          total: number;
          months: Record<number, {
            month: number;
            monthName: string;
            matches: number;
            total: number;
            items: { id: string; date: string; dayOfWeek: string; time: string; pitch: string; status: string; price: number }[];
          }>;
        }>;
      };
    }> = {};

    // 1. Procesar todo el historial histórico (meses y años) de safeBookings para trazabilidad
    safeBookings.forEach(b => {
      const isEntity = b.client_type === 'entity';
      const isSchool = b.client_type === 'school';
      const isContract =
        b.booking_type === 'contract' ||
        b.is_contract === true ||
        Boolean(b.contract_id) ||
        Boolean(b.billing_scheme) ||
        (b.customer_name && (b.customer_name.includes('[Contrato') || b.customer_name.includes('[Turno Fijo') || b.customer_name.includes('[ENTIDAD') || b.customer_name.includes('[ESCUELA'))) ||
        (b.note && (b.note.includes('[TURNO FIJO') || b.note.includes('CID:') || b.note.includes('ESQUEMA:')));

      if (!isEntity && !isSchool && !isContract) return;

      const entityName = (b.client_entity_name || b.customer_name || 'Sin nombre').trim();
      const type: 'entity' | 'school' | 'contract' = isEntity ? 'entity' : (isSchool ? 'school' : 'contract');
      const contractCid = b.contract_id || (b.note?.match(/CID:([a-zA-Z0-9_-]+)/i)?.[1]) || null;
      const key = `${type}-${entityName.toLowerCase()}-${b.pitch_id || 'p'}`;

      if (!map[key]) {
        map[key] = {
          id: key,
          name: entityName,
          type,
          contractId: contractCid,
          pitchId: b.pitch_id,
          pitchName: b.pitches?.name || 'Cancha',
          paymentMethod: b.payment_method || 'cuenta_cobrar',
          customRate: Number(b.custom_rate || b.total_price || b.pitches?.price_per_hour || 0),
          totalBookings: 0,
          confirmedBookings: 0,
          pendingBookings: 0,
          totalBilled: 0,
          totalReceivable: 0,
          daysPlayed: [],
          allTimeHistory: {
            totalMatches: 0,
            totalBilled: 0,
            totalReceivable: 0,
            byYear: {},
          },
        };
      }

      const rec = map[key];
      const inc = getBookingIncome(b);

      // Agregar a trazabilidad histórica multianual
      if (b.start_time) {
        const d = new Date(b.start_time);
        if (!isNaN(d.getTime())) {
          const year = d.getFullYear();
          const month = d.getMonth() + 1;
          const monthName = d.toLocaleDateString('es-CO', { month: 'long', timeZone: 'America/Bogota' });

          rec.allTimeHistory.totalMatches++;
          if (b.status === 'confirmed') rec.allTimeHistory.totalBilled += inc;
          if (b.payment_method === 'cuenta_cobrar' || b.payment_method === 'credito') {
            rec.allTimeHistory.totalReceivable += inc;
          }

          if (!rec.allTimeHistory.byYear[year]) {
            rec.allTimeHistory.byYear[year] = { year, matches: 0, total: 0, months: {} };
          }
          const yRec = rec.allTimeHistory.byYear[year];
          yRec.matches++;
          if (b.status === 'confirmed') yRec.total += inc;

          if (!yRec.months[month]) {
            yRec.months[month] = { month, monthName, matches: 0, total: 0, items: [] };
          }
          const mRec = yRec.months[month];
          mRec.matches++;
          if (b.status === 'confirmed') mRec.total += inc;

          mRec.items.push({
            id: b.id,
            date: d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' }),
            dayOfWeek: d.toLocaleDateString('es-CO', { weekday: 'short', timeZone: 'America/Bogota' }),
            time: d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' }),
            pitch: b.pitches?.name || 'Cancha',
            status: b.status,
            price: inc,
          });
        }
      }

      // Si está en el rango seleccionado de fechas del modal
      const timeVal = b.start_time || b.created_at;
      if (timeVal) {
        const d = new Date(timeVal);
        if (!isNaN(d.getTime()) && d >= from && d <= to) {
          rec.totalBookings++;
          if (b.status === 'confirmed') {
            rec.confirmedBookings++;
            rec.totalBilled += inc;
          } else if (b.status === 'pending') {
            rec.pendingBookings++;
          }

          if (b.payment_method === 'cuenta_cobrar' || b.payment_method === 'credito') {
            rec.totalReceivable += inc;
          }

          if (b.start_time) {
            rec.daysPlayed.push({
              date: new Date(b.start_time).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', weekday: 'short', timeZone: 'America/Bogota' }),
              time: new Date(b.start_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' }),
              status: b.status,
              pitch: b.pitches?.name || 'Cancha',
              iso: b.start_time,
              price: inc,
            });
          }
        }
      }
    });

    const list = Object.values(map).sort((a, b) => b.allTimeHistory.totalBilled - a.allTimeHistory.totalBilled);
    const totalEntities = list.length;
    const totalBilledAll = list.reduce((s, e) => s + (e.totalBilled || e.allTimeHistory.totalBilled), 0);
    const totalReceivableAll = list.reduce((s, e) => s + (e.totalReceivable || e.allTimeHistory.totalReceivable), 0);
    const totalMatchesAll = list.reduce((s, e) => s + (e.confirmedBookings || e.allTimeHistory.totalMatches), 0);
    const avgRateAll = totalMatchesAll > 0 ? Math.round(totalBilledAll / totalMatchesAll) : 0;

    return {
      list,
      totalEntities,
      totalBilledAll,
      totalReceivableAll,
      totalMatchesAll,
      avgRateAll,
    };
  }, [safeBookings, from, to]);

  // Si se solicita abrir la trazabilidad de un contrato específico directamente
  useEffect(() => {
    if (isOpen && initialEntityTarget && entitiesReport.list.length > 0) {
      const targetCid =
        initialEntityTarget.contract_id ||
        initialEntityTarget.contractId ||
        (initialEntityTarget.note?.match(/CID:([a-zA-Z0-9_-]+)/i)?.[1]);

      const rawTargetName = (
        initialEntityTarget.client_entity_name ||
        initialEntityTarget.entityName ||
        initialEntityTarget.customer_name ||
        initialEntityTarget.customerName ||
        ''
      ).trim();

      const cleanTargetName = rawTargetName
        .replace(/\[(Turno Fijo|Contrato|ENTIDAD|ESCUELA)[^\]]*\]/gi, '')
        .replace(/CID:[a-zA-Z0-9_-]+/gi, '')
        .trim().toLowerCase();

      const targetPitchId = initialEntityTarget.pitch_id || initialEntityTarget.pitchId;

      // Buscar coincidencia exacta por CID o por nombre de entidad/particular
      const match = entitiesReport.list.find(ent => {
        if (targetCid && ent.contractId && ent.contractId === targetCid) {
          return true;
        }
        const cleanEntName = ent.name
          .replace(/\[(Turno Fijo|Contrato|ENTIDAD|ESCUELA)[^\]]*\]/gi, '')
          .replace(/CID:[a-zA-Z0-9_-]+/gi, '')
          .trim().toLowerCase();
        if (cleanTargetName && (cleanEntName === cleanTargetName || cleanEntName.includes(cleanTargetName) || cleanTargetName.includes(cleanEntName))) {
          if (!targetPitchId || ent.pitchId === targetPitchId) {
            return true;
          }
          return true;
        }
        return false;
      });

      if (match) {
        setSelectedEntityTrace(match);
        setActiveTab('entities');
      }
    } else if (!isOpen) {
      setSelectedEntityTrace(null);
    }
  }, [isOpen, initialEntityTarget, entitiesReport.list]);

  // ── Exportación a PDF / Impresión Ejecutiva ──────────────────────────────────
  const handleDownloadPDF = useCallback(() => {
    const periodLabel = PERIOD_OPTIONS.find(p => p.key === period)?.label || 'Período';
    const dateRange = `${from.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })} – ${to.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    const generatedAt = new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' });
    const pendingBalance = Math.max(0, totalRevenue - depositRevenue);

    const courtRows = byCourt.map((c, i) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;">${i + 1}. ${c.name}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:600;">${c.count}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:800;color:#0f766e;">${formatCOP(c.revenue)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;color:#64748b;font-weight:600;">${pct(c.revenue, totalRevenue)}</td>
      </tr>
    `).join('');

    const topCustomersRows = topCustomers.map((c, i) => {
      const isVip = c.bookingsCount >= 10;
      const isFrequent = c.bookingsCount >= 5;
      const tierBadge = isVip
        ? '<span style="background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:12px;font-weight:800;font-size:10px;">VIP ORO</span>'
        : isFrequent
          ? '<span style="background:#ecfdf5;color:#047857;padding:2px 8px;border-radius:12px;font-weight:700;font-size:10px;">FRECUENTE</span>'
          : '<span style="background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:12px;font-weight:600;font-size:10px;">ACTIVO</span>';

      return `
        <tr>
          <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;font-weight:800;color:#64748b;text-align:center;">#${i + 1}</td>
<td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;text-transform:capitalize;">${c.name}</td>
          <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;color:#475569;font-weight:500;">${c.phone || '—'}</td>
          <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:800;color:#0f172a;">${c.bookingsCount}</td>
          <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:800;color:#0f766e;">${formatCOP(c.totalSpent)}</td>
          <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${tierBadge}</td>
        </tr>
      `;
    }).join('');

    const topHoursRows = byHour.filter(h => h.count > 0).slice(0, 8).map((h, i) => `
      <tr>
        <td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;">#${i + 1} &nbsp;  ${h.label}</td>
        <td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;">${h.count} partidos</td>
        <td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#0f766e;">${formatCOP(h.revenue)}</td>
        <td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;text-align:right;color:#64748b;font-weight:600;">${pct(h.count, confirmedCount)} del volumen</td>
      </tr>
    `).join('');

    const cancelRows = cancelledBookings.slice(0, 10).map((b, i) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;text-transform:capitalize;">${i + 1}. ${b.customer_name || 'Cliente'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${b.pitches?.name || 'Cancha'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${b.start_time ? new Date(b.start_time).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:#e11d48;font-weight:700;">${formatCOP(getBookingIncome(b))}</td>
      </tr>
    `).join('');

    const entityRows = entitiesReport.list.map((e, i) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:700;text-transform:capitalize;">${i + 1}. ${e.name} (${e.type === 'entity' ? 'Entidad' : e.type === 'school' ? 'Escuela' : 'Turno Fijo'})</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-transform:capitalize;">${e.pitchName}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">${formatCOP(e.customRate)}/h</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;">${e.confirmedBookings}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:800;color:#0f766e;">${formatCOP(e.totalBilled)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;color:#b45309;font-weight:700;">${e.totalReceivable > 0 ? formatCOP(e.totalReceivable) : '$0'}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Reporte Ejecutivo – ${companyName || 'Cancheros'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; background: #fff; padding: 36px; line-height: 1.45; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 24px; }
    .title-h1 { font-size: 24px; font-weight: 900; letter-spacing: -0.02em; color: #0f172a; }
    .subtitle { font-size: 13px; color: #475569; margin-top: 4px; font-weight: 500; }
    .meta-box { text-align: right; font-size: 11px; color: #64748b; line-height: 1.6; }
    .meta-box strong { color: #0f172a; }
    .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
    .kpi-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; text-align: left; }
    .kpi-card .lbl { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .kpi-card .val { font-size: 22px; font-weight: 900; color: #0f172a; }
    .kpi-card .sub { font-size: 11px; color: #0f766e; font-weight: 700; margin-top: 4px; }
    .kpi-card.highlight { background: #042f2e; color: #fff; border-color: #115e59; }
    .kpi-card.highlight .lbl { color: #99f6e4; }
    .kpi-card.highlight .val { color: #fff; }
    .kpi-card.highlight .sub { color: #5eead4; }
    .section { margin-bottom: 26px; }
    .section-title { font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; color: #0f172a; margin-bottom: 10px; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f1f5f9; color: #334155; padding: 8px 14px; text-align: left; font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1.5px solid #cbd5e1; }
    .footer { margin-top: 36px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; align-items: center; }
    @media print {
      body { padding: 20px; }
      @page { margin: 1.5cm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title-h1">${companyName || 'Complejo Deportivo'}</div>
      <div class="subtitle">Informe Ejecutivo de Gestión, Ocupación y Rendimiento Financiero</div>
    </div>
    <div class="meta-box">
      <div><strong>Período:</strong> ${periodLabel} (${dateRange})</div>
      <div><strong>Emitido:</strong> ${generatedAt}</div>
      <div><strong>Estado Auditoría:</strong> Verificado por Cancheros</div>
    </div>
  </div>

  <div class="kpi-row">
    <div class="kpi-card highlight">
      <div class="lbl">Total Facturado Confirmado</div>
      <div class="val">${formatCOP(totalRevenue)}</div>
      <div class="sub">${confirmedCount} partidos aprobados</div>
    </div>
    <div class="kpi-card">
      <div class="lbl">Total Abonos Recaudados</div>
      <div class="val" style="color:#0f766e;">${formatCOP(depositRevenue)}</div>
      <div class="sub">${pct(depositRevenue, totalRevenue)} recaudado en anticipo</div>
    </div>
    <div class="kpi-card">
      <div class="lbl">Saldo Pendiente por Cobrar</div>
      <div class="val" style="color:#b45309;">${formatCOP(pendingBalance)}</div>
      <div class="sub">Cobro en taquilla / crédito</div>
    </div>
    <div class="kpi-card">
      <div class="lbl">Clientes Únicos / Usuarios</div>
      <div class="val" style="color:#4f46e5;">${uniqueCustomersCount}</div>
      <div class="sub">Jugadores distintos en período</div>
    </div>
  </div>

  <div class="kpi-row" style="margin-bottom:28px;">
    <div class="kpi-card">
      <div class="lbl">Hora Pico Más Demandada</div>
      <div class="val" style="font-size:18px;">${peakHour ? ` ${peakHour.label}` : 'N/A'}</div>
      <div class="sub">${peakHour ? `${peakHour.count} partidos jugados` : 'Sin registros'}</div>
    </div>
    <div class="kpi-card">
      <div class="lbl">Tasa de Efectividad</div>
      <div class="val">${successRate}%</div>
      <div class="sub">${confirmedCount} de ${totalBookingsCount} solicitudes</div>
    </div>
    <div class="kpi-card">
      <div class="lbl">Ticket Promedio</div>
      <div class="val">${formatCOP(averageTicket)}</div>
      <div class="sub">Por reserva confirmada</div>
    </div>
    <div class="kpi-card">
      <div class="lbl">Cancelaciones</div>
      <div class="val" style="color:#e11d48;">${cancelledCount} (${cancellationRate}%)</div>
      <div class="sub" style="color:#e11d48;">-${formatCOP(lostRevenue)} no ingresado</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title"> Rendimiento y Cuota de Facturación por Cancha</div>
    <table>
      <thead>
        <tr>
          <th>Cancha</th>
          <th style="text-align:center;">Partidos</th>
          <th style="text-align:right;">Recaudo Total</th>
          <th style="text-align:right;">Participación</th>
        </tr>
      </thead>
      <tbody>
        ${courtRows}
      </tbody>
    </table>
  </div>

  ${topCustomersRows ? `
  <div class="section">
    <div class="section-title"> Top 10 Clientes Frecuentes con Mayor Asistencia</div>
    <table>
      <thead>
        <tr>
          <th style="text-align:center;">#</th>
          <th>Nombre del Cliente</th>
          <th>Teléfono / Contacto</th>
          <th style="text-align:center;">Partidos Jugados</th>
          <th style="text-align:right;">Gasto Total Aportado</th>
          <th style="text-align:center;">Categoría</th>
        </tr>
      </thead>
      <tbody>
        ${topCustomersRows}
      </tbody>
    </table>
  </div>` : ''}

  ${topHoursRows ? `
  <div class="section">
    <div class="section-title"> Franjas Horarias con Mayor Recaudo (Horas Pico Demandadas)</div>
    <table>
      <thead>
        <tr>
          <th>Horario</th>
          <th style="text-align:center;">Volumen Reservas</th>
          <th style="text-align:right;">Ingreso Generado</th>
          <th style="text-align:right;">Cuota de Demanda</th>
        </tr>
      </thead>
      <tbody>
        ${topHoursRows}
      </tbody>
    </table>
  </div>` : ''}

  ${entityRows.length > 0 ? `
  <div class="section">
    <div class="section-title">Control Corporativo: Entidades, Escuelas y Turnos Fijos</div>
    <table>
      <thead>
        <tr>
          <th>Entidad / Escuela</th>
          <th>Cancha</th>
          <th style="text-align:right;">Tarifa Acordada</th>
          <th style="text-align:center;">Partidos</th>
          <th style="text-align:right;">Total Facturado</th>
          <th style="text-align:right;">Por Cobrar (Crédito)</th>
        </tr>
      </thead>
      <tbody>
        ${entityRows}
      </tbody>
    </table>
  </div>` : ''}

  ${cancelledBookings.length > 0 ? `
  <div class="section">
    <div class="section-title"> Control de Cancelaciones y Pérdida de Ocupación</div>
    <table>
      <thead>
        <tr>
          <th>Cliente</th>
          <th>Cancha</th>
          <th style="text-align:center;">Fecha</th>
          <th style="text-align:right;">Valor No Percibido</th>
        </tr>
      </thead>
      <tbody>
        ${cancelRows}
      </tbody>
    </table>
  </div>` : ''}

  <div class="footer">
    <span>Cancheros · Plataforma de Gestión de Complejos Deportivos</span>
    <span>Reporte Oficial para Gerencia y Socios</span>
  </div>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=950,height=750,scrollbars=yes');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 400);
  }, [period, from, to, companyName, byCourt, byHour, cancelledBookings, totalRevenue, depositRevenue, confirmedCount, totalBookingsCount, successRate, averageTicket, cancelledCount, cancellationRate, lostRevenue, topCustomers, uniqueCustomersCount, entitiesReport, peakHour]);

  // ── Impresión de Hoja de Trazabilidad y Estado de Cuenta Individual ───────────
  const handlePrintSingleTraceability = useCallback((ent: any) => {
    if (!ent) return;
    const generatedAt = new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' });
    const years = Object.values(ent.allTimeHistory?.byYear || {}).sort((a: any, b: any) => b.year - a.year);

    let rowsHtml = '';
    years.forEach((y: any) => {
      const months = Object.values(y.months || {}).sort((a: any, b: any) => b.month - a.month);
      rowsHtml += `
        <tr style="background:#f1f5f9;">
          <td colspan="5" style="padding:9px 12px;font-weight:900;color:#0f172a;text-transform:uppercase;font-size:11px;letter-spacing:0.05em;border-top:2px solid #cbd5e1;border-bottom:1.5px solid #cbd5e1;">
            AÑO ${y.year} — ${y.matches} turnos / partidos acumulados (${formatCOP(y.total)})
          </td>
        </tr>
      `;
      months.forEach((m: any) => {
        rowsHtml += `
          <tr style="background:#f8fafc;">
            <td colspan="5" style="padding:7px 12px;font-weight:700;color:#475569;font-size:11px;border-bottom:1px solid #e2e8f0;">
              • Mes de ${m.monthName} (${m.matches} turnos — ${formatCOP(m.total)})
            </td>
          </tr>
        `;
        m.items.forEach((it: any, idx: number) => {
          const statusBadge = it.status === 'confirmed'
            ? '<span style="color:#0f766e;font-weight:bold;">Aprobado</span>'
            : (it.status === 'pending' ? '<span style="color:#b45309;font-weight:bold;">Por Aprobar</span>' : '<span style="color:#e11d48;font-weight:bold;">Cancelado</span>');
          rowsHtml += `
            <tr>
              <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;font-weight:600;">${idx + 1}</td>
              <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;">${it.dayOfWeek.toUpperCase()}, ${it.date} — ${it.time}</td>
              <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;">${it.pitch}</td>
              <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;text-align:center;">${statusBadge}</td>
              <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:#0f172a;">${formatCOP(it.price)}</td>
            </tr>
          `;
        });
      });
    });

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Trazabilidad Turno Fijo – ${ent.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; background: #fff; padding: 36px; line-height: 1.45; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; }
    .title-h1 { font-size: 22px; font-weight: 900; }
    .subtitle { font-size: 13px; color: #475569; margin-top: 4px; }
    .meta-box { text-align: right; font-size: 11px; color: #64748b; line-height: 1.6; }
    .info-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px 18px; margin-bottom: 22px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .info-item .lbl { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 3px; }
    .info-item .val { font-size: 15px; font-weight: 900; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
    th { background: #0f172a; color: #fff; padding: 8px 12px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 50px; padding-top: 20px; }
    .sign-line { border-top: 1.5px solid #0f172a; padding-top: 8px; text-align: center; font-size: 11px; font-weight: 700; color: #334155; }
    @media print { body { padding: 20px; } @page { margin: 1.5cm; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title-h1">${companyName || 'Complejo Deportivo'}</div>
      <div class="subtitle">Hoja Oficial de Trazabilidad y Estado de Cuenta — Turno Fijo / Convenio</div>
    </div>
    <div class="meta-box">
      <div><strong>Fecha Emisión:</strong> ${generatedAt}</div>
      <div><strong>Cliente / Titular:</strong> ${ent.name}</div>
      <div><strong>Categoría:</strong> ${ent.type === 'entity' ? 'Entidad / Empresa' : (ent.type === 'school' ? 'Escuela de Fútbol' : 'Turno Fijo')}</div>
    </div>
  </div>

  <div class="info-card">
    <div class="info-item">
      <div class="lbl">Cancha Asignada</div>
      <div class="val">${ent.pitchName}</div>
    </div>
    <div class="info-item">
      <div class="lbl">Tarifa Acordada</div>
      <div class="val">${formatCOP(ent.customRate)}/hora</div>
    </div>
    <div class="info-item">
      <div class="lbl">Partidos Históricos</div>
      <div class="val">${ent.allTimeHistory?.totalMatches || 0} turnos</div>
    </div>
    <div class="info-item">
      <div class="lbl">Total Facturado Histórico</div>
      <div class="val" style="color:#0f766e;">${formatCOP(ent.allTimeHistory?.totalBilled || 0)}</div>
    </div>
  </div>

  ${ent.allTimeHistory?.totalReceivable > 0 ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;padding:10px 16px;border-radius:10px;margin-bottom:20px;font-size:12px;color:#92400e;">
      <strong>⚠️ Cuenta por Cobrar Vigente:</strong> Se registran <strong>${formatCOP(ent.allTimeHistory.totalReceivable)}</strong> bajo modalidad de Crédito / Cuenta por Cobrar.
    </div>
  ` : ''}

  <h3 style="font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;color:#0f172a;">Historial Cronológico de Turnos (Meses y Años)</h3>
  <table>
    <thead>
      <tr>
        <th style="width:30px;">#</th>
        <th>Fecha y Horario</th>
        <th>Cancha</th>
        <th style="text-align:center;">Estado</th>
        <th style="text-align:right;">Valor Liquidado</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || '<tr><td colspan="5" style="text-align:center;padding:16px;">Sin registros históricos</td></tr>'}
    </tbody>
  </table>

  <div class="signatures">
    <div>
      <div class="sign-line">Administración / Gerencia<br />${companyName || 'Complejo Deportivo'}</div>
    </div>
    <div>
      <div class="sign-line">Representante Autorizado<br />${ent.name}</div>
    </div>
  </div>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=950,height=750,scrollbars=yes');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 400);
  }, [companyName]);

  // ── Clientes: todos, con búsqueda (período seleccionado o todo el historial) ──
  const [clientScope, setClientScope] = useState<'all' | 'period'>('all');
  const [clientSearch, setClientSearch] = useState('');
  const [clientSort, setClientSort] = useState<'approved' | 'spent' | 'recent' | 'name'>('approved');
  const [clientLimit, setClientLimit] = useState(30);
  const [entitySearch, setEntitySearch] = useState('');
  const [entityFilter, setEntityFilter] = useState<'all' | 'entity' | 'school' | 'contract'>('all');

  const clients = useMemo(() => {
    const source = clientScope === 'all' ? safeBookings.filter(b => b && b.status !== 'draft') : inRangeBookings;
    const map = new Map<string, ClientRow>();
    source.forEach(b => {
      const phone = normalizePhone(b.customer_phone);
      const name = cleanClientName(b.client_entity_name || b.customer_name);
      const key = phone ? `p:${phone}` : b.user_id ? `u:${b.user_id}` : name ? `n:${name.toLowerCase()}` : '';
      if (!key) return;
      let row = map.get(key);
      if (!row) {
        row = { key, name: name || 'Cliente sin nombre', phone: phone ? String(b.customer_phone).trim() : '', approved: 0, pending: 0, cancelled: 0, spent: 0, last: null, pitches: {} };
        map.set(key, row);
      }
      if (name && row.name === 'Cliente sin nombre') row.name = name;
      if (b.status === 'confirmed') {
        row.approved++;
        row.spent += getBookingIncome(b);
        const pitchName = b.pitches?.name || 'Cancha';
        row.pitches[pitchName] = (row.pitches[pitchName] || 0) + 1;
      } else if (b.status === 'pending') row.pending++;
      else if (b.status === 'cancelled' || b.status === 'rejected') row.cancelled++;
      if (b.start_time && (!row.last || b.start_time > row.last)) row.last = b.start_time;
    });
    return [...map.values()];
  }, [clientScope, safeBookings, inRangeBookings]);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    const list = clients.filter(c => !q
      || c.name.toLowerCase().includes(q)
      || (qDigits.length >= 3 && c.phone.replace(/\D/g, '').includes(qDigits)));
    const sorted = [...list].sort((a, b) => {
      if (clientSort === 'spent') return b.spent - a.spent;
      if (clientSort === 'recent') return (b.last || '').localeCompare(a.last || '');
      if (clientSort === 'name') return a.name.localeCompare(b.name, 'es');
      return b.approved - a.approved || b.spent - a.spent;
    });
    return sorted;
  }, [clients, clientSearch, clientSort]);

  const clientTotals = useMemo(() => ({
    count: filteredClients.length,
    approved: filteredClients.reduce((s, c) => s + c.approved, 0),
    spent: filteredClients.reduce((s, c) => s + c.spent, 0),
  }), [filteredClients]);

  const filteredEntities = useMemo(() => {
    const q = entitySearch.trim().toLowerCase();
    return entitiesReport.list.filter(e =>
      (entityFilter === 'all' || e.type === entityFilter) &&
      (!q || e.name.toLowerCase().includes(q) || e.pitchName.toLowerCase().includes(q)));
  }, [entitiesReport.list, entitySearch, entityFilter]);

  const hoursChrono = useMemo(() => [...byHour].sort((a, b) => a.hour - b.hour), [byHour]);

  // Si la hoja de trazabilidad se abrió desde una reserva, al cerrarla se vuelve a la gestión de reservas.
  const openedFromBooking = Boolean(initialEntityTarget);
  const closeTrace = () => {
    setSelectedEntityTrace(null);
    if (openedFromBooking) onClose();
  };

  if (!isOpen) return null;

  const rangeLabel = `${from.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} – ${to.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const blocksTotal = timeBlocks.manana.count + timeBlocks.tarde.count + timeBlocks.noche.count;

  const TABS: { key: ReportTab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Resumen', icon: <TrendingUp size={15} /> },
    { key: 'customers', label: 'Clientes', icon: <Users size={15} /> },
    { key: 'entities', label: 'Turnos fijos y entidades', icon: <Building2 size={15} /> },
    { key: 'pitches', label: 'Canchas', icon: <Layers size={15} /> },
    { key: 'hours', label: 'Horarios', icon: <Clock size={15} /> },
    { key: 'cancellations', label: 'Cancelaciones', icon: <XCircle size={15} /> },
  ];

  return (
    <div className="fixed inset-0 z-[300] flex items-stretch sm:items-center justify-center sm:p-5 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-background sm:border border-border sm:rounded-3xl shadow-2xl w-full max-w-5xl h-full sm:h-auto sm:max-h-[94vh] flex flex-col overflow-hidden">

        {/* ── Encabezado ── */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <BarChart3 size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-foreground truncate">Reportes</h2>
              <p className="text-xs text-muted-foreground truncate">{companyName || 'Tu complejo'} · {rangeLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Cerrar reportes">
            <X size={20} />
          </button>
        </div>

        {/* ── Período ── */}
        <div className="px-4 sm:px-6 py-3 border-b border-border bg-secondary/20 shrink-0 space-y-2">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <CalendarDays size={15} className="text-muted-foreground shrink-0 mr-0.5" />
            {PERIOD_OPTIONS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer border transition-colors ${period === p.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5 font-semibold text-muted-foreground">Desde
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="border border-border bg-background rounded-xl px-2.5 py-1.5 text-foreground" />
              </label>
              <label className="flex items-center gap-1.5 font-semibold text-muted-foreground">Hasta
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="border border-border bg-background rounded-xl px-2.5 py-1.5 text-foreground" />
              </label>
            </div>
          )}
        </div>

        {/* ── Pestañas ── */}
        <div className="px-2 sm:px-4 border-b border-border bg-card flex items-center gap-0.5 overflow-x-auto no-scrollbar shrink-0">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-3 border-b-2 text-xs sm:text-sm font-bold whitespace-nowrap cursor-pointer transition-colors ${activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* ── Contenido ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-background">

          {/* ═══════ RESUMEN ═══════ */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi tone="primary" label="Dinero de reservas aprobadas" value={formatCOP(totalRevenue)} hint={`${confirmedCount} ${confirmedCount === 1 ? 'reserva aprobada' : 'reservas aprobadas'}`} icon={<DollarSign size={16} />} />
                <Kpi label="Reservas aprobadas" value={`${confirmedCount}`} hint={`${successRate}% de ${totalBookingsCount} solicitudes`} icon={<CheckCircle2 size={16} className="text-emerald-500" />} />
                <Kpi tone="amber" label="Por aprobar" value={`${pendingCount}`} hint={`${formatCOP(pendingPotentialRevenue)} en espera`} icon={<AlertTriangle size={16} />} />
                <Kpi tone="rose" label="Canceladas" value={`${cancelledCount}`} hint={`${formatCOP(lostRevenue)} que no ingresó`} icon={<XCircle size={16} />} />
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <MiniStat label="Cancha que más vende" value={topCourt?.name || '—'} hint={topCourt ? formatCOP(topCourt.revenue) : 'Sin datos'} />
                <MiniStat label="Hora más pedida" value={peakHour?.label || '—'} hint={peakHour ? `${peakHour.count} reservas` : 'Sin datos'} />
                <MiniStat label="Clientes distintos" value={`${uniqueCustomersCount}`} hint="Con reservas aprobadas" />
                <MiniStat label="Valor promedio" value={formatCOP(averageTicket)} hint="Por reserva aprobada" />
              </div>

              <Card title="¿A qué hora juegan más?" icon={<Clock size={15} />}>
                <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-secondary">
                  {blocksTotal > 0 && (
                    <>
                      <div className="bg-amber-400" style={{ width: `${(timeBlocks.manana.count / blocksTotal) * 100}%` }} />
                      <div className="bg-sky-500" style={{ width: `${(timeBlocks.tarde.count / blocksTotal) * 100}%` }} />
                      <div className="bg-indigo-600" style={{ width: `${(timeBlocks.noche.count / blocksTotal) * 100}%` }} />
                    </>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  {[
                    { label: 'Mañana', sub: '6 am – 12 m', d: timeBlocks.manana, dot: 'bg-amber-400' },
                    { label: 'Tarde', sub: '12 m – 6 pm', d: timeBlocks.tarde, dot: 'bg-sky-500' },
                    { label: 'Noche', sub: '6 pm – 12 am', d: timeBlocks.noche, dot: 'bg-indigo-600' },
                  ].map(x => (
                    <div key={x.label} className="rounded-xl bg-secondary/40 p-2.5">
                      <p className="text-xs font-bold text-foreground flex items-center justify-center gap-1.5"><span className={`h-2 w-2 rounded-full ${x.dot}`} />{x.label}</p>
                      <p className="text-lg font-black text-foreground">{x.d.count}</p>
                      <p className="text-[10px] text-muted-foreground">{x.sub} · {x.d.pct}</p>
                    </div>
                  ))}
                </div>
              </Card>

              <div className="grid gap-5 lg:grid-cols-2">
                <Card title="Ingresos por cancha" icon={<Layers size={15} />} action={<LinkBtn onClick={() => setActiveTab('pitches')}>Ver todo</LinkBtn>}>
                  {byCourt.length === 0 ? <Empty text="Aún no tienes canchas con reservas." /> : (
                    <div className="space-y-3">
                      {byCourt.slice(0, 5).map(c => (
                        <BarRow key={c.id} label={c.name} value={formatCOP(c.revenue)} sub={`${c.count} reservas`} pct={(c.revenue / maxCourtRevenue) * 100} />
                      ))}
                    </div>
                  )}
                </Card>
                <Card title="Mejores clientes" icon={<Users size={15} />} action={<LinkBtn onClick={() => setActiveTab('customers')}>Ver todos</LinkBtn>}>
                  {topCustomers.length === 0 ? <Empty text="Sin reservas aprobadas en este período." /> : (
                    <ol className="divide-y divide-border/60">
                      {topCustomers.slice(0, 5).map((c, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 py-2">
                          <span className="flex items-center gap-2.5 min-w-0">
                            <span className="h-6 w-6 rounded-full bg-secondary text-[11px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                            <span className="min-w-0">
                              <span className="block text-sm font-bold text-foreground truncate capitalize">{cleanClientName(c.name).toLowerCase() || 'Cliente'}</span>
                              <span className="block text-[11px] text-muted-foreground">{c.bookingsCount} reservas aprobadas</span>
                            </span>
                          </span>
                          <span className="text-sm font-black text-foreground shrink-0">{formatCOP(c.totalSpent)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* ═══════ CLIENTES ═══════ */}
          {activeTab === 'customers' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={clientSearch}
                    onChange={e => { setClientSearch(e.target.value); setClientLimit(30); }}
                    placeholder="Buscar cliente por nombre o celular"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-card text-sm outline-none focus:border-primary"
                  />
                </div>
                <select value={clientSort} onChange={e => setClientSort(e.target.value as typeof clientSort)}
                  className="px-3 py-2.5 rounded-xl border border-border bg-card text-sm font-semibold outline-none focus:border-primary cursor-pointer">
                  <option value="approved">Más reservas aprobadas</option>
                  <option value="spent">Más dinero</option>
                  <option value="recent">Jugó más reciente</option>
                  <option value="name">Nombre (A-Z)</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-xl border border-border bg-card p-1 text-xs font-bold">
                  {([['all', 'Todo el historial'], ['period', 'Solo este período']] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setClientScope(k)}
                      className={`px-3 py-1.5 rounded-lg cursor-pointer ${clientScope === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">{clientTotals.count}</strong> clientes · <strong className="text-foreground">{clientTotals.approved}</strong> reservas aprobadas · <strong className="text-foreground">{formatCOP(clientTotals.spent)}</strong>
                </p>
              </div>

              {filteredClients.length === 0 ? (
                <Empty text={clientSearch ? 'Ningún cliente coincide con la búsqueda.' : 'Aún no hay clientes en este rango.'} />
              ) : (
                <>
                  {/* Móvil: tarjetas */}
                  <div className="grid gap-2.5 md:hidden">
                    {filteredClients.slice(0, clientLimit).map(c => (
                      <div key={c.key} className="rounded-2xl border border-border bg-card p-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold text-foreground truncate capitalize">{c.name.toLowerCase()}</p>
                            {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xl font-black text-foreground leading-none">{c.approved}</p>
                            <p className="text-[10px] font-semibold text-muted-foreground">aprobadas</p>
                          </div>
                        </div>
                        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">{formatCOP(c.spent)}</span>
                          {c.pending > 0 && <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400">{c.pending} por aprobar</span>}
                          {c.cancelled > 0 && <span className="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-600">{c.cancelled} canceladas</span>}
                          {c.last && <span className="px-2 py-0.5 rounded-lg bg-secondary text-muted-foreground">Última: {shortDate(c.last)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* PC: tabla */}
                  <div className="hidden md:block rounded-2xl border border-border bg-card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-secondary/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="p-3 font-bold">Cliente</th>
                          <th className="p-3 font-bold text-center">Aprobadas</th>
                          <th className="p-3 font-bold text-center">Por aprobar</th>
                          <th className="p-3 font-bold text-center">Canceladas</th>
                          <th className="p-3 font-bold text-right">Total pagado</th>
                          <th className="p-3 font-bold">Cancha favorita</th>
                          <th className="p-3 font-bold">Última reserva</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {filteredClients.slice(0, clientLimit).map(c => {
                          const fav = Object.entries(c.pitches).sort((a, b) => b[1] - a[1])[0]?.[0];
                          return (
                            <tr key={c.key} className="hover:bg-secondary/20">
                              <td className="p-3">
                                <p className="font-bold text-foreground capitalize">{c.name.toLowerCase()}</p>
                                {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                              </td>
                              <td className="p-3 text-center text-base font-black text-foreground">{c.approved}</td>
                              <td className="p-3 text-center text-amber-600 font-semibold">{c.pending || '—'}</td>
                              <td className="p-3 text-center text-rose-500 font-semibold">{c.cancelled || '—'}</td>
                              <td className="p-3 text-right font-black text-foreground">{formatCOP(c.spent)}</td>
                              <td className="p-3 text-muted-foreground">{fav || '—'}</td>
                              <td className="p-3 text-muted-foreground whitespace-nowrap">{c.last ? shortDate(c.last) : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {filteredClients.length > clientLimit && (
                    <button onClick={() => setClientLimit(n => n + 30)} className="w-full py-2.5 rounded-xl border border-border bg-card text-sm font-bold hover:bg-secondary cursor-pointer">
                      Ver más clientes ({filteredClients.length - clientLimit} restantes)
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* ═══════ TURNOS FIJOS, ENTIDADES Y ESCUELAS ═══════ */}
          {activeTab === 'entities' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi label="Clientes con convenio" value={`${entitiesReport.totalEntities}`} hint="Turnos fijos, entidades y escuelas" icon={<Building2 size={16} />} />
                <Kpi label="Partidos aprobados" value={`${entitiesReport.totalMatchesAll}`} hint="En el período" icon={<CheckCircle2 size={16} className="text-emerald-500" />} />
                <Kpi tone="primary" label="Facturado" value={formatCOP(entitiesReport.totalBilledAll)} hint={`Promedio ${formatCOP(entitiesReport.avgRateAll)} por partido`} icon={<DollarSign size={16} />} />
                <Kpi tone="amber" label="Por cobrar" value={formatCOP(entitiesReport.totalReceivableAll)} hint="Crédito / cuenta por cobrar" icon={<AlertTriangle size={16} />} />
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={entitySearch} onChange={e => setEntitySearch(e.target.value)} placeholder="Buscar por nombre o cancha"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-card text-sm outline-none focus:border-primary" />
                </div>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                  {([['all', 'Todos'], ['contract', 'Turnos fijos'], ['entity', 'Entidades'], ['school', 'Escuelas']] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setEntityFilter(k)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap border cursor-pointer ${entityFilter === k ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {filteredEntities.length === 0 ? (
                <Empty text={entitiesReport.list.length === 0
                  ? 'Aún no hay turnos fijos, entidades ni escuelas. Al crear una reserva manual o un turno fijo elige el tipo de cliente y aparecerá aquí.'
                  : 'Ningún resultado con ese filtro.'} />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredEntities.map(ent => (
                    <div key={ent.id} className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-black text-foreground uppercase truncate">{cleanClientName(ent.name) || ent.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{ent.pitchName} · {formatCOP(ent.customRate)}/h · {paymentLabel(ent.paymentMethod)}</p>
                        </div>
                        <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg shrink-0 ${ent.type === 'entity' ? 'bg-blue-500/10 text-blue-600' : ent.type === 'school' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-green-500/10 text-green-600'}`}>
                          {ent.type === 'entity' ? 'Entidad' : ent.type === 'school' ? 'Escuela' : 'Turno fijo'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-secondary/40 p-2">
                          <p className="text-lg font-black text-foreground leading-tight">{ent.confirmedBookings}</p>
                          <p className="text-[10px] text-muted-foreground">Partidos{ent.pendingBookings > 0 ? ` (+${ent.pendingBookings} pend.)` : ''}</p>
                        </div>
                        <div className="rounded-xl bg-secondary/40 p-2">
                          <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 leading-tight mt-1">{formatCOP(ent.totalBilled)}</p>
                          <p className="text-[10px] text-muted-foreground">Facturado</p>
                        </div>
                        <div className="rounded-xl bg-secondary/40 p-2">
                          <p className={`text-sm font-black leading-tight mt-1 ${ent.totalReceivable > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>{formatCOP(ent.totalReceivable)}</p>
                          <p className="text-[10px] text-muted-foreground">Por cobrar</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => setSelectedEntityTrace(ent)}
                        className="w-full py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5">
                        <CalendarDays size={14} /> Ver historial completo
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══════ CANCHAS ═══════ */}
          {activeTab === 'pitches' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Cuánto deja cada cancha en el período y cuántas reservas se cancelaron.</p>
              {byCourt.length === 0 ? <Empty text="Sin datos en este período." /> : byCourt.map((c, i) => {
                const avg = c.count > 0 ? Math.round(c.revenue / c.count) : 0;
                return (
                  <div key={c.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-bold text-foreground min-w-0 truncate"><span className="text-muted-foreground mr-1.5">{i + 1}.</span>{c.name}</p>
                      <p className="font-black text-foreground shrink-0">{formatCOP(c.revenue)}</p>
                    </div>
                    <div className="mt-2 h-2.5 w-full rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((c.revenue / maxCourtRevenue) * 100)}%` }} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span><strong className="text-foreground">{c.count}</strong> reservas aprobadas</span>
                      <span>Promedio <strong className="text-foreground">{formatCOP(avg)}</strong></span>
                      <span>{pct(c.revenue, totalRevenue)} del total</span>
                      {c.cancelledCount > 0 && <span className="text-rose-500">{c.cancelledCount} canceladas</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ═══════ HORARIOS ═══════ */}
          {activeTab === 'hours' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Reservas aprobadas por hora del día. La barra dorada es la hora más pedida: úsala para ajustar tus precios.</p>
              <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
                {hoursChrono.map(h => (
                  <div key={h.hour} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-xs font-bold text-foreground">{h.label}</span>
                    <div className="flex-1 h-3 rounded-full bg-secondary overflow-hidden">
                      <div className={`h-full rounded-full ${peakHour && h.hour === peakHour.hour ? 'bg-amber-500' : 'bg-primary/70'}`} style={{ width: `${Math.round((h.count / maxHourCount) * 100)}%` }} />
                    </div>
                    <span className="w-20 shrink-0 text-right text-xs"><strong className="text-foreground">{h.count}</strong> <span className="text-muted-foreground">res.</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══════ CANCELACIONES ═══════ */}
          {activeTab === 'cancellations' && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-foreground"><strong>{cancelledCount}</strong> reservas canceladas o rechazadas ({cancellationRate}%)</p>
                <p className="text-sm font-black text-rose-600">{formatCOP(lostRevenue)} sin ingresar</p>
              </div>
              {cancelledBookings.length === 0 ? (
                <Empty text="¡Muy bien! No hubo cancelaciones en este período." />
              ) : (
                <div className="grid gap-2">
                  {cancelledBookings.map(b => (
                    <div key={b.id} className="rounded-xl border border-border bg-card p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground truncate capitalize">{(cleanClientName(b.customer_name) || 'Cliente').toLowerCase()}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {b.pitches?.name || 'Cancha'} · {b.start_time ? new Date(b.start_time).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' }) : '—'}
                        </p>
                      </div>
                      <span className="text-sm font-black text-rose-600 shrink-0">{formatCOP(getBookingIncome(b))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Pie ── */}
        <div className="px-4 sm:px-6 py-3 border-t border-border bg-card shrink-0 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground"><strong className="text-foreground">{inRangeBookings.length}</strong> reservas en el período</p>
          <button onClick={handleDownloadPDF}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl cursor-pointer">
            <Printer size={15} /> Descargar PDF
          </button>
        </div>
      </div>

      {/* ═══════ HOJA DE TRAZABILIDAD (historial completo de un cliente con convenio) ═══════ */}
      {selectedEntityTrace && (
        <div className="fixed inset-0 z-[400] flex items-stretch sm:items-center justify-center sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={closeTrace}>
          <div className="bg-background sm:border border-border sm:rounded-3xl shadow-2xl w-full max-w-3xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-border bg-card shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-black text-foreground truncate uppercase">{cleanClientName(selectedEntityTrace.name) || selectedEntityTrace.name}</h3>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 uppercase">
                    {selectedEntityTrace.type === 'entity' ? 'Entidad' : selectedEntityTrace.type === 'school' ? 'Escuela' : 'Turno fijo'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{selectedEntityTrace.pitchName} · Hoja de trazabilidad</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button type="button" onClick={() => handlePrintSingleTraceability(selectedEntityTrace)}
                  className="px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold flex items-center gap-1.5 cursor-pointer border border-border">
                  <Printer size={14} /><span className="hidden sm:inline">Imprimir</span>
                </button>
                <button type="button" onClick={closeTrace} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Cerrar">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 border-b border-border bg-secondary/15 shrink-0">
              <MiniStat label="Tarifa acordada" value={`${formatCOP(selectedEntityTrace.customRate)}/h`} hint={paymentLabel(selectedEntityTrace.paymentMethod)} />
              <MiniStat label="Partidos" value={`${selectedEntityTrace.allTimeHistory?.totalMatches || 0}`} hint="Todo el historial" />
              <MiniStat label="Facturado" value={formatCOP(selectedEntityTrace.allTimeHistory?.totalBilled || 0)} hint="Partidos aprobados" />
              <MiniStat label="Por cobrar" value={formatCOP(selectedEntityTrace.allTimeHistory?.totalReceivable || 0)} hint="Saldo pendiente" />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {Object.keys(selectedEntityTrace.allTimeHistory?.byYear || {}).length === 0 ? (
                <Empty text="No hay partidos registrados para este cliente." />
              ) : (
                Object.values(selectedEntityTrace.allTimeHistory.byYear)
                  .sort((a: any, b: any) => b.year - a.year)
                  .map((yearGroup: any) => (
                    <div key={yearGroup.year} className="space-y-3">
                      <div className="flex items-center justify-between text-sm font-black text-foreground">
                        <span>{yearGroup.year}</span>
                        <span className="text-xs font-bold text-muted-foreground">{yearGroup.matches} partidos · <span className="text-emerald-600">{formatCOP(yearGroup.total)}</span></span>
                      </div>
                      {Object.values(yearGroup.months)
                        .sort((a: any, b: any) => b.month - a.month)
                        .map((monthGroup: any) => (
                          <div key={monthGroup.month} className="rounded-2xl border border-border bg-card overflow-hidden">
                            <div className="px-3.5 py-2.5 bg-secondary/40 flex items-center justify-between">
                              <span className="text-xs font-black text-foreground capitalize">{monthGroup.monthName}</span>
                              <span className="text-[11px] font-bold text-muted-foreground">{monthGroup.matches} partidos · {formatCOP(monthGroup.total)}</span>
                            </div>
                            <ul className="divide-y divide-border/50">
                              {monthGroup.items.map((it: any) => (
                                <li key={it.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs">
                                  <span className="min-w-0">
                                    <span className="block font-bold text-foreground capitalize">{it.dayOfWeek} {it.date} · {it.time}</span>
                                    <span className="block text-muted-foreground truncate">{it.pitch}</span>
                                  </span>
                                  <span className="flex items-center gap-2 shrink-0">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${it.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-600' : it.status === 'pending' ? 'bg-amber-500/10 text-amber-600' : 'bg-rose-500/10 text-rose-500'}`}>
                                      {it.status === 'confirmed' ? 'Aprobado' : it.status === 'pending' ? 'Por aprobar' : 'Cancelado'}
                                    </span>
                                    <span className="font-black text-foreground w-20 text-right">{formatCOP(it.price)}</span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                    </div>
                  ))
              )}
            </div>

            <div className="px-4 sm:px-5 py-3 border-t border-border bg-card shrink-0 flex justify-end">
              <button type="button" onClick={closeTrace}
                className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs cursor-pointer">
                {openedFromBooking ? 'Volver a gestión de reservas' : 'Cerrar historial'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Piezas visuales ──────────────────────────────────────────────────────────

type ClientRow = {
  key: string; name: string; phone: string;
  approved: number; pending: number; cancelled: number; spent: number;
  last: string | null; pitches: Record<string, number>;
};

/** Quita etiquetas internas como "[Turno Fijo]" o "CID:..." de los nombres. */
function cleanClientName(name: unknown) {
  return String(name || '')
    .replace(/\[(Turno Fijo|Contrato|ENTIDAD|ESCUELA)[^\]]*\]/gi, '')
    .replace(/CID:[a-zA-Z0-9_-]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Últimos 10 dígitos del celular (agrupa +57 300... y 300... como la misma persona). */
function normalizePhone(phone: unknown) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : '';
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota' });
}

function paymentLabel(method: string) {
  return method === 'cuenta_cobrar' ? 'Cuenta por cobrar'
    : method === 'credito' ? 'Crédito'
    : method === 'transferencia' ? 'Transferencia'
    : 'Efectivo';
}

function Kpi({ label, value, hint, icon, tone }: { label: string; value: string; hint: string; icon: React.ReactNode; tone?: 'primary' | 'amber' | 'rose' }) {
  const toneCls = tone === 'primary' ? 'border-primary/30 bg-primary/5'
    : tone === 'amber' ? 'border-amber-500/30 bg-amber-500/5'
    : tone === 'rose' ? 'border-rose-500/30 bg-rose-500/5'
    : 'border-border bg-card';
  const valueCls = tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : tone === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-foreground';
  return (
    <div className={`rounded-2xl border p-3.5 sm:p-4 min-w-0 ${toneCls}`}>
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span className="text-[11px] font-bold leading-tight">{label}</span>
        <span className="shrink-0">{icon}</span>
      </div>
      <p className={`text-xl sm:text-2xl font-black mt-1 truncate ${valueCls}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{hint}</p>
    </div>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground truncate">{label}</p>
      <p className="text-sm sm:text-base font-black text-foreground truncate mt-0.5">{value}</p>
      <p className="text-[10px] text-muted-foreground truncate">{hint}</p>
    </div>
  );
}

function Card({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-black text-foreground flex items-center gap-2"><span className="text-primary">{icon}</span>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function LinkBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="text-xs font-bold text-primary hover:underline cursor-pointer flex items-center gap-0.5">
      {children}<ArrowUpRight size={13} />
    </button>
  );
}

function BarRow({ label, value, sub, pct: width }: { label: string; value: string; sub: string; pct: number }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-bold text-foreground truncate">{label}</span>
        <span className="font-black text-foreground shrink-0">{value}</span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, Math.round(width))}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="text-center py-10 px-4 rounded-2xl border border-dashed border-border bg-card/50">
      <Sparkles size={26} className="mx-auto mb-2 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground max-w-md mx-auto">{text}</p>
    </div>
  );
}
