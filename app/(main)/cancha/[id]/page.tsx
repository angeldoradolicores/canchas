'use client';

import { useEffect, useRef, useState } from 'react';
import { use } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PitchDetail } from '@/components/booking/PitchDetail';
import { BookingFlow } from '@/components/booking/BookingFlow';
import { Pitch } from '@/lib/types';
import { Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function PublicPitchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [pitch, setPitch] = useState<Pitch | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [booking, setBooking] = useState(false);

  const savedDateRef = useRef('');
  const savedTimesRef = useRef<string[]>([]);
  const [returnKey, setReturnKey] = useState(0);

  // ── Leer parámetros del link inteligente de n8n / WhatsApp ──
  // Formato esperado:
  //   /cancha/[id]?date=2025-10-10&times=18:00,19:00&name=Juan&phone=3001234567
  const urlDate = searchParams.get('date') || '';
  const urlTimesRaw = searchParams.get('times') || searchParams.get('horas') || '';
  const urlTimes = urlTimesRaw
    ? urlTimesRaw.split(',').map(t => t.trim().substring(0, 5)).filter(Boolean)
    : [];
  const urlName = searchParams.get('name') || searchParams.get('nombre') || '';
  const urlPhone = searchParams.get('phone') || searchParams.get('tel') || searchParams.get('celular') || '';

  // Guardar datos del invitado en localStorage para autocompletar en el flujo de reserva
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (urlName) localStorage.setItem('cancheros_customer_name', urlName);
    if (urlPhone) localStorage.setItem('cancheros_customer_phone', urlPhone.replace(/\D/g, ''));
  }, [urlName, urlPhone]);

  // Si vienen fecha y horas por URL, pre-cargar en refs y abrir BookingFlow directamente
  useEffect(() => {
    if (urlDate && urlTimes.length > 0 && pitch) {
      savedDateRef.current = urlDate;
      savedTimesRef.current = urlTimes;
      setBooking(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitch]); // solo cuando el pitch cargue por primera vez

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

  // Si se libera la cancha desde el timer flotante, otra pestaña o dispositivo, salir del BookingFlow
  useEffect(() => {
    const handleCancelled = () => {
      if (typeof window !== 'undefined' && sessionStorage.getItem('canchas_booking_in_step_3') === 'true') {
        return;
      }
      setBooking(false);
      savedTimesRef.current = [];
      savedDateRef.current = '';
    };

    window.addEventListener('cancel-active-booking', handleCancelled);
    window.addEventListener('active-booking-expired', handleCancelled);
    return () => {
      window.removeEventListener('cancel-active-booking', handleCancelled);
      window.removeEventListener('active-booking-expired', handleCancelled);
    };
  }, []);

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
          if (times && times.length > 0) savedTimesRef.current = times;
          if (date) savedDateRef.current = date;
          setReturnKey(k => k + 1);
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
      initialDate={savedDateRef.current || urlDate}
      initialTimes={savedTimesRef.current.length > 0 ? savedTimesRef.current : urlTimes}
      onBack={() => window.history.back()}
      onSelectPitch={(newPitch) => {
        setPitch(newPitch);
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', `/cancha/${newPitch.id}`);
        }
      }}
      onBook={(times, date, chosenPitch) => {
        if (chosenPitch) setPitch(chosenPitch);
        savedTimesRef.current = times || [];
        savedDateRef.current = date || '';
        setBooking(true);
      }}
    />
  );
}
