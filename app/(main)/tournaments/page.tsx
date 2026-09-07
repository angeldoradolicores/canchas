'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  Trophy, Plus, X, Loader2, CalendarDays, MapPin, Ticket,
  Award, Edit3, Trash2, Upload, Star, Shield, ExternalLink,
  ChevronDown, Search, Crown, Gift, Sparkles, Users, AlertCircle,
  Info, Clock, Target, CheckCircle2, ChevronLeft, ChevronRight, Maximize2
} from 'lucide-react';
import Link from 'next/link';
import { CustomAlertModal, AlertModalState } from '@/components/ui/CustomAlertModal';

interface Tournament {
  id: string;
  name: string;
  description?: string;
  start_date: string;
  registration_end_date?: string;
  final_date?: string;
  location?: string;
  entry_fee: number;
  prize?: string;
  prize_value?: number;
  status: 'active' | 'closed' | 'finished';
  media_urls: string[];
  user_id: string;
  pitch_id?: string;
  created_by_owner: boolean;
  pitches?: {
    id: string;
    name: string;
    image_url?: string;
    media_urls?: string[];
    type?: string;
    companies?: { name: string; zone: string };
  };
}

const EMPTY_FORM = {
  name: '',
  description: '',
  start_date: '',
  registration_end_date: '',
  final_date: '',
  location: '',
  entry_fee: '',
  prize: '',
  prize_value: '',
  pitch_id: '',
  pitch_name: '',
  status: 'active' as 'active' | 'closed' | 'finished',
  media_urls: [] as string[],
};

const STATUS_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  active: { label: 'Inscripciones abiertas', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30', icon: '🟢' },
  closed: { label: 'Cupos llenos', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30', icon: '🟡' },
  finished: { label: 'Finalizado', color: 'bg-secondary text-muted-foreground border-border', icon: '⬛' },
};

// ─── Custom Select Component ────────────────────────────────────────────────
function CustomSelect({ value, onChange, options }: {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string; icon?: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full h-11 px-3 border border-border rounded-xl bg-background text-sm flex items-center justify-between gap-2 hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors outline-none"
      >
        <span className="flex items-center gap-2">
          {selected?.icon && <span>{selected.icon}</span>}
          <span className={selected ? 'text-foreground font-medium' : 'text-muted-foreground'}>{selected?.label || 'Seleccionar...'}</span>
        </span>
        <ChevronDown size={16} className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-secondary transition-colors ${value === opt.value ? 'bg-primary/10 text-primary font-bold' : 'text-foreground'}`}
            >
              {opt.icon && <span>{opt.icon}</span>}
              {opt.label}
              {value === opt.value && <CheckCircle2 size={14} className="ml-auto text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Custom Date Input ──────────────────────────────────────────────────────
function CustomDateInput({ value, onChange, label, required, min }: {
  value: string;
  onChange: (val: string) => void;
  label: string;
  required?: boolean;
  min?: string;
}) {
  return (
    <div className="relative">
      <CalendarDays size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${value ? 'text-primary' : 'text-muted-foreground'}`} />
      <input
        type="date"
        required={required}
        min={min}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-11 pl-9 pr-3 border border-border rounded-xl bg-background text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors cursor-pointer outline-none"
      />
    </div>
  );
}

