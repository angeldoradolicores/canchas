'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Plus, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { PitchCard, PitchData } from '@/components/ui/PitchCard';

export default function PitchesPage() {
  const { user, session, loading: authLoading } = useAuth();
  const [pitches, setPitches] = useState<PitchData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setLoading(false);
      return;
    }

    const fetchPitches = async () => {
      setLoading(true);
      try {
        const token = session?.access_token;
        const res = await fetch('/api/admin-actions', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            action: 'get_pitches',
            payload: { owner_id: user.id },
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Error al cargar las canchas.');
        
        setPitches(data.data || []);
      } catch (err: any) {
        setError(err.message || 'Error al cargar las canchas.');
      } finally {
        setLoading(false);
      }
    };

    fetchPitches();
  }, [user?.id, session?.access_token, authLoading]);

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-20 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-foreground">Mis Canchas</h1>
          <p className="text-sm text-muted-foreground mt-1">Administra tus campos deportivos y precios.</p>
        </div>
        <Link
          href="/dashboard/pitches/new"
          className="btn-primary flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold rounded-xl"
        >
          <Plus size={18} /> Nueva Cancha
        </Link>
      </div>

      {error && (
        <div className="p-4 mb-6 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-center gap-2">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {pitches.length === 0 ? (
        <div className="bg-card border border-border rounded-3xl p-12 text-center space-y-4 shadow-sm">
          <p className="text-base text-muted-foreground font-medium">No tienes canchas registradas aún.</p>
          <Link
            href="/dashboard/pitches/new"
            className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline bg-primary/10 px-6 py-3 rounded-xl transition-colors hover:bg-primary/20"
          >
            <Plus size={16} /> Registrar mi primera cancha
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pitches.map(pitch => (
            <PitchCard 
              key={pitch.id}
              pitch={pitch} 
              editUrl={`/dashboard/pitches/${pitch.id}/edit`}
              isAdmin={true} 
            />
          ))}
        </div>
      )}
    </div>
  );
}