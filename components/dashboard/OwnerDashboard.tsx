'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ArrowRight, CalendarDays, DollarSign, Grid2X2,
  TrendingUp, Clock, CheckCircle2, AlertCircle, Trophy, XCircle,
  BarChart3, Wallet, Star, Activity, Zap, ChevronRight, Users, Bell, X,
  TrendingDown, Target, CalendarClock, Hash, FileText, Layers, Gift, Sparkles
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { BookingReportModal } from '@/components/booking/BookingReportModal';
import { ManualBookingModal } from '@/components/booking/ManualBookingModal';
import { playPendingAlertSound, triggerSystemNotification } from '@/lib/push-notifications';
import { getBookingRemainingPayment } from '@/lib/remaining-payment-utils';

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
    case 'hoy': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'ayer': {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'semana': {
      const d = new Date(now);
      const day = d.getDay();
      const diff = (day + 6) % 7; // Lunes como inicio de semana
      d.setDate(d.getDate() - diff);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'mes': {
      return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }
    default: return new Date(0);
  }
}

function endOf(filter: DateFilter): Date {
  const now = new Date();
  switch (filter) {
    case 'hoy': {
      const d = new Date(now);
      d.setHours(23, 59, 59, 999);
      return d;
    }
    case 'ayer': {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      d.setHours(23, 59, 59, 999);
      return d;
    }
    case 'semana': {
      const d = new Date(now);
      const day = d.getDay();
      const diff = (day + 6) % 7;
      d.setDate(d.getDate() - diff + 6); // Domingo al final de la semana
      d.setHours(23, 59, 59, 999);
      return d;
    }
    case 'mes': {
      const d = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Último día del mes actual
      d.setHours(23, 59, 59, 999);
      return d;
    }
    default: return new Date(8640000000000000);
  }
}

function fmt(n: number) { return '$' + n.toLocaleString('es-CO'); }

function fmtDate(iso: string) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota' });
  } catch {
    return '—';
  }
}

function fmtTime(iso: string) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' });
  } catch {
    return '';
  }
}

function fmtDateTime(iso: string) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    const dateStr = d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
    const timeStr = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' });
    return `${dateStr}, ${timeStr}`;
  } catch {
    return '';
  }
}

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

function getBookingIncome(b: any): number {
  return Number(b.total_price || b.pitches?.price_per_hour || 0);
}

function getBookingDeposit(b: any): number {
  if (!b) return 0;
  if (b.deposit_amount !== undefined && b.deposit_amount !== null && Number(b.deposit_amount) > 0) {
    return Number(b.deposit_amount);
  }
  // Fallback si no tiene deposit_amount pero es reserva web de cliente
  if (b.source !== 'owner_panel' && b.pitches && !b.is_loyalty_free) {
    const customPricing = b.pitches.custom_pricing || {};
    const isFixed = customPricing.booking_type === 'fixed';
    const pct = customPricing.booking_percentage || b.pitches.booking_percentage || 50;
    const tPrice = getBookingIncome(b);
    if (isFixed) {
      return Number(customPricing.booking_fixed || 0);
    }
    return (tPrice * Number(pct)) / 100;
  }
  return 0;
}

// Abonos/saldos cobrados en el local (pagos parciales registrados después del anticipo).
function getBookingAbonos(b: any): number {
  if (!b) return 0;
  const rem = getBookingRemainingPayment(b);
  return Number(rem?.amount || b.remaining_amount_paid || 0);
}

// Monto REALMENTE cobrado de una reserva.
// Regla: una reserva del panel del dueño (manual / turno fijo) marcada como pagada
// (payment_status 'verified') y que NO sea a crédito ni cuenta por cobrar, se considera
// COBRADA en su totalidad (se pagó por adelantado en el local). El resto se cobra por
// anticipo + abonos, con tope en el valor total.
function getBookingCollected(b: any): number {
  if (!b) return 0;
  const total = getBookingIncome(b);
  if (b.is_loyalty_free) return 0;
  const method = b.payment_method;
  const paidInFull =
    b.source === 'owner_panel' &&
    b.payment_status === 'verified' &&
    method !== 'credito' &&
    method !== 'cuenta_cobrar';
  if (paidInFull) return total;
  return Math.min(getBookingDeposit(b) + getBookingAbonos(b), total);
}

