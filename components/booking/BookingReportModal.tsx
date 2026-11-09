'use client';

import { useState, useMemo, useCallback } from 'react';
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
  FileSpreadsheet
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface BookingReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookings: any[];
  pitches: any[];
  companyName?: string;
}

type Period = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
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
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const ago = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days + 1);
    return d;
  };

  switch (period) {
    case 'today': {
      const from = new Date(today);
      const to = new Date(today.getTime() + 86400000 - 1);
      return { from, to };
    }
    case 'week': {
      return { from: ago(7), to: new Date(today.getTime() + 86400000 - 1) };
    }
    case 'month': {
      return { from: ago(30), to: new Date(today.getTime() + 86400000 - 1) };
    }
    case 'quarter': {
      return { from: ago(90), to: new Date(today.getTime() + 86400000 - 1) };
    }
    case 'year': {
      return { from: ago(365), to: new Date(today.getTime() + 86400000 - 1) };
    }
    case 'custom': {
      const from = customFrom ? new Date(customFrom + 'T00:00:00-05:00') : ago(30);
      const to = customTo ? new Date(customTo + 'T23:59:59-05:00') : new Date();
      return { from, to };
    }
  }
}

const PERIOD_OPTIONS: PeriodOption[] = [
  { key: 'today', label: 'Hoy', badge: '24h' },
  { key: 'week', label: 'Esta Semana', badge: '7 días' },
  { key: 'month', label: 'Este Mes', badge: '30 días' },
  { key: 'quarter', label: 'Trimestre', badge: '90 días' },
  { key: 'year', label: 'Anual', badge: '365 días' },
  { key: 'custom', label: 'Personalizado', badge: 'Rango libre' },
];

