'use client';

/**
 * CAPTCHA invisible de Cloudflare Turnstile para invitados que apartan horas.
 * Si NEXT_PUBLIC_TURNSTILE_SITE_KEY no está configurada, devuelve null y la
 * reserva sigue normal (el servidor tampoco lo exige sin TURNSTILE_SECRET_KEY).
 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

let scriptPromise: Promise<TurnstileApi | null> | null = null;

function loadScript(): Promise<TurnstileApi | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const w = window as unknown as { turnstile?: TurnstileApi };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise(resolve => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(w.turnstile || null);
    s.onerror = () => { scriptPromise = null; resolve(null); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** Carga el script con anticipación (por ejemplo, al abrir la cancha) para que la reserva no espere. */
export function preloadTurnstile() {
  if (SITE_KEY) void loadScript();
}

/** Obtiene un token de un solo uso. Devuelve null si no está configurado o falla. */
export async function getTurnstileToken(timeoutMs = 15000): Promise<string | null> {
  if (!SITE_KEY) return null;
  const api = await loadScript();
  if (!api) return null;

  return new Promise(resolve => {
    const holder = document.createElement('div');
    // Solo se ve si Cloudflare necesita que la persona toque la casilla (casos sospechosos).
    holder.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;';
    document.body.appendChild(holder);
    let id = '';
    let done = false;
    const finish = (token: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { if (id) api.remove(id); } catch { /* ignore */ }
      holder.remove();
      resolve(token);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      id = api.render(holder, {
        sitekey: SITE_KEY,
        appearance: 'interaction-only',
        language: 'es',
        callback: (token: string) => finish(token),
        'error-callback': () => finish(null),
        'expired-callback': () => finish(null),
      });
    } catch {
      finish(null);
    }
  });
}
