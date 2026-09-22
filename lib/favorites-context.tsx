'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';

interface FavoritesContextType {
  favoriteComplexIds: Set<string>;
  isFavoriteComplex: (complexId: string) => boolean;
  toggleFavoriteComplex: (complexId: string) => Promise<boolean>;
  // Backward compat: pitch-level API (used by PitchCard outside explore)
  favoriteIds: Set<string>;
  isFavorite: (pitchId: string) => boolean;
  toggleFavorite: (pitchId: string) => Promise<boolean>;
  loading: boolean;
}

const FavoritesContext = createContext<FavoritesContextType>({
  favoriteComplexIds: new Set(),
  isFavoriteComplex: () => false,
  toggleFavoriteComplex: async () => false,
  favoriteIds: new Set(),
  isFavorite: () => false,
  toggleFavorite: async () => false,
  loading: false,
});

const LOCAL_COMPLEX_KEY = 'canchas_favorite_complexes';
const LOCAL_PITCH_KEY = 'canchas_favorites_ids';

function getStored(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStored(key: string, ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {}
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function syncToBackend(id: string, action: 'add' | 'remove', userId: string | null) {
  if (!id || !UUID_REGEX.test(id)) return;
  try {
    await fetch('/api/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pitch_id: id, user_id: userId, action }),
    });
  } catch {}
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [favoriteComplexIds, setFavoriteComplexIds] = useState<Set<string>>(new Set());
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Cargar favoritos al inicio
  useEffect(() => {
    const localComplexes = getStored(LOCAL_COMPLEX_KEY);
    const localPitches = getStored(LOCAL_PITCH_KEY);
    setFavoriteComplexIds(new Set(localComplexes));
    setFavoriteIds(new Set(localPitches));

    if (!user) return;

    let cancelled = false;
    const fetchBackendFavs = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/favorites?user_id=${user.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.favorites)) {
          // All saved IDs from backend (can be pitch IDs or complex keys)
          const backendIds: string[] = data.favorites;

          // Separate complex keys (start with 'cplx_' or uuid) vs pitch IDs
          // We save complexes as-is; legacy pitch entries are kept too
          const merged = new Set([...localPitches, ...backendIds]);
          setFavoriteIds(merged);
          saveStored(LOCAL_PITCH_KEY, Array.from(merged));

          const mergedComplexes = new Set([...localComplexes, ...backendIds]);
          setFavoriteComplexIds(mergedComplexes);
          saveStored(LOCAL_COMPLEX_KEY, Array.from(mergedComplexes));

          // Sync any local entries not yet in backend
          const toSync = [...localComplexes, ...localPitches].filter(id => !backendIds.includes(id));
          for (const id of toSync) {
            syncToBackend(id, 'add', user.id);
          }
        }
      } catch (err) {
        console.warn('[Favorites fetch error]', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchBackendFavs();
    return () => { cancelled = true; };
  }, [user]);

  // ── Complex-level favorites ──
  const isFavoriteComplex = useCallback(
    (complexId: string) => favoriteComplexIds.has(complexId),
    [favoriteComplexIds]
  );

  const toggleFavoriteComplex = useCallback(
    async (complexId: string): Promise<boolean> => {
      const willBeFav = !favoriteComplexIds.has(complexId);

      setFavoriteComplexIds(prev => {
        const next = new Set(prev);
        if (willBeFav) next.add(complexId);
        else next.delete(complexId);
        saveStored(LOCAL_COMPLEX_KEY, Array.from(next));
        return next;
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('favorites-updated', {
          detail: { complexId, isFavorite: willBeFav }
        }));
      }

      try {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pitch_id: complexId, // stored using complexId as key
            user_id: user?.id || null,
            action: willBeFav ? 'add' : 'remove',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          return !!data.isFavorite;
        }
      } catch (e) {
        console.warn('[Favorites complex sync error]', e);
      }

      return willBeFav;
    },
    [favoriteComplexIds, user]
  );

  // ── Pitch-level favorites (backward compat) ──
  const isFavorite = useCallback(
    (pitchId: string) => favoriteIds.has(pitchId),
    [favoriteIds]
  );

  const toggleFavorite = useCallback(
    async (pitchId: string): Promise<boolean> => {
      const willBeFav = !favoriteIds.has(pitchId);

      setFavoriteIds(prev => {
        const next = new Set(prev);
        if (willBeFav) next.add(pitchId);
        else next.delete(pitchId);
        saveStored(LOCAL_PITCH_KEY, Array.from(next));
        return next;
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('favorites-updated', {
          detail: { pitchId, isFavorite: willBeFav }
        }));
      }

      try {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pitch_id: pitchId,
            user_id: user?.id || null,
            action: willBeFav ? 'add' : 'remove',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          return !!data.isFavorite;
        }
      } catch (e) {
        console.warn('[Favorites sync error]', e);
      }

      return willBeFav;
    },
    [favoriteIds, user]
  );

  return (
    <FavoritesContext.Provider value={{
      favoriteComplexIds,
      isFavoriteComplex,
      toggleFavoriteComplex,
      favoriteIds,
      isFavorite,
      toggleFavorite,
      loading
    }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export const useFavorites = () => useContext(FavoritesContext);
