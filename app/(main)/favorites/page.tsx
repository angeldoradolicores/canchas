'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useFavorites } from '@/lib/favorites-context';
import { Loader2, Heart } from 'lucide-react';
import Link from 'next/link';
import { ComplexCard, ComplexData } from '@/components/ui/ComplexCard';
import { groupPitchesByComplex } from '@/lib/complex-utils';
import { Pitch } from '@/lib/types';

export default function FavoritesPage() {
  const { user } = useAuth();
  const { favoriteComplexIds, toggleFavoriteComplex } = useFavorites();
  const supabase = createClient();

  const [allPitches, setAllPitches] = useState<Pitch[]>([]);
  const [loading, setLoading] = useState(true);

  // Load all pitches once (we'll filter by favorited complex IDs client-side)
  useEffect(() => {
    const fetchPitches = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('pitches')
          .select('*, companies(id, name, zone, address)');

        if (!error && data && data.length > 0) {
          const mapped = data.map((p: any) => ({
            ...p,
            zone: p.companies?.zone || p.zone || 'Norte',
            city: p.city || 'Pasto',
            distance: '—',
            rating: '5.0',
            reviews: 0,
            open: true,
            price: `$${p.price_per_hour?.toLocaleString('es-CO')}`,
            image: (Array.isArray(p.media_urls) && p.media_urls.length > 0)
              ? p.media_urls[0]
              : p.image_url || '/pasto-pitch-collection.png',
            amenity: p.amenities || 'Luces LED',
          }));
          setAllPitches(mapped as any);
        }
      } catch (err) {
        console.error('[FavoritesPage fetch error]', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPitches();
  }, [supabase]);

  // Group all pitches into complexes, then filter by favorited complex IDs
  const favoriteComplexes = useMemo(() => {
    if (allPitches.length === 0) return [];
    const allComplexes = groupPitchesByComplex(allPitches);
    return allComplexes.filter(c => favoriteComplexIds.has(c.id));
  }, [allPitches, favoriteComplexIds]);

  const handleOpen = (pitch: any) => {
    if (typeof window !== 'undefined') {
      window.location.href = `/cancha/${pitch.id}`;
    }
  };

  return (
    <section className="page-content fade-in">
      {/* ── Header ── */}
      <div className="bg-[#DCE7DE] border border-[#C8DACB] rounded-3xl p-4 sm:p-6 mb-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Heart className="text-[#054D27]" size={26} strokeWidth={2.5} />
              <h1 className="text-2xl sm:text-3xl font-black text-[#054D27] uppercase tracking-tight">
                Favoritos
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-[#4D715B] font-medium mt-1 leading-relaxed">
              Tus complejos habituales organizados en un solo lugar para armar el partido sin rodeos.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-[#CDE0D1]/70 border border-[#BACFC0] px-4 py-2.5 rounded-xl shrink-0 self-start sm:self-auto">
            <span className="text-xs sm:text-sm font-black text-[#054D27]">
              {loading ? '…' : favoriteComplexes.length}{' '}
              {favoriteComplexes.length === 1 ? 'complejo guardado' : 'complejos guardados'}
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={36} className="animate-spin text-primary" />
        </div>
      ) : favoriteComplexes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-red-50 dark:bg-red-950/30 border-2 border-red-100 dark:border-red-900/30 flex items-center justify-center mb-5 shadow-sm">
            <Heart size={36} className="text-red-400" />
          </div>
          <h3 className="text-lg font-bold mb-2">Aún no tienes complejos favoritos</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs leading-relaxed">
            Cuando encuentres un complejo que te guste, toca el corazón ❤️ en su tarjeta para tenerlo aquí a la mano.
          </p>
          <Link href="/" className="btn-primary text-sm shadow-md">
            Explorar complejos
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {favoriteComplexes.map(complex => (
            <ComplexCard
              key={complex.id}
              complex={complex}
              onOpen={handleOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
}
