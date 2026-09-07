'use client';

import { useEffect, useRef, useState } from 'react';
import { use } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PitchDetail } from '@/components/booking/PitchDetail';
import { BookingFlow } from '@/components/booking/BookingFlow';
import { Pitch } from '@/lib/types';
import { Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function PublicPitchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = createClient();

  const [pitch, setPitch] = useState<Pitch | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [booking, setBooking] = useState(false);

  // Usamos refs para guardar los valores en tiempo real sin causar re-renders
  const savedDateRef = useRef('');
  const savedTimesRef = useRef<string[]>([]);
  // Cambiamos la key para forzar remount de PitchDetail al volver
  const [returnKey, setReturnKey] = useState(0);

  useEffect(() => {
    const fetchPitch = async () => {
      const { data, error } = await supabase
        .from('pitches')
        .select(`
          *,
          companies (
            id, name, zone, address, owner_id,
            owner:profiles (full_name, avatar_url)
          )
        `)
        .eq('id', id)
        .single();

      if (error || !data) {
        setNotFound(true);
      } else {
        setPitch(data as any);
      }
      setLoading(false);
    };
    fetchPitch();
  }, [id, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={36} className="animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !pitch) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <AlertCircle size={48} className="text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">Cancha no encontrada</h2>
        <p className="text-muted-foreground mb-6">Esta cancha no existe o ya no está disponible.</p>
        <Link href="/" className="btn-primary">Explorar canchas</Link>
      </div>
    );
  }

  if (booking) {
    return (
      <BookingFlow
        pitch={pitch}
        preselectedTimes={savedTimesRef.current}
        preselectedDate={savedDateRef.current}
        onBack={(times, date) => {
          // Guardar datos al volver para pasarlos de vuelta a PitchDetail
          if (times && times.length > 0) savedTimesRef.current = times;
          if (date) savedDateRef.current = date;
          setReturnKey(k => k + 1); // fuerza remount de PitchDetail
          setBooking(false);
        }}
        onFinish={() => {
          savedTimesRef.current = [];
          savedDateRef.current = '';
          setBooking(false);
        }}
      />
    );
  }

  return (
    <PitchDetail
      key={returnKey}
      pitch={pitch}
      initialDate={savedDateRef.current}
      initialTimes={savedTimesRef.current}
      onBack={() => window.history.back()}
      onBook={(times, date) => {
        savedTimesRef.current = times || [];
        savedDateRef.current = date || '';
        setBooking(true);
      }}
    />
  );
}
