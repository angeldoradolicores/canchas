'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight, CalendarDays, DollarSign, Grid2X2,
  Loader2, Sparkles, Users, TrendingUp, Clock,
  CheckCircle2, AlertCircle, BarChart3, Trophy
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function OwnerDashboard() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (user?.id) fetchStats();
  }, [user]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_dashboard_stats', payload: { owner_id: user?.id } }),
      });
      const json = await res.json();
      if (json.success && json.data) setStats(json.data);
    } catch (e) {
      console.error('Error cargando estadísticas:', e);
    } finally {
      setLoading(false);
    }
  };

  const companyName = stats?.company?.name || profile?.full_name || 'Mi Complejo Deportivo';
  const pitchesCount = stats?.pitchesCount || 0;
  const recentBookings: any[] = stats?.recentBookings || [];
  const pitches: any[] = stats?.pitches || [];

  // Compute derived stats
  const pendingCount = recentBookings.filter(b => b.status === 'pending').length;
  const confirmedCount = recentBookings.filter(b => b.status === 'confirmed').length;
  const totalIncome = recentBookings
    .filter(b => b.status === 'confirmed')
    .reduce((acc: number, b: any) => acc + (b.total_price || b.pitches?.price_per_hour || 80000), 0);

  // Pitch demand: count bookings per pitch
  const pitchDemand = pitches.map(p => ({
    name: p.name,
    count: recentBookings.filter(b => b.pitch_id === p.id).length,
  })).sort((a, b) => b.count - a.count);
  const maxDemand = Math.max(...pitchDemand.map(p => p.count), 1);

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <Loader2 size={32} className="animate-spin text-emerald-600" />
        <span className="text-xs font-semibold text-zinc-500">Cargando tu panel...</span>
      </div>
    );
  }

  return (
    <section className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow accent-label">PANEL DE NEGOCIO</p>
          <h1>Hola, {companyName} 👋</h1>
          <p className="lead">Aquí está el resumen de tu complejo deportivo.</p>
        </div>
      </div>

      {/* ─── Stat Cards (clicables) ─── */}
      <div className="stat-grid">
        <button
          onClick={() => router.push('/dashboard/pitches')}
          className="stat-card text-left hover:border-primary/40 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="stat-top">
            <span>Canchas activas</span>
            <Grid2X2 size={18} className="group-hover:text-primary transition-colors" />
          </div>
          <div className="stat-value">{pitchesCount}</div>
          <p className="stat-delta flex items-center justify-between">
            <span>Ver mis canchas</span>
            <ArrowRight size={13} className="opacity-0 group-hover:opacity-100 transition-all" />
          </p>
        </button>

        <button
          onClick={() => router.push('/dashboard/bookings')}
          className="stat-card text-left hover:border-primary/40 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="stat-top">
            <span>Reservas totales</span>
            <CalendarDays size={18} className="group-hover:text-primary transition-colors" />
          </div>
          <div className="stat-value">{recentBookings.length}</div>
          <p className="stat-delta flex items-center justify-between">
            <span>Ver reservas</span>
            <ArrowRight size={13} className="opacity-0 group-hover:opacity-100 transition-all" />
          </p>
        </button>

        <button
          onClick={() => router.push('/dashboard/bookings')}
          className="stat-card text-left hover:border-amber-400/40 hover:shadow-md transition-all cursor-pointer group border-amber-200"
        >
          <div className="stat-top">
            <span>Pendientes</span>
            <AlertCircle size={18} className="text-amber-500 group-hover:scale-110 transition-all" />
          </div>
          <div className="stat-value text-amber-500">{pendingCount}</div>
          <p className="stat-delta flex items-center justify-between">
            <span>Requieren aprobación</span>
            <ArrowRight size={13} className="opacity-0 group-hover:opacity-100 transition-all" />
          </p>
        </button>

        <div className="stat-card">
          <div className="stat-top">
            <span>Ingresos confirmados</span>
            <DollarSign size={18} />
          </div>
          <div className="stat-value text-emerald-600">
            ${Number(totalIncome || 0).toLocaleString('es-CO')}
          </div>
          <p className="stat-delta"><span>{confirmedCount} reservas aprobadas</span></p>
        </div>
      </div>

      <div className="dashboard-grid mt-6">
        {/* ─── Reservas Recientes ─── */}
        <div className="dashboard-card">
          <div className="card-heading">
            <div>
              <h2>Reservas recientes</h2>
              <p>Movimientos de tus canchas</p>
            </div>
            <Link href="/dashboard/bookings" className="text-link text-xs font-bold flex items-center gap-1">
              Ver todas <ArrowRight size={14} />
            </Link>
          </div>

          {recentBookings.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              Aún no tienes reservas registradas.
            </div>
          ) : (
            <div className="space-y-2 mt-4">
              {recentBookings.slice(0, 6).map((row: any) => (
                <div key={row.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40 border border-border hover:bg-secondary/70 transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${row.status === 'confirmed' ? 'bg-green-100 text-green-600' :
                    row.status === 'pending' ? 'bg-amber-100 text-amber-600' :
                      'bg-red-100 text-red-500'
                    }`}>
                    {row.status === 'confirmed' ? <CheckCircle2 size={16} /> :
                      row.status === 'pending' ? <Clock size={16} /> :
                        <AlertCircle size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{row.customer_name || 'Cliente'}</div>
                    <div className="text-xs text-muted-foreground">{row.pitches?.name} · {new Date(row.start_time).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${row.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                    row.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                    {row.status === 'pending' ? 'Pendiente' : row.status === 'confirmed' ? 'Aprobada' : 'Rechazada'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Panel derecho: Canchas + Demanda ─── */}
        <div className="space-y-5">
          {/* Mis Canchas */}
          <div className="dashboard-card">
            <div className="card-heading">
              <div>
                <h2>Tus Canchas</h2>
                <p>Gestión rápida</p>
              </div>
              <Link href="/dashboard/pitches/new" className="btn-primary text-xs py-1.5 px-3">
                + Nueva
              </Link>
            </div>
            {pitches.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-500 space-y-2">
                <p>No has registrado ninguna cancha aún.</p>
                <Link href="/dashboard/pitches/new" className="btn-primary inline-block text-xs py-2 px-4">
                  Crear cancha
                </Link>
              </div>
            ) : (
              <div className="space-y-2 mt-4">
                {pitches.map((pitch: any) => (
                  <Link key={pitch.id} href="/dashboard/pitches" className="flex items-center justify-between p-3 rounded-xl bg-secondary/40 hover:bg-secondary/70 border border-border transition-colors group">
                    <div>
                      <div className="font-bold text-sm">{pitch.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {Array.isArray(pitch.supported_types)
                          ? pitch.supported_types.join(', ')
                          : (pitch.type || '')} · ${Number(pitch.price_per_hour || 0).toLocaleString('es-CO')}/hr
                      </div>                    </div>
                    <ArrowRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-all" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Canchas más solicitadas */}
          {pitchDemand.length > 0 && (
            <div className="dashboard-card">
              <div className="card-heading">
                <div>
                  <h2 className="flex items-center gap-2"><Trophy size={16} className="text-amber-500" /> Más Solicitadas</h2>
                  <p>Últimas 10 reservas</p>
                </div>
              </div>
              <div className="space-y-3 mt-4">
                {pitchDemand.map((p, i) => (
                  <div key={p.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold flex items-center gap-1.5">
                        {i === 0 && <span className="text-amber-500">1</span>}
                        {i === 1 && <span>2</span>}
                        {i === 2 && <span>3</span>}
                        {i > 2 && <span className="text-muted-foreground font-normal">{i + 1}.</span>}
                        {p.name}
                      </span>
                      <span className="text-muted-foreground">{p.count} reservas</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-700"
                        style={{ width: `${(p.count / maxDemand) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Estado del complejo */}
          <div className="stat-card">
            <div className="stat-top">
              <span>Estado del complejo</span>
              <Sparkles size={18} />
            </div>
            <div className="stat-value text-emerald-600 text-lg font-bold flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Activo
            </div>
            <p className="stat-delta"><span>Visibilidad habilitada</span></p>
          </div>
        </div>
      </div>
    </section>
  );
}
