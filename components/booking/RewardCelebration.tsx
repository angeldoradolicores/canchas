'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { describeDays } from './ComplexPromotions';

type Reward = {
  id: string;
  hours: number;
  expires_at: string;
  celebrated_at: string | null;
  complex_promotions: { title: string; weekdays: number[]; companies: { name: string } | null } | null;
};

/**
 * Notificación especial (una sola vez por bono) cuando el jugador gana horas gratis.
 * Se marca como vista en el servidor para que no vuelva a aparecer en otro dispositivo.
 */
export function RewardCelebration() {
  const { user } = useAuth();
  const [reward, setReward] = useState<Reward | null>(null);

  useEffect(() => {
    if (!user) { setReward(null); return; }
    let active = true;
    const check = () => fetch('/api/promotions')
      .then(r => r.json())
      .then(j => {
        if (!active) return;
        const pending = (j.rewards || []).find((r: Reward) => !r.celebrated_at);
        if (pending) setReward(pending);
      })
      .catch(() => {});
    void check();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void check(); }, 120000);
    return () => { active = false; clearInterval(timer); };
  }, [user]);

  if (!reward) return null;

  const close = (go?: string) => {
    const id = reward.id;
    setReward(null);
    void fetch('/api/promotions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ack', reward_id: id }),
    }).finally(() => { if (go) window.location.href = go; });
  };

  const promo = reward.complex_promotions;
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="reward-title">
      <div className="relative w-full max-w-sm rounded-3xl bg-card border border-emerald-500/40 shadow-2xl p-6 text-center overflow-hidden animate-in zoom-in-95 fade-in">
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-emerald-500/25 to-transparent pointer-events-none" />
        <div className="relative text-6xl mb-2" aria-hidden>🎉</div>
        <p className="relative text-xs font-black uppercase tracking-widest text-emerald-600">¡Ganaste un bono!</p>
        <h2 id="reward-title" className="relative text-2xl font-black mt-1">
          {reward.hours} {reward.hours === 1 ? 'hora gratis' : 'horas gratis'}
        </h2>
        <p className="relative text-sm text-muted-foreground mt-2 break-words">
          {promo?.companies?.name ? <>en <strong className="text-foreground">{promo.companies.name}</strong> · </> : null}{promo?.title}
        </p>
        <p className="relative text-sm mt-3">
          Úsalas {describeDays(promo?.weekdays || [])} antes del{' '}
          <strong>{new Date(reward.expires_at).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long' })}</strong>.
          Al reservar en ese complejo elige “Usa tus horas gratis” en el paso de pago.
        </p>
        <div className="relative mt-5 grid gap-2">
          <button onClick={() => close('/')} className="btn-primary w-full">Reservar ahora</button>
          <button onClick={() => close()} className="text-sm text-muted-foreground underline cursor-pointer">Más tarde</button>
        </div>
      </div>
    </div>
  );
}
