'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useFavorites } from '@/lib/favorites-context';
import { Loader2, Heart, MapPin, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { PitchCard, PitchData } from '@/components/ui/PitchCard';


import { useRouter } from 'next/navigation';

export default function FavoritesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { favoriteIds, toggleFavorite } = useFavorites();
  const supabase = createClient();

  const [pitches, setPitches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFavoritePitches = async () => {
      const ids = Array.from(favoriteIds);
      if (ids.length === 0) {
        setPitches([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Al usar '*, companies(*)' nos aseguramos de traer absolutamente todos 
        // los datos de la cancha y su empresa, tal como lo hace tu API interna.
        const { data, error } = await supabase
          .from('pitches')
          .select('*, companies(*)')
          .in('id', ids);

        if (error) throw error;

        if (data) {
          setPitches(data);
        }
      } catch (err) {
        console.error('[FavoritesPage fetch error]', err);
        // Opcional: si tienes un estado de error configurado puedes usarlo aquí
        // setError('Error al cargar los favoritos.');
      } finally {
        setLoading(false);
      }
    };

    fetchFavoritePitches();
  }, [favoriteIds, supabase]);


  const handleRemove = async (pitchId: string) => {
    await toggleFavorite(pitchId);
  };

  return (
    <section className="page-content fade-in">
      {/* ── Contenedor Principal (Favoritos) ── */}
      <div className="bg-[#DCE7DE] border border-[#C8DACB] rounded-3xl p-4 sm:p-6 mb-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              {/* Corazón sin relleno (solo borde) */}
              <Heart className="text-[#054D27]" size={26} strokeWidth={2.5} />
              <h1 className="text-2xl sm:text-3xl font-black text-[#054D27] uppercase tracking-tight">
                Favoritos
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-[#4D715B] font-medium mt-1 leading-relaxed">
              Tus sedes habituales organizadas en un solo lugar para armar el partido sin rodeos.
            </p>
          </div>

          {/* Badge indicador de canchas guardadas */}
          <div className="flex items-center gap-2 bg-[#CDE0D1]/70 border border-[#BACFC0] px-4 py-2.5 rounded-xl shrink-0 self-start sm:self-auto">
            <span className="text-xs sm:text-sm font-black text-[#054D27]">
              {pitches.length} {pitches.length === 1 ? 'cancha guardada' : 'canchas guardadas'}
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={36} className="animate-spin text-primary" />
        </div>
      ) : pitches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-red-50 dark:bg-red-950/30 border-2 border-red-100 dark:border-red-900/30 flex items-center justify-center mb-5 shadow-sm">
            <Heart size={36} className="text-red-400" />
          </div>
          <h3 className="text-lg font-bold mb-2">Aún no tienes canchas favoritas</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs leading-relaxed">
            Cuando encuentres una cancha que te guste, toca el corazón ❤️ en cualquier tarjeta o perfil para tenerla aquí a la mano.
          </p>
          <Link href="/" className="btn-primary text-sm shadow-md">
            Explorar canchas
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pitches.map(pitch => (
            <PitchCard
              key={pitch.id}
              pitch={pitch}
              isAdmin={true}
            />
          ))}
        </div>
      )}
    </section>
  );
}
