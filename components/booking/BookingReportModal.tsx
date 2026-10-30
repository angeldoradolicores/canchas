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
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface BookingReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookings: any[];
  pitches: any[];
  companyName?: string;
}

type Period = 'week' | 'biweek' | 'month' | 'quarter' | 'semester' | 'year' | 'custom';

interface PeriodOption {
  key: Period;
  label: string;
  short: string;
  getDays: () => number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCOP(n: number) {
  return `$${Math.round(n).toLocaleString('es-CO')}`;
}

function pct(part: number, total: number) {
  if (total === 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function fmt12(h: number) {
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:00 ${ampm}`;
}

function getPeriodRange(period: Period, customFrom?: string, customTo?: string): { from: Date; to: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const ago = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days + 1);
    return d;
  };

  switch (period) {
    case 'week': return { from: ago(7), to: new Date(today.getTime() + 86400000) };
    case 'biweek': return { from: ago(15), to: new Date(today.getTime() + 86400000) };
    case 'month': return { from: ago(30), to: new Date(today.getTime() + 86400000) };
    case 'quarter': return { from: ago(91), to: new Date(today.getTime() + 86400000) };
    case 'semester': return { from: ago(183), to: new Date(today.getTime() + 86400000) };
    case 'year': return { from: ago(365), to: new Date(today.getTime() + 86400000) };
    case 'custom': {
      const from = customFrom ? new Date(customFrom + 'T00:00:00') : ago(30);
      const to = customTo ? new Date(customTo + 'T23:59:59') : new Date();
      return { from, to };
    }
  }
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: PeriodOption[] = [
  { key: 'week', label: 'Semanal', short: '7 días', getDays: () => 7 },
  { key: 'biweek', label: 'Quincenal', short: '15 días', getDays: () => 15 },
  { key: 'month', label: 'Mensual', short: '30 días', getDays: () => 30 },
  { key: 'quarter', label: 'Trimestral', short: '3 meses', getDays: () => 91 },
  { key: 'semester', label: 'Semestral', short: '6 meses', getDays: () => 183 },
  { key: 'year', label: 'Anual', short: '1 año', getDays: () => 365 },
  { key: 'custom', label: 'Personalizado', short: 'fecha libre', getDays: () => 0 },
];

// ─── Mini progress bar ────────────────────────────────────────────────────────

function ProgressBar({ value, max, color = '#008744' }: { value: number; max: number; color?: string }) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${width}%`, background: color }}
      />
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export function BookingReportModal({ isOpen, onClose, bookings, pitches, companyName }: BookingReportModalProps) {
  const [period, setPeriod] = useState<Period>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // ── Calcular métricas ────────────────────────────────────────────────────────

  const { from, to } = useMemo(() => getPeriodRange(period, customFrom, customTo), [period, customFrom, customTo]);

  const filtered = useMemo(() => {
    return bookings.filter(b => {
      if (b.status === 'cancelled' || b.status === 'draft') return false;
      const d = new Date(b.start_time || b.created_at);
      return d >= from && d <= to;
    });
  }, [bookings, from, to]);

  const confirmedOnly = useMemo(() => filtered.filter(b => b.status === 'confirmed'), [filtered]);

  // Total recaudado (usando price_per_hour de la cancha enlazada o total_price del booking)
  const totalRevenue = useMemo(() => {
    return confirmedOnly.reduce((sum, b) => {
      const price = b.total_price || b.pitches?.price_per_hour || 0;
      return sum + (typeof price === 'number' ? price : Number(price) || 0);
    }, 0);
  }, [confirmedOnly]);

  // Anticipo recaudado
  const depositRevenue = useMemo(() => {
    return confirmedOnly.reduce((sum, b) => {
      const dep = b.deposit_amount || 0;
      return sum + (typeof dep === 'number' ? dep : Number(dep) || 0);
    }, 0);
  }, [confirmedOnly]);

  // Por cancha
  const byCourt = useMemo(() => {
    const map: Record<string, { name: string; count: number; revenue: number }> = {};
    confirmedOnly.forEach(b => {
      const id = b.pitch_id;
      const name = b.pitches?.name || pitches.find(p => p.id === id)?.name || 'Cancha';
      if (!map[id]) map[id] = { name, count: 0, revenue: 0 };
      map[id].count++;
      map[id].revenue += b.total_price || b.pitches?.price_per_hour || 0;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [confirmedOnly, pitches]);

  const maxCourtRevenue = byCourt.reduce((m, c) => Math.max(m, c.revenue), 0);

  // Horas más usadas
  const byHour = useMemo(() => {
    const map: Record<number, number> = {};
    filtered.forEach(b => {
      try {
        const h = new Date(b.start_time).toLocaleString('es-CO', { hour: 'numeric', hour12: false, timeZone: 'America/Bogota' });
        const hNum = parseInt(h);
        map[hNum] = (map[hNum] || 0) + 1;
      } catch { }
    });
    return Object.entries(map)
      .map(([h, count]) => ({ hour: parseInt(h), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filtered]);

  const maxHourCount = byHour.reduce((m, h) => Math.max(m, h.count), 0);

  // Pending
  const pendingCount = useMemo(() => filtered.filter(b => b.status === 'pending').length, [filtered]);

  // ── Descargar PDF (print) ────────────────────────────────────────────────────

  const handleDownloadPDF = useCallback(() => {
    const periodLabel = PERIOD_OPTIONS.find(p => p.key === period)?.label || 'Período';
    const dateRange = `${from.toLocaleDateString('es-CO')} – ${to.toLocaleDateString('es-CO')}`;
    const generatedAt = new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' });

    const courtRows = byCourt.map((c, i) => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:8px 12px;font-weight:700;">${i + 1}. ${c.name}</td>
        <td style="padding:8px 12px;text-align:center;">${c.count}</td>
        <td style="padding:8px 12px;text-align:right;font-weight:700;color:#008744;">${formatCOP(c.revenue)}</td>
        <td style="padding:8px 12px;text-align:right;color:#6b7280;">${pct(c.revenue, totalRevenue)}</td>
      </tr>
    `).join('');

    const hourRows = byHour.map((h, i) => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:8px 12px;font-weight:700;">#${i + 1} ${fmt12(h.hour)}</td>
        <td style="padding:8px 12px;text-align:right;">${h.count} reservas</td>
        <td style="padding:8px 12px;text-align:right;color:#6b7280;">${pct(h.count, filtered.length)}</td>
      </tr>
    `).join('');

    const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/cancheros.png` : '/cancheros.png';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Reporte ${periodLabel} – ${companyName || 'Cancheros'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; background: #fff; padding: 32px; }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; padding-bottom: 18px; border-bottom: 3px solid #008744; }
    .brand-box { display: flex; align-items: center; gap: 14px; }
    .logo-img { height: 48px; max-width: 130px; object-fit: contain; }
    .logo { font-size: 24px; font-weight: 900; color: #054D27; }
    .logo span { color: #008744; }
    .subtitle { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .meta { text-align: right; font-size: 12px; color: #6b7280; }
    .meta strong { color: #111; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 28px; }
    .kpi { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 14px; padding: 16px; text-align: center; }
    .kpi .val { font-size: 22px; font-weight: 900; color: #054D27; margin-bottom: 4px; }
    .kpi .lbl { font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; }
    .section { margin-bottom: 26px; }
    .section-title { font-size: 13px; font-weight: 900; color: #054D27; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid #DCE7DE; display: flex; align-items: center; gap: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #054D27; color: #fff; padding: 8px 12px; text-align: left; font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
    th:last-child, td:last-child { text-align: right; }
    tr:nth-child(even) { background: #f9fafb; }
    .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand-box">
      <img src="${logoUrl}" alt="Cancheros" class="logo-img" onerror="this.style.display='none'" />
      <div>
        <div class="logo">Canch<span>eros</span></div>
        <div class="subtitle">${companyName || 'Panel de Dueño'} · Reporte ${periodLabel}</div>
      </div>
    </div>
    <div class="meta">
      <div><strong>Período:</strong> ${dateRange}</div>
      <div><strong>Generado:</strong> ${generatedAt}</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi">
      <div class="val">${formatCOP(totalRevenue)}</div>
      <div class="lbl">Total Recaudado</div>
    </div>
    <div class="kpi">
      <div class="val">${confirmedOnly.length}</div>
      <div class="lbl">Reservas Confirmadas</div>
    </div>
    <div class="kpi">
      <div class="val">${pitches.length}</div>
      <div class="lbl">Canchas Activas</div>
    </div>
    <div class="kpi">
      <div class="val">${pendingCount}</div>
      <div class="lbl">Pendientes</div>
    </div>
  </div>

  ${byCourt.length > 0 ? `
  <div class="section">
    <div class="section-title">⚽ Recaudo por Cancha</div>
    <table>
      <thead><tr><th>Cancha</th><th>Reservas</th><th>Recaudo</th><th>% Total</th></tr></thead>
      <tbody>${courtRows}</tbody>
    </table>
  </div>` : ''}

  ${byHour.length > 0 ? `
  <div class="section">
    <div class="section-title">🕐 Horas Más Usadas</div>
    <table>
      <thead><tr><th>Hora</th><th>Reservas</th><th>% Uso</th></tr></thead>
      <tbody>${hourRows}</tbody>
    </table>
  </div>` : ''}

  ${depositRevenue > 0 ? `
  <div class="section">
    <div class="section-title">💰 Anticipos Recaudados</div>
    <table>
      <tbody>
        <tr><td style="padding:8px 12px;font-weight:700;">Total Anticipos (Abonos)</td><td style="padding:8px 12px;text-align:right;font-weight:900;color:#008744;">${formatCOP(depositRevenue)}</td></tr>
        <tr style="background:#f9fafb;"><td style="padding:8px 12px;font-weight:700;">Saldo Pendiente Estimado</td><td style="padding:8px 12px;text-align:right;font-weight:900;color:#f59e0b;">${formatCOP(totalRevenue - depositRevenue)}</td></tr>
      </tbody>
    </table>
  </div>` : ''}

  <div class="footer">
    <span>Generado por Cancheros · cancheros.site</span>
    <span>Reporte ${periodLabel} · ${dateRange}</span>
  </div>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 400);
  }, [period, from, to, confirmedOnly, byCourt, byHour, totalRevenue, depositRevenue, pendingCount, pitches, companyName, filtered.length]);

  if (!isOpen) return null;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-background border border-border rounded-3xl shadow-2xl w-full max-w-3xl max-h-[94vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0 bg-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-card border border-border flex items-center justify-center p-1 overflow-hidden shadow-sm shrink-0">
              <img src="/cancheros.png" alt="Cancheros" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-foreground">Reporte de Gestión</h2>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#008744]/15 text-[#008744]">Cancheros</span>
              </div>
              <p className="text-xs text-muted-foreground">{companyName || 'Tu Complejo'} · Analítica de reservas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#054D27] hover:bg-[#043d20] text-white text-xs font-bold rounded-xl transition-all shadow-sm"
            >
              <Download size={14} /> Descargar PDF
            </button> */}
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Period selector */}
        <div className="px-5 py-3 border-b border-border bg-secondary/20 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Período:</span>
            {PERIOD_OPTIONS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${period === p.key
                  ? 'bg-[#008744] text-white border-[#008744]'
                  : 'bg-card border-border text-muted-foreground hover:border-[#008744]/40'
                  }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-3 mt-3">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">DESDE</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="border border-border bg-card rounded-xl px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground block mb-0.5">HASTA</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="border border-border bg-card rounded-xl px-3 py-1.5 text-xs"
                />
              </div>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground mt-1.5">
            📅 {from.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })} – {to.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gradient-to-br from-[#054D27] to-[#008744] text-white rounded-2xl p-4 col-span-1">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign size={14} className="opacity-80" />
                <span className="text-[10px] font-bold uppercase opacity-80">Total Recaudado</span>
              </div>
              <p className="text-2xl font-black">{formatCOP(totalRevenue)}</p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={14} className="text-[#008744]" />
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Reservas</span>
              </div>
              <p className="text-2xl font-black text-foreground">{confirmedOnly.length}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">confirmadas</p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Building2 size={14} className="text-[#008744]" />
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Canchas</span>
              </div>
              <p className="text-2xl font-black text-foreground">{pitches.length}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">activas en el complejo</p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={14} className="text-amber-500" />
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Pendientes</span>
              </div>
              <p className="text-2xl font-black text-amber-500">{pendingCount}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">por revisar</p>
            </div>
          </div>

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <BarChart3 size={40} className="text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm font-bold">Sin datos para este período</p>
              <p className="text-muted-foreground text-xs mt-1">Prueba seleccionando un rango de tiempo más amplio</p>
            </div>
          )}

          {/* Por cancha */}
          {byCourt.length > 0 && (
            <div>
              <h3 className="text-sm font-black text-foreground flex items-center gap-2 mb-3">
                <span className="text-base"></span> Recaudo por Cancha
              </h3>
              <div className="space-y-3">
                {byCourt.map((court, i) => (
                  <div key={court.name} className="bg-card border border-border rounded-2xl p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#054D27] text-white text-[9px] font-black flex items-center justify-center">{i + 1}</span>
                        <span className="font-bold text-sm text-foreground">{court.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-sm text-[#008744]">{formatCOP(court.revenue)}</span>
                        <span className="text-xs text-muted-foreground ml-2">({pct(court.revenue, totalRevenue)})</span>
                      </div>
                    </div>
                    <ProgressBar value={court.revenue} max={maxCourtRevenue} />
                    <p className="text-xs text-muted-foreground mt-1">{court.count} reservas confirmadas</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Horas pico */}
          {byHour.length > 0 && (
            <div>
              <h3 className="text-sm font-black text-foreground flex items-center gap-2 mb-3">
                <Clock size={15} className="text-[#008744]" /> Horas Más Usadas
              </h3>
              <div className="space-y-2.5">
                {byHour.map((h, i) => (
                  <div key={h.hour} className="flex items-center gap-3">
                    <span className="w-14 text-xs font-black text-foreground shrink-0">
                      {fmt12(h.hour)}
                    </span>
                    <div className="flex-1">
                      <ProgressBar value={h.count} max={maxHourCount} color={i === 0 ? '#f59e0b' : '#008744'} />
                    </div>
                    <span className="text-xs font-bold text-muted-foreground w-20 text-right shrink-0">
                      {h.count} reservas
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Anticipos vs Saldo */}
          {depositRevenue > 0 && (
            <div>
              <h3 className="text-sm font-black text-foreground flex items-center gap-2 mb-3">
                <Trophy size={15} className="text-[#008744]" /> Desglose de Pagos
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#008744]/10 border border-[#008744]/30 rounded-2xl p-4">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Anticipos / Abonos</p>
                  <p className="text-xl font-black text-[#008744]">{formatCOP(depositRevenue)}</p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Saldo Estimado</p>
                  <p className="text-xl font-black text-amber-600 dark:text-amber-400">{formatCOP(totalRevenue - depositRevenue)}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border bg-card shrink-0 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            📊 {filtered.length} reservas en el período
          </p>
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-2 px-4 py-2 bg-[#054D27] hover:bg-[#043d20] text-white text-xs font-bold rounded-xl transition-all"
          >
            <Download size={14} /> Descargar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
