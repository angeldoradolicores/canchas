'use client';

import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef } from 'react';
import { Pitch } from '@/lib/types';
import { PitchCard } from '@/components/ui/PitchCard';
import { ComplexCard, ComplexData } from '@/components/ui/ComplexCard';

interface DiscoverRailProps {
  title: string;
  subtitle: string;
  items: (ComplexData | Pitch)[];
  onOpen: (pitch: Pitch) => void;
  onBook?: (pitch: Pitch) => void;
  onViewAll?: () => void;
  badge?: React.ReactNode;
}

export function DiscoverRail({
  title,
  subtitle,
  items,
  onOpen,
  onBook,
  onViewAll,
  badge,
}: DiscoverRailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!items || items.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -320 : 320;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <section className="discover-section my-3">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg sm:text-xl font-black text-foreground tracking-tight">{title}</h2>
            {badge}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {items.length > 3 && (
            <div className="hidden sm:flex items-center gap-1">
              <button
                type="button"
                onClick={() => scroll('left')}
                className="w-8 h-8 rounded-full border border-border bg-card hover:bg-secondary flex items-center justify-center text-foreground transition-colors cursor-pointer"
                title="Desplazar a la izquierda"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => scroll('right')}
                className="w-8 h-8 rounded-full border border-border bg-card hover:bg-secondary flex items-center justify-center text-foreground transition-colors cursor-pointer"
                title="Desplazar a la derecha"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer ml-1"
            >
              <span>Ver todos</span>
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Contenedor responsivo: Deslizamiento horizontal táctil en móvil, Grid de 3 en pantallas grandes */}
      <div
        ref={scrollRef}
        className="flex lg:grid overflow-x-auto lg:overflow-visible gap-3 sm:gap-4 pb-3 lg:pb-0 scrollbar-hide snap-x snap-mandatory lg:grid-cols-3 items-stretch"
      >
        {items.map((item) => {
          const isComplex = 'pitchesCount' in item && Array.isArray((item as ComplexData).pitches);

          return (
            <div
              key={item.id}
              className="flex-shrink-0 w-[275px] sm:w-[310px] lg:w-auto snap-start h-full"
              style={{ minHeight: '100%' }}
            >
              {isComplex ? (
                <ComplexCard
                  complex={item as ComplexData}
                  onOpen={onOpen}
                  onBook={onBook}
                />
              ) : (
                <PitchCard
                  pitch={item as any}
                  isAdmin={false}
                  onOpen={onOpen}
                  onBook={onBook}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
