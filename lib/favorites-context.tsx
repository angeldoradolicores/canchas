'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';

interface FavoritesContextType {
  favoriteComplexIds: Set<string>;
  isFavoriteComplex: (complexId: string, pitchIds?: string[]) => boolean;
  toggleFavoriteComplex: (
    complexId: string,
    extra?: { pitchIds?: string[]; currentlyFavorite?: boolean; baseId?: string } | string[] | string
  ) => Promise<boolean>;
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

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [favoriteComplexIds, setFavoriteComplexIds] = useState<Set<string>>(new Set());
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const userId = user?.id;
  const fetchedUserRef = React.useRef<string | null>(null);

  // Cargar favoritos al inicio
  useEffect(() => {
    const localComplexes = getStored(LOCAL_COMPLEX_KEY);
    const localPitches = getStored(LOCAL_PITCH_KEY);
    setFavoriteComplexIds(new Set(localComplexes));
    setFavoriteIds(new Set(localPitches));

    if (!userId) {
      fetchedUserRef.current = null;
      return;
    }

    if (fetchedUserRef.current === userId) return;

    let cancelled = false;
    const fetchBackendFavs = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/favorites?user_id=${userId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.favorites)) {
          fetchedUserRef.current = userId;
          const backendIds: string[] = data.favorites || [];
          const backendCompanyIds: string[] = data.favorite_companies || [];

          const mergedPitches = new Set([...localPitches, ...backendIds]);
          setFavoriteIds(mergedPitches);
          saveStored(LOCAL_PITCH_KEY, Array.from(mergedPitches));

          const mergedComplexes = new Set([...localComplexes, ...backendIds, ...backendCompanyIds]);
          setFavoriteComplexIds(mergedComplexes);
          saveStored(LOCAL_COMPLEX_KEY, Array.from(mergedComplexes));
        }
      } catch (err) {
        console.warn('[Favorites fetch error]', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchBackendFavs();
    return () => { cancelled = true; };
  }, [userId]);

  // ── Complex-level favorites ──
  const isFavoriteComplex = useCallback(
    (complexId: string, pitchIds?: string[]) => {
      if (!complexId) return false;
      if (favoriteComplexIds.has(complexId)) return true;
      if (favoriteIds.has(complexId)) return true;
      if (complexId.includes('_')) {
        const base = complexId.split('_')[0];
        if (favoriteComplexIds.has(base) || favoriteIds.has(base)) return true;
      }
      if (Array.isArray(pitchIds) && pitchIds.some(pid => favoriteIds.has(pid))) {
        return true;
      }
      return false;
    },
    [favoriteComplexIds, favoriteIds]
  );

  const toggleFavoriteComplex = useCallback(
    async (
      complexId: string,
      extra?: { pitchIds?: string[]; currentlyFavorite?: boolean; baseId?: string } | string[] | string
    ): Promise<boolean> => {
      let pitchIds: string[] = [];
      let baseId: string = complexId.includes('_') ? complexId.split('_')[0] : complexId;
      let explicitFav: boolean | undefined = undefined;

      if (Array.isArray(extra)) {
        pitchIds = extra;
      } else if (typeof extra === 'string') {
        pitchIds = [extra];
      } else if (extra && typeof extra === 'object') {
        if (Array.isArray(extra.pitchIds)) pitchIds = extra.pitchIds;
        if (extra.baseId) baseId = extra.baseId;
        if (typeof extra.currentlyFavorite === 'boolean') explicitFav = extra.currentlyFavorite;
      }

      // Si explicitFav fue proporcionado, usarlo directamente; de lo contrario verificar si ya es favorito
      const isCurFav = explicitFav !== undefined
        ? explicitFav
        : (isFavoriteComplex(complexId) || (baseId ? isFavoriteComplex(baseId) : false) || pitchIds.some(pid => favoriteIds.has(pid)));

      const willBeFav = !isCurFav;

      const allIds = Array.from(new Set([complexId, baseId, ...pitchIds].filter(Boolean)));

      if (willBeFav) {
        // AGREGAR A FAVORITOS
        setFavoriteComplexIds(prev => {
          const next = new Set(prev);
          next.add(complexId);
          if (baseId) next.add(baseId);
          saveStored(LOCAL_COMPLEX_KEY, Array.from(next));
          return next;
        });
        if (pitchIds.length > 0) {
          setFavoriteIds(prev => {
            const next = new Set(prev);
            pitchIds.forEach(pid => next.add(pid));
            saveStored(LOCAL_PITCH_KEY, Array.from(next));
            return next;
          });
        }
      } else {
        // QUITAR DE FAVORITOS: limpiar de AMBOS conjuntos para asegurar que desparezca de favoritos
        setFavoriteComplexIds(prev => {
          const next = new Set(prev);
          allIds.forEach(id => next.delete(id));
          saveStored(LOCAL_COMPLEX_KEY, Array.from(next));
          return next;
        });

        setFavoriteIds(prev => {
          const next = new Set(prev);
          allIds.forEach(id => next.delete(id));
          saveStored(LOCAL_PITCH_KEY, Array.from(next));
          return next;
        });
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('favorites-updated', {
          detail: { complexId, baseId, pitchIds, isFavorite: willBeFav }
        }));
      }

      // Si el usuario no ha iniciado sesión, se conserva localmente sin peticiones POST innecesarias
      if (!user?.id) {
        return willBeFav;
      }

      try {
        const targetToSend = pitchIds[0] || baseId || complexId;
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pitch_id: targetToSend,
            complex_id: complexId,
            base_id: baseId,
            pitch_ids: pitchIds,
            user_id: user.id,
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
    [isFavoriteComplex, favoriteIds, user?.id]
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

      // Si el usuario no ha iniciado sesión, se conserva localmente sin peticiones POST innecesarias
      if (!user?.id) {
        return willBeFav;
      }

      try {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pitch_id: pitchId,
            user_id: user.id,
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
    [favoriteIds, user?.id]
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
