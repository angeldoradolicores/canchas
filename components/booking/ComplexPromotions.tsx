'use client';
import { useEffect, useState } from 'react';
import { ChevronDown, Gift } from 'lucide-react';

export const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export type Promotion = {
  id: string;
  company_id?: string;
  title: string;
  required_bookings: number;
  gift_hours: number;
  redeem_days: number | null;
  weekdays: number[];
  ends_at: string;
  period?: 'week' | 'month' | 'campaign';
  image_url?: string | null;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "sábado y domingo", "cualquier día", "lunes, martes y viernes" */
export function describeDays(days: number[]) {
  const sorted = [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // lunes primero
  if (sorted.length === 7) return 'cualquier día';
  const names = sorted.map(d => dayNames[d].toLowerCase());
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/** Frase principal y forma de uso de la promoción, en lenguaje del jugador. */
export function describePromotion(p: Promotion) {
  const reservas = plural(p.required_bookings, 'reserva', 'reservas');
  const horas = plural(p.gift_hours, 'hora gratis', 'horas gratis');
  const days = describeDays(p.weekdays);
  if (p.period === 'week') {
    return {
      headline: `Reserva ${reservas} en la misma semana y gana ${horas}`,
      usage: p.redeem_days
        ? `Úsalas ${days} durante los ${plural(p.redeem_days, 'día', 'días')} siguientes.`
        : `Úsalas ${days} de esa misma semana (de lunes a domingo).`,
    };
  }
  if (p.period === 'month') {
    return {
      headline: `Reserva ${reservas} en el mismo mes y gana ${horas}`,
      usage: p.redeem_days
        ? `Úsalas ${days} durante los ${plural(p.redeem_days, 'día', 'días')} siguientes.`
        : `Úsalas ${days} antes de que termine ese mismo mes.`,
    };
  }
  return {
    headline: `Por cada ${reservas} aprobadas gana ${horas}`,
    usage: `Úsalas ${days} durante los ${plural(p.redeem_days || 30, 'día', 'días')} siguientes.`,
  };
}

export function PromotionCard({ p, compact = false }: { p: Promotion; compact?: boolean }) {
  const d = describePromotion(p);
  return (
    <article className="rounded-2xl bg-card border border-border overflow-hidden min-w-0">
      {p.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.image_url}
          alt={p.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          className={`w-full object-cover bg-secondary ${compact ? 'max-h-40' : 'max-h-64'}`}
        />
      )}
      <div className="p-3.5 sm:p-4 space-y-1.5">
        <h3 className="font-bold break-words text-foreground">{p.title}</h3>
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{d.headline}.</p>
        <p className="text-xs text-muted-foreground">{d.usage}</p>
        <p className="text-[11px] text-muted-foreground">
          Promoción vigente hasta el {new Date(p.ends_at).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long' })}.
          Cuentan las reservas pagadas y aprobadas en cualquier cancha del complejo.
        </p>
      </div>
    </article>
  );
}

function useCompanyPromotions(companyId: string) {
  const [items, setItems] = useState<Promotion[]>([]);
  useEffect(() => {
    if (!companyId) return;
    let active = true;
    setItems([]);
    fetch('/api/promotions?company_id=' + encodeURIComponent(companyId))
      .then(r => r.json())
      .then(j => { if (active) setItems(Array.isArray(j.promotions) ? j.promotions : []); })
      .catch(() => {});
    return () => { active = false; };
  }, [companyId]);
  return items;
}

/** Sección en el detalle de la cancha. */
export function PitchPromotions({ companyId }: { companyId: string }) {
  const items = useCompanyPromotions(companyId);
  if (!items.length) return null;
  return (
    <section className="bg-card px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-8 rounded-[28px] md:rounded-2xl border border-emerald-500/30 shadow-sm mt-6 w-full max-w-full min-w-0">
      <h2 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-foreground">
        <Gift size={20} className="text-emerald-600 shrink-0" /> Promociones del complejo
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full min-w-0">
        {items.map(p => <PromotionCard key={p.id} p={p} />)}
      </div>
    </section>
  );
}

/** Pestaña desplegable dentro del paso de pago. */
export function BookingPromotionsTab({ companyId, isLoggedIn }: { companyId: string; isLoggedIn: boolean }) {
  const items = useCompanyPromotions(companyId);
  const [open, setOpen] = useState(false);
  if (!items.length) return null;

  return (
    <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 overflow-hidden w-full min-w-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 p-3.5 sm:p-4 text-left cursor-pointer"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Gift size={16} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-foreground">Promoción del complejo</span>
            <span className="block text-[11px] text-muted-foreground truncate">
              {items.length === 1 ? describePromotion(items[0]).headline : `${items.length} promociones activas`}
            </span>
          </span>
        </span>
        <ChevronDown size={18} className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-3.5 pb-4 sm:px-4 space-y-3">
          {items.map(p => <PromotionCard key={p.id} p={p} compact />)}
          {isLoggedIn ? (
            <p className="text-xs text-muted-foreground">
              Esta reserva suma a tu cuenta cuando el complejo la apruebe. Usa tu celular de siempre: así también se suman
              las reservas que el complejo registró con tu número.
            </p>
          ) : (
            <div className="rounded-xl bg-emerald-600/10 border border-emerald-600/20 p-3 text-xs space-y-1.5">
              <p className="font-bold text-foreground">Regístrate para no perder tu conteo</p>
              <p className="text-muted-foreground">
                Como invitado tu reserva suma con el celular que escribas, pero solo con una cuenta puedes ver y canjear tus horas
                gratis. Cuando reserves con tu cuenta y ese mismo celular, el conteo anterior se une a tu cuenta.
              </p>
              <a className="font-bold underline text-emerald-700 dark:text-emerald-400" href="/register" target="_blank" rel="noopener noreferrer">
                Crear mi cuenta en otra pestaña
              </a>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
