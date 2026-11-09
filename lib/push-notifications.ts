// lib/push-notifications.ts
// Helpers para Web Push con VAPID, Audio Chime y Notificaciones de Sistema

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Suscribe el navegador a Push Notifications */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (typeof window === 'undefined') return null;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) return existing;
    if (!VAPID_PUBLIC_KEY) return null;
    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    return sub;
  } catch (e) {
    console.warn('[subscribeToPush]', e);
    return null;
  }
}

let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new AudioContextClass();
  }
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {});
  }
  return _audioCtx;
}

/**
 * Sonido llamativo para reservas por aprobar (Ding - Dong - Ding! de alta frecuencia)
 * Diseñado con Web Audio API para sonar fuerte y nítido en celulares y computadores.
 */
export function playPendingAlertSound() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;

    // 3 tonos enérgicos con frecuencias armónicas (D5 -> A5 -> D6)
    const notes = [
      { freq: 587.33, start: 0, dur: 0.18, vol: 0.28 },
      { freq: 880.00, start: 0.15, dur: 0.22, vol: 0.35 },
      { freq: 1174.66, start: 0.35, dur: 0.45, vol: 0.42 },
    ];

    notes.forEach(({ freq, start, dur, vol }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle'; // Tono con armónicos brillantes que corta el ruido ambiente
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(vol, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    });

    // Vibración en dispositivos móviles que lo soporten
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([350, 120, 350, 120, 500]);
    }
  } catch (err) {
    console.warn('[playPendingAlertSound error]:', err);
  }
}

/** Dispara una notificación del sistema (PWA o navegador) con clic interactivo */
export function triggerSystemNotification(title: string, body: string, url: string = '/dashboard/bookings') {
  if (typeof window === 'undefined') return;

  // Si Service Worker está listo, mostrar mediante showNotification
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.showNotification) {
        reg.showNotification(title, {
          body,
          icon: '/icon-192x192.png',
          badge: '/icon-96x96.png',
          vibrate: [350, 120, 350, 120, 500],
          data: { url },
          tag: 'booking-pending-alert',
          renotify: true,
        } as any);
      }
    }).catch(() => {});
  } else if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const notif = new Notification(title, {
        body,
        icon: '/icon-192x192.png',
      });
      notif.onclick = () => {
        window.focus();
        if (window.location.pathname !== url) {
          window.location.href = url;
        }
      };
    } catch {}
  }
}
