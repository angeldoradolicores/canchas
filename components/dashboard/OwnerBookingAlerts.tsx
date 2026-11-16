'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BellRing, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import { playPendingAlertSound, triggerSystemNotification, unlockAlertAudio } from '@/lib/push-notifications';

type Alert = { id: string; name: string; when: string };

/**
 * Alerta global para el DUEÑO: suena y muestra un aviso cuando llega una reserva con
 * comprobante por aprobar, aunque esté navegando fuera del panel.
 * En /dashboard/bookings no actúa porque esa pantalla ya tiene su propia alerta.
 * Solo recibe reservas que la RLS le permite leer y además filtra por sus canchas.
 */
export function OwnerBookingAlerts() {
  const { user, profile } = useAuth();
  const pathname = usePathname();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const onBookingsPage = pathname?.startsWith('/dashboard/bookings');
  const isOwner = profile?.role === 'owner';

  useEffect(() => {
    const unlock = () => unlockAlertAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  useEffect(() => {
    if (!user || !isOwner || onBookingsPage) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data: companies } = await supabase.from('companies').select('id').eq('owner_id', user.id);
      const companyIds = (companies || []).map((c: { id: string }) => c.id);
      if (!companyIds.length || cancelled) return;
      const { data: pitches } = await supabase.from('pitches').select('id').in('company_id', companyIds);
      const pitchIds = new Set((pitches || []).map((p: { id: string }) => p.id));
      if (!pitchIds.size || cancelled) return;

      channel = supabase
        .channel(`owner-global-alerts-${user.id}-${Math.random().toString(36).slice(2, 8)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, (payload: any) => {
          const row = payload.new;
          if (!row?.id || !pitchIds.has(row.pitch_id)) return;
          const isSubmittedPending = row.status === 'pending' && Boolean(row.payment_proof_url);
          const fresh = (payload.eventType === 'INSERT' && isSubmittedPending)
            || (payload.eventType === 'UPDATE' && isSubmittedPending && payload.old?.status !== 'pending');
          if (!fresh || seen.current.has(row.id)) return;
          // Agrupar las horas de una misma solicitud (mismo comprobante) en un solo aviso.
          const groupKey = String(row.payment_proof_url);
          if (seen.current.has(groupKey)) { seen.current.add(row.id); return; }
          seen.current.add(row.id); seen.current.add(groupKey);

          const name = String(row.customer_name || 'Nuevo cliente').slice(0, 60);
          const when = row.start_time
            ? new Date(row.start_time).toLocaleString('es-CO', { timeZone: 'America/Bogota', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
            : '';
          playPendingAlertSound();
          triggerSystemNotification('⚽ Nueva reserva por aprobar', `${name}${when ? ' · ' + when : ''}`, '/dashboard/bookings');
          setAlerts(a => [{ id: row.id, name, when }, ...a].slice(0, 3));
        })
        .subscribe();
    })();

    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, [user, isOwner, onBookingsPage]);

  if (!alerts.length || onBookingsPage) return null;

  return (
    <div className="fixed top-3 inset-x-3 sm:left-auto sm:right-4 sm:w-96 z-[1001] space-y-2">
      {alerts.map(a => (
        <div key={a.id} role="alert" className="flex items-start gap-3 rounded-2xl bg-emerald-700 text-white shadow-2xl p-3.5 animate-in slide-in-from-top-2 fade-in">
          <BellRing size={20} className="shrink-0 mt-0.5 animate-pulse" />
          <a href="/dashboard/bookings" className="flex-1 min-w-0">
            <p className="font-bold text-sm">Nueva reserva por aprobar</p>
            <p className="text-xs opacity-90 truncate">{a.name}{a.when ? ` · ${a.when}` : ''}</p>
            <p className="text-[11px] underline mt-0.5">Ver y aprobar</p>
          </a>
          <button aria-label="Cerrar aviso" onClick={() => setAlerts(list => list.filter(x => x.id !== a.id))} className="p-1 rounded-full hover:bg-white/15 cursor-pointer">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
