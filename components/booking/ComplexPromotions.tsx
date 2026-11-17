'use client';
import { useEffect, useState } from 'react';
import { ChevronDown, ExternalLink, Gift, History, IdCard, MapPin, Sparkles, Swords, ZoomIn } from 'lucide-react';
import { ImageLightbox } from '@/components/ui/ImageLightbox';

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
  period?: 'day' | 'week' | 'biweek' | 'month' | 'campaign';
  image_url?: string | null;
  redeem_pitch_ids?: string[] | null;
  redeem_pitches?: { id: string; name: string }[] | null;
};

/** "cualquier cancha del complejo" o "Cancha 1 y Cancha 3" */
export function describePitches(p: Pick<Promotion, 'redeem_pitches'>) {
  const names = (p.redeem_pitches || []).map(x => x.name);
  if (!names.length) return 'cualquier cancha del complejo';
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

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
  if (p.period === 'day') {
    return {
      headline: `Reserva ${reservas} el mismo día y gana ${horas}`,
      usage: p.redeem_days
        ? `Úsalas ${days} durante los ${plural(p.redeem_days, 'día', 'días')} siguientes.`
        : `Úsalas ${days} ese mismo día.`,
    };
  }
  if (p.period === 'biweek') {
    return {
      headline: `Reserva ${reservas} en la misma quincena y gana ${horas}`,
      usage: p.redeem_days
        ? `Úsalas ${days} durante los ${plural(p.redeem_days, 'día', 'días')} siguientes.`
        : `Úsalas ${days} antes de que termine esa quincena (del 1 al 15 o del 16 a fin de mes).`,
    };
  }
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

/** Columnas según cuántas tarjetas hay: con 1 ocupa todo el ancho, con 2 se reparten a la mitad. */
export function sectionGridClass(count: number) {
  if (count <= 1) return 'grid grid-cols-1 gap-4 w-full min-w-0';
  if (count === 2) return 'grid grid-cols-1 sm:grid-cols-2 gap-4 w-full min-w-0';
  return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full min-w-0';
}

export function PromotionCard({ p, compact = false, wide = false }: { p: Promotion; compact?: boolean; wide?: boolean }) {
  const d = describePromotion(p);
  const [zoom, setZoom] = useState(false);
  const horizontal = wide && !compact && !!p.image_url;
  return (
    <article className={`rounded-2xl bg-card border border-border overflow-hidden min-w-0 flex flex-col h-full ${horizontal ? 'md:flex-row' : ''}`}>
      {p.image_url && (
        <button
          type="button"
          onClick={() => setZoom(true)}
          className={`group relative block w-full bg-secondary cursor-zoom-in shrink-0 ${compact ? 'aspect-[21/9]' : 'aspect-[16/9]'} ${horizontal ? 'md:w-1/2 lg:w-[45%] md:aspect-auto md:min-h-[260px]' : ''}`}
          aria-label={`Ver imagen de ${p.title}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.image_url} alt={p.title} loading="lazy" decoding="async" referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover" />
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 text-white text-[11px] font-semibold px-2.5 py-1 opacity-90 group-hover:opacity-100">
            <ZoomIn size={13} /> Ver imagen
          </span>
        </button>
      )}
      <div className={`p-3.5 sm:p-4 space-y-1.5 flex-1 ${wide && !compact ? 'md:p-6 md:space-y-2.5 md:flex md:flex-col md:justify-center' : ''}`}>
        <h3 className={`font-bold break-words text-foreground ${wide && !compact ? 'md:text-xl' : ''}`}>{p.title}</h3>
        <p className={`text-sm font-semibold text-emerald-700 dark:text-emerald-400 ${wide && !compact ? 'md:text-lg' : ''}`}>{d.headline}.</p>
        <p className="text-xs text-muted-foreground">{d.usage}</p>
        <p className="text-xs text-foreground flex items-start gap-1">
          <MapPin size={13} className="text-emerald-600 shrink-0 mt-0.5" />
          <span>Se usa en: <strong>{describePitches(p)}</strong></span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          Promoción vigente hasta el {new Date(p.ends_at).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long' })}.
          Cuentan las reservas pagadas y aprobadas en cualquier cancha del complejo.
        </p>
      </div>
      {zoom && p.image_url && <ImageLightbox src={p.image_url} alt={p.title} onClose={() => setZoom(false)} />}
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
    <section className="bg-card px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-8 rounded-[28px] md:rounded-2xl border border-emerald-500/30 shadow-sm w-full max-w-full min-w-0">
      <h2 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-2 text-foreground">
        <Gift size={20} className="text-emerald-600 shrink-0" /> Promociones del complejo
      </h2>
      <div className={sectionGridClass(items.length)}>
        {items.map(p => <PromotionCard key={p.id} p={p} wide={items.length === 1} />)}
      </div>
    </section>
  );
}

/** Pestaña desplegable dentro del paso de pago. */
export function BookingPromotionsTab({ companyId, isLoggedIn }: { companyId: string; isLoggedIn: boolean }) {
  const items = useCompanyPromotions(companyId);
  const [open, setOpen] = useState(false);
  if (!items.length) return isLoggedIn ? null : <GuestSignupCallout standalone />;

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
            <p className="text-xs text-muted-foreground">
              Como invitado tu reserva suma con el celular que escribas. Para ver y canjear tus horas gratis necesitas una cuenta (mira abajo).
            </p>
          )}
        </div>
      )}
      {!isLoggedIn && <GuestSignupCallout />}
    </section>
  );
}

/** Invitación visible a crear cuenta: se muestra siempre al invitado, sin tener que abrir la pestaña. */
export function GuestSignupCallout({ standalone = false }: { standalone?: boolean }) {
  const perks = [
    { icon: <Gift size={15} />, text: 'Acumula reservas y canjea tus horas gratis' },
    { icon: <Swords size={15} />, text: 'Crea retos y encuentra rivales en la comunidad' },
    { icon: <IdCard size={15} />, text: 'Tu tarjeta de jugador con tus partidos y estadísticas' },
    { icon: <History size={15} />, text: 'Todas tus reservas y comprobantes en un solo lugar' },
  ];
  return (
    <div className={`${standalone ? 'w-full min-w-0' : 'm-3.5 mt-0 sm:m-4 sm:mt-0'} rounded-2xl overflow-hidden border-2 border-emerald-600 bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-lg shadow-emerald-900/20`}>
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Sparkles size={20} />
          </span>
          <div className="min-w-0">
            <p className="font-black text-base leading-tight">{standalone ? 'Crea tu cuenta gratis y juega más' : 'Regístrate gratis y no pierdas tu conteo'}</p>
            <p className="text-xs text-white/85 mt-1 leading-snug">
              Como invitado tu reserva suma con tu celular, pero solo con una cuenta puedes ver y canjear tus horas gratis.
              Al crearla con ese mismo celular, el conteo anterior se une a tu cuenta.
            </p>
          </div>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {perks.map(p => (
            <li key={p.text} className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold">
              <span className="shrink-0 text-emerald-100">{p.icon}</span>
              <span>{p.text}</span>
            </li>
          ))}
        </ul>
        <a
          href="/register"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-white text-emerald-800 font-black text-sm py-3 hover:bg-emerald-50 transition-colors"
        >
          Crear mi cuenta gratis <ExternalLink size={14} />
        </a>
        <p className="text-[11px] text-center text-white/75">Se abre en otra pestaña: no pierdes la reserva que estás haciendo.</p>
      </div>
    </div>
  );
}
