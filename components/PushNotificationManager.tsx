'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Bell, BellRing, Check, X } from 'lucide-react';
import { subscribeToPush, playPendingAlertSound, triggerSystemNotification } from '@/lib/push-notifications';

interface PushNotificationManagerProps {
  userId?: string;
}

export function PushNotificationManager({ userId }: PushNotificationManagerProps) {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [showPromptBanner, setShowPromptBanner] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const registeredRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('Notification' in window) {
      setPermission(Notification.permission);
      if (Notification.permission === 'default') {
        // Mostrar aviso discreto tras 3 segundos para que el dueño active las notificaciones con sonido
        const t = setTimeout(() => setShowPromptBanner(true), 3500);
        return () => clearTimeout(t);
      }
    }
  }, []);

  const handleEnableNotifications = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    setIsSubscribing(true);
    try {
      // Probar audio inmediatamente durante el gesto táctil del usuario (permite desbloquear AudioContext en iOS Safari y Chrome Android)
      playPendingAlertSound();

      const perm = await Notification.requestPermission();
      setPermission(perm);
      setShowPromptBanner(false);

      if (perm === 'granted') {
        triggerSystemNotification(
          '⚽ ¡Alertas de Cancheros Activadas!',
          'Recibirás sonido y notificación cada vez que una reserva esté por aprobar.'
        );

        if (userId) {
          const sub = await subscribeToPush();
          if (sub) {
            await fetch('/api/push-subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subscription: sub.toJSON(), userId }),
            }).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn('[handleEnableNotifications error]:', err);
    } finally {
      setIsSubscribing(false);
    }
  }, [userId]);

  // Si el permiso ya está otorgado y tenemos userId, asegurar registro de la suscripción
  useEffect(() => {
    if (!userId || registeredRef.current) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      registeredRef.current = true;
      (async () => {
        try {
          const sub = await subscribeToPush();
          if (sub) {
            await fetch('/api/push-subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subscription: sub.toJSON(), userId }),
            }).catch(() => {});
          }
        } catch {}
      })();
    }
  }, [userId]);

  if (!showPromptBanner || permission !== 'default') {
    return null;
  }

  return (
    <aside
      aria-label="Activar notificaciones de reservas"
      className="fixed bottom-20 sm:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-sm z-[998] animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="relative overflow-hidden rounded-2xl bg-zinc-900/95 dark:bg-card/95 text-white dark:text-foreground border border-primary/40 shadow-2xl backdrop-blur-xl p-3.5 ring-1 ring-primary/20">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
            <BellRing size={20} className="animate-bounce" />
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-xs sm:text-sm font-black leading-tight text-white dark:text-foreground">
              ¿Activar alertas con sonido?
            </h4>
            <p className="text-[11px] text-zinc-300 dark:text-muted-foreground mt-1 leading-snug">
              Te avisaremos con un <strong>sonido llamativo</strong> en tu celular cuando una cancha entre en estado <strong>por aprobar</strong>.
            </p>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleEnableNotifications}
                disabled={isSubscribing}
                className="flex-1 py-1.5 px-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <Check size={13} />
                <span>Activar ahora</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPromptBanner(false)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-400 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                title="Descartar"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

