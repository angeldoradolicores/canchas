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
      // Descargar silenciosamente y guardar en la memoria local del dispositivo
      const res = await fetch(cleanUrl, { mode: 'cors' }).catch(() => null);
      if (res && res.ok) {
        await cache.put(cleanUrl, res.clone());
      }
    }
  } catch {
    // Falla silenciosa si hay bloqueo de red o CORS
  }
}

/**
 * Obtiene la URL local (Blob URL) de un comprobante almacenado en caché
 * Si no está en caché o hay red, devuelve la URL original
 */
export async function getCachedProofUrl(url: string): Promise<string> {
  if (!url || typeof window === 'undefined' || !('caches' in window)) return url;
  try {
    const cleanUrl = url.split('###')[0].trim();
    const cache = await caches.open(PROOFS_CACHE_NAME);
    const match = await cache.match(cleanUrl);
    if (match) {
      const blob = await match.blob();
      return URL.createObjectURL(blob);
    }
  } catch {
    // Fallback a URL remota
  }
  return url;
}

/**
 * Pre-almacena en segundo plano los comprobantes de las reservas recientes
 * (limita a las últimas 25 para no saturar memoria)
 */
export function precacheRecentProofs(bookings: any[]): void {
  if (typeof window === 'undefined' || !('caches' in window) || !Array.isArray(bookings)) return;

  const proofUrls = bookings
    .map(b => b?.payment_proof_url?.split('###')[0]?.trim())
    .filter((u): u is string => Boolean(u && u.startsWith('http')))
    .slice(0, 25);

  // Ejecutar de forma no bloqueante con requestIdleCallback o setTimeout
  const task = () => {
    proofUrls.forEach(url => {
      cacheProofImage(url).catch(() => {});
    });
  };

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(task, { timeout: 3000 });
  } else {
    setTimeout(task, 1500);
  }
}
