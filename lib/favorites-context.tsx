'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';

interface FavoritesContextType {
  favoriteIds: Set<string>;
  isFavorite: (pitchId: string) => boolean;
  toggleFavorite: (pitchId: string) => Promise<boolean>;
  loading: boolean;
}

const FavoritesContext = createContext<FavoritesContextType>({
  favoriteIds: new Set(),
  isFavorite: () => false,
  toggleFavorite: async () => false,
  loading: false,
});

const LOCAL_STORAGE_KEY = 'canchas_favorites_ids';

function getStoredLocalFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredLocalFavorites(ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(ids));
  } catch {}
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Cargar favoritos al inicio (de localStorage y de backend si hay usuario)
  useEffect(() => {
    const local = getStoredLocalFavorites();
    const initialSet = new Set(local);
    setFavoriteIds(initialSet);

    if (!user) return;

    let cancelled = false;
    const fetchBackendFavs = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/favorites?user_id=${user.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.favorites)) {
          // Fusionar con los que ya teníamos localmente
          const merged = new Set([...local, ...data.favorites]);
          setFavoriteIds(merged);
          saveStoredLocalFavorites(Array.from(merged));

          // Si había favoritos locales que no estaban en DB, subirlos silenciosamente
          const toSync = local.filter((id: string) => !data.favorites.includes(id));
          for (const pid of toSync) {
            fetch('/api/favorites', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pitch_id: pid, user_id: user.id, action: 'add' }),
            }).catch(() => {});
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

  const isFavorite = useCallback(
    (pitchId: string) => favoriteIds.has(pitchId),
    [favoriteIds]
  );

  const toggleFavorite = useCallback(
    async (pitchId: string): Promise<boolean> => {
      const willBeFav = !favoriteIds.has(pitchId);

      // Optimistic update
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (willBeFav) next.add(pitchId);
        else next.delete(pitchId);
        saveStoredLocalFavorites(Array.from(next));
        return next;
      });

      // Disparar evento para que otras pestañas o componentes se sincronicen
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('favorites-updated', {
          detail: { pitchId, isFavorite: willBeFav }
        }));
      }

      // Sync con el backend
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
    <FavoritesContext.Provider value={{ favoriteIds, isFavorite, toggleFavorite, loading }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export const useFavorites = () => useContext(FavoritesContext);