export default function TournamentsPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed' | 'finished'>('all');

  // Modal de detalle
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ urls: string[]; index: number } | null>(null);

  // Modal crear/editar
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Alert
  const [alertState, setAlertState] = useState<AlertModalState>({ isOpen: false, type: 'info', title: '', message: '' });

  // Pitch autocomplete
  const [pitchQuery, setPitchQuery] = useState('');
  const [pitchResults, setPitchResults] = useState<any[]>([]);
  const [showPitchDropdown, setShowPitchDropdown] = useState(false);

  // Image upload
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().split('T')[0];

  // ── Fetch tournaments ─────────────────────────────────────────────────────
  const fetchTournaments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tournaments');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setTournaments(data.data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTournaments(); }, [fetchTournaments]);

  // ── Pitch autocomplete ────────────────────────────────────────────────────
  useEffect(() => {
    if (pitchQuery.trim().length < 2) { setPitchResults([]); return; }
    const searchPitches = async () => {
      const { data } = await supabase
        .from('pitches')
        .select('id, name, image_url, media_urls, type, companies(name)')
        .ilike('name', `%${pitchQuery}%`)
        .limit(6);
      setPitchResults(data || []);
      setShowPitchDropdown(true);
    };
    const timer = setTimeout(searchPitches, 300);
    return () => clearTimeout(timer);
  }, [pitchQuery, supabase]);

  // ── Image upload ──────────────────────────────────────────────────────────
  const handleImageUpload = async (files: FileList) => {
    if (!files.length) return;
    setUploadingImages(true);
    setFormError('');
    const newUrls: string[] = [];

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop();
      const fileName = `tournaments/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { data, error } = await supabase.storage.from('pitch-images').upload(fileName, file, { upsert: true });
      if (error) {
        setFormError('Error al subir imagen.');
        break;
      } else if (data) {
        const { data: urlData } = supabase.storage.from('pitch-images').getPublicUrl(fileName);
        newUrls.push(urlData.publicUrl);
      }
    }
    if (newUrls.length > 0) setForm(f => ({ ...f, media_urls: [...f.media_urls, ...newUrls] }));
    setUploadingImages(false);
  };

  // ── Open modal ────────────────────────────────────────────────────────────
  const openCreate = () => {
    if (!user) {
      setAlertState({ isOpen: true, type: 'login_required', title: 'Inicia sesión', message: 'Debes iniciar sesión para crear un campeonato.' });
      return;
    }
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPitchQuery('');
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (t: Tournament) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      description: t.description || '',
      start_date: t.start_date,
      registration_end_date: (t as any).registration_end_date || '',
      final_date: (t as any).final_date || '',
      location: t.location || '',
      entry_fee: t.entry_fee?.toString() || '',
      prize: t.prize || '',
      prize_value: t.prize_value?.toString() || '',
      pitch_id: t.pitch_id || '',
      pitch_name: t.pitches?.name || '',
      status: t.status,
      media_urls: t.media_urls || [],
    });
    setPitchQuery(t.pitches?.name || '');
    setFormError('');
    setSelectedTournament(null);
    setShowModal(true);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { setFormError('Debes iniciar sesión.'); return; }
    if (!form.name || !form.start_date) { setFormError('El nombre y fecha de inicio son obligatorios.'); return; }

    setSaving(true);
    setFormError('');

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';

    const payload = {
      user_id: user.id,
      name: form.name,
      description: form.description,
      start_date: form.start_date,
      registration_end_date: form.registration_end_date || null,
      final_date: form.final_date || null,
      location: form.location,
      entry_fee: form.entry_fee,
      prize: form.prize,
      prize_value: form.prize_value,
      pitch_id: form.pitch_id || null,
      media_urls: form.media_urls,
      status: form.status,
      ...(editingId ? { tournament_id: editingId } : {}),
    };

    const res = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: editingId ? 'update_tournament' : 'create_tournament', payload }),
    });
    const data = await res.json();
    setSaving(false);

    if (!data.success) { setFormError(data.error || 'Error al guardar'); return; }
    setShowModal(false);
    fetchTournaments();
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = (id: string) => {
    setAlertState({
      isOpen: true, type: 'warning', title: '¿Eliminar campeonato?',
      message: 'Esta acción es irreversible. Se eliminará el campeonato y todos sus datos.',
      showCancel: true, confirmText: 'Sí, eliminar', cancelText: 'Cancelar',
      onConfirm: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || '';
        await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'delete_tournament', payload: { tournament_id: id, user_id: user?.id } }),
        });
        fetchTournaments();
        setSelectedTournament(null);
      }
    });
  };

  const filtered = statusFilter === 'all' ? tournaments : tournaments.filter(t => t.status === statusFilter);

  return (
    <div className="page-content fade-in max-w-6xl mx-auto">
      <CustomAlertModal alertState={alertState} onClose={() => setAlertState(prev => ({ ...prev, isOpen: false }))} />

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-foreground flex items-center gap-3">
            <Trophy className="text-amber-500" size={32} /> Campeonatos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Torneos organizados por centros deportivos y jugadores.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center justify-center gap-2 bg-primary text-white font-bold px-5 py-3 rounded-xl hover:bg-primary/90 transition-colors shadow-md text-sm"
        >
          <Plus size={18} /> Crear Campeonato
        </button>
      </div>

      {/* ── Status filter tabs ── */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {[
          { key: 'all', label: 'Todos' },
          { key: 'active', label: ' Abiertos' },
          { key: 'closed', label: 'Llenos' },
          { key: 'finished', label: 'Finalizados' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key as any)}
            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${statusFilter === f.key
              ? 'bg-primary text-white border-primary'
              : 'bg-card text-muted-foreground border-border hover:border-primary/50'
              }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-4 mb-6 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-card border border-border rounded-3xl">
          <Trophy size={48} className="mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="font-bold text-lg mb-2">No hay campeonatos {statusFilter !== 'all' ? `con estado "${STATUS_LABELS[statusFilter]?.label}"` : 'aún'}</h3>
          <p className="text-muted-foreground text-sm">
            {user ? '¡Sé el primero en crear un campeonato!' : 'Inicia sesión para crear uno.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(t => {
            const img = t.media_urls?.[0] || t.pitches?.media_urls?.[0] || t.pitches?.image_url;
            const statusStyle = STATUS_LABELS[t.status] || STATUS_LABELS.active;
            const isOwner = user?.id === t.user_id;
            const hasPrizeValue = t.prize_value && t.prize_value > 0;

            return (
              <article
                key={t.id}
                className="group relative bg-card border border-border rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col cursor-pointer"
                onClick={() => setSelectedTournament(t)}
              >
                {t.created_by_owner && (
                  <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-black/25 backdrop-blur-[6px] text-white/85 text-[10px] font-black px-2.5 py-1 rounded-full border border-white/10 tracking-wider uppercase select-none">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 animate-pulse" />

                  </div>

                )}

                {isOwner && (
                  <div className="absolute top-3 right-3 z-10 flex gap-1.5">
                    <button
                      onClick={e => { e.stopPropagation(); openEdit(t); }}
                      className="p-2 bg-white/90 dark:bg-zinc-900/90 rounded-full hover:bg-primary hover:text-white transition-colors shadow-md"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                      className="p-2 bg-white/90 dark:bg-zinc-900/90 rounded-full hover:bg-red-500 hover:text-white transition-colors shadow-md"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}

                <div className="relative h-44 bg-gradient-to-br from-amber-500 via-orange-600 to-rose-600 overflow-hidden">
                  {img ? (
                    <img src={img} alt={t.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Trophy size={56} className="text-white/30" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                  {(t.prize || hasPrizeValue) && (
                    <div className="absolute bottom-3 left-3 right-3">


                    </div>
                  )}
                </div>

                <div className="p-4 flex flex-col gap-2.5 flex-1">
                  <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 backdrop-blur-sm text-white px-3.5 py-2 rounded-xl shadow-md border border-emerald-400/30 transition-all group-hover:scale-105">
                    <Trophy size={13} className="text-emerald-100 flex-shrink-0 animate-pulse" />
                    <span className="font-black text-xs tracking-wide uppercase truncate">
                      {hasPrizeValue ? `Premio: $${Number(t.prize_value).toLocaleString('es-CO')}` : t.prize}
                    </span>
                  </div>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${statusStyle.color}`}>
                      {statusStyle.label}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${statusStyle.color}`}>
                      <CalendarDays size={12} className="shrink-0" />
                      <span>
                        {new Date(t.start_date + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}
                      </span>
                    </span>

                  </div>

                  <h3 className="text-base font-extrabold text-foreground leading-tight">{t.name}</h3>

                  {t.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{t.description}</p>
                  )}

                  {(t.location || t.pitches) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin size={12} className="text-primary flex-shrink-0" />
                      <span className="truncate">{t.pitches?.name || t.location}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t border-border/60 mt-auto justify-between">
                    <div className="flex items-center gap-1.5">
                      <Ticket size={14} className="text-primary flex-shrink-0" />
                      <span className="font-extrabold text-sm text-foreground">
                        {t.entry_fee > 0 ? `$${Number(t.entry_fee).toLocaleString()}` : 'Gratuito'}
                      </span>
                    </div>
                    <span className="text-[10px] text-primary font-bold flex items-center gap-1">Ver más <ExternalLink size={10} /></span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ──────────────── MODAL DETALLE CAMPEONATO ──────────────── */}
      {selectedTournament && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div
            className="bg-card w-full max-w-2xl max-h-[95vh] sm:max-h-[88vh] flex flex-col sm:rounded-3xl shadow-2xl border border-border overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Image Header */}
            <div className="relative h-52 sm:h-64 flex-shrink-0 bg-gradient-to-br from-amber-500 via-orange-600 to-rose-600">
              {(() => {
                const img = selectedTournament.media_urls?.[0] || selectedTournament.pitches?.media_urls?.[0] || selectedTournament.pitches?.image_url;
                return img ? <img src={img} alt={selectedTournament.name} className="w-full h-full object-cover" /> : null;
              })()}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

              {/* Overlay content */}
              {/* <div className="absolute bottom-0 left-0 right-0 p-5">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${STATUS_LABELS[selectedTournament.status]?.color || ''}`}>
                    {STATUS_LABELS[selectedTournament.status]?.icon} {STATUS_LABELS[selectedTournament.status]?.label}
                  </span>
                  {selectedTournament.created_by_owner && (
                    <span className="inline-flex items-center gap-1.5 bg-emerald-950/45 backdrop-blur-md text-emerald-50 text-[10px] font-black px-2.5 py-1 rounded-full border border-emerald-400/20 shadow-sm uppercase tracking-wider">
                      <Shield size={11} className="text-emerald-400 shrink-0" />
                      Cancha Oficial
                    </span>
                  )}

                </div>
                <h2 className="text-2xl font-black text-white leading-tight">{selectedTournament.name}</h2>
              </div> */}

              <button
                onClick={() => setSelectedTournament(null)}
                className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-black/60 text-white rounded-full transition-colors"
              >
                <X size={20} />
              </button>

              {user?.id === selectedTournament.user_id && (
                <button
                  onClick={() => openEdit(selectedTournament)}
                  className="absolute top-4 right-14 p-2 bg-black/40 hover:bg-primary text-white rounded-full transition-colors"
                >
                  <Edit3 size={16} />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-5 space-y-5">
              {/* Prize */}
              {(selectedTournament.prize || (selectedTournament.prize_value && selectedTournament.prize_value > 0)) && (
                <div className="flex items-center gap-3 p-4 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 dark:border-emerald-500/30 rounded-2xl shadow-xs">

                  {/* Contenedor del Icono: Fondo verde translúcido con icono verde intenso */}
                  <div className="w-10 h-10 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Trophy size={20} className="text-emerald-600 dark:text-emerald-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Premio Mayor
                    </p>

                    {/* Texto del Premio: Ajustado a verde esmeralda legible en modo claro y oscuro */}
                    <p className="font-black text-sm sm:text-base text-emerald-700 dark:text-emerald-400 leading-tight">
                      {selectedTournament.prize_value && selectedTournament.prize_value > 0
                        ? `$${Number(selectedTournament.prize_value).toLocaleString('es-CO')} COP`
                        : selectedTournament.prize}
                    </p>

                    {selectedTournament.prize && selectedTournament.prize_value && selectedTournament.prize_value > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5 break-words">
                        {selectedTournament.prize}
                      </p>
                    )}
                  </div>

                </div>
              )}


              {/* Descripción */}
              {selectedTournament.description && (
                <div>
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Descripción</h3>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{selectedTournament.description}</p>
                </div>
              )}

              {/* Dates grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-secondary/50 rounded-xl p-3 border border-border">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CalendarDays size={13} className="text-primary" />
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Inicio del Torneo</p>
                  </div>
                  <p className="font-bold text-sm capitalize">
                    {new Date(selectedTournament.start_date + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>

                {(selectedTournament as any).registration_end_date && (
                  <div className="bg-amber-500/10 rounded-xl p-3 border border-amber-500/20">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock size={13} className="text-amber-500" />
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Fin Inscripciones</p>
                    </div>
                    <p className="font-bold text-sm capitalize">
                      {new Date((selectedTournament as any).registration_end_date + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                )}

                {(selectedTournament as any).final_date && (
                  <div className="bg-primary/10 rounded-xl p-3 border border-primary/20">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Trophy size={13} className="text-primary" />
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Gran Final</p>
                    </div>
                    <p className="font-bold text-sm capitalize">
                      {new Date((selectedTournament as any).final_date + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                )}
              </div>

              {/* Sede y Entry Fee */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                {(selectedTournament.location || selectedTournament.pitches) && (
                  <div className="bg-emerald-50/40 rounded-xl p-3.5 border border-emerald-200/50 shadow-sm flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <MapPin size={13} className="text-emerald-600 shrink-0" />
                      <p className="text-[10px] font-bold text-emerald-800/80 uppercase tracking-wider">Sede</p>
                    </div>
                    {selectedTournament.pitches ? (
                      /* CORRECCIÓN: Quitamos 'truncate' para que el nombre de la cancha se lea completo en varias líneas */
                      <p className="font-extrabold text-sm text-foreground dark:text-emerald-50 leading-tight">
                        {selectedTournament.pitches.name}
                      </p>
                    ) : (
                      /* CORRECCIÓN: Quitamos 'truncate' para que la locación manual se muestre completa siempre */
                      <p className="font-bold text-sm text-foreground dark:text-emerald-50 leading-tight">
                        {selectedTournament.location}
                      </p>
                    )}

                  </div>
                )}

                <div className="bg-emerald-50/40 rounded-xl p-3.5 border border-emerald-200/50 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Ticket size={13} className="text-emerald-600 shrink-0" />
                    <p className="text-[10px] font-bold text-emerald-800/80 uppercase tracking-wider">Inscripción</p>
                  </div>
                  <p className="font-black text-sm text-emerald-700 tracking-tight">
                    {selectedTournament.entry_fee > 0
                      ? `$${Number(selectedTournament.entry_fee).toLocaleString('es-CO')}`
                      : 'Gratuito'}
                  </p>
                </div>
              </div>


              {/* Galería */}
              {selectedTournament.media_urls?.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Galería</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedTournament.media_urls.map((url, i) => (
                      <div
                        key={i}
                        onClick={() => setLightboxImage({ urls: selectedTournament.media_urls, index: i })}
                        className="aspect-square rounded-xl overflow-hidden border border-border cursor-pointer relative group"
                      >
                        <img src={url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                          <Maximize2 size={18} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border flex gap-3 flex-shrink-0 bg-card">
              <button
                onClick={() => setSelectedTournament(null)}
                className="flex-1 py-3 rounded-xl border border-border font-semibold text-sm hover:bg-secondary transition-colors"
              >
                Cerrar
              </button>
              {selectedTournament.pitches && (
                <Link
                  href={`/?pitch=${selectedTournament.pitch_id}`}
                  className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm text-center hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                >
                  <MapPin size={15} /> Ver Cancha
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── LIGHTBOX IMÁGENES ──────────────── */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[9998] bg-black/95 flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setLightboxImage(null)}
        >
          {/* Botón cerrar */}
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-10"
          >
            <X size={22} />
          </button>

          {/* Contador */}
          <div className="absolute top-4 left-4 bg-black/50 text-white text-xs font-bold px-3 py-1.5 rounded-full">
            {lightboxImage.index + 1} / {lightboxImage.urls.length}
          </div>

          {/* Imagen */}
          <img
            src={lightboxImage.urls[lightboxImage.index]}
            alt=""
            className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />

          {/* Botón anterior */}
          {lightboxImage.index > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setLightboxImage(prev => prev ? { ...prev, index: prev.index - 1 } : null); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/25 text-white rounded-full transition-colors"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          {/* Botón siguiente */}
          {lightboxImage.index < lightboxImage.urls.length - 1 && (
            <button
              onClick={e => { e.stopPropagation(); setLightboxImage(prev => prev ? { ...prev, index: prev.index + 1 } : null); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/25 text-white rounded-full transition-colors"
            >
              <ChevronRight size={24} />
            </button>
          )}

          {/* Thumbnails */}
          {lightboxImage.urls.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {lightboxImage.urls.map((url, i) => (
                <button
                  key={i}
                  onClick={e => { e.stopPropagation(); setLightboxImage(prev => prev ? { ...prev, index: i } : null); }}
                  className={`w-10 h-10 rounded-lg overflow-hidden border-2 transition-all ${i === lightboxImage.index ? 'border-white scale-110' : 'border-white/30 opacity-60'}`}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ──────────────── MODAL CREAR / EDITAR ──────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div
            className="bg-card border border-border w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="p-5 border-b border-border flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-black flex items-center gap-2">
                <Trophy size={22} className="text-amber-500" />
                {editingId ? 'Editar Campeonato' : 'Nuevo Campeonato'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-full hover:bg-secondary transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 p-6">
              <form id="tournament-form" onSubmit={handleSave} className="space-y-5">

                {formError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                    <AlertCircle size={14} /> {formError}
                  </div>
                )}

                {/* Name */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Nombre del Campeonato *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Copa Nariño 2026"
                    className="w-full h-11 px-3 border border-border rounded-xl bg-background text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors placeholder:text-muted-foreground"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Descripción</label>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Describe el formato, reglas, categorías..."
                    className="w-full px-3 py-2.5 border border-border rounded-xl bg-background text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors resize-none placeholder:text-muted-foreground"
                  />
                </div>

                {/* Estado */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Estado del Campeonato</label>
                  <CustomSelect
                    value={form.status}
                    onChange={val => setForm(f => ({ ...f, status: val as any }))}
                    options={[
                      { value: 'active', label: 'Inscripciones abiertas', icon: '' },
                      { value: 'closed', label: 'Cupos llenos', icon: '' },
                      { value: 'finished', label: 'Finalizado', icon: '' },
                    ]}
                  />
                </div>

                {/* Fechas */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Fechas del Campeonato</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] font-semibold text-foreground mb-1.5 flex items-center gap-1">
                        <CalendarDays size={12} className="text-primary" /> Fecha de inicio *
                      </p>
                      <CustomDateInput value={form.start_date} onChange={val => setForm(f => ({ ...f, start_date: val }))} label="Inicio" required />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-foreground mb-1.5 flex items-center gap-1">
                        <Clock size={12} className="text-amber-500" /> Fin de inscripciones
                      </p>
                      <CustomDateInput value={form.registration_end_date} onChange={val => setForm(f => ({ ...f, registration_end_date: val }))} label="Fin inscripciones" min={form.start_date} />
                    </div>
                  </div>
                  <div className="max-w-sm">
                    <p className="text-[11px] font-semibold text-foreground mb-1.5 flex items-center gap-1">
                      <Trophy size={12} className="text-primary" /> Fecha de Gran Final <span className="text-muted-foreground font-normal">(opcional)</span>
                    </p>
                    <CustomDateInput value={form.final_date} onChange={val => setForm(f => ({ ...f, final_date: val }))} label="Gran Final" min={form.start_date} />
                  </div>
                </div>

                {/* Pitch autocomplete */}
                <div className="relative">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Cancha sede <span className="text-muted-foreground/60 normal-case font-normal">(opcional)</span>
                  </label>
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={pitchQuery}
                      onChange={e => {
                        setPitchQuery(e.target.value);
                        if (!e.target.value) setForm(f => ({ ...f, pitch_id: '', pitch_name: '' }));
                      }}
                      placeholder="Buscar cancha registrada..."
                      className="w-full h-11 pl-9 pr-3 border border-border rounded-xl bg-background text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors placeholder:text-muted-foreground"
                    />
                  </div>
                  {showPitchDropdown && pitchResults.length > 0 && (
                    <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
                      {pitchResults.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setForm(f => ({ ...f, pitch_id: p.id, pitch_name: p.name }));
                            setPitchQuery(p.name);
                            setPitchResults([]);
                            setShowPitchDropdown(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary text-left transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                            {(p.media_urls?.[0] || p.image_url) && (
                              <img src={p.media_urls?.[0] || p.image_url} alt={p.name} className="w-full h-full object-cover" />
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-sm">{p.name}</p>
                            <p className="text-xs text-muted-foreground">{p.companies?.name || ''} · {p.type}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {form.pitch_id && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1 flex items-center gap-1">
                      Cancha oficial: <strong>{form.pitch_name}</strong>
                    </p>
                  )}
                </div>

                {/* Location */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Ubicación / Dirección</label>
                  <div className="relative">
                    <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={form.location}
                      onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                      placeholder="Calle 18 #25-10"
                      className="w-full h-11 pl-9 pr-3 border border-border rounded-xl bg-background text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors placeholder:text-muted-foreground"
                    />
                  </div>
                </div>

                {/* Entry fee + Prize value */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                      <Ticket size={12} className="inline mr-1" />Inscripción (COP)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">$</span>
                      <input
                        type="number"
                        min="0"
                        value={form.entry_fee}
                        onChange={e => setForm(f => ({ ...f, entry_fee: e.target.value }))}
                        placeholder="0 = Gratis"
                        className="w-full h-11 pl-7 pr-3 border border-border rounded-xl bg-background text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors placeholder:text-muted-foreground"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                      Premio (COP)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">$</span>
                      <input
                        type="number"
                        min="0"
                        value={form.prize_value || ''}
                        onChange={e => setForm(f => ({ ...f, prize_value: e.target.value }))}
                        placeholder="300.000"
                        className="w-full h-11 pl-7 pr-3 border border-border rounded-xl bg-background text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors placeholder:text-muted-foreground"
                      />
                    </div>
                  </div>
                </div>

                {/* Prize description */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    <Gift size={12} className="inline mr-1" />Descripción del Premio
                  </label>
                  <div className="relative">
                    <Gift size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={form.prize}
                      onChange={e => setForm(f => ({ ...f, prize: e.target.value }))}
                      placeholder="Trofeo + Medallas + Camisetas oficiales"
                      className="w-full h-11 pl-9 pr-3 border border-border rounded-xl bg-background text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors placeholder:text-muted-foreground"
                    />
                  </div>
                </div>

                {/* Images */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    <Upload size={12} className="inline mr-1" />Imágenes
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => e.target.files && handleImageUpload(e.target.files)}
                  />
                  <div className="flex flex-wrap gap-2">
                    {form.media_urls.map((url, i) => (
                      <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border group">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, media_urls: f.media_urls.filter((_, j) => j !== i) }))}
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                        >
                          <X size={20} className="text-white" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImages}
                      className="w-20 h-20 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1 hover:border-primary hover:bg-primary/5 transition-all text-muted-foreground"
                    >
                      {uploadingImages ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
                      <span className="text-[10px]">Subir</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-border flex gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 rounded-xl border border-border font-semibold text-sm hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="tournament-form"
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Trophy size={16} />}
                {editingId ? 'Guardar cambios' : 'Crear Campeonato'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
