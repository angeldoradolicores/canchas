/**
 * lib/cache.ts
 * ──────────────────────────────────────────────────────────
 * Caché en memoria con TTL para reducir queries a Supabase.
 * 
 * En Vercel Serverless cada función puede ser una instancia
 * separada, pero dentro de cada instancia el caché funciona
 * perfectamente para absorber ráfagas de tráfico.
 * 
 * Para producción de alto volumen (500+ RPS) considera
 * agregar Upstash Redis como capa de caché distribuida.
 * ──────────────────────────────────────────────────────────
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number;
}

interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<any>>();
  private stats: CacheStats = { size: 0, hits: 0, misses: 0, evictions: 0 };
  private maxEntries: number;
  private cleanupIntervalMs: number;
  private lastCleanup = Date.now();

  constructor(maxEntries = 500, cleanupIntervalMs = 30_000) {
    this.maxEntries = maxEntries;
    this.cleanupIntervalMs = cleanupIntervalMs;
  }

  get<T>(key: string): T | null {
    const now = Date.now();
    this.maybeCleanup(now);

    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (entry.expiresAt < now) {
      this.store.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      return null;
    }

    entry.hits++;
    this.stats.hits++;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    // Si está lleno, evictar la entrada más antigua
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) {
        this.store.delete(firstKey);
        this.stats.evictions++;
      }
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
      hits: 0,
    });
    this.stats.size = this.store.size;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** Invalida todas las entradas que empiecen con el prefijo dado */
  invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    this.stats.size = this.store.size;
    return count;
  }

  getStats(): CacheStats {
    return { ...this.stats, size: this.store.size };
  }

  private maybeCleanup(now: number): void {
    if (now - this.lastCleanup < this.cleanupIntervalMs) return;
    this.lastCleanup = now;

    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt < now) {
        this.store.delete(key);
        this.stats.evictions++;
      }
    }
    this.stats.size = this.store.size;
  }
}

// Instancia global compartida dentro de la misma función serverless
export const cache = new MemoryCache(500, 30_000);

// TTLs predefinidos por tipo de dato (en segundos)
export const TTL = {
  SEARCH_RESULTS: 45,       // Búsqueda de canchas: 45 segundos
  AVAILABILITY:   20,       // Disponibilidad de hora: 20 segundos (dato sensible)
  COMPANY_LIST:   120,      // Lista de complejos: 2 minutos
  PITCH_DETAILS:  300,      // Detalle de una cancha: 5 minutos
  DASHBOARD_STATS: 30,      // Stats del dueño: 30 segundos
} as const;

/**
 * Wrapper con caché para funciones async.
 * Si el resultado está en caché lo devuelve directo;
 * si no, ejecuta la función y cachea el resultado.
 *
 * @example
 * const data = await withCache('search:Pasto', TTL.SEARCH_RESULTS, () =>
 *   supabase.from('companies').select('*').ilike('name', '%Pasto%')
 * );
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  const cached = cache.get<T>(key);
  if (cached !== null) return cached;

  const result = await fn();
  cache.set(key, result, ttlSeconds);
  return result;
}
