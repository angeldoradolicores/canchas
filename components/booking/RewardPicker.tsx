'use client';
import { useEffect, useMemo, useState } from 'react';
import { Gift } from 'lucide-react';
import { describeDays } from './ComplexPromotions';

type Reward = {
  id: string;
  remaining: number;
  expires_at: string;
  complex_promotions: { title: string; company_id: string; weekdays: number[] } | null;
};

/** Día de la semana (0=domingo) de una fecha YYYY-MM-DD, sin depender de la zona del navegador. */
function weekdayOf(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
}

/** Motivo por el que el regalo no aplica a la selección actual, o null si aplica. */
function whyNot(r: Reward, date: string, times: string[]): string | null {
  const promo = r.complex_promotions;
  if (!promo) return 'Promoción no disponible';
  if (!date || times.length === 0) return 'Selecciona fecha y hora';
  if (times.length > r.remaining) {
    return `Te quedan ${r.remaining} ${r.remaining === 1 ? 'hora' : 'horas'} de regalo y seleccionaste ${times.length}`;
  }
  if (!promo.weekdays.includes(weekdayOf(date))) return `Solo se puede usar ${describeDays(promo.weekdays)}`;
  const expires = new Date(r.expires_at).getTime();
  if (times.some(t => new Date(`${date}T${t}:00-05:00`).getTime() >= expires)) {
    return `Vence el ${new Date(r.expires_at).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long' })}`;
  }
  return null;
}

export function RewardPicker({
  companyId, value, onChange, selectedDate, selectedTimes,
}: {
  companyId: string;
  value: string;
  onChange: (id: string) => void;
  selectedDate: string;
  selectedTimes: string[];
}) {
  const [items, setItems] = useState<Reward[]>([]);

  useEffect(() => {
    let active = true;
    fetch('/api/promotions?company_id=' + encodeURIComponent(companyId))
      .then(r => r.json())
      .then(j => { if (active) setItems((j.rewards || []).filter((r: Reward) => r.complex_promotions?.company_id === companyId)); })
      .catch(() => {});
    return () => { active = false; };
  }, [companyId]);

  const evaluated = useMemo(
    () => items.map(r => ({ r, reason: whyNot(r, selectedDate, selectedTimes) })),
    [items, selectedDate, selectedTimes],
  );

  // Si la selección cambia y el regalo elegido deja de aplicar, volver al pago normal.
  useEffect(() => {
    if (value && evaluated.some(e => e.r.id === value && e.reason)) onChange('');
  }, [value, evaluated, onChange]);

  if (!items.length) return null;

  return (
    <section className="p-4 rounded-2xl border border-emerald-500 bg-emerald-500/10 space-y-3 w-full min-w-0">
      <p className="font-bold flex items-center gap-2 text-foreground"><Gift size={18} className="text-emerald-600" /> Usa tus horas gratis</p>
      <div className="space-y-2">
        <label className={`flex items-start gap-3 p-3 rounded-xl border bg-card cursor-pointer ${!value ? 'border-emerald-600' : 'border-border'}`}>
          <input type="radio" name="reward" className="mt-1" checked={!value} onChange={() => onChange('')} />
          <span className="text-sm">Pagar normalmente y seguir acumulando</span>
        </label>
        {evaluated.map(({ r, reason }) => (
          <label
            key={r.id}
            className={`flex items-start gap-3 p-3 rounded-xl border bg-card ${reason ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${value === r.id ? 'border-emerald-600' : 'border-border'}`}
          >
            <input type="radio" name="reward" className="mt-1" disabled={!!reason} checked={value === r.id} onChange={() => onChange(r.id)} />
            <span className="min-w-0 text-sm">
              <span className="block font-semibold break-words">
                {r.remaining} {r.remaining === 1 ? 'hora gratis' : 'horas gratis'} · {r.complex_promotions?.title}
              </span>
              <span className="block text-xs text-muted-foreground">
                {reason
                  ? `No aplica: ${reason}.`
                  : `Válido ${describeDays(r.complex_promotions?.weekdays || [])} hasta el ${new Date(r.expires_at).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}. No necesitas adjuntar comprobante.`}
              </span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
