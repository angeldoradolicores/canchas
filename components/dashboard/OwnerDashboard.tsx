'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  ArrowRight, CalendarDays, DollarSign, Grid2X2,
  TrendingUp, Clock, CheckCircle2, AlertCircle, Trophy, XCircle,
  BarChart3, Wallet, Star, Activity, Zap, ChevronRight, Users
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type DateFilter = 'hoy' | 'ayer' | 'semana' | 'mes' | 'total';

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'ayer', label: 'Ayer' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
  { key: 'total', label: 'Todo' },
];

function startOf(filter: DateFilter): Date {
  const now = new Date();
  switch (filter) {
    case 'hoy': { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; }
    case 'ayer': { const d = new Date(now); d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0); return d; }
    case 'semana': { const d = new Date(now); const day = d.getDay(); const diff = (day + 6) % 7; d.setDate(d.getDate() - diff); d.setHours(0, 0, 0, 0); return d; }
    case 'mes': { return new Date(now.getFullYear(), now.getMonth(), 1); }
    default: return new Date(0);
  }
}

function endOf(filter: DateFilter): Date {
  if (filter === 'ayer') { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(23, 59, 59, 999); return d; }
  const d = new Date(); d.setHours(23, 59, 59, 999); return d;
}

function fmt(n: number) { return '$' + n.toLocaleString('es-CO'); }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getBookingIncome(b: any): number {
  return Number(b.total_price || b.pitches?.price_per_hour || 0);
}

function MiniBarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1.5 h-16 w-full">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div
            className="w-full rounded-t-md bg-primary/80 transition-all duration-500"
            style={{ height: `${Math.max(4, (d.value / max) * 56)}px` }}
            title={`${d.label}: ${d.value}`}
          />
          <span className="text-[9px] text-muted-foreground font-medium truncate w-full text-center block">
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatCard({
  icon, title, value, sub, accent, onClick,
}: {
  icon: React.ReactNode; title: string; value: React.ReactNode;
  sub?: string; accent?: string; onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border border-border bg-card p-4 sm:p-5 flex flex-col justify-between gap-2.5 shadow-xs hover:shadow-md transition-all duration-200 w-full min-w-0 text-left ${onClick ? 'cursor-pointer hover:border-primary/50 active:scale-[0.98]' : ''
        }`}
    >
      <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-15 pointer-events-none ${accent || 'bg-primary'}`} />
      <div className="flex items-center justify-between relative z-10">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center bg-secondary shrink-0">
          {icon}
        </div>
        {onClick && <ChevronRight size={14} className="text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity" />}
      </div>
      <div className="relative z-10 min-w-0 w-full">
        <div className="text-xl sm:text-2xl font-black text-foreground leading-tight truncate">{value}</div>
        <div className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground mt-0.5 uppercase tracking-wider truncate">{title}</div>
        {sub && <div className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">{sub}</div>}
      </div>
    </Tag>
  );
}

