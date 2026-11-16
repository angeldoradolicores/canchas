'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

/**
 * Aviso especial (una sola vez) cuando el superadmin aprueba la solicitud de dueño.
 * Solo se consulta si el perfil ya es dueño; el rol viene de la base de datos.
 */
export function OwnerApprovedCelebration() {
  const { user, profile } = useAuth();
  const [company, setCompany] = useState<string | null>(null);

  useEffect(() => {
    if (!user || profile?.role !== 'owner') { setCompany(null); return; }
    let active = true;
    fetch('/api/owner-requests')
      .then(r => r.json())
      .then(j => {
        const req = (j.data || [])[0];
        if (active && req?.status === 'approved' && !req.celebrated_at) setCompany(req.company_name || 'tu complejo');
      })
      .catch(() => {});
    return () => { active = false; };
  }, [user, profile?.role]);

  if (!company) return null;

  const close = (go?: string) => {
    setCompany(null);
    void fetch('/api/owner-requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ack_approval' }),
    }).finally(() => { if (go) window.location.href = go; });
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="owner-approved-title">
      <div className="relative w-full max-w-sm rounded-3xl bg-card border border-emerald-500/40 shadow-2xl p-6 text-center overflow-hidden animate-in zoom-in-95 fade-in">
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-emerald-500/25 to-transparent pointer-events-none" />
        <div className="relative text-6xl mb-2" aria-hidden>🏟️</div>
        <p className="relative text-xs font-black uppercase tracking-widest text-emerald-600">¡Solicitud aprobada!</p>
        <h2 id="owner-approved-title" className="relative text-2xl font-black mt-1">Ya eres dueño en Cancheros</h2>
        <p className="relative text-sm text-muted-foreground mt-2 break-words">
          Verificamos tus datos de <strong className="text-foreground">{company}</strong>. Crea tus canchas, define precios y empieza a recibir reservas.
        </p>
        <div className="relative mt-5 grid gap-2">
          <button onClick={() => close('/dashboard')} className="btn-primary w-full">Ir a mi panel de dueño</button>
          <button onClick={() => close()} className="text-sm text-muted-foreground underline cursor-pointer">Más tarde</button>
        </div>
      </div>
    </div>
  );
}
