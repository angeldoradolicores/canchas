'use client';
import { useEffect, useState } from 'react';
import { ChevronDown, Gift } from 'lucide-react';

export const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

type Promotion = {
  id: string;
  title: string;
  required_bookings: number;
  gift_hours: number;
  redeem_days: number;
  weekdays: number[];
  ends_at: string;
};

/**
 * Pestaña desplegable que se muestra SOLO dentro del flujo de reserva.
 * Muestra las promociones vigentes que el dueño del complejo creó y,
 * para invitados, invita a registrarse para que sus reservas sumen.
 */
export function BookingPromotionsTab({ companyId, isLoggedIn }: { companyId: string; isLoggedIn: boolean }) {
  const [items, setItems] = useState<Promotion[]>([]);
  const [open, setOpen] = useState(true);

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
              {items.length === 1 ? items[0].title : `${items.length} promociones activas`}
            </span>
          </span>
        </span>
        <ChevronDown size={18} className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-3.5 pb-4 sm:px-4 space-y-3">
          {items.map(p => (
            <article key={p.id} className="rounded-xl bg-card border border-border p-3 space-y-1.5 text-sm">
              <h3 className="font-bold break-words text-foreground">{p.title}</h3>
              <p>
                Por cada <strong>{p.required_bookings} {p.required_bookings === 1 ? 'reserva aprobada' : 'reservas aprobadas'}</strong> en
                cualquier cancha del complejo, recibes <strong>{p.gift_hours} {p.gift_hours === 1 ? 'hora gratis' : 'horas gratis'}</strong>.
              </p>
              <p className="text-xs text-muted-foreground">
                Días para usarlas: {p.weekdays.map(d => dayNames[d]).join(', ')} · Tienes {p.redeem_days} días para jugarlas ·
                Acumula hasta el {new Date(p.ends_at).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}.
              </p>
            </article>
          ))}

          {isLoggedIn ? (
            <p className="text-xs text-muted-foreground">
              Esta reserva suma a tu cuenta cuando el complejo la apruebe. Usa el mismo celular de siempre: así también se suman
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