function getBookingIncome(b: any): number {
  if (!b) return 0;
  const val = Number(b.total_price ?? b.pitches?.price_per_hour ?? 0);
  return isNaN(val) ? 0 : val;
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export function BookingReportModal({ isOpen, onClose, bookings = [], pitches = [], companyName }: BookingReportModalProps) {
  const [period, setPeriod] = useState<Period>('month');
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

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
    return confirmedBookings.reduce((sum, b) => sum + Number(b.deposit_amount || 0), 0);
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

  // ── Reporte Ejecutivo: Entidades, Escuelas y Turnos Fijos ───────────────────
  const entitiesReport = useMemo(() => {
    const map: Record<string, {
      id: string;
      name: string;
      type: 'entity' | 'school' | 'contract';
      pitchName: string;
      paymentMethod: string;
      customRate: number;
      totalBookings: number;
      confirmedBookings: number;
      pendingBookings: number;
      totalBilled: number;
      totalReceivable: number;
      daysPlayed: { date: string; time: string; status: string; pitch: string }[];
    }> = {};

    inRangeBookings.forEach(b => {
      const isEntity = b.client_type === 'entity';
      const isSchool = b.client_type === 'school';
      const isContract = b.booking_type === 'contract' || (b.customer_name && b.customer_name.includes('[Contrato'));

      if (!isEntity && !isSchool && !isContract) return;

      const entityName = (b.client_entity_name || b.customer_name || 'Sin nombre').trim();
      const type: 'entity' | 'school' | 'contract' = isEntity ? 'entity' : (isSchool ? 'school' : 'contract');
      const key = `${type}-${entityName.toLowerCase()}-${b.pitch_id || 'p'}`;

      if (!map[key]) {
        map[key] = {
          id: key,
          name: entityName,
          type,
          pitchName: b.pitches?.name || 'Cancha',
          paymentMethod: b.payment_method || 'efectivo',
          customRate: Number(b.custom_rate || b.total_price || b.pitches?.price_per_hour || 0),
          totalBookings: 0,
          confirmedBookings: 0,
          pendingBookings: 0,
          totalBilled: 0,
          totalReceivable: 0,
          daysPlayed: [],
        };
      }

      const rec = map[key];
      rec.totalBookings++;
      const inc = getBookingIncome(b);

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
        });
      }
    });

    const list = Object.values(map).sort((a, b) => b.totalBilled - a.totalBilled);
    const totalEntities = list.length;
    const totalBilledAll = list.reduce((s, e) => s + e.totalBilled, 0);
    const totalReceivableAll = list.reduce((s, e) => s + e.totalReceivable, 0);
    const totalMatchesAll = list.reduce((s, e) => s + e.confirmedBookings, 0);
    const avgRateAll = totalMatchesAll > 0 ? Math.round(totalBilledAll / totalMatchesAll) : 0;

    return {
      list,
      totalEntities,
      totalBilledAll,
      totalReceivableAll,
      totalMatchesAll,
      avgRateAll,
    };
  }, [inRangeBookings]);

  // ── Exportación a PDF / Impresión Ejecutiva ──────────────────────────────────
  const handleDownloadPDF = useCallback(() => {
    const periodLabel = PERIOD_OPTIONS.find(p => p.key === period)?.label || 'Período';
    const dateRange = `${from.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })} – ${to.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    const generatedAt = new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' });

    const courtRows = byCourt.map((c, i) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;">${i + 1}. ${c.name}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:600;">${c.count}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:800;color:#0f766e;">${formatCOP(c.revenue)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;color:#64748b;font-weight:600;">${pct(c.revenue, totalRevenue)}</td>
      </tr>
    `).join('');

    const topHoursRows = byHour.filter(h => h.count > 0).slice(0, 6).map((h, i) => `
      <tr>
        <td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;font-weight:700;">#${i + 1} ${h.label}</td>
        <td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;text-align:center;">${h.count} reservas</td>
        <td style="padding:9px 14px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#0f766e;">${formatCOP(h.revenue)}</td>
      </tr>
    `).join('');

    const cancelRows = cancelledBookings.slice(0, 10).map((b, i) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;">${i + 1}. ${b.customer_name || 'Cliente'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${b.pitches?.name || 'Cancha'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${b.start_time ? new Date(b.start_time).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:#e11d48;font-weight:700;">${formatCOP(getBookingIncome(b))}</td>
      </tr>
    `).join('');

    const entityRows = entitiesReport.list.map((e, i) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-weight:700;">${i + 1}. ${e.name} (${e.type === 'entity' ? 'Entidad' : e.type === 'school' ? 'Escuela' : 'Turno Fijo'})</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">${e.pitchName}</td>
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
    .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
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
      <div class="subtitle">Informe Ejecutivo de Gestión y Rendimiento Financiero</div>
    </div>
    <div class="meta-box">
      <div><strong>Período:</strong> ${periodLabel} (${dateRange})</div>
      <div><strong>Emitido:</strong> ${generatedAt}</div>
      <div><strong>Estado Auditoría:</strong> Verificado por Cancheros</div>
    </div>
  </div>

  <div class="kpi-row">
    <div class="kpi-card highlight">
      <div class="lbl">Recaudo Total Confirmado</div>
      <div class="val">${formatCOP(totalRevenue)}</div>
      <div class="sub">${confirmedCount} partidos aprobados</div>
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
    <div class="section-title">📊 Rendimiento y Cuota de Facturación por Cancha</div>
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

  ${topHoursRows ? `
  <div class="section">
    <div class="section-title">⏰ Franjas Horarias con Mayor Recaudo (Top Demandadas)</div>
    <table>
      <thead>
        <tr>
          <th>Horario</th>
          <th style="text-align:center;">Volumen Reservas</th>
          <th style="text-align:right;">Ingreso Generado</th>
        </tr>
      </thead>
      <tbody>
        ${topHoursRows}
      </tbody>
    </table>
  </div>` : ''}

  ${entityRows.length > 0 ? `
  <div class="section">
    <div class="section-title">🏢 Control Corporativo: Entidades, Escuelas y Turnos Fijos</div>
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
    <div class="section-title">⚠️ Control de Cancelaciones y Pérdida de Ocupación</div>
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
  }, [period, from, to, companyName, byCourt, byHour, cancelledBookings, totalRevenue, confirmedCount, totalBookingsCount, successRate, averageTicket, cancelledCount, cancellationRate, lostRevenue]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-2 sm:p-5 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-background border border-border rounded-3xl shadow-2xl w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden">

        {/* ── Header Ejecutivo ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-2xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 flex items-center justify-center p-2 shadow-sm shrink-0 font-black">
              <BarChart3 size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-foreground truncate">
                  Reporte Ejecutivo de Gestión
                </h2>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {companyName || 'Complejo Deportivo'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                Métricas financieras, ocupación y control de cancelaciones
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDownloadPDF}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
              title="Descargar o imprimir reporte ejecutivo"
            >
              <Download size={14} /> Imprimir / PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Selector de Períodos Sobrio y Elegante (Sin verdes fosforescentes) ── */}
        <div className="px-5 py-3 border-b border-border bg-secondary/20 shrink-0 space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider mr-1">
                Período:
              </span>
              {PERIOD_OPTIONS.map(p => {
                const isActive = period === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => setPeriod(p.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer border ${
                      isActive
                        ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100 shadow-xs'
                        : 'bg-card border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                  >
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Rango de fechas activo */}
            <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
              <Calendar size={13} className="text-foreground/70" />
              <span>
                {from.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} – {to.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>

          {/* Rango Personalizado con tipografía sobria y elegante */}
          {period === 'custom' && (
            <div className="flex flex-wrap items-center gap-3 p-3 bg-card border border-border rounded-2xl animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <CalendarDays size={15} className="text-muted-foreground" />
                <span>Rango específico:</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Desde</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="border border-border bg-background rounded-xl px-2.5 py-1.5 text-xs text-foreground font-medium outline-none focus:border-foreground transition-colors"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Hasta</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="border border-border bg-background rounded-xl px-2.5 py-1.5 text-xs text-foreground font-medium outline-none focus:border-foreground transition-colors"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Navegación de Pestañas del Reporte ── */}
        <div className="px-5 border-b border-border bg-card flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
          {[
            { key: 'overview', label: 'Resumen Ejecutivo', icon: <TrendingUp size={14} /> },
            { key: 'entities', label: 'Entidades & Escuelas', icon: <Building2 size={14} /> },
            { key: 'pitches', label: 'Rendimiento Canchas', icon: <Layers size={14} /> },
            { key: 'hours', label: 'Horas Pico', icon: <Clock size={14} /> },
            { key: 'cancellations', label: 'Canceladas & Fuga', icon: <XCircle size={14} /> },
            { key: 'customers', label: 'Top Clientes', icon: <Users size={14} /> },
          ].map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as ReportTab)}
                className={`flex items-center gap-1.5 px-3 py-2.5 border-b-2 text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Contenido Principal Scrollable ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

          {/* ═══════════════ PESTAÑA: RESUMEN EJECUTIVO ═══════════════ */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Tarjetas KPI de Primer Nivel */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Total Recaudado */}
                <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 text-white rounded-2xl p-4 shadow-sm col-span-2 sm:col-span-1">
                  <div className="flex items-center justify-between mb-1 opacity-80">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">Recaudo Realizado</span>
                    <DollarSign size={14} />
                  </div>
                  <p className="text-2xl font-black">{formatCOP(totalRevenue)}</p>
                  <p className="text-[10px] opacity-70 mt-1 font-medium">
                    {confirmedCount} partidos confirmados
                  </p>
                </div>

                {/* Ticket Promedio */}
                <div className="bg-card border border-border rounded-2xl p-4 shadow-2xs">
                  <div className="flex items-center justify-between mb-1 text-muted-foreground">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">Ticket Promedio</span>
                    <Trophy size={14} className="text-amber-500" />
                  </div>
                  <p className="text-2xl font-black text-foreground">{formatCOP(averageTicket)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 font-medium">
                    Por reserva confirmada
                  </p>
                </div>

                {/* Tasa de Efectividad */}
                <div className="bg-card border border-border rounded-2xl p-4 shadow-2xs">
                  <div className="flex items-center justify-between mb-1 text-muted-foreground">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">Efectividad</span>
                    <CheckCircle2 size={14} className="text-emerald-500" />
                  </div>
                  <p className="text-2xl font-black text-foreground">{successRate}%</p>
                  <p className="text-[10px] text-muted-foreground mt-1 font-medium">
                    {confirmedCount} de {totalBookingsCount} totales
                  </p>
                </div>

                {/* Canceladas & Pérdida */}
                <div className="bg-card border border-border rounded-2xl p-4 shadow-2xs">
                  <div className="flex items-center justify-between mb-1 text-muted-foreground">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">Canceladas</span>
                    <XCircle size={14} className="text-rose-500" />
                  </div>
                  <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{cancelledCount}</p>
                  <p className="text-[10px] text-rose-500 mt-1 font-semibold">
                    -{formatCOP(lostRevenue)} no ingresado
                  </p>
                </div>
              </div>

              {/* Fila Secundaria de KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-secondary/40 border border-border">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase block">Pendientes</span>
                  <span className="text-base font-extrabold text-foreground">{pendingCount}</span>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 block font-medium">
                    {formatCOP(pendingPotentialRevenue)} por cobrar
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-secondary/40 border border-border">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase block">Clientes Únicos</span>
                  <span className="text-base font-extrabold text-foreground">{uniqueCustomersCount}</span>
                  <span className="text-[10px] text-muted-foreground block font-medium">En el período</span>
                </div>
                <div className="p-3 rounded-xl bg-secondary/40 border border-border">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase block">Horario Dorado</span>
                  <span className="text-base font-extrabold text-foreground">{peakHour?.label || '—'}</span>
                  <span className="text-[10px] text-muted-foreground block font-medium">
                    {peakHour ? `${peakHour.count} partidos` : 'Sin datos'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-secondary/40 border border-border">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase block">Cancha Estrella</span>
                  <span className="text-base font-extrabold text-foreground truncate block">{topCourt?.name || '—'}</span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-medium">
                    {topCourt ? formatCOP(topCourt.revenue) : '—'}
                  </span>
                </div>
              </div>

              {/* Franjas del día */}
              <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
                <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Clock size={14} className="text-foreground" /> Distribución por Turnos del Día
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-secondary/30 border border-border/60 text-center">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">Mañana (6am - 12pm)</span>
                    <span className="text-lg font-black text-foreground">{timeBlocks.manana.count}</span>
                    <span className="text-[11px] font-bold text-muted-foreground block mt-0.5">{timeBlocks.manana.pct}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-secondary/30 border border-border/60 text-center">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">Tarde (12pm - 6pm)</span>
                    <span className="text-lg font-black text-foreground">{timeBlocks.tarde.count}</span>
                    <span className="text-[11px] font-bold text-muted-foreground block mt-0.5">{timeBlocks.tarde.pct}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-secondary/30 border border-border/60 text-center">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase block">Noche (6pm - 12am)</span>
                    <span className="text-lg font-black text-foreground">{timeBlocks.noche.count}</span>
                    <span className="text-[11px] font-bold text-muted-foreground block mt-0.5">{timeBlocks.noche.pct}</span>
                  </div>
                </div>
              </div>

              {/* Resumen por canchas (Top 3) */}
              <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Building2 size={14} className="text-foreground" /> Aporte Financiero por Cancha
                  </h3>
                  <button
                    onClick={() => setActiveTab('pitches')}
                    className="text-xs font-bold text-foreground hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span>Ver detalle completo</span>
                    <ArrowUpRight size={12} />
                  </button>
                </div>
                <div className="space-y-3">
                  {byCourt.slice(0, 4).map((c, i) => (
                    <div key={c.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-extrabold text-foreground">{i + 1}. {c.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-foreground">{formatCOP(c.revenue)}</span>
                          <span className="text-muted-foreground font-semibold">({pct(c.revenue, totalRevenue)})</span>
                        </div>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-500"
                          style={{ width: `${Math.round((c.revenue / maxCourtRevenue) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════ PESTAÑA: RENDIMIENTO CANCHAS ═══════════════ */}
          {activeTab === 'pitches' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-foreground">Análisis Financiero de Canchas</h3>
                  <p className="text-xs text-muted-foreground">Recaudo, volumen de turnos y ticket por espacio deportivo</p>
                </div>
              </div>

              <div className="overflow-x-auto border border-border rounded-2xl bg-card">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-secondary/40 border-b border-border text-left">
                      <th className="p-3 font-extrabold text-muted-foreground uppercase">Cancha</th>
                      <th className="p-3 font-extrabold text-muted-foreground uppercase text-center">Partidos</th>
                      <th className="p-3 font-extrabold text-muted-foreground uppercase text-right">Recaudo Total</th>
                      <th className="p-3 font-extrabold text-muted-foreground uppercase text-right">% Cuota</th>
                      <th className="p-3 font-extrabold text-muted-foreground uppercase text-right">Ticket Medio</th>
                      <th className="p-3 font-extrabold text-muted-foreground uppercase text-right text-rose-500">Canceladas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {byCourt.map((c, i) => {
                      const avg = c.count > 0 ? Math.round(c.revenue / c.count) : 0;
                      return (
                        <tr key={c.id} className="hover:bg-secondary/20 transition-colors">
                          <td className="p-3 font-bold text-foreground">
                            <span className="inline-block w-5 text-muted-foreground font-medium">{i + 1}.</span>
                            {c.name}
                          </td>
                          <td className="p-3 text-center font-semibold text-foreground">{c.count}</td>
                          <td className="p-3 text-right font-black text-foreground">{formatCOP(c.revenue)}</td>
                          <td className="p-3 text-right font-bold text-muted-foreground">{pct(c.revenue, totalRevenue)}</td>
                          <td className="p-3 text-right font-semibold text-foreground/80">{formatCOP(avg)}</td>
                          <td className="p-3 text-right font-semibold text-rose-500">{c.cancelledCount}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-secondary/50 font-black border-t-2 border-border">
                      <td className="p-3">Totales</td>
                      <td className="p-3 text-center">{confirmedCount}</td>
                      <td className="p-3 text-right text-foreground">{formatCOP(totalRevenue)}</td>
                      <td className="p-3 text-right">100%</td>
                      <td className="p-3 text-right">{formatCOP(averageTicket)}</td>
                      <td className="p-3 text-right text-rose-500">{cancelledCount}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* ═══════════════ PESTAÑA: HORAS PICO ═══════════════ */}
          {activeTab === 'hours' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-black text-foreground">Mapa de Demanda Horaria</h3>
                <p className="text-xs text-muted-foreground">Identifica las franjas de mayor facturación para optimizar tus tarifas</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {byHour.map((h, i) => {
                  const pctVal = maxHourCount > 0 ? Math.round((h.count / maxHourCount) * 100) : 0;
                  return (
                    <div key={h.hour} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between gap-3">
                      <div className="w-16 shrink-0 font-extrabold text-xs text-foreground">
                        {h.label}
                      </div>
                      <div className="flex-1">
                        <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              i === 0 ? 'bg-amber-500' : 'bg-foreground'
                            }`}
                            style={{ width: `${pctVal}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0 w-24">
                        <span className="text-xs font-black text-foreground block">{h.count} partidos</span>
                        <span className="text-[10px] text-muted-foreground block">{formatCOP(h.revenue)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══════════════ PESTAÑA: CANCELADAS & FUGA ═══════════════ */}
          {activeTab === 'cancellations' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black text-foreground">Control de Cancelaciones y Rechazos</h3>
                  <p className="text-xs text-muted-foreground">Monitorea los turnos que no se jugaron y el impacto económico no percibido</p>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold">
                  {cancelledCount} canceladas · Impacto: {formatCOP(lostRevenue)}
                </div>
              </div>

              {cancelledBookings.length === 0 ? (
                <div className="text-center py-12 bg-card border border-border rounded-2xl p-6">
                  <CheckCircle2 size={36} className="text-emerald-500 mx-auto mb-2 opacity-80" />
                  <p className="text-sm font-bold text-foreground">¡Excelente! Sin cancelaciones en este período</p>
                  <p className="text-xs text-muted-foreground mt-0.5">El 100% de tus reservas programadas se han mantenido activas.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-border rounded-2xl bg-card">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-secondary/40 border-b border-border text-left">
                        <th className="p-3 font-extrabold text-muted-foreground uppercase">Cliente</th>
                        <th className="p-3 font-extrabold text-muted-foreground uppercase">Cancha</th>
                        <th className="p-3 font-extrabold text-muted-foreground uppercase">Fecha / Hora</th>
                        <th className="p-3 font-extrabold text-muted-foreground uppercase text-right">Valor Perdido</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {cancelledBookings.map((b) => (
                        <tr key={b.id} className="hover:bg-secondary/20 transition-colors">
                          <td className="p-3">
                            <span className="font-bold text-foreground block">{b.customer_name || 'Cliente'}</span>
                            {b.customer_phone && <span className="text-[10px] text-muted-foreground">{b.customer_phone}</span>}
                          </td>
                          <td className="p-3 font-semibold text-foreground uppercase">{b.pitches?.name || '—'}</td>
                          <td className="p-3 text-muted-foreground font-medium">
                            {b.start_time ? new Date(b.start_time).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }) : '—'}
                          </td>
                          <td className="p-3 text-right font-black text-rose-600 dark:text-rose-400">
                            {formatCOP(getBookingIncome(b))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ PESTAÑA: ENTIDADES & ESCUELAS DE FÚTBOL ═══════════════ */}
          {activeTab === 'entities' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-black text-foreground flex items-center gap-2">
                  <Building2 size={16} className="text-primary" />
                  Reporte Ejecutivo: Entidades, Escuelas de Fútbol y Turnos Fijos
                </h3>
                <p className="text-xs text-muted-foreground">
                  Control corporativo de contratos, tarifas acordadas, días jugados y cuentas por cobrar
                </p>
              </div>

              {/* KPIs de Entidades y Escuelas */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-card border border-border rounded-2xl p-4 shadow-xs">
                  <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1">
                    Entidades & Escuelas
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-foreground">
                    {entitiesReport.totalEntities}
                  </div>
                  <span className="text-[10px] text-muted-foreground font-semibold mt-1 block">
                    Registradas en el período
                  </span>
                </div>

                <div className="bg-card border border-border rounded-2xl p-4 shadow-xs">
                  <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1">
                    Partidos Jugados
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-foreground">
                    {entitiesReport.totalMatchesAll}
                  </div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1 block">
                    Sesiones confirmadas
                  </span>
                </div>

                <div className="bg-card border border-border rounded-2xl p-4 shadow-xs">
                  <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block mb-1">
                    Total Facturado
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {formatCOP(entitiesReport.totalBilledAll)}
                  </div>
                  <span className="text-[10px] text-muted-foreground font-semibold mt-1 block">
                    Promedio {formatCOP(entitiesReport.avgRateAll)}/partido
                  </span>
                </div>

                <div className="bg-card border border-amber-500/30 bg-amber-500/5 rounded-2xl p-4 shadow-xs">
                  <span className="text-[10px] font-extrabold text-amber-700 dark:text-amber-400 uppercase tracking-wider block mb-1">
                    Cuentas por Cobrar (Crédito)
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400">
                    {formatCOP(entitiesReport.totalReceivableAll)}
                  </div>
                  <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80 font-semibold mt-1 block">
                    Pendientes de liquidación
                  </span>
                </div>
              </div>

              {/* Tabla Detallada */}
              {entitiesReport.list.length === 0 ? (
                <div className="text-center py-12 bg-card border border-border rounded-3xl space-y-2 p-6">
                  <Building2 size={36} className="text-muted-foreground/30 mx-auto mb-1" />
                  <p className="text-sm font-bold text-foreground">Sin registros de entidades o escuelas en este rango</p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    Al agendar una reserva manual o turno fijo, selecciona el tipo <strong>Entidad</strong> o <strong>Escuela de Fútbol</strong> para que aparezca automáticamente en este reporte con sus días jugados y tarifas acordadas.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-border rounded-2xl bg-card shadow-xs">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-secondary/40 border-b border-border text-left">
                        <th className="p-3.5 font-extrabold text-muted-foreground uppercase">Entidad / Escuela</th>
                        <th className="p-3.5 font-extrabold text-muted-foreground uppercase">Cancha</th>
                        <th className="p-3.5 font-extrabold text-muted-foreground uppercase">Tarifa Acordada</th>
                        <th className="p-3.5 font-extrabold text-muted-foreground uppercase">Forma de Pago</th>
                        <th className="p-3.5 font-extrabold text-muted-foreground uppercase text-center">Partidos</th>
                        <th className="p-3.5 font-extrabold text-muted-foreground uppercase text-right">Total Facturado</th>
                        <th className="p-3.5 font-extrabold text-muted-foreground uppercase text-right">Por Cobrar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {entitiesReport.list.map((ent, idx) => {
                        const isSchool = ent.type === 'school';
                        const isEntity = ent.type === 'entity';
                        return (
                          <tr key={ent.id || idx} className="hover:bg-secondary/20 transition-colors">
                            <td className="p-3.5">
                              <div className="flex items-center gap-2">
                                <span className="text-base shrink-0">{isEntity ? '🏢' : isSchool ? '⚽' : '📋'}</span>
                                <div className="min-w-0">
                                  <p className="font-extrabold text-foreground truncate uppercase">{ent.name}</p>
                                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground uppercase">
                                    {isEntity ? 'Entidad' : isSchool ? 'Escuela' : 'Turno Fijo'}
                                  </span>
                                </div>
                              </div>

                              {/* Días jugados */}
                              {ent.daysPlayed.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1 max-w-md">
                                  {ent.daysPlayed.slice(0, 5).map((dp, i) => (
                                    <span
                                      key={i}
                                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${
                                        dp.status === 'confirmed'
                                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
                                      }`}
                                    >
                                      {dp.date} {dp.time}
                                    </span>
                                  ))}
                                  {ent.daysPlayed.length > 5 && (
                                    <span className="text-[9px] text-muted-foreground font-semibold py-0.5">
                                      +{ent.daysPlayed.length - 5} más
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="p-3.5 font-bold uppercase text-foreground/90 whitespace-nowrap">
                              {ent.pitchName}
                            </td>

                            <td className="p-3.5 font-extrabold text-foreground whitespace-nowrap">
                              {formatCOP(ent.customRate)}/h
                            </td>

                            <td className="p-3.5 whitespace-nowrap">
                              <span
                                className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-lg border ${
                                  ent.paymentMethod === 'cuenta_cobrar'
                                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                    : ent.paymentMethod === 'credito'
                                    ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
                                    : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                }`}
                              >
                                {ent.paymentMethod === 'cuenta_cobrar'
                                  ? 'Cuenta por Cobrar'
                                  : ent.paymentMethod === 'credito'
                                  ? 'Crédito'
                                  : ent.paymentMethod === 'transferencia'
                                  ? 'Transferencia'
                                  : 'Efectivo'}
                              </span>
                            </td>

                            <td className="p-3.5 text-center font-extrabold text-foreground">
                              {ent.confirmedBookings}
                              {ent.pendingBookings > 0 && (
                                <span className="text-[9px] text-amber-600 dark:text-amber-400 block font-normal">
                                  ({ent.pendingBookings} pend.)
                                </span>
                              )}
                            </td>

                            <td className="p-3.5 text-right font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                              {formatCOP(ent.totalBilled)}
                            </td>

                            <td className="p-3.5 text-right font-black whitespace-nowrap">
                              {ent.totalReceivable > 0 ? (
                                <span className="text-amber-600 dark:text-amber-400">
                                  {formatCOP(ent.totalReceivable)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground font-normal">$0</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ PESTAÑA: TOP CLIENTES ═══════════════ */}
          {activeTab === 'customers' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-black text-foreground">Clientes con Mayor Valor (Top VIP)</h3>
                <p className="text-xs text-muted-foreground">Clientes que más aportan al negocio durante el período</p>
              </div>

              {topCustomers.length === 0 ? (
                <div className="text-center py-10 bg-card border border-border rounded-2xl">
                  <Users size={32} className="text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No hay datos de clientes para este rango</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-border rounded-2xl bg-card">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-secondary/40 border-b border-border text-left">
                        <th className="p-3 font-extrabold text-muted-foreground uppercase">Cliente</th>
                        <th className="p-3 font-extrabold text-muted-foreground uppercase">Contacto</th>
                        <th className="p-3 font-extrabold text-muted-foreground uppercase text-center">Partidos Jugados</th>
                        <th className="p-3 font-extrabold text-muted-foreground uppercase text-right">Inversión Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {topCustomers.map((cust, i) => (
                        <tr key={i} className="hover:bg-secondary/20 transition-colors">
                          <td className="p-3 font-bold text-foreground">
                            <span className="inline-block w-5 text-muted-foreground font-medium">{i + 1}.</span>
                            {cust.name}
                          </td>
                          <td className="p-3 text-muted-foreground font-medium">{cust.phone || '—'}</td>
                          <td className="p-3 text-center font-bold text-foreground">{cust.bookingsCount}</td>
                          <td className="p-3 text-right font-black text-foreground">{formatCOP(cust.totalSpent)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t border-border bg-card shrink-0 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            📊 <strong>{inRangeBookings.length}</strong> movimientos evaluados en el período
          </p>
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
          >
            <Printer size={14} /> Imprimir / Exportar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
