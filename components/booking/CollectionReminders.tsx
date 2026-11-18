'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BellRing, ChevronDown, ChevronUp, X } from 'lucide-react';
import { getContractBillingInfo } from '@/lib/contract-billing';

/**
 * Aviso de cobros del día para el dueño:
 *  · "Hoy": partidos de hoy que aún deben (sesión de turno fijo, reserva manual por cobrar…).
 *  · "Vencido": partidos ya jugados con saldo (mensualidad vencida, sesiones sin pagar…),
 *    agrupados por turno fijo / cliente.
 * Usa el mismo saldo que el resto del panel (`outstanding`, regla única de lib/cash-events).
 */

type Item = {
  key: string;
  kind: 'today' | 'overdue';
  title: string;
  detail: string;
  amount: number;
  booking: any;
  sessionId?: string;
};

const ymdBogota = (d: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(d));
const fmtCOP = (n: number) => `$${Math.round(n || 0).toLocaleString('es-CO')}`;
const fmtHour = (d: string) => new Date(d).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' });
const fmtDay = (d: string) => new Date(d).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Bogota' });

function displayName(b: any): string {
  const ent = String(b?.client_entity_name || '').trim();
  if (ent) return ent;
  const m = String(b?.note || '').match(/(?:ENTIDAD|ESCUELA):\s*([^·\]]+)/i);
  if (m && m[1].trim()) return m[1].trim();
  return String(b?.customer_name || 'Cliente').replace(/\[[^\]]*\]/g, '').trim() || 'Cliente';
}