function MiniBarChart({
  data,
  selectedIsoDate,
  onSelectDate,
}: {
  data: { weekday: string; dateLabel: string; value: number; fullDate: string; isoDate: string }[];
  selectedIsoDate?: string | null;
  onSelectDate?: (isoDate: string, fullDate: string) => void;
}) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1 sm:gap-2 h-24 w-full pt-1">
      {data.map((d, i) => {
        const isSelected = selectedIsoDate === d.isoDate;
        return (
          <button
            type="button"
            key={i}
            onClick={() => onSelectDate?.(d.isoDate, d.fullDate)}
            className={`flex-1 flex flex-col items-center gap-1 min-w-0 group rounded-xl p-0.5 transition-all text-left cursor-pointer hover:bg-secondary/40 active:scale-95 ${isSelected ? 'bg-primary/15 ring-2 ring-primary ring-offset-1' : ''
              }`}
            title={`Toca para ver datos del ${d.fullDate}: ${d.value} confirmadas`}
          >
            <div className="relative flex-1 flex flex-col justify-end w-full">
              <div
                className={`w-full rounded-t-lg transition-all duration-300 min-h-[4px] ${isSelected ? 'bg-primary opacity-100 shadow-sm' : 'bg-primary/80 group-hover:bg-primary'
                  }`}
                style={{ height: `${Math.max(4, (d.value / max) * 48)}px` }}
              />
            </div>
            <div className="flex flex-col items-center leading-none text-center w-full">
              <span className={`text-[10px] sm:text-[11px] font-bold capitalize truncate w-full ${isSelected ? 'text-primary font-black' : 'text-foreground'
                }`}>
                {d.weekday}
              </span>
              <span className="text-[8px] sm:text-[9px] text-muted-foreground capitalize truncate w-full mt-0.5 font-medium">
                {d.dateLabel}
              </span>
            </div>
            {/* Número de reservas confirmadas */}
            <span className={`text-[9px] sm:text-[10px] font-black truncate w-full text-center ${isSelected ? 'text-primary scale-110' : 'text-primary'
              }`}>
              {d.value}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function WeekdayChart({
  data,
  selectedIsoDate,
  onSelectDate,
}: {
  data: { weekday: string; dateLabel: string; value: number; income: number; fullDate: string; isoDate: string; isHighlighted?: boolean; highlightTag?: string }[];
  selectedIsoDate?: string | null;
  onSelectDate?: (isoDate: string, fullDate: string) => void;
}) {
  const max = Math.max(...data.map(d => d.value), 1);
  const colors = ['bg-violet-400', 'bg-sky-400', 'bg-emerald-400', 'bg-primary', 'bg-amber-400', 'bg-rose-400', 'bg-pink-400'];
  return (
    <div className="flex items-end gap-1 sm:gap-2 h-24 w-full pt-1">
      {data.map((d, i) => {
        const isSelected = selectedIsoDate === d.isoDate;
        return (
          <button
            type="button"
            key={i}
            onClick={() => onSelectDate?.(d.isoDate, d.fullDate)}
            className={`flex-1 flex flex-col items-center gap-1 min-w-0 group rounded-xl p-0.5 transition-all text-left cursor-pointer hover:bg-secondary/40 active:scale-95 ${isSelected ? 'bg-primary/20 ring-2 ring-primary ring-offset-1' : d.isHighlighted ? 'bg-primary/10 ring-1 ring-primary/40' : ''
              }`}
            title={`Toca para ver datos del ${d.fullDate}: ${d.value} reservas ${d.highlightTag ? `(${d.highlightTag})` : ''}`}
          >
            <div className="relative flex-1 flex flex-col justify-end w-full">
              <div
                className={`w-full rounded-t-lg ${colors[i % colors.length]} ${isSelected ? 'opacity-100 ring-2 ring-primary' : d.isHighlighted ? 'opacity-100 ring-1 ring-primary' : 'opacity-80 group-hover:opacity-100'
                  } transition-all duration-300 min-h-[4px]`}
                style={{ height: `${Math.max(4, (d.value / max) * 50)}px` }}
              />
            </div>
            <div className="flex flex-col items-center leading-none text-center w-full">
              <span className={`text-[10px] sm:text-[11px] font-bold capitalize truncate w-full ${isSelected ? 'text-primary font-black underline' : d.isHighlighted ? 'text-primary font-black' : 'text-foreground'
                }`}>
                {d.weekday}
              </span>
              <span className="text-[8px] sm:text-[9px] text-muted-foreground capitalize truncate w-full mt-0.5 font-medium">
                {d.highlightTag || d.dateLabel}
              </span>
            </div>
            <span className={`text-[9px] sm:text-[10px] font-black truncate w-full text-center ${isSelected || d.isHighlighted ? 'text-primary scale-110' : 'text-primary'
              }`}>
              {d.value}
            </span>
          </button>
        );
      })}
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
      className={`group relative overflow-hidden rounded-2xl border border-border bg-card p-3 sm:p-5 flex flex-col justify-between gap-2 shadow-xs hover:shadow-md transition-all duration-200 w-full min-w-0 text-left ${onClick ? 'cursor-pointer hover:border-primary/50 active:scale-[0.98]' : ''
        }`}
    >
      <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-15 pointer-events-none ${accent || 'bg-primary'}`} />

      <div className="flex items-center justify-between relative z-10">
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center bg-secondary shrink-0">
          {icon}
        </div>
        {onClick && <ChevronRight size={14} className="text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity shrink-0" />}
      </div>

      <div className="relative z-10 min-w-0 w-full">
        {/* El valor solo hace truncate si es un número gigante o string largo, pero el texto fluye */}
        <div className="text-lg sm:text-2xl font-black text-foreground leading-tight truncate">{value}</div>

        {/* Quitamos truncate y permitimos que baje de línea (line-clamp-2) para que se lea completo */}
        <div className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground mt-1 uppercase tracking-wider line-clamp-2 leading-tight">
          {title}
        </div>

        {sub && (
          <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {sub}
          </div>
        )}
      </div>
    </Tag>
  );
}

export function OwnerDashboard() {
  const { user, profile, session, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [filter, setFilter] = useState<DateFilter>('hoy');
  const [selectedDay, setSelectedDay] = useState<{ isoDate: string; fullDate: string } | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [newPendingToast, setNewPendingToast] = useState<string | null>(null);
  const [loyaltyGiftClient, setLoyaltyGiftClient] = useState<{ name: string; phone: string } | null>(null);

  const fetchStats = useCallback(async () => {
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
  }, [session?.access_token]);

  // ⚠️ Esperar a que el contexto de auth termine de cargar antes de pedir stats
  useEffect(() => {
    if (authLoading) return;   // auth todavía cargando – no hacer nada
    if (!user?.id) {
      router.replace('/login?next=/dashboard');
      return;
    }
    fetchStats();
  }, [user?.id, authLoading, fetchStats, router]);

  // Realtime: escuchar nuevas reservas pending con alerta de sonido llamativo
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`owner-bookings-realtime:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bookings',
      }, (payload: any) => {
        if (payload.new?.status === 'pending') {
          const name = payload.new.customer_name || 'Un cliente';
          setNewPendingToast(`🔔 Nueva reserva por aprobar de ${name}`);
          playPendingAlertSound();
          triggerSystemNotification(
            '⚽ Cancheros: Reserva por aprobar',
            `Cliente ${name} subió comprobante y espera tu confirmación.`
          );
          setTimeout(() => setNewPendingToast(null), 8000);
          fetchStats(); // Refrescar estadísticas automáticamente
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bookings',
      }, (payload: any) => {
        if (payload.new?.status === 'pending' && payload.old?.status !== 'pending') {
          const name = payload.new.customer_name || 'Un cliente';
          setNewPendingToast(`🔔 Reserva por aprobar de ${name}`);
          playPendingAlertSound();
          triggerSystemNotification(
            '⚽ Cancheros: Reserva por aprobar',
            `Cliente ${name} subió comprobante y espera tu confirmación.`
          );
          setTimeout(() => setNewPendingToast(null), 8000);
        }
        fetchStats(); // Cualquier cambio refresca
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchStats]);

  const allBookings: any[] = stats?.recentBookings || [];
  const pitches: any[] = stats?.pitches || [];

  const filteredBookings = useMemo(() => {
    if (selectedDay) {
      return allBookings.filter(b => {
        const matchYmd = b.start_time ? getLocalDateString(b.start_time) : '';
        const createdYmd = b.created_at ? getLocalDateString(b.created_at) : '';
        return matchYmd === selectedDay.isoDate || createdYmd === selectedDay.isoDate;
      });
    }

    if (filter === 'total') return allBookings;
    const from = startOf(filter);
    const to = endOf(filter);

    return allBookings.filter(b => {
      // 1. ¿Fue realizada (creada) en el período seleccionado? (ej: realizada hoy sin importar el día del partido)
      const createdTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      const isCreatedInPeriod = createdTime >= from.getTime() && createdTime <= to.getTime();

      // 2. ¿El partido está programado para este período? (ej: partido hoy)
      const matchTime = b.start_time ? new Date(b.start_time).getTime() : 0;
      const isMatchInPeriod = matchTime >= from.getTime() && matchTime <= to.getTime();

      return isCreatedInPeriod || isMatchInPeriod;
    });
  }, [allBookings, filter, selectedDay]);

  // Todas las pendientes del complejo en total
  const allPending = useMemo(() => {
    return allBookings.filter(b => b.status === 'pending');
  }, [allBookings]);

  // Pendientes correspondientes a partidos de otras fechas (futuras o pasadas fuera de hoy)
  const pendingOtherDays = useMemo(() => {
    const todayStr = getLocalDateString(new Date());
    return allPending.filter(b => {
      const matchDateStr = getLocalDateString(b.start_time);
      const createdDateStr = b.created_at ? getLocalDateString(b.created_at) : '';
      return matchDateStr !== todayStr && createdDateStr !== todayStr;
    });
  }, [allPending]);

  const confirmed = filteredBookings.filter(b => b.status === 'confirmed');
  const pending = filteredBookings.filter(b => b.status === 'pending');
  const cancelled = filteredBookings.filter(b => b.status === 'cancelled' || b.status === 'rejected');
  const totalIncome = confirmed.reduce((s, b) => s + getBookingIncome(b), 0);
  // Cobrado total = suma de lo realmente cobrado por reserva (incluye pagos adelantados
  // del panel del dueño como cobrados completos). El desglose se mantiene coherente:
  // "cobrado directo/anticipos" + "abonos de saldo" = totalCollected.
  const totalCollected = confirmed.reduce((s, b) => s + getBookingCollected(b), 0);
  const totalRemainingPaid = confirmed.reduce((s, b) => s + getBookingAbonos(b), 0);
  const totalDeposits = Math.max(0, totalCollected - totalRemainingPaid);
  const pendingCollection = Math.max(0, totalIncome - totalCollected);
  const avgIncome = confirmed.length > 0 ? Math.round(totalIncome / confirmed.length) : 0;
  const confirmRate = filteredBookings.length > 0 ? Math.round((confirmed.length / filteredBookings.length) * 100) : 0;

  const incomeByPitch = pitches.map(p => {
    const pb = confirmed.filter(b => b.pitch_id === p.id);
    return { name: p.name || 'Cancha', income: pb.reduce((s, b) => s + getBookingIncome(b), 0), count: pb.length, id: p.id };
  }).sort((a, b) => b.income - a.income);

  const demandByPitch = pitches.map(p => ({
    name: p.name || 'Cancha', count: filteredBookings.filter(b => b.pitch_id === p.id).length,
  })).sort((a, b) => b.count - a.count);
  const maxDemand = Math.max(...demandByPitch.map(p => p.count), 1);

  const hourCount: Record<string, number> = {};
  confirmed.forEach(b => {
    try {
      if (!b.start_time) return;
      const d = new Date(b.start_time);
      if (isNaN(d.getTime())) return;
      const h = d.getHours();
      const lbl = `${h}:00`;
      hourCount[lbl] = (hourCount[lbl] || 0) + 1;
    } catch { }
  });
  const topHour = Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0];

  const last7 = useMemo(() => {
    const days: { weekday: string; dateLabel: string; value: number; fullDate: string; isoDate: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);

      const weekday = d.toLocaleDateString('es-CO', { weekday: 'short', timeZone: 'America/Bogota' }).replace('.', '');
      const dateLabel = `${d.getDate()} ${d.toLocaleDateString('es-CO', { month: 'short', timeZone: 'America/Bogota' }).replace('.', '')}`;
      const fullDate = d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
      const isoDate = getLocalDateString(d);

      const value = allBookings.filter(b => {
        const bd = new Date(b.created_at || b.start_time);
        return bd >= d && bd < next && b.status === 'confirmed';
      }).length;

      days.push({ weekday, dateLabel, value, fullDate, isoDate });
    }
    return days;
  }, [allBookings]);

  // Actividad por día de la semana
  // Para que no salgan 0 en los otros 6 días cuando el filtro es 'hoy' o 'ayer',
  // se evalúa la distribución de la semana actual (o mes/total según filtro),
  // destacando el día seleccionado (Hoy o Ayer).
  const byWeekday = useMemo(() => {
    const weekdayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const now = new Date();
    const currDay = now.getDay();
    const yesterdayDay = (currDay + 6) % 7; // índice del día de ayer

    // Determinar qué conjunto de reservas evaluar según el filtro
    let sourceBookings = allBookings;
    if (filter === 'mes') {
      const from = startOf('mes').getTime();
      const to = endOf('mes').getTime();
      sourceBookings = allBookings.filter(b => {
        const t = b.start_time ? new Date(b.start_time).getTime() : 0;
        return t >= from && t <= to;
      });
    } else if (filter === 'semana' || filter === 'hoy' || filter === 'ayer') {
      // Semana completa actual para que el dueño siempre pueda comparar los 7 días
      const from = startOf('semana').getTime();
      const to = endOf('semana').getTime();
      sourceBookings = allBookings.filter(b => {
        const t = b.start_time ? new Date(b.start_time).getTime() : 0;
        return t >= from && t <= to;
      });
    }

    return weekdayNames.map((weekday, idx) => {
      // Calcular la fecha correspondiente a este día en la semana actual
      const targetDate = new Date(now);
      const dayDiff = idx - currDay;
      targetDate.setDate(now.getDate() + dayDiff);

      const dateLabel = `${targetDate.getDate()} ${targetDate.toLocaleDateString('es-CO', { month: 'short', timeZone: 'America/Bogota' }).replace('.', '')}`;
      const fullDate = targetDate.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
      const isoDate = getLocalDateString(targetDate);

      // Agrupar estrictamente por el día del partido (start_time)
      const dayBookings = sourceBookings.filter(b => {
        if (!b?.start_time) return false;
        const d = new Date(b.start_time);
        if (isNaN(d.getTime())) return false;
        return d.getDay() === idx;
      });

      const isToday = idx === currDay;
      const isYesterday = idx === yesterdayDay;
      const isHighlighted = (filter === 'hoy' && isToday) || (filter === 'ayer' && isYesterday);
      const highlightTag = filter === 'hoy' && isToday ? 'Hoy' : filter === 'ayer' && isYesterday ? 'Ayer' : undefined;

      return {
        weekday,
        dateLabel,
        fullDate,
        isoDate,
        value: dayBookings.length,
        income: dayBookings.filter(b => b.status === 'confirmed').reduce((s, b) => s + getBookingIncome(b), 0),
        isHighlighted,
        highlightTag,
      };
    });
  }, [allBookings, filter]);

  // Métricas adicionales
  const uniqueCustomers = useMemo(() => {
    const names = new Set(filteredBookings.map(b => b.customer_phone || b.customer_name || b.user_id).filter(Boolean));
    return names.size;
  }, [filteredBookings]);

  const cancelRate = filteredBookings.length > 0 ? Math.round((cancelled.length / filteredBookings.length) * 100) : 0;

  // Clientes con 20 o más canchas confirmadas (Alerta de Fidelización)
  const loyaltyClients = useMemo(() => {
    const map: Record<string, { name: string; phone: string; confirmedCount: number; lastDate: string }> = {};

    allBookings.filter(b => b.status === 'confirmed').forEach(b => {
      const key = (b.customer_phone || b.customer_name || '').trim().toLowerCase();
      if (!key) return;
      if (!map[key]) {
        map[key] = {
          name: b.customer_name || 'Cliente frecuente',
          phone: b.customer_phone || '',
          confirmedCount: 0,
          lastDate: b.start_time,
        };
      }
      map[key].confirmedCount++;
      if (b.start_time && (!map[key].lastDate || new Date(b.start_time) > new Date(map[key].lastDate))) {
        map[key].lastDate = b.start_time;
      }
    });

    return Object.values(map)
      .filter(c => c.confirmedCount >= 20)
      .sort((a, b) => b.confirmedCount - a.confirmedCount);
  }, [allBookings]);

  // Ingresos proyectados: extrapolar el mes actual basado en los días transcurridos
  const projectedMonthIncome = useMemo(() => {
    if (filter !== 'mes' && filter !== 'semana') return null;
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (dayOfMonth === 0) return null;
    return Math.round((totalIncome / dayOfMonth) * daysInMonth);
  }, [totalIncome, filter]);

  if (loading || !user?.id) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
          <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin" />
        </div>
        <span className="text-xs font-semibold text-muted-foreground">Verificando credenciales...</span>
      </div>
    );
  }

  return (
    <section className="page-content px-3 sm:px-6 py-4 max-w-7xl mx-auto space-y-6">
      {/* Toast de nueva reserva */}
      {newPendingToast && (
        <div className="fixed top-4 right-4 z-[9999] flex items-center gap-3 bg-amber-500 text-white px-4 py-3 rounded-2xl shadow-2xl animate-slide-in-right max-w-sm">
          <Bell size={16} className="shrink-0 animate-bounce" />
          <p className="text-sm font-bold flex-1">{newPendingToast}</p>
          <button onClick={() => setNewPendingToast(null)} className="opacity-80 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-primary tracking-widest uppercase mb-0.5">PANEL DE NEGOCIO</p>
          <h1 className="text-xl sm:text-2xl font-black text-foreground capitalize truncate">Hola, {profile?.full_name?.split(' ')[0] || 'Dueño'} 👋</h1>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={() => setShowReportModal(true)}
            className="bg-card border border-border hover:bg-secondary text-foreground px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <BarChart3 size={13} className="text-primary" /> Reporte Ejecutivo
          </button>
          <button
            onClick={fetchStats}
            className="bg-secondary border border-border hover:bg-secondary/80 text-foreground px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Activity size={13} className="text-primary" /> Actualizar
          </button>
        </div>
      </div>

      {/* ── ALERTA DE FIDELIZACIÓN (BENEFICIO POR 20 CANCHAS COMPLETADAS) ── */}
      {loyaltyClients.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-500/35 p-4 sm:p-5 shadow-xs animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md">
                <Gift size={20} className="animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-extrabold text-foreground">
                    ¡Beneficio de Fidelización por 20 Canchas!
                  </h3>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-white uppercase tracking-wider">
                    {loyaltyClients.length} {loyaltyClients.length === 1 ? 'Cliente' : 'Clientes'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  Los clientes que alcanzan 20 partidos califican para recibir <strong>1 cancha de cortesía ($0)</strong> en día domingo a discreción del administrador.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2 border-t border-amber-500/20">
            {loyaltyClients.slice(0, 6).map((cl, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-amber-500/30 shadow-2xs">
                <div className="min-w-0 pr-2">
                  <p className="font-bold text-xs truncate capitalize text-foreground">{cl.name}</p>
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 font-extrabold">
                    ⚽ {cl.confirmedCount} canchas jugadas
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLoyaltyGiftClient({ name: cl.name, phone: cl.phone })}
                  className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-[11px] font-black rounded-xl transition-all shadow-xs flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Gift size={12} /> Regalar Domingo
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros de fecha (Scroll Horizontal adaptable para móviles) */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0">
          {DATE_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => {
                setFilter(f.key);
                setSelectedDay(null);
              }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0 border cursor-pointer ${filter === f.key && !selectedDay
                ? 'bg-primary text-white border-primary shadow-xs'
                : 'bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {selectedDay && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/30 text-xs font-bold animate-in fade-in slide-in-from-top-1">
            <span className="flex items-center gap-1.5 text-primary">
              <CalendarDays size={14} />
              <span>Filtrando por día: <strong className="capitalize underline">{selectedDay.fullDate}</strong></span>
            </span>
            <button
              onClick={() => setSelectedDay(null)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-[11px] transition-colors cursor-pointer"
              title="Volver al período general"
            >
              <X size={12} />
              <span>Quitar filtro de día</span>
            </button>
          </div>
        )}

        <span className="text-[11px] font-medium text-muted-foreground">
          {selectedDay
            ? `${filteredBookings.length} reservas registradas para el ${selectedDay.fullDate}`
            : `${filteredBookings.length} reservas en el período`}
        </span>
      </div>

      {/* Grid Stat Cards Fila 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 w-full max-w-full min-w-0">
        <div className="min-w-0">
          <StatCard icon={<CheckCircle2 size={18} className="text-emerald-600 shrink-0" />} title="Reservas confirmadas" value={confirmed.length} sub={`de ${filteredBookings.length} totales`} accent="bg-emerald-500" onClick={() => router.push('/dashboard/bookings')} />
        </div>
        <div className="min-w-0">
          <StatCard
            icon={<DollarSign size={18} className="text-primary shrink-0" />}
            title="Total Facturado"
            value={fmt(totalIncome)}
            sub={`Directo/anticipos: ${fmt(totalDeposits)} · Saldos: ${fmt(totalRemainingPaid)}`}
            accent="bg-primary"
            onClick={() => router.push('/dashboard/bookings')}
          />
        </div>
        <div className="min-w-0">
          <StatCard
            icon={<AlertCircle size={18} className="text-amber-500 shrink-0" />}
            title="Pendientes de aprobar"
            value={
              <div className="flex items-center gap-2 flex-wrap">
                <span>{allPending.length}</span>
                {pendingOtherDays.length > 0 && (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse"
                    title={`Hay ${pendingOtherDays.length} reserva(s) pendiente(s) para otros días`}
                  >
                    <Bell size={10} /> +{pendingOtherDays.length} otros días
                  </span>
                )}
              </div>
            }
            sub={
              allPending.length === 0
                ? 'Al día · Sin pendientes'
                : pendingOtherDays.length > 0
                  ? `⚠️ ${pendingOtherDays.length} pendiente(s) de otros días`
                  : `${pending.length} pendiente(s) para hoy`
            }
            accent="bg-amber-500"
            onClick={() => router.push('/dashboard/bookings')}
          />
        </div>
        <div className="min-w-0">
          <StatCard icon={<Grid2X2 size={18} className="text-violet-600 shrink-0" />} title="Canchas activas" value={stats?.pitchesCount || 0} sub="En tu complejo" accent="bg-violet-500" onClick={() => router.push('/dashboard/pitches')} />
        </div>
      </div>

      {/* Grid Stat Cards Fila 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 w-full max-w-full min-w-0">
        <div className="min-w-0">
          <StatCard icon={<TrendingUp size={18} className="text-teal-600 shrink-0" />} title="Promedio por reserva" value={fmt(avgIncome)} sub="Reservas confirmadas" accent="bg-teal-500" />
        </div>
        <div className="min-w-0">
          <StatCard icon={<Star size={18} className="text-orange-500 shrink-0" />} title="Tasa de confirmación" value={`${confirmRate}%`} sub="Del total solicitudes" accent="bg-orange-400" />
        </div>
        <div className="min-w-0">
          <StatCard icon={<Clock size={18} className="text-rose-500 shrink-0" />} title="Hora más popular" value={topHour ? topHour[0] : '—'} sub={topHour ? `${topHour[1]} reservas` : 'Sin datos'} accent="bg-rose-400" />
        </div>
        <div className="min-w-0">
          <StatCard icon={<Users size={18} className="text-indigo-600 shrink-0" />} title="Clientes únicos" value={uniqueCustomers} sub="En el período" accent="bg-indigo-500" />
        </div>

        <div className="min-w-0">
          <StatCard icon={<TrendingDown size={18} className="text-red-500 shrink-0" />} title="Tasa de cancelación" value={`${cancelRate}%`} sub={`${cancelled.length} canceladas`} accent="bg-red-400" />
        </div>
        <div className="min-w-0">
          {projectedMonthIncome !== null ? (
            <StatCard icon={<Target size={18} className="text-purple-600 shrink-0" />} title="Ingresos proyectados" value={fmt(projectedMonthIncome)} sub="Al ritmo actual del mes" accent="bg-purple-500" />
          ) : (
            <StatCard icon={<Hash size={18} className="text-zinc-500 shrink-0" />} title="Total de solicitudes" value={filteredBookings.length} sub="Todas las reservas" accent="bg-zinc-400" />
          )}
        </div>
      </div>

      {/* Resumen Financiero Real de Caja (Abonos + Saldos vs Facturado) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 w-full max-w-full min-w-0">
        <div className="p-3.5 rounded-2xl bg-card border border-border flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">Facturado Total</span>
            <span className="text-lg font-black text-foreground">{fmt(totalIncome)}</span>
            <span className="text-[10px] text-muted-foreground block mt-0.5">{confirmed.length} reservas confirmadas</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
            <DollarSign size={20} />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-black uppercase text-emerald-800 dark:text-emerald-300 tracking-wider block">Dinero en Caja (Recaudado)</span>
            <span className="text-lg font-black text-emerald-700 dark:text-emerald-400">{fmt(totalCollected)}</span>
            <span className="text-[10px] text-muted-foreground block mt-0.5">Directo/anticipos: {fmt(totalDeposits)} · Saldos: {fmt(totalRemainingPaid)}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold shrink-0">
            <CheckCircle2 size={20} />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-black uppercase text-amber-800 dark:text-amber-300 tracking-wider block">Por Cobrar en Cancha</span>
            <span className="text-lg font-black text-amber-700 dark:text-amber-400">{fmt(pendingCollection)}</span>
            <span className="text-[10px] text-muted-foreground block mt-0.5">Saldo pendiente al momento de jugar</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center font-bold shrink-0">
            <Wallet size={20} />
          </div>
        </div>
      </div>

      {/* Banner de aviso para reservas pendientes de otras fechas */}
      {pendingOtherDays.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 animate-bounce">
              <Bell size={16} />
            </div>
            <div>
              <p className="font-extrabold text-foreground text-xs sm:text-sm">
                Tienes {pendingOtherDays.length} {pendingOtherDays.length === 1 ? 'reserva pendiente' : 'reservas pendientes'} para fechas posteriores
              </p>
              <p className="text-muted-foreground text-[11px] mt-0.5">
                Hay solicitudes de clientes para días futuros que requieren tu aprobación.
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push('/dashboard/bookings')}
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold rounded-xl text-xs shrink-0 transition-all shadow-xs flex items-center justify-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <span>Revisar pendientes</span>
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Reservas recientes */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-4 sm:p-5 flex flex-col justify-start shadow-xs">
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
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <CalendarDays size={32} className="opacity-30" />
              <p className="text-xs font-medium">Sin reservas en este período</p>
            </div>
          ) : (
            <div className="space-y-2 mt-3 overflow-y-auto max-h-[520px] pr-1">
              {filteredBookings.slice(0, 20).map((row: any) => (
                <div key={row.id} className="flex items-center gap-2.5 p-2.5 sm:p-3 rounded-xl bg-secondary/40 border border-border/60 hover:bg-secondary/70 transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${row.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-600' : row.status === 'pending' ? 'bg-amber-500/10 text-amber-600' : 'bg-rose-500/10 text-rose-500'}`}>
                    {row.status === 'confirmed' ? <CheckCircle2 size={15} /> : row.status === 'pending' ? <Clock size={15} /> : <XCircle size={15} />}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                    {/* Línea 1: Nombre del cliente completo */}
                    <div className="font-bold text-xs sm:text-sm text-foreground capitalize leading-snug break-words">
                      {row.customer_name || 'Cliente'}
                    </div>

                    {/* Línea 2: Cancha, Fecha y Hora del partido, y Fecha/Hora en que se realizó la reserva */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-tight">
                      <span className="font-semibold text-foreground/90 uppercase">
                        {row.pitches?.name || '—'}
                      </span>
                      <span className="text-muted-foreground/40">•</span>
                      <span className="text-muted-foreground font-medium">
                        ⚽ Partido: <strong className="text-foreground/90 font-semibold">{fmtDate(row.start_time)}</strong> {fmtTime(row.start_time) ? `(${fmtTime(row.start_time)})` : ''}
                      </span>
                      {row.created_at && (
                        <>
                          <span className="text-muted-foreground/40">•</span>
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-500/20">
                            <Clock size={10} className="text-emerald-600 dark:text-emerald-400" />
                            <span>Realizada: {fmtDateTime(row.created_at)}</span>
                          </span>
                        </>
                      )}
                    </div>
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
            <div className="mt-4">
              <MiniBarChart
                data={last7}
                selectedIsoDate={selectedDay?.isoDate}
                onSelectDate={(iso, full) => {
                  if (selectedDay?.isoDate === iso) {
                    setSelectedDay(null);
                  } else {
                    setSelectedDay({ isoDate: iso, fullDate: full });
                  }
                }}
              />
            </div>
          </div>

          {/* Actividad por día de la semana */}
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-xs">
            <div className="pb-3 border-b border-border/60">
              <h2 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                <CalendarClock size={15} className="text-violet-500" /> Días más activos
              </h2>
              <p className="text-xs text-muted-foreground">
                {filter === 'hoy'
                  ? 'Reservas de la semana (Hoy resaltado)'
                  : filter === 'ayer'
                    ? 'Reservas de la semana (Ayer resaltado)'
                    : filter === 'semana'
                      ? 'Total reservas de esta semana'
                      : filter === 'mes'
                        ? 'Total reservas de este mes'
                        : 'Total reservas por día de la semana'}
              </p>
            </div>
            <div className="mt-4">
              <WeekdayChart
                data={byWeekday}
                selectedIsoDate={selectedDay?.isoDate}
                onSelectDate={(iso, full) => {
                  if (selectedDay?.isoDate === iso) {
                    setSelectedDay(null);
                  } else {
                    setSelectedDay({ isoDate: iso, fullDate: full });
                  }
                }}
              />
            </div>
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
                      <span className="flex items-center gap-1 max-w-[140px]">{i === 0 && <Zap size={11} className="text-amber-500 shrink-0" />}{(p.name || 'Cancha').toUpperCase()}</span>
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
                <div key={`${i}-${p.name || 'cancha'}`} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5 truncate max-w-[140px]">
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-zinc-300 text-zinc-700' : i === 2 ? 'bg-orange-300 text-white' : 'bg-secondary text-muted-foreground'}`}>{i + 1}</span>
                      <span>{(p.name || 'Cancha').toUpperCase()}</span>
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
                      <div className="font-bold text-xs sm:text-sm truncate">{(pitch.name || 'Cancha').toUpperCase()}</div>
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

      {/* ── Tabla Corporativa Completa ── */}
      <div className="bg-card border border-border rounded-2xl shadow-xs overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 sm:p-5 border-b border-border/60">
          <div>
            <h2 className="text-base font-extrabold text-foreground flex items-center gap-2">
              <FileText size={16} className="text-primary" /> Detalle de reservas
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {filteredBookings.length} registros en el período · Ingresos confirmados: <span className="font-bold text-foreground">{fmt(totalIncome)}</span>
            </p>
          </div>
          <Link
            href="/dashboard/bookings"
            className="text-xs font-bold text-primary hover:underline flex items-center gap-1 shrink-0"
          >
            Ver todas <ArrowRight size={13} />
          </Link>
        </div>

        {filteredBookings.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2 text-muted-foreground">
            <CalendarDays size={32} className="opacity-30" />
            <p className="text-xs font-medium">Sin reservas en este período</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-secondary/50 border-b border-border/60">
                  <th className="text-left px-3 sm:px-4 py-3 font-extrabold text-muted-foreground uppercase tracking-wider whitespace-nowrap">#</th>
                  <th className="text-left px-3 sm:px-4 py-3 font-extrabold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Cliente</th>
                  <th className="text-left px-3 sm:px-4 py-3 font-extrabold text-muted-foreground uppercase tracking-wider whitespace-nowrap hidden sm:table-cell">Cancha</th>
                  <th className="text-left px-3 sm:px-4 py-3 font-extrabold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Partido</th>
                  <th className="text-right px-3 sm:px-4 py-3 font-extrabold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Total</th>
                  <th className="text-center px-3 sm:px-4 py-3 font-extrabold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredBookings.slice(0, 50).map((row: any, idx: number) => (
                  <tr key={row.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-3 sm:px-4 py-2.5 text-muted-foreground font-medium">{idx + 1}</td>
                    <td className="px-3 sm:px-4 py-2.5">
                      <div className="font-bold text-foreground capitalize">{row.customer_name || 'Cliente'}</div>
                      {row.customer_phone && (
                        <div className="text-[10px] text-muted-foreground">{row.customer_phone}</div>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 hidden sm:table-cell">
                      <span className="font-semibold text-foreground/90 uppercase">{row.pitches?.name || '—'}</span>
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 whitespace-nowrap">
                      <div className="font-semibold text-foreground">
                        {fmtDate(row.start_time)}
                      </div>
                      {fmtTime(row.start_time) && (
                        <div className="text-[10px] text-muted-foreground">
                          {fmtTime(row.start_time)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 text-right">
                      <span className="font-extrabold text-foreground">{fmt(getBookingIncome(row))}</span>
                    </td>
                    <td className="px-3 sm:px-4 py-2.5 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${row.status === 'confirmed'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : row.status === 'pending'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'bg-rose-500/10 text-rose-500'
                        }`}>
                        {row.status === 'confirmed' ? <CheckCircle2 size={10} /> : row.status === 'pending' ? <AlertCircle size={10} /> : <XCircle size={10} />}
                        {row.status === 'confirmed' ? 'Aprobada' : row.status === 'pending' ? 'Pendiente' : 'Cancelada'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Totales al pie de la tabla */}
              <tfoot>
                <tr className="bg-secondary/50 border-t-2 border-border/80">
                  <td colSpan={4} className="px-3 sm:px-4 py-3 font-extrabold text-xs text-foreground">Totales del período</td>
                  <td className="px-3 sm:px-4 py-3 text-right">
                    <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{fmt(totalIncome)}</span>
                  </td>
                  <td className="px-3 sm:px-4 py-3 text-center">
                    <span className="text-[10px] font-bold text-muted-foreground">{confirmed.length}/{filteredBookings.length} conf.</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Reporte Ejecutivo */}
      <BookingReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        bookings={allBookings}
        pitches={pitches}
        companyName={stats?.company?.name || profile?.full_name}
      />

      {/* Modal para agendar Cancha de Cortesía de Domingo ($0) por Fidelización */}
      {loyaltyGiftClient && (
        <ManualBookingModal
          pitches={pitches}
          initialIsLoyaltyFree={true}
          initialCustomerName={loyaltyGiftClient.name}
          initialCustomerPhone={loyaltyGiftClient.phone}
          onClose={() => setLoyaltyGiftClient(null)}
          onSuccess={() => {
            setLoyaltyGiftClient(null);
            fetchStats();
          }}
        />
      )}
    </section>
  );
}