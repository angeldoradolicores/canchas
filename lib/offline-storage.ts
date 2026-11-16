/**
 * Utilidades para almacenamiento y sincronización Offline-First
 * Permite guardar canchas, reservas y comprobantes en el dispositivo
 * para acceso instantáneo sin conexión a internet (PWA / Acceso directo).
 */

const OFFLINE_DATA_KEY = 'cancheros_offline_dashboard_v1';
const PROOFS_CACHE_NAME = 'cancheros-proofs-v1';

export interface OfflineDataSnapshot {
  company: any | null;
  pitches: any[];
  bookings: any[];
  timestamp: number;
}

/**
 * Guarda una instantánea de los datos del dueño en localStorage
 */
export function saveOfflineData(company: any, pitches: any[], bookings: any[]): void {
  if (typeof window === 'undefined') return;
  try {
    const snapshot: OfflineDataSnapshot = {
      company: company || null,
      pitches: Array.isArray(pitches) ? pitches : [],
      bookings: Array.isArray(bookings) ? bookings : [],
      timestamp: Date.now(),
    };
    localStorage.setItem(OFFLINE_DATA_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.warn('[OfflineStorage] No se pudo guardar la instantánea local:', err);
  }
}

/**
 * Recupera la instantánea de datos guardada en el dispositivo
 */
export function getOfflineData(): OfflineDataSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(OFFLINE_DATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        company: parsed.company || null,
        pitches: Array.isArray(parsed.pitches) ? parsed.pitches : [],
        bookings: Array.isArray(parsed.bookings) ? parsed.bookings : [],
        timestamp: Number(parsed.timestamp || 0),
      };
    }
  } catch (err) {
    console.warn('[OfflineStorage] Error leyendo datos locales:', err);
  }
  return null;
}

/**
 * Formatea la hora de la última sincronización
 */
export function formatLastSync(timestamp: number): string {
  if (!timestamp) return 'Reciente';
  const diffMinutes = Math.floor((Date.now() - timestamp) / 60000);
  if (diffMinutes < 1) return 'Hace unos segundos';
  if (diffMinutes === 1) return 'Hace 1 minuto';
  if (diffMinutes < 60) return `Hace ${diffMinutes} min`;

  const date = new Date(timestamp);
  return date.toLocaleTimeString('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Almacena una imagen de comprobante en la Cache Storage del navegador
 */
export async function cacheProofImage(url: string): Promise<void> {
  if (!url || typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const cleanUrl = url.split('###')[0].trim();
    if (!cleanUrl.startsWith('http')) return;

    const cache = await caches.open(PROOFS_CACHE_NAME);
    const existing = await cache.match(cleanUrl);
    if (!existing) {
      // Intentar descargar; si hay bloqueo CORS (R2 sin CORS config) se ignora silenciosamente
      const res = await fetch(cleanUrl, { mode: 'no-cors' }).catch(() => null);
      // mode: 'no-cors' devuelve respuesta opaca (type==='opaque') que no podemos leer pero sí cachear
      if (res && (res.ok || res.type === 'opaque')) {
        await cache.put(cleanUrl, res.clone());
      }
    }
  } catch {
    // Falla silenciosa si hay bloqueo de red o CORS
  }
}

/**
 * URL para mostrar un comprobante. Ya no se usa una copia "opaca" del Cache Storage
 * (con comprobantes privados podía mostrarse vacía): el navegador guarda la imagen
 * firmada en su caché HTTP, así que abrirla de nuevo es inmediato.
 */
export async function getCachedProofUrl(url: string): Promise<string> {
  return (url || '').split('###')[0].trim();
}

/**
 * Precarga en segundo plano los comprobantes que el dueño probablemente va a revisar
 * (reservas pendientes primero, luego las más recientes). Así, al tocar "Ver comprobante"
 * la imagen ya está descargada. Máximo 12 para no gastar datos.
 */
export function precacheRecentProofs(bookings: any[]): void {
  if (typeof window === 'undefined' || !Array.isArray(bookings)) return;
  const conn = (navigator as any).connection;
  if (conn?.saveData) return; // respeta el "ahorro de datos" del celular

  const withProof = bookings.filter(b => b?.payment_proof_url && b.status !== 'cancelled' && b.status !== 'rejected');
  const ordered = [
    ...withProof.filter(b => b.status === 'pending'),
    ...withProof.filter(b => b.status !== 'pending'),
  ];
  const urls = [...new Set(
    ordered
      .map(b => String(b.payment_proof_url).split('###')[0].trim())
      .filter(u => u.startsWith('/api/receipts/') || u.startsWith('http')),
  )].slice(0, 12);

  const task = () => {
    urls.forEach((u, i) => {
      setTimeout(() => {
        const img = new Image();
        img.decoding = 'async';
        img.src = u;
      }, i * 250);
    });
  };
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(task, { timeout: 3000 });
  } else {
    setTimeout(task, 1500);
  }
}
