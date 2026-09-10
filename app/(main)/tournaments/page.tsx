'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  Trophy, Plus, X, Loader2, CalendarDays, MapPin, Ticket,
  Award, Edit3, Trash2, Upload, Star, Shield, ExternalLink,
  ChevronDown, Search, Crown, Gift, Sparkles, Users, AlertCircle,
  Info, Clock, Target, CheckCircle2, ChevronLeft, ChevronRight, Maximize2, LayoutGrid
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
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
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
      isOpen: true,
      type: 'warning',
      title: '¿Eliminar campeonato?',
      message: 'Esta acción es irreversible. Se eliminará el campeonato y todos sus datos.',
      showCancel: true,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      confirmButtonClassName: 'btn-primary bg-secondary text-foreground hover:bg-border flex-1',
      cancelButtonClassName: 'btn-primary bg-red-600 hover:bg-red-700 text-white flex-1 shadow-sm',
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

      {/* ── Contenedor Principal de Controles (Header + Filtros) ── */}
      <div className="bg-[#DCE7DE] border border-[#C8DACB] rounded-3xl p-4 sm:p-6 mb-8 shadow-xs">

        {/* Encabezado: Título y Botón de Acción */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-[#C8DACB]">
          <div>
            <div className="flex items-center gap-2.5">
              <Trophy className="text-[#054D27]" size={26} strokeWidth={2.5} />
              <h1 className="text-2xl sm:text-3xl font-black text-[#054D27] uppercase tracking-tight">
                Campeonatos
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-[#4D715B] font-medium mt-1">
              Explora, regístrate y participa en los torneos y campeonatos organizados por centros deportivos y la comunidad de jugadores.            </p>
          </div>

          <button
            onClick={openCreate}
            className="flex items-center justify-center gap-2 bg-[#008744] hover:bg-[#054D27] text-white font-black px-5 py-3 rounded-xl transition-colors shadow-md text-sm shrink-0"
          >
            <Plus size={18} strokeWidth={3} /> Crear Campeonato
          </button>
        </div>

        {/* Barra de Filtros en una sola línea continua compacta */}
        <div>
          <h2 className="text-[10px] font-extrabold text-[#4D715B] uppercase tracking-wider mb-2 px-1">
            Filtrar por estado
          </h2>

          <div className="bg-[#CDE0D1]/70 border border-[#BACFC0] rounded-2xl p-1 flex items-center gap-1 w-full">
            {[
              { key: 'all', label: 'Todos', showIcon: true },
              { key: 'active', label: 'Abiertos', showIcon: false },
              { key: 'closed', label: 'Llenos', showIcon: false },
              { key: 'finished', label: 'Finalizados', showIcon: false },
            ].map((f) => {
              const isActive = statusFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key as any)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all duration-200 select-none whitespace-nowrap ${isActive
                    ? 'bg-[#DCE7DE] text-[#054D27] shadow-xs border border-[#BACFC0]'
                    : 'text-[#4D715B] hover:text-[#054D27] hover:bg-[#DCE7DE]/50'
                    }`}
                >
                  {f.showIcon && (
                    <LayoutGrid
                      size={13}
                      strokeWidth={2.5}
                      className={isActive ? 'text-[#008744]' : 'text-[#4D715B]'}
                    />
                  )}
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sección de Errores */}
      {error && (
        <div className="p-4 mb-6 bg-red-100 border border-red-200 text-red-800 rounded-2xl flex items-center gap-2.5 text-xs font-bold shadow-xs">
          <AlertCircle size={18} className="shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}


      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={36} className="animate-spin text-[#008744]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 px-4 bg-[#DCE7DE]/50 border border-[#C8DACB] rounded-[2.5rem]">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#CDE0D1] flex items-center justify-center text-[#054D27]">
            <Trophy size={32} />
          </div>
          <h3 className="font-black text-xl text-[#054D27] uppercase tracking-tight mb-1">
            {statusFilter !== 'all'
              ? `No hay campeonatos ${STATUS_LABELS[statusFilter]?.label || ''}`
              : 'No hay campeonatos aún'}
          </h3>
          <p className="text-[#4D715B] text-sm font-medium max-w-sm mx-auto">
            {user ? '¡Sé el primero en crear y publicar un campeonato!' : 'Inicia sesión para registrar tu torneo.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((t) => {
            const img = t.media_urls?.[0] || t.pitches?.media_urls?.[0] || t.pitches?.image_url;
            const isOwner = user?.id === t.user_id;
            const hasPrizeValue = t.prize_value && t.prize_value > 0;

            // ============================================================
            // 1. LÓGICA DE COLORES DIRECTA Y ULTRA ESTRICTA POR ESTADO
            // Usamos t.status directamente ('active', 'closed', 'finished')
            // ============================================================

            const status = t.status || 'active';

            // Configuración POR DEFECTO: Abiertas / Activo (VERDE)
            let statusClasses = {
              bg: 'bg-[#E8F3EB] border-[#008744] shadow-sm',
              text: 'text-[#054D27]',
              dot: 'bg-[#008744] animate-pulse',
              label: 'Inscripciones abiertas', // Texto visible
            };

            // Condición estricta para CUPO LLENO (ROJO/NARANJA FUERTE)
            if (status === 'closed') {
              statusClasses = {
                bg: 'bg-[#FFF0F0] border-red-500 shadow-sm',
                text: 'text-red-700',
                dot: 'bg-red-500',
                label: 'Cupos llenos', // Texto visible
              };
            }
            // Condición estricta para FINALIZADO (GRIS/NEGRO)
            else if (status === 'finished') {
              statusClasses = {
                bg: 'bg-white border-zinc-400 shadow-sm',
                text: 'text-zinc-600',
                dot: 'bg-zinc-500',
                label: 'Finalizado', // Texto visible
              };
            }

            // Usar siempre el label del statusClasses ya calculado
            const visibleLabel = statusClasses.label;

            return (
              <article
                key={t.id}
                onClick={() => setSelectedTournament(t)}
                className="group relative bg-[#DCE7DE] border border-[#C8DACB] rounded-[2rem] overflow-hidden shadow-xs hover:shadow-xl transition-all duration-300 hover:-translate-y-1.5 flex flex-col cursor-pointer select-none"
              >
                {/* Header con Imagen */}
                <div className="relative aspect-[4/4] w-full bg-secondary overflow-hidden">
                  {img ? (
                    <img
                      src={img}
                      alt={t.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#054D27] to-[#002D15] flex flex-col items-center justify-center gap-2 p-4 text-center">
                      <Trophy size={48} className="text-[#00E664]/20" />
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#00E664]/40">
                        Torneo de Fútbol
                      </span>
                    </div>
                  )}

                  {/* Sombra Degradada Inferior */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  {/* Acciones del Propietario */}
                  {isOwner && (
                    <div className="absolute top-3 right-3 z-10 flex gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(t);
                        }}
                        className="p-2 bg-[#DCE7DE]/90 backdrop-blur-md text-[#054D27] rounded-full hover:bg-[#008744] hover:text-white transition-all shadow-md"
                        title="Editar torneo"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(t.id);
                        }}
                        className="p-2 bg-[#DCE7DE]/90 backdrop-blur-md text-red-600 rounded-full hover:bg-red-600 hover:text-white transition-all shadow-md"
                        title="Eliminar torneo"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}

                  {/* Título sobre la imagen */}
                  <div className="absolute bottom-3 left-4 right-4 z-10">
                    <h3 className="text-xl font-black text-white uppercase leading-tight drop-shadow-md truncate">
                      {t.name}
                    </h3>
                  </div>
                </div>

                {/* Cuerpo de la tarjeta */}
                <div className="p-4 flex flex-col gap-3 flex-1 text-[#0F3822]">

                  {/* SECCIÓN SUPERIOR: Badge de Estado Dinámico + Fecha de inicio */}
                  <div className="flex items-center justify-between gap-2">
                    {/* Badge con clases dinámicas garantizadas */}
                    <span
                      className={`inline-flex items-center gap-1.5 border text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider ${statusClasses.bg} ${statusClasses.text}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${statusClasses.dot}`} />
                      {visibleLabel}
                    </span>

                    {t.start_date && (
                      <div className="flex items-center gap-1 text-[11px] font-extrabold text-[#4D715B]">
                        <CalendarDays size={13} className="text-[#0B6637] shrink-0" />
                        <span>
                          Inicio:{' '}
                          <strong className="text-[#054D27]">
                            {new Date(t.start_date + 'T12:00:00').toLocaleDateString('es-CO', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </strong>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* BLOQUE PREMIO MAYOR - SUAVE, ELEGANTE Y DE ALTO CONTRASTE */}
                  <div className="bg-[#CDE0D1] border border-[#BACFC0] rounded-2xl p-3.5 flex items-center gap-3.5 shadow-xs">
                    {/* Caja del Icono en Verde Oscuro Corporativo */}
                    <div className="w-11 h-11 rounded-xl bg-[#054D27] text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Trophy size={22} className="text-[#DCE7DE]" />
                    </div>

                    {/* Contenido del Premio */}
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#4D715B] leading-none mb-1">
                        Premio Mayor
                      </p>
                      <p className="font-black text-xl text-[#054D27] tracking-tight leading-none truncate">
                        {hasPrizeValue
                          ? `$${Number(t.prize_value).toLocaleString('es-CO')} COP`
                          : t.prize || 'Por definir'}
                      </p>
                      {t.prize && Number(t.prize_value || 0) > 0 && (
                        <p className="text-[11px] font-bold text-[#1C412B] truncate mt-0.5">
                          {t.prize}
                        </p>
                      )}

                    </div>
                  </div>

                  {/* Grid de Inscripción y Sede */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Bloque Inscripción */}
                    <div className="bg-[#CDE0D1] border border-[#BACFC0] rounded-2xl p-3 flex flex-col justify-between">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Ticket size={13} className="text-[#0B6637] shrink-0" />
                        <span className="text-[9px] font-extrabold uppercase tracking-wider text-[#4D715B]">
                          Inscripción
                        </span>
                      </div>
                      <p className="font-black text-xs sm:text-sm text-[#054D27] leading-tight">
                        {t.entry_fee > 0
                          ? `$${Number(t.entry_fee).toLocaleString('es-CO')}`
                          : 'Gratuito'}
                      </p>
                    </div>

                    {/* Bloque Sede / Cancha */}
                    <div className="bg-[#CDE0D1] border border-[#BACFC0] rounded-2xl p-3 flex flex-col justify-between">
                      <div className="flex items-center gap-1.5 mb-1">
                        <MapPin size={13} className="text-[#0B6637] shrink-0" />
                        <span className="text-[9px] font-extrabold uppercase tracking-wider text-[#4D715B]">
                          Lugar
                        </span>
                      </div>
                      {t.pitch_id ? (
                        <Link
                          href={`/cancha/${t.pitch_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-black text-xs text-[#054D27] hover:underline uppercase leading-tight line-clamp-2"
                        >
                          {t.pitches?.name}
                        </Link>
                      ) : (
                        <p className="font-black text-xs text-[#054D27] uppercase leading-tight line-clamp-2">
                          {t.location || 'Por definir'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Descripción */}
                  {t.description && (
                    <p className="text-xs text-[#1C412B] font-medium line-clamp-2 leading-relaxed px-1">
                      {t.description}
                    </p>
                  )}

                  {/* Footer de Tarjeta */}
                  {/* <div className="pt-2 border-t border-[#BACFC0] mt-auto flex items-center justify-end">
                    <span className="inline-flex items-center gap-1 text-xs font-black text-[#008744] group-hover:translate-x-1 transition-transform">
                      Ver Torneo <ChevronRight size={15} />
                    </span>
                  </div> */}
                </div>
              </article>
            );
          })}
        </div>
      )}



      {/* ──────────────── MODAL DETALLE CAMPEONATO ──────────────── */}
      {selectedTournament && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setSelectedTournament(null)}
        >
          {/* Tarjeta Flotante Completa */}
          <div
            className="bg-[#DCE7DE] w-full max-w-md max-h-[88vh] flex flex-col rounded-[2.5rem] shadow-2xl overflow-hidden border border-[#C8DACB] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 1. Header Principal */}
            <div className="p-6 pb-3 flex items-start justify-between bg-[#DCE7DE] shrink-0">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#4D715B] mb-0.5">
                  Torneo
                </p>
                <h2 className="text-2xl sm:text-3xl font-black text-[#054D27] uppercase leading-tight tracking-tight">
                  {selectedTournament.name}
                </h2>
              </div>

              <div className="flex items-center gap-1 shrink-0 -mr-1 -mt-1">
                {user?.id === selectedTournament.user_id && (
                  <button
                    type="button"
                    onClick={() => openEdit(selectedTournament)}
                    className="p-2 text-[#054D27] hover:bg-[#CDE0D1] rounded-full transition-colors"
                  >
                    <Edit3 size={18} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedTournament(null)}
                  className="p-2 text-[#054D27] hover:bg-[#CDE0D1] rounded-full transition-colors"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* 2. Cuerpo Desplazable */}
            <div className="overflow-y-auto flex-1 px-5 pb-5 space-y-3 text-[#0F3822]">

              {/* Imagen / Carrusel Embebido */}
              {(() => {
                const mediaUrls =
                  selectedTournament.media_urls?.length > 0
                    ? selectedTournament.media_urls
                    : selectedTournament.pitches?.media_urls ||
                    (selectedTournament.pitches?.image_url
                      ? [selectedTournament.pitches.image_url]
                      : []);

                if (mediaUrls.length === 0) return null;
                const currentImg = mediaUrls[currentImageIdx || 0];

                return (
                  <div className="relative w-full h-80 sm:h-96 md:h-[420px] rounded-3xl overflow-hidden bg-black/40 shrink-0 group select-none shadow-md border border-[#C5E1CB]">
                    {/* Fondo difuminado para rellenar laterales en imágenes verticales */}
                    <img
                      src={currentImg}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-50 pointer-events-none"
                    />

                    {/* Imagen Principal (Mantiene proporciones completas sin recortar) */}
                    <img
                      src={currentImg}
                      alt={selectedTournament.name}
                      onClick={() =>
                        setLightboxImage?.({
                          urls: mediaUrls,
                          index: currentImageIdx || 0,
                        })
                      }
                      className="relative z-10 w-full h-full object-contain cursor-pointer transition-transform duration-300 group-hover:scale-[1.02]"
                    />

                    {/* Controles del Carrusel */}
                    {mediaUrls.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentImageIdx((prev) =>
                              prev === 0 ? mediaUrls.length - 1 : prev - 1
                            );
                          }}
                          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md transition-all shadow-md"
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentImageIdx((prev) =>
                              prev === mediaUrls.length - 1 ? 0 : prev + 1
                            );
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md transition-all shadow-md"
                        >
                          <ChevronRight size={20} />
                        </button>

                        <div className="absolute bottom-3 inset-x-0 z-20 flex items-center justify-center gap-1.5 pointer-events-none">
                          {mediaUrls.map((_: any, i: number) => (
                            <span
                              key={i}
                              className={`h-1.5 rounded-full transition-all duration-300 ${i === (currentImageIdx || 0)
                                ? 'w-6 bg-white shadow-xs'
                                : 'w-1.5 bg-white/50'
                                }`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* Highlight Banner: Premio Mayor */}
              {(selectedTournament.prize ||
                (selectedTournament.prize_value && selectedTournament.prize_value > 0)) && (
                  <div className="bg-[#CDE0D1] border border-[#BACFC0] rounded-2xl p-3.5 flex items-center gap-3.5 shadow-2xs">
                    <div className="w-10 h-10 rounded-full bg-[#008744] text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Trophy size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#4D715B]">
                        Premio Mayor
                      </p>
                      <p className="font-black text-lg text-[#054D27] leading-tight">
                        {selectedTournament.prize_value && selectedTournament.prize_value > 0
                          ? `$${Number(selectedTournament.prize_value).toLocaleString('es-CO')} COP`
                          : selectedTournament.prize}
                      </p>
                      {selectedTournament.prize && Number(selectedTournament.prize_value || 0) > 0 && (
                        <p className="text-[11px] font-bold text-[#1C412B] truncate mt-0.5">
                          {selectedTournament.prize}
                        </p>
                      )}
                    </div>
                  </div>
                )}

              {/* Grid de 2 Columnas: Sede & Inscripción */}
              <div className="grid grid-cols-2 gap-3">
                {(selectedTournament.location || selectedTournament.pitches) && (
                  <div className="bg-[#CDE0D1] border border-[#BACFC0] rounded-2xl p-3.5 flex flex-col justify-between">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <MapPin size={14} className="text-[#0B6637] shrink-0" />
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#4D715B]">
                        Lugar
                      </p>
                    </div>
                    {selectedTournament.pitches ? (
                      <Link
                        href={`/cancha/${selectedTournament.pitch_id}`}
                        title={selectedTournament.pitches.name}
                        className="group font-black text-xs sm:text-sm text-[#054D27] hover:underline flex items-start gap-1 uppercase leading-snug break-words"
                      >
                        <span className="line-clamp-2 transition-colors group-hover:text-[#008744]">
                          {selectedTournament.pitches.name}
                        </span>
                        <ExternalLink size={11} className="shrink-0 mt-0.5" />
                      </Link>
                    ) : (
                      <p
                        title={selectedTournament.location}
                        className="font-black text-xs sm:text-sm text-[#054D27] uppercase leading-snug line-clamp-2 break-words"
                      >
                        {selectedTournament.location}
                      </p>
                    )}
                  </div>
                )}

                {selectedTournament.entry_fee !== undefined && (
                  <div className="bg-[#CDE0D1] border border-[#BACFC0] rounded-2xl p-3.5 flex flex-col justify-between">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Ticket size={14} className="text-[#0B6637] shrink-0" />
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#4D715B]">
                        Inscripción
                      </p>
                    </div>
                    <p className="font-black text-xs sm:text-sm text-[#054D27] leading-tight">
                      {selectedTournament.entry_fee > 0
                        ? `$${Number(selectedTournament.entry_fee).toLocaleString('es-CO')} COP`
                        : 'Gratuito'}
                    </p>
                  </div>
                )}
              </div>

              {/* Bloque de Fechas Reorganizadas */}
              {(selectedTournament.start_date ||
                selectedTournament.registration_end_date ||
                selectedTournament.final_date) && (
                  <div className="bg-[#CDE0D1] border border-[#BACFC0] rounded-2xl p-3.5 space-y-2.5">
                    {selectedTournament.start_date && (
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-[#B8D3BD] flex items-center justify-center shrink-0">
                          <CalendarDays size={15} className="text-[#0B6637]" />
                        </div>
                        <div>
                          <p className="text-[9px] font-extrabold uppercase tracking-wider text-[#4D715B]">
                            Inicio del Torneo
                          </p>
                          <p className="font-black text-xs text-[#054D27] capitalize">
                            {new Date(selectedTournament.start_date + 'T12:00:00').toLocaleDateString(
                              'es-CO',
                              { day: 'numeric', month: 'long', year: 'numeric' }
                            )}
                          </p>
                        </div>
                      </div>
                    )}

                    {selectedTournament.registration_end_date && (
                      <div className="flex items-center gap-3 pt-2 border-t border-[#BACFC0]/60">
                        <div className="w-7 h-7 rounded-full bg-[#B8D3BD] flex items-center justify-center shrink-0">
                          <CalendarDays size={15} className="text-[#0B6637]" />
                        </div>
                        <div>
                          <p className="text-[9px] font-extrabold uppercase tracking-wider text-[#4D715B]">
                            Fecha Límite de Inscripción
                          </p>
                          <p className="font-black text-xs text-[#054D27] capitalize">
                            {new Date(
                              selectedTournament.registration_end_date + 'T12:00:00'
                            ).toLocaleDateString('es-CO', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                    )}

                    {selectedTournament.final_date && (
                      <div className="flex items-center gap-3 pt-2 border-t border-[#BACFC0]/60">
                        <div className="w-7 h-7 rounded-full bg-[#B8D3BD] flex items-center justify-center shrink-0">
                          <CalendarDays size={15} className="text-[#0B6637]" />
                        </div>
                        <div>
                          <p className="text-[9px] font-extrabold uppercase tracking-wider text-[#4D715B]">
                            Fecha de Premiación
                          </p>
                          <p className="font-black text-xs text-[#054D27] capitalize">
                            {new Date(selectedTournament.final_date + 'T12:00:00').toLocaleDateString(
                              'es-CO',
                              { day: 'numeric', month: 'long', year: 'numeric' }
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              {/* Descripción */}
              {selectedTournament.description && (
                <div className="bg-[#CDE0D1] border border-[#BACFC0] rounded-2xl p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#4D715B] mb-1.5">
                    Descripción
                  </p>
                  <p className="text-xs sm:text-sm text-[#1C412B] font-medium leading-relaxed whitespace-pre-wrap">
                    {selectedTournament.description}
                  </p>
                </div>
              )}
            </div>

            {/* 3. Footer Botones */}
            <div className="p-4 bg-[#DCE7DE] flex items-center gap-3 shrink-0 border-t border-[#BACFC0]">
              <button
                type="button"
                onClick={() => setSelectedTournament(null)}
                className="flex-1 py-3 px-4 rounded-full bg-[#CDE0D1] text-[#054D27] font-extrabold text-sm hover:bg-[#BFD7C4] transition-colors flex items-center justify-center gap-2"
              >
                <span className="w-5 h-5 rounded-full bg-[#2D312E] text-white flex items-center justify-center text-[10px] font-bold">
                  N
                </span>
                Cerrar
              </button>

              {selectedTournament.pitch_id && (
                <Link
                  href={`/cancha/${selectedTournament.pitch_id}`}
                  className="flex-1 py-3 px-4 rounded-full bg-[#008744] text-white font-extrabold text-sm hover:bg-[#007339] transition-colors flex items-center justify-center gap-2 shadow-xs"
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
                {/* Función auxiliar para formatear los puntos de miles */}
                {/* Puedes colocarla fuera de tu componente o dentro antes del return */}
                {/* 
  const formatThousands = (val: string | number) => {
    const rawDigits = String(val).replace(/\D/g, '');
    if (!rawDigits) return '';
    return Number(rawDigits).toLocaleString('es-CO');
  };
*/}

                <div className="grid grid-cols-2 gap-4">
                  {/* Campo 1: Inscripción (COP) */}
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                      <Ticket size={12} className="inline mr-1" />Inscripción (COP)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">$</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.entry_fee ? Number(String(form.entry_fee).replace(/\D/g, '')).toLocaleString('es-CO') : ''}
                        onChange={e => {
                          // Extrae únicamente los dígitos numéricos
                          const rawValue = e.target.value.replace(/\D/g, '');
                          setForm(f => ({ ...f, entry_fee: rawValue }));
                        }}
                        placeholder="0 = Gratis"
                        className="w-full h-11 pl-7 pr-3 border border-border rounded-xl bg-background text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors placeholder:text-muted-foreground"
                      />
                    </div>
                  </div>

                  {/* Campo 2: Premio (COP) */}
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                      Premio (COP)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">$</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.prize_value ? Number(String(form.prize_value).replace(/\D/g, '')).toLocaleString('es-CO') : ''}
                        onChange={e => {
                          // Extrae únicamente los dígitos numéricos
                          const rawValue = e.target.value.replace(/\D/g, '');
                          setForm(f => ({ ...f, prize_value: rawValue }));
                        }}
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