export function OwnerDashboard() {
  const { user, profile, session, loading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [filter, setFilter] = useState<DateFilter>('total');

  // ⚠️ Esperar a que el contexto de auth termine de cargar antes de pedir stats
  useEffect(() => {
    if (authLoading) return;   // auth todavía cargando – no hacer nada
    if (!user?.id) { setLoading(false); return; }  // no hay sesión
    fetchStats();
  }, [user?.id, authLoading]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const token = session?.access_token;
      const res = await fetch('/api/admin-actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'get_dashboard_stats', payload: {} }),
      });
      const json = await res.json();
      if (json.success && json.data) setStats(json.data);
      else setStats(null);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const allBookings: any[] = stats?.recentBookings || [];
  const pitches: any[] = stats?.pitches || [];

  const filteredBookings = useMemo(() => {
    if (filter === 'total') return allBookings;
    const from = startOf(filter); const to = endOf(filter);
    return allBookings.filter(b => { const d = new Date(b.created_at || b.start_time); return d >= from && d <= to; });
  }, [allBookings, filter]);

  const confirmed = filteredBookings.filter(b => b.status === 'confirmed');
  const pending = filteredBookings.filter(b => b.status === 'pending');
  const cancelled = filteredBookings.filter(b => b.status === 'cancelled' || b.status === 'rejected');
  const totalIncome = confirmed.reduce((s, b) => s + getBookingIncome(b), 0);
  const totalDeposit = confirmed.reduce((s, b) => s + Number(b.deposit_amount || 0), 0);
  const avgIncome = confirmed.length > 0 ? Math.round(totalIncome / confirmed.length) : 0;
  const confirmRate = filteredBookings.length > 0 ? Math.round((confirmed.length / filteredBookings.length) * 100) : 0;

  const incomeByPitch = pitches.map(p => {
    const pb = confirmed.filter(b => b.pitch_id === p.id);
    return { name: p.name, income: pb.reduce((s, b) => s + getBookingIncome(b), 0), count: pb.length, id: p.id };
  }).sort((a, b) => b.income - a.income);

  const demandByPitch = pitches.map(p => ({
    name: p.name, count: filteredBookings.filter(b => b.pitch_id === p.id).length,
  })).sort((a, b) => b.count - a.count);
  const maxDemand = Math.max(...demandByPitch.map(p => p.count), 1);

  const hourCount: Record<string, number> = {};
  confirmed.forEach(b => {
    try { const h = new Date(b.start_time).getHours(); const lbl = `${h}:00`; hourCount[lbl] = (hourCount[lbl] || 0) + 1; } catch { }
  });
  const topHour = Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0];

  const last7 = useMemo(() => {
    const days: { label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      const label = d.toLocaleDateString('es-CO', { weekday: 'short' });
      const value = allBookings.filter(b => { const bd = new Date(b.created_at || b.start_time); return bd >= d && bd < next && b.status === 'confirmed'; }).length;
      days.push({ label, value });
    }
    return days;
  }, [allBookings]);

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
          <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin" />
        </div>
        <span className="text-xs font-semibold text-muted-foreground">Cargando tu panel...</span>
      </div>
    );
  }

  return (
    <section className="page-content px-3 sm:px-6 py-4 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-primary tracking-widest uppercase mb-0.5">PANEL DE NEGOCIO</p>
          <h1 className="text-xl sm:text-2xl font-black text-foreground capitalize truncate">Hola, {profile?.full_name?.split(' ')[0]} 👋</h1>
          <p className="text-xs text-muted-foreground truncate">Resumen de <strong className="text-foreground">{stats?.company?.name || 'tu complejo'}</strong></p>
        </div>
        <button onClick={fetchStats} className="self-start sm:self-auto bg-secondary border border-border hover:bg-secondary/80 text-foreground px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0">
          <Activity size={13} className="text-primary" /> Actualizar
        </button>
      </div>

      {/* Filtros de fecha (Scroll Horizontal adaptable para móviles) */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0">
          {DATE_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0 border cursor-pointer ${filter === f.key
                  ? 'bg-primary text-white border-primary shadow-xs'
                  : 'bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] font-medium text-muted-foreground">
          {filteredBookings.length} reservas en el período
        </span>
      </div>

      {/* Grid Stat Cards Fila 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <StatCard icon={<CheckCircle2 size={18} className="text-emerald-600" />} title="Reservas confirmadas" value={confirmed.length} sub={`de ${filteredBookings.length} totales`} accent="bg-emerald-500" onClick={() => router.push('/dashboard/bookings')} />
        <StatCard icon={<DollarSign size={18} className="text-primary" />} title="Ingresos confirmados" value={fmt(totalIncome)} sub={`${confirmed.length} pagos aprobados`} accent="bg-primary" />
        <StatCard icon={<AlertCircle size={18} className="text-amber-500" />} title="Pendientes de aprobar" value={pending.length} sub="Requieren atención" accent="bg-amber-500" onClick={() => router.push('/dashboard/bookings')} />
        <StatCard icon={<Grid2X2 size={18} className="text-violet-600" />} title="Canchas activas" value={stats?.pitchesCount || 0} sub="En tu complejo" accent="bg-violet-500" onClick={() => router.push('/dashboard/pitches')} />
      </div>

      {/* Grid Stat Cards Fila 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <StatCard icon={<Wallet size={18} className="text-sky-600" />} title="Total en abonos" value={fmt(totalDeposit)} sub="Depósitos recibidos" accent="bg-sky-500" />
        <StatCard icon={<TrendingUp size={18} className="text-teal-600" />} title="Promedio por reserva" value={fmt(avgIncome)} sub="Reservas confirmadas" accent="bg-teal-500" />
        <StatCard icon={<Star size={18} className="text-orange-500" />} title="Tasa de confirmación" value={`${confirmRate}%`} sub="Del total solicitudes" accent="bg-orange-400" />
        <StatCard icon={<Clock size={18} className="text-rose-500" />} title="Hora más popular" value={topHour ? topHour[0] : '—'} sub={topHour ? `${topHour[1]} reservas` : 'Sin datos'} accent="bg-rose-400" />
      </div>

      {/* Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Reservas recientes */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-4 sm:p-5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/60">
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-foreground truncate">Reservas recientes</h2>
              <p className="text-xs text-muted-foreground truncate">Últimos movimientos del período</p>
            </div>
            <Link href="/dashboard/bookings" className="text-xs font-bold text-primary hover:underline flex items-center gap-1 shrink-0">
              Ver todas <ArrowRight size={13} />
            </Link>
          </div>

          {filteredBookings.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2 text-muted-foreground">
              <CalendarDays size={32} className="opacity-30" />
              <p className="text-xs font-medium">Sin reservas en este período</p>
            </div>
          ) : (
            <div className="space-y-2 mt-3 max-h-80 overflow-y-auto pr-1">
              {filteredBookings.slice(0, 20).map((row: any) => (
                <div key={row.id} className="flex items-center gap-2.5 p-2.5 sm:p-3 rounded-xl bg-secondary/40 border border-border/60 hover:bg-secondary/70 transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${row.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-600' : row.status === 'pending' ? 'bg-amber-500/10 text-amber-600' : 'bg-rose-500/10 text-rose-500'}`}>
                    {row.status === 'confirmed' ? <CheckCircle2 size={15} /> : row.status === 'pending' ? <Clock size={15} /> : <XCircle size={15} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs sm:text-sm text-foreground truncate capitalize">{row.customer_name || 'Cliente'}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{row.pitches?.name?.toUpperCase() || '—'} · {fmtDate(row.start_time)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-extrabold text-xs sm:text-sm text-foreground">{fmt(getBookingIncome(row))}</div>
                    <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-md ${row.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-600' : row.status === 'pending' ? 'bg-amber-500/10 text-amber-600' : 'bg-rose-500/10 text-rose-500'}`}>
                      {row.status === 'pending' ? 'Pendiente' : row.status === 'confirmed' ? 'Aprobada' : 'Cancelada'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel Derecho */}
        <div className="flex flex-col gap-4">
          {/* Mini chart */}
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-xs">
            <div className="pb-3 border-b border-border/60">
              <h2 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                <BarChart3 size={15} className="text-primary" /> Actividad 7 días
              </h2>
              <p className="text-xs text-muted-foreground">Reservas confirmadas por día</p>
            </div>
            <div className="mt-4"><MiniBarChart data={last7} /></div>
          </div>

          {/* Estado general */}
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-xs">
            <div className="pb-3 border-b border-border/60">
              <h2 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                <Activity size={15} className="text-primary" /> Estado general
              </h2>
              <p className="text-xs text-muted-foreground">Distribución del período</p>
            </div>
            <div className="mt-4 space-y-3">
              {[
                { label: 'Confirmadas', count: confirmed.length, color: 'bg-emerald-500', text: 'text-emerald-600' },
                { label: 'Pendientes', count: pending.length, color: 'bg-amber-400', text: 'text-amber-600' },
                { label: 'Canceladas', count: cancelled.length, color: 'bg-rose-500', text: 'text-rose-600' },
              ].map(s => {
                const pct = filteredBookings.length > 0 ? Math.round((s.count / filteredBookings.length) * 100) : 0;
                return (
                  <div key={s.label} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span>{s.label}</span>
                      <span className={s.text}>{s.count} · {pct}%</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className={`h-full ${s.color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Segunda Fila */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Ingresos por cancha */}
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="pb-3 border-b border-border/60">
            <h2 className="text-sm font-extrabold text-foreground flex items-center gap-2">
              <DollarSign size={15} className="text-primary" /> Ingresos por cancha
            </h2>
            <p className="text-xs text-muted-foreground">Solo reservas confirmadas</p>
          </div>
          {incomeByPitch.length === 0 ? <p className="text-xs text-muted-foreground mt-4">Sin datos aún.</p> : (
            <div className="mt-4 space-y-3">
              {incomeByPitch.map((p, i) => {
                const maxIncome = incomeByPitch[0]?.income || 1;
                return (
                  <div key={p.id} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="flex items-center gap-1 truncate max-w-[140px]">{i === 0 && <Zap size={11} className="text-amber-500 shrink-0" />}{p.name}</span>
                      <span className="text-foreground font-extrabold shrink-0">{fmt(p.income)}</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${(p.income / maxIncome) * 100}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{p.count} reservas confirmadas</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Más solicitadas */}
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="pb-3 border-b border-border/60">
            <h2 className="text-sm font-extrabold text-foreground flex items-center gap-2">
              <Trophy size={15} className="text-amber-500" /> Más solicitadas
            </h2>
            <p className="text-xs text-muted-foreground">Todas las reservas del período</p>
          </div>
          {demandByPitch.length === 0 ? <p className="text-xs text-muted-foreground mt-4">Sin datos aún.</p> : (
            <div className="mt-4 space-y-3">
              {demandByPitch.map((p, i) => (
                <div key={`${i}-${p.name}`} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5 truncate max-w-[140px]">
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-zinc-300 text-zinc-700' : i === 2 ? 'bg-orange-300 text-white' : 'bg-secondary text-muted-foreground'}`}>{i + 1}</span>
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="text-muted-foreground shrink-0">{p.count} res.</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${i === 0 ? 'bg-amber-400' : 'bg-primary/70'}`} style={{ width: `${(p.count / maxDemand) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mis canchas */}
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div>
              <h2 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                <Grid2X2 size={15} className="text-primary" /> Tus Canchas
              </h2>
              <p className="text-xs text-muted-foreground">Gestión rápida</p>
            </div>
            <Link href="/dashboard/pitches/new" className="bg-primary hover:bg-primary/90 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition-colors shrink-0">
              + Nueva
            </Link>
          </div>
          {pitches.length === 0 ? (
            <div className="mt-4 text-center space-y-2">
              <p className="text-xs text-muted-foreground">No has registrado canchas.</p>
              <Link href="/dashboard/pitches/new" className="bg-primary text-white inline-block text-xs font-bold py-1.5 px-3 rounded-lg">Crear cancha</Link>
            </div>
          ) : (
            <div className="space-y-2 mt-4">
              {pitches.map((pitch: any) => {
                const pConf = confirmed.filter(b => b.pitch_id === pitch.id).length;
                const pInc = confirmed.filter(b => b.pitch_id === pitch.id).reduce((s, b) => s + getBookingIncome(b), 0);
                return (
                  <Link key={pitch.id} href="/dashboard/pitches" className="flex items-center justify-between p-2.5 rounded-xl bg-secondary/40 hover:bg-secondary/70 border border-border/60 transition-colors group">
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-xs sm:text-sm truncate">{pitch.name.toUpperCase()}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{pConf} reservas · {fmt(pInc)}</div>
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground shrink-0 opacity-60 group-hover:opacity-100 transition-all" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Accesos rápidos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 pt-2">
        {[
          { label: 'Ver reservas', href: '/dashboard/bookings', icon: <CalendarDays size={16} /> },
          { label: 'Mis canchas', href: '/dashboard/pitches', icon: <Grid2X2 size={16} /> },
          { label: 'Torneos', href: '/dashboard/tournaments', icon: <Trophy size={16} /> },
          { label: 'Perfil', href: '/dashboard/profile', icon: <Users size={16} /> },
        ].map(item => (
          <Link key={item.href} href={item.href} className="flex items-center gap-2 p-3 rounded-xl border border-border bg-card hover:bg-primary/5 hover:border-primary/30 transition-all group min-w-0">
            <span className="text-primary shrink-0 group-hover:scale-110 transition-transform">{item.icon}</span>
            <span className="text-xs font-bold truncate">{item.label}</span>
            <ArrowRight size={12} className="ml-auto text-muted-foreground shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
          </Link>
        ))}
      </div>
    </section>
  );
}