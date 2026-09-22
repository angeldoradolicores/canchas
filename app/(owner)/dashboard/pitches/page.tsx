'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Plus, Loader2, AlertCircle, Building2, Edit3, Check, X } from 'lucide-react';
import Link from 'next/link';
import { PitchCard, PitchData } from '@/components/ui/PitchCard';

export default function PitchesPage() {
  const { user, session, loading: authLoading } = useAuth();
  const [pitches, setPitches] = useState<PitchData[]>([]);
  const [company, setCompany] = useState<{ id: string; name: string } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [savingCompany, setSavingCompany] = useState(false);
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
        if (data.company) {
          setCompany(data.company);
          setNewCompanyName(data.company.name || '');
        }
      } catch (err: any) {
        setError(err.message || 'Error al cargar las canchas.');
      } finally {
        setLoading(false);
      }
    };

    fetchPitches();
  }, [user?.id, session?.access_token, authLoading]);

  const handleSaveCompanyName = async () => {
    if (!newCompanyName.trim() || !session?.access_token) return;
    setSavingCompany(true);
    try {
      const res = await fetch('/api/admin-actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'update_company',
          payload: { name: newCompanyName.trim() },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error al actualizar nombre.');
      setCompany(data.data);
      setEditingName(false);
    } catch (err: any) {
      alert(err.message || 'No se pudo actualizar el nombre del complejo.');
    } finally {
      setSavingCompany(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-20 p-4 sm:p-6">
      {/* ── Banner de Complejo Deportivo Principal ── */}
      <div className="mb-6 p-4 sm:p-5 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          {/* <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-md shadow-emerald-600/20 shrink-0 mt-0.5 sm:mt-0">
            <Building2 size={24} />
          </div> */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {/* <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                Sede Principal
              </span> */}
              <span className="text-xs text-muted-foreground font-medium">
                · {pitches.length} {pitches.length === 1 ? 'cancha asociada' : 'canchas asociadas'}
              </span>
            </div>

            {editingName ? (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <input
                  type="text"
                  value={newCompanyName}
                  onChange={e => setNewCompanyName(e.target.value)}
                  className="w-full sm:w-auto flex-1 px-3 py-1.5 text-sm sm:text-base font-bold bg-background border border-emerald-500 rounded-lg outline-none"
                  placeholder="Nombre del complejo"
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSaveCompanyName}
                    disabled={savingCompany}
                    className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                    title="Guardar"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingName(false); setNewCompanyName(company?.name || ''); }}
                    className="p-2 bg-secondary text-muted-foreground rounded-lg hover:text-foreground cursor-pointer"
                    title="Cancelar"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-1 min-w-0">
                <h2 className="text-lg sm:text-xl font-black text-foreground capitalize truncate">
                  {company?.name || 'Mi Complejo Deportivo'}
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  className="p-1 text-muted-foreground hover:text-primary transition-colors cursor-pointer shrink-0"
                  title="Editar nombre del complejo"
                >
                  <Edit3 size={14} />
                </button>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Tus canchas se muestran agrupadas bajo este complejo para tus clientes.
            </p>
          </div>
        </div>

        <Link
          href="/dashboard/pitches/new"
          className="btn-primary w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl shrink-0 text-center cursor-pointer"
        >
          <Plus size={16} /> Agregar Cancha a este Complejo
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground">Campos Deportivos</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Listado de canchas disponibles en esta sede.</p>
        </div>
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