'use client';

import { ArrowRight } from 'lucide-react';
import { Pitch } from '@/lib/types';
import { PitchCard } from '@/components/ui/PitchCard';

interface DiscoverRailProps {
  title: string;
  subtitle: string;
  items: Pitch[];
  onOpen: (pitch: Pitch) => void;
  onBook: (pitch: Pitch) => void;
}

export function DiscoverRail({
  title,
  subtitle,
  items,
  onOpen,
  onBook,
}: DiscoverRailProps) {
  return (
    <section className="discover-section">
      <div className="discover-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button type="button">
          Ver todos <ArrowRight size={14} />
        </button>
      </div>
      <div className="discover-grid">
        {items.map((pitch) => (
          <div key={pitch.id} className="discover-card" style={{ background: 'transparent', boxShadow: 'none', padding: 0 }}>
            <PitchCard
              pitch={pitch as any}
              isAdmin={false}
              onOpen={onOpen}
              onBook={onBook}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