export function CollectionReminders({
  bookings,
  outstanding,
  onCollect,
  onSeeAll,
  seeAllHref,
}: {
  bookings: any[];
  outstanding: Map<string, number>;
  /** Abrir el cobro de una reserva (y la sesión puntual en turnos fijos por sesión). */
  onCollect?: (booking: any, sessionId?: string) => void;
  onSeeAll?: () => void;
  seeAllHref?: string;
}) {
  const today = ymdBogota(new Date());
  const [open, setOpen] = useState(true);
  const [hidden, setHidden] = useState(false);
  const storageKey = `cobros_aviso_oculto:${today}`;

  useEffect(() => {
    try { if (localStorage.getItem(storageKey) === '1') setHidden(true); } catch { /* sin almacenamiento */ }
  }, [storageKey]);

  const items = useMemo(() => {
    const list: Item[] = [];
    const overdue = new Map<string, Item & { count: number; first: string }>();
    for (const b of bookings) {
      if (!b || b.status !== 'confirmed' || b.source === 'loyalty_reward' || b.is_loyalty_free) continue;
      const due = outstanding.get(b.id) || 0;
      if (due <= 0) continue;
      const day = ymdBogota(b.start_time);
      if (day > today) continue;
      const info = getContractBillingInfo(b, bookings);
      const isContract = info.isContract;
      if (day === today) {
        list.push({
          key: `t_${b.id}`,
          kind: 'today',
          title: displayName(b),
          detail: `Hoy ${fmtHour(b.start_time)} · ${b.pitches?.name || 'Cancha'} · ${isContract ? (info.isPlanBilling ? info.billingSchemeLabel : 'Sesión de turno fijo') : 'Reserva por cobrar'}`,
          amount: due,
          booking: b,
          sessionId: isContract && !info.isPlanBilling ? b.id : undefined,
        });
      } else {
        const gKey = info.contractId || `${displayName(b).toLowerCase()}_${b.pitch_id}`;
        const prev = overdue.get(gKey);
        if (prev) {
          prev.amount += due;
          prev.count += 1;
          if (b.start_time < prev.first) { prev.first = b.start_time; prev.booking = b; prev.sessionId = isContract && !info.isPlanBilling ? b.id : undefined; }
        } else {
          overdue.set(gKey, {
            key: `o_${gKey}`,
            kind: 'overdue',
            title: displayName(b),
            detail: '',
            amount: due,
            booking: b,
            sessionId: isContract && !info.isPlanBilling ? b.id : undefined,
            count: 1,
            first: b.start_time,
          });
        }
      }
    }
    list.sort((a, b) => new Date(a.booking.start_time).getTime() - new Date(b.booking.start_time).getTime());
    const over = Array.from(overdue.values()).map(o => {
      const info = getContractBillingInfo(o.booking, bookings);
      const label = info.isContract ? (info.isPlanBilling ? info.billingSchemeLabel : 'Turno fijo por sesión') : 'Reserva';
      return {
        ...o,
        detail: `${label} · ${o.count} ${o.count === 1 ? 'partido jugado' : 'partidos jugados'} sin pagar · desde ${fmtDay(o.first)}`,
      };
    }).sort((a, b) => b.amount - a.amount);
    return { today: list, overdue: over };
  }, [bookings, outstanding, today]);

  const total = items.today.length + items.overdue.length;
  if (total === 0 || hidden) return null;
  const totalAmount = [...items.today, ...items.overdue].reduce((s, i) => s + i.amount, 0);

  const Row = ({ it }: { it: Item }) => (
    <li className="flex items-center gap-3 py-2">
      <span className={`w-2 h-2 rounded-full shrink-0 ${it.kind === 'today' ? 'bg-blue-600' : 'bg-rose-500'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground truncate">{it.title}</p>
        <p className="text-[11px] text-muted-foreground truncate">{it.detail}</p>
      </div>
      <span className="text-sm font-black text-blue-700 dark:text-blue-300 shrink-0">{fmtCOP(it.amount)}</span>
      {onCollect && (
        <button
          type="button"
          onClick={() => onCollect(it.booking, it.sessionId)}
          className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white cursor-pointer"
        >
          Cobrar
        </button>
      )}
    </li>
  );

  return (
    <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 shadow-xs" role="status">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-blue-700 text-white flex items-center justify-center shrink-0">
          <BellRing size={18} />
        </div>
        <button type="button" onClick={() => setOpen(o => !o)} className="flex-1 min-w-0 text-left cursor-pointer">
          <p className="text-sm font-black text-foreground">
            {items.today.length > 0
              ? `Hoy hay ${items.today.length} ${items.today.length === 1 ? 'pago' : 'pagos'} por cobrar`
              : 'Tienes pagos vencidos por cobrar'}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {items.overdue.length > 0 ? `${items.overdue.length} ${items.overdue.length === 1 ? 'cliente con saldo vencido' : 'clientes con saldo vencido'} · ` : ''}
            Total {fmtCOP(totalAmount)}
          </p>
        </button>
        <button type="button" onClick={() => setOpen(o => !o)} aria-label={open ? 'Contraer' : 'Expandir'} className="p-1 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <button
          type="button"
          onClick={() => { setHidden(true); try { localStorage.setItem(storageKey, '1'); } catch { /* noop */ } }}
          aria-label="Ocultar hasta mañana"
          title="Ocultar hasta mañana"
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>
      {open && (
        <div className="px-4 pb-3 border-t border-blue-500/20">
          {items.today.length > 0 && (
            <>
              <p className="pt-2.5 text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-300">Deben pagar hoy</p>
              <ul className="divide-y divide-border/60">{items.today.slice(0, 6).map(it => <Row key={it.key} it={it} />)}</ul>
            </>
          )}
          {items.overdue.length > 0 && (
            <>
              <p className="pt-2.5 text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">Vencido (ya jugaron y deben)</p>
              <ul className="divide-y divide-border/60">{items.overdue.slice(0, 6).map(it => <Row key={it.key} it={it} />)}</ul>
            </>
          )}
          {(onSeeAll || seeAllHref) && (
            <div className="pt-2 text-right">
              {onSeeAll ? (
                <button type="button" onClick={onSeeAll} className="text-xs font-bold text-blue-700 dark:text-blue-300 hover:underline cursor-pointer">Ver todo en Por cobrar →</button>
              ) : (
                <Link href={seeAllHref!} className="text-xs font-bold text-blue-700 dark:text-blue-300 hover:underline">Ver todo en Por cobrar →</Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
