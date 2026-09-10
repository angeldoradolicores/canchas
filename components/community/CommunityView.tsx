'use client';

import { useEffect, useState, useMemo, Activity } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useToday, BOOKING_HOURS } from '@/lib/use-today';
import { CustomAlertModal, AlertModalState } from '@/components/ui/CustomAlertModal';
import { CustomMonthCalendar } from '@/components/explore/CustomMonthCalendar';
import { PitchCard, PitchData } from '@/components/ui/PitchCard';
import {
  Users, Trophy, Swords, Plus, Loader2, Search,
  UserCheck, Shield, CalendarDays, Clock3,
  Pencil, Trash2, MapPin, X, Flame, ChevronRight, ChevronDown,
  Clock3Icon,
  CalendarIcon
} from 'lucide-react';

type Tab = 'retos' | 'buscar-jugador' | 'buscar-equipo';

// ── Componente principal ────────────────────────────────────────────────────
export function CommunityView() {
  const [activeTab, setActiveTab] = useState<Tab>('retos');
  const [alertState, setAlertState] = useState<AlertModalState>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
  });

  const showAlert = (type: AlertModalState['type'], title: string, message: string, onConfirm?: () => void) => {
    setAlertState({ isOpen: true, type, title, message, onConfirm });
  };

  const closeAlert = () => setAlertState(prev => ({ ...prev, isOpen: false }));

  return (
    <section className="page-content fade-in">
      <CustomAlertModal alertState={alertState} onClose={closeAlert} />

      {/* Header */}
      <div className="page-heading mb-6">
        <div>
          <p className="eyebrow accent-label">COMUNIDAD</p>
          <h1>Juega con tu gente</h1>
          <p className="lead">Forma equipo, reta rivales o únete a una convocatoria cerca de ti.</p>
        </div>
      </div>

      {/* Tabs Premium */}
      <div className="flex gap-2 mb-8 p-1.5 bg-secondary rounded-2xl border border-border w-fit">
        {[
          { id: 'retos' as Tab, label: 'Retos', icon: Trophy },
          { id: 'buscar-jugador' as Tab, label: 'Buscar Jugador', icon: UserCheck },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === id
              ? 'bg-primary text-white shadow-md'
              : 'text-muted-foreground hover:text-foreground hover:bg-card'
              }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'retos' && <RetosTab showAlert={showAlert} />}
      {activeTab === 'buscar-jugador' && <BuscarJugadorTab showAlert={showAlert} />}
      {activeTab === 'buscar-equipo' && <BuscarEquipoTab showAlert={showAlert} />}
    </section>
  );
}

// ── TAB: RETOS ──────────────────────────────────────────────────────────────
function RetosTab({ showAlert }: { showAlert: (type: AlertModalState['type'], title: string, msg: string, onConfirm?: () => void) => void }) {
  const [challenges, setChallenges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [contacted, setContacted] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState<any | null>(null);
  const [previewPitch, setPreviewPitch] = useState<any | null>(null);

  // Filtros
  const [filterUrgent, setFilterUrgent] = useState(false);
  const [filterZone, setFilterZone] = useState('Todas');
  const [filterLevel, setFilterLevel] = useState('todos');
  const [filterDate, setFilterDate] = useState<'todas' | 'hoy' | 'pasados_3' | 'pasados_7' | 'historial'>('todas');
  const [openDropdown, setOpenDropdown] = useState<'zone' | 'level' | 'date' | null>(null);


  const { user, profile } = useAuth();
  const supabase = createClient();

  useEffect(() => {
    if (user) {
      try {
        const stored = localStorage.getItem(`contacted_challenges_${user.id}`);
        if (stored) setContacted(JSON.parse(stored));
      } catch (e) { }
    }
    fetchChallenges();
  }, [user]);

  const markAsContacted = (id: string) => {
    setContacted(prev => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      if (user) {
        try { localStorage.setItem(`contacted_challenges_${user.id}`, JSON.stringify(next)); } catch (e) { }
      }
      return next;
    });
  };

  const fetchChallenges = async () => {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('challenges')
      .select(`
        *,
        profiles(full_name, skill_level, preferred_foot, phone),
        pitches(*, companies(*))
      `)
      .eq('status', 'open')
      .eq('players_needed', 0) // Retos de equipo vs equipo
      .gte('created_at', oneWeekAgo)
      .order('created_at', { ascending: false });
    setChallenges(data || []);
    setLoading(false);
  };

  const joinChallenge = async (challenge: any) => {
    if (!user) {
      return showAlert('login_required', 'Iniciar Sesión', 'Debes iniciar sesión para unirte a este reto.');
    }

    try {
      await supabase.from('notifications').insert({
        user_id: challenge.creator_id,
        sender_id: user.id,
        title: '⚽ ¡Alguien aceptó tu Reto!',
        message: `${profile?.full_name || 'Un jugador'} se ha ofrecido para tu reto del ${new Date(challenge.date + 'T12:00:00').toLocaleDateString('es-CO')} a las ${challenge.time}.`,
        type: 'challenge_join',
      });

      markAsContacted(challenge.id);

      const phone = challenge.profiles?.phone;
      if (phone) {
        const pitchName = challenge.pitches?.name || challenge.custom_pitch_name || 'una cancha';
        const dateStr = new Date(challenge.date + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' });
        const text = `¡Hola ${challenge.profiles?.full_name || 'jugador'}! Vi tu convocatoria en Canchas Pasto para el ${dateStr} a las ${challenge.time} en ${pitchName} y quiero unirme.`;

        const cleanPhone = phone.replace(/\\D/g, '');
        const formattedPhone = cleanPhone.length === 10 ? `57${cleanPhone}` : cleanPhone;

        window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`, '_blank');
      } else {
        showAlert('success', '¡Notificación Enviada!', 'El creador del reto ha sido notificado. (Su número no es público)');
      }
    } catch (e: any) {
      showAlert('error', 'Error', e.message || 'No se pudo enviar la solicitud.');
    }
  };

  const deleteChallenge = async (id: string) => {
    showAlert('warning', 'Eliminar Reto', '¿Estás seguro de eliminar este reto?', async () => {
      try {
        const res = await fetch('/api/community-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'delete_challenge',
            payload: { challenge_id: id, user_id: user?.id }
          })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          setChallenges(prev => prev.filter(c => c.id !== id));
          showAlert('success', 'Reto Eliminado', 'El reto ha sido eliminado con éxito.');
        } else {
          throw new Error(data.error || 'No se pudo eliminar el reto.');
        }
      } catch (err: any) {
        showAlert('error', 'Error', err.message);
      }
    });
  };

  const filtered = challenges.filter(c => {
    const matchesUrgent = !filterUrgent || c.is_urgent === true;
    const matchesZone = filterZone === 'Todas' || (c.pitches?.companies?.zone || c.location_zone || 'Todas') === filterZone;
    const matchesLevel = filterLevel === 'todos' || c.level === filterLevel;

    let matchesDate = true;
    if (filterDate !== 'todas') {
      const challengeDate = new Date(c.date + 'T12:00:00');
      challengeDate.setHours(0, 0, 0, 0); // Normalizamos la hora de la reserva/desafío

      const today = new Date();
      today.setHours(0, 0, 0, 0); // Normalizamos la hora actual

      // Calculamos la diferencia: HOY menos el día del desafío (Días pasados darán positivo)
      const diffTime = today.getTime() - challengeDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (filterDate === 'hoy') {
        matchesDate = diffDays === 0;
      } else if (filterDate === 'pasados_3') {
        // Que sea del pasado (>= 0) pero hace 3 días o menos (<= 3)
        matchesDate = diffDays >= 0 && diffDays <= 3;
      } else if (filterDate === 'pasados_7') {
        // Que sea del pasado (>= 0) pero hace 7 días o menos (<= 7)
        matchesDate = diffDays >= 0 && diffDays <= 7;
      } else if (filterDate === 'historial') {
        // Cualquier día que tenga más de 7 días de antigüedad
        matchesDate = diffDays > 7;
      }
    }

    return matchesUrgent && matchesZone && matchesLevel && matchesDate;

  });

  if (loading) return <div className="py-20 flex justify-center"><Loader2 size={32} className="animate-spin text-primary" /></div>;

  return (
    <div className="max-w-4xl">
      {/* Pitch Preview Modal */}
      {previewPitch && <PitchPreviewModal pitch={previewPitch} onClose={() => setPreviewPitch(null)} />}
      <div className="p-5 bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 rounded-2xl mb-6">
        <h3 className="font-bold text-base mb-1">⚽ Retos y Partidos</h3>
        <p className="text-sm text-muted-foreground">
          ¿Tu equipo está listo para jugar? Desafía a otros grupos, acuerda el nivel y organiza un partido competitivo.
        </p>
      </div>
      {/* Fila 2: Botón Principal */}
      <button
        type="button"
        onClick={() => {
          if (!user) return showAlert('login_required', 'Iniciar Sesión', 'Debes iniciar sesión para crear un reto.');
          setEditingChallenge(null);
          setShowForm(!showForm);
        }}
        className="btn-primary text-xs h-10 py-2 px-4 flex items-center justify-center gap-2 w-full font-bold"
      >
        <Plus size={15} /> Crear reto
      </button>
      {/* Barra de Filtros */}
      <div className="p-3.5 bg-card border border-border rounded-2xl mb-6 shadow-sm flex flex-col gap-3">
        {/* Fila 1: Filtros organizados proporcionalmente */}
        <div className="grid grid-cols-3 gap-2">
          {/* Filtro Urgente */}
          <button
            type="button"
            onClick={() => setFilterUrgent(!filterUrgent)}
            className={`h-9 px-2 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 border ${filterUrgent
              ? 'bg-red-500 text-white border-red-500 shadow-sm'
              : 'bg-secondary text-muted-foreground border-transparent'
              }`}
          >
            <Flame size={13} />
            <span className="truncate">Urgente</span>
          </button>

          {/* Filtro Fecha (Dropdown) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'date' ? null : ('date' as any))}
              className="w-full h-9 px-2 border border-border rounded-xl bg-card text-[11px] font-semibold flex items-center justify-between outline-none"
            >
              <span className="truncate">
                {filterDate === 'todas' ? 'Fechas' : filterDate === 'hoy' ? 'Hoy' : 'Filtrado'}
              </span>
              <ChevronDown size={13} className="text-muted-foreground shrink-0" />
            </button>

            {openDropdown === ('date' as any) && (
              <div className="absolute top-10 left-0 w-44 p-2 bg-card border border-border rounded-xl shadow-xl z-50 flex flex-col gap-1">
                {[
                  { val: 'todas', label: 'Todas las fechas' },
                  { val: 'hoy', label: 'Hoy' },
                  { val: 'pasados_3', label: 'Últimos 3 días' },
                  { val: 'pasados_7', label: 'Últimos 7 días' },
                ].map((dt) => (
                  <button
                    key={dt.val}
                    type="button"
                    onClick={() => {
                      setFilterDate(dt.val as any);
                      setOpenDropdown(null);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-bold text-left ${filterDate === dt.val ? 'bg-primary text-white' : 'text-foreground hover:bg-primary/10'
                      }`}
                  >
                    {dt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filtro Nivel (Dropdown) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'level' ? null : 'level')}
              className="w-full h-9 px-2 border border-border rounded-xl bg-card text-[11px] font-semibold flex items-center justify-between outline-none"
            >
              <span className="truncate">
                {filterLevel === 'todos' ? 'Nivel' : filterLevel}
              </span>
              <ChevronDown size={13} className="text-muted-foreground shrink-0" />
            </button>

            {openDropdown === 'level' && (
              <div className="absolute top-10 right-0 w-40 p-2 bg-card border border-border rounded-xl shadow-xl z-50 flex flex-col gap-1">
                {[
                  { val: 'todos', label: 'Todos los niveles' },
                  { val: 'recreativo', label: 'Recreativo' },
                  { val: 'competitivo', label: 'Competitivo' },
                  { val: 'profesional', label: 'Profesional' },
                ].map((lvl) => (
                  <button
                    key={lvl.val}
                    type="button"
                    onClick={() => {
                      setFilterLevel(lvl.val);
                      setOpenDropdown(null);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-bold text-left ${filterLevel === lvl.val ? 'bg-primary text-white' : 'text-foreground hover:bg-primary/10'
                      }`}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>


      </div>

      {/* Formulario Modal Crear / Editar Reto */}
      {(showForm || editingChallenge) && (
        <ChallengeFormModal
          key={editingChallenge?.id || 'new-challenge'}
          editingItem={editingChallenge}
          showAlert={showAlert}
          isConvocatoria={false}
          onClose={() => {
            setShowForm(false);
            setEditingChallenge(null);
          }}
          onSuccess={() => {
            setShowForm(false);
            setEditingChallenge(null);
            fetchChallenges();
          }}
        />
      )}

      {/* Lista de Retos */}
      {filtered.length === 0 && !showForm && !editingChallenge ? (
        <EmptyState icon={<Trophy size={16} />} title="No hay retos que coincidan" desc="Ajusta los filtros o sé el primero en crear un reto." />
      ) : (
        <div className="grid gap-4">
          {filtered.map(c => {
            const isOwner = c.creator_id === user?.id;
            return (
              <div key={c.id} className="p-5 bg-card border border-border rounded-2xl shadow-sm hover:border-primary/40 transition-all">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center text-primary flex-shrink-0">
                        <Trophy size={16} />
                      </div>
                      <span className="font-bold capitalize">{c.profiles?.full_name || 'Jugador'}</span>                      <LevelBadge level={c.level} />
                      {c.is_urgent && (
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold animate-pulse flex items-center gap-1">
                          <Flame size={11} /> Urgente
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarDays size={13} /> {new Date(c.date + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock3 size={13} /> {c.time}
                      </span>
                    </div>

                    {/* Botón o Nombre de Cancha */}
                    <div className="pt-1">
                      {c.pitches ? (
                        <button
                          type="button"
                          onClick={() => setPreviewPitch(c.pitches)}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all border border-emerald-200/80 shadow-sm cursor-pointer"
                        >
                          🏟️ {c.pitches.name.toUpperCase()}  <span className="text-[10px] text-emerald-600 font-semibold">(Ver cancha)</span>
                        </button>
                      ) : (
                        <span className="px-3 py-1.5 bg-secondary text-foreground rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border border-border">
                          📍 CANCHA: {c.custom_pitch_name || 'Por definir'.toUpperCase()}
                        </span>
                      )}
                    </div>

                    {c.message && (
                      <div className="mt-2 p-2.5 rounded-xl bg-secondary/60 border border-border/70 text-xs flex items-start gap-2">
                        <span className="text-primary text-sm shrink-0 leading-none">💬</span>
                        <p className="text-foreground/90 italic leading-relaxed break-words">{c.message}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                    {isOwner ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingChallenge(c)}
                          className="p-2 text-primary hover:bg-primary/10 rounded-xl transition-colors"
                          title="Editar reto"
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteChallenge(c.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                          title="Eliminar reto"
                        >
                          <Trash2 size={17} />
                        </button>
                      </>
                    ) : contacted.includes(c.id) ? (
                      <span className="bg-green-100 text-green-800 font-medium text-xs py-2.5 px-4 w-full sm:w-auto rounded-lg transition-colors
">
                        Ya solicitaste unirte a este reto
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => joinChallenge(c)}
                        className="btn-primary text-xs py-2.5 px-4 w-full sm:w-auto"
                      >
                        Unirme
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── TAB: BUSCAR JUGADOR (Convocatorias) ────────────────────────────────────
function BuscarJugadorTab({ showAlert }: { showAlert: (type: AlertModalState['type'], title: string, msg: string, onConfirm?: () => void) => void }) {
  const [convocatorias, setConvocatorias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [contacted, setContacted] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [previewPitch, setPreviewPitch] = useState<any | null>(null);
  const [openDropdown, setOpenDropdown] = useState<'zone' | 'level' | 'date' | null>(null);

  // Filtros
  const [filterUrgent, setFilterUrgent] = useState(false);
  const [filterZone, setFilterZone] = useState('Todas');
  const [filterLevel, setFilterLevel] = useState('todos');
  const [filterDate, setFilterDate] = useState('todas');
  const { user, profile } = useAuth();
  const supabase = createClient();

  useEffect(() => {
    if (user) {
      try {
        const stored = localStorage.getItem(`contacted_challenges_${user.id}`);
        if (stored) setContacted(JSON.parse(stored));
      } catch (e) { }
    }
    fetchConvocatorias();
  }, [user]);

  const markAsContacted = (id: string) => {
    setContacted(prev => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      if (user) {
        try { localStorage.setItem(`contacted_challenges_${user.id}`, JSON.stringify(next)); } catch (e) { }
      }
      return next;
    });
  };

  const fetchConvocatorias = async () => {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('challenges')
      .select(`
        *,
        profiles(full_name, skill_level, preferred_foot, phone),
        pitches(*, companies(*))
      `)
      .eq('status', 'open')
      .gt('players_needed', 0)
      .order('created_at', { ascending: false });
    setConvocatorias(data || []);
    setLoading(false);
  };

  const handleOffer = async (c: any) => {
    if (!user) {
      return showAlert('login_required', 'Iniciar Sesión', 'Debes iniciar sesión para ofrecerte como jugador.');
    }

    try {
      await supabase.from('notifications').insert({
        user_id: c.creator_id,
        sender_id: user.id,
        title: '✋ ¡Alguien se ofreció para tu partido!',
        message: `${profile?.full_name || 'Un jugador'} se ha ofrecido para completar tu convocatoria del ${new Date(c.date + 'T12:00:00').toLocaleDateString('es-CO')} a las ${c.time}.`,
        type: 'player_offer',
      });

      markAsContacted(c.id);

      const phone = c.profiles?.phone;
      if (phone) {
        const pitchName = c.pitches?.name || c.custom_pitch_name || 'una cancha';
        const dateStr = new Date(c.date + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' });
        const text = `¡Hola ${c.profiles?.full_name || 'organizador'}! Vi tu convocatoria en Canchas Pasto para el ${dateStr} a las ${c.time} en ${pitchName} y quiero ofrecerme para jugar.`;

        const cleanPhone = phone.replace(/\D/g, '');
        const formattedPhone = cleanPhone.length === 10 ? `57${cleanPhone}` : cleanPhone;

        window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`, '_blank');
      } else {
        showAlert('success', '¡Postulación Enviada!', 'El organizador del partido ha sido notificado. (Su número no es público)');
      }
    } catch (e: any) {
      showAlert('error', 'Error', e.message || 'No se pudo enviar tu postulación.');
    }
  };

  const deleteConvocatoria = async (id: string) => {
    showAlert('warning', 'Eliminar Convocatoria', '¿Estás seguro de eliminar esta convocatoria?', async () => {
      const { error } = await supabase.from('challenges').delete().eq('id', id);
      if (!error) {
        setConvocatorias(prev => prev.filter(c => c.id !== id));
        showAlert('success', 'Eliminada', 'Convocatoria eliminada con éxito.');
      } else {
        showAlert('error', 'Error', error.message || 'No se pudo eliminar.');
      }
    });
  };

  const filtered = convocatorias.filter(c => {
    const matchesUrgent = !filterUrgent || c.is_urgent === true;
    const matchesZone = filterZone === 'Todas' || (c.pitches?.companies?.zone || c.location_zone || 'Todas') === filterZone;
    const matchesLevel = filterLevel === 'todos' || c.level === filterLevel;

    let matchesDate = true;
    if (filterDate !== 'todas') {
      const challengeDate = new Date(c.date + 'T12:00:00');
      challengeDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today.getTime() - challengeDate.getTime()) / (1000 * 60 * 60 * 24));
      if (filterDate === 'hoy') matchesDate = diffDays === 0;
      else if (filterDate === 'pasados_3') matchesDate = diffDays >= 0 && diffDays <= 3;
      else if (filterDate === 'pasados_7') matchesDate = diffDays >= 0 && diffDays <= 7;
      else if (filterDate === 'historial') matchesDate = diffDays > 7;
    }

    return matchesUrgent && matchesZone && matchesLevel && matchesDate;
  });

  if (loading) return <div className="py-16 flex justify-center"><Loader2 size={32} className="animate-spin text-primary" /></div>;

  return (
    <div className="max-w-4xl">
      {/* Pitch Preview Modal */}
      {previewPitch && <PitchPreviewModal pitch={previewPitch} onClose={() => setPreviewPitch(null)} />}

      <div className="p-5 bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 rounded-2xl mb-6">
        <h3 className="font-bold text-base mb-1">🔍 Convocatorias de jugadores</h3>
        <p className="text-sm text-muted-foreground">
          ¿Tienes un partido reservado pero te falta gente? Publica aquí y encuentra los jugadores exactos que necesitas.
        </p>
      </div>
      {/* Fila 2 (Móvil) / Derecha (Desktop): Botón de Acción Principal */}
      <button
        type="button"
        onClick={() => {
          if (!user)
            return showAlert(
              'login_required',
              'Iniciar Sesión',
              'Debes iniciar sesión para publicar una convocatoria.'
            );
          setEditingItem(null);
          setShowForm(!showForm);
        }}
        className="btn-primary text-xs h-10 sm:h-9 py-2 px-4 flex items-center justify-center gap-2 w-full sm:w-auto font-bold shrink-0"
      >
        <Plus size={15} /> Necesito un jugador
      </button>

      <div className="p-3.5 bg-card border border-border rounded-2xl mb-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Fila 1: Filtros distribuidos equitativamente en 3 columnas en móvil */}
        <div className="grid grid-cols-3 gap-2 w-full sm:w-auto sm:flex sm:items-center">

          {/* Filtro Urgente / Por Empezar */}
          <button
            type="button"
            onClick={() => setFilterUrgent(!filterUrgent)}
            className={`h-9 px-2 sm:px-3 rounded-xl text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 border ${filterUrgent
              ? 'bg-red-500 text-white border-red-500 shadow-sm'
              : 'bg-secondary text-muted-foreground border-transparent hover:border-red-300'
              }`}
          >
            <Flame size={14} className="shrink-0" />
            <span className="truncate">Urgente</span>
          </button>

          {/* Filtro Fecha (Dropdown) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'date' ? null : ('date' as any))}
              className="w-full sm:w-auto h-9 px-2 sm:px-3 border border-border rounded-xl bg-card text-[11px] sm:text-xs font-semibold flex items-center justify-between sm:justify-start gap-1.5 outline-none focus:border-primary hover:border-primary/40"
            >
              <span className="truncate">
                {filterDate === 'todas'
                  ? 'Fechas'
                  : filterDate === 'hoy'
                    ? 'Hoy'
                    : filterDate === 'pasados_3'
                      ? '3 días'
                      : filterDate === 'pasados_7'
                        ? '7 días'
                        : 'Antiguo'}
              </span>
              <ChevronDown
                size={14}
                className={`transition-transform text-muted-foreground shrink-0 ${openDropdown === ('date' as any) ? 'rotate-180' : ''
                  }`}
              />
            </button>

            {openDropdown === ('date' as any) && (
              <div className="absolute top-10 left-0 w-44 p-2 bg-card border border-border rounded-xl shadow-xl z-50 flex flex-col gap-1 animate-in fade-in slide-in-from-top-1">
                {[
                  { val: 'todas', label: 'Todas las fechas' },
                  { val: 'hoy', label: 'Hoy' },
                  { val: 'pasados_3', label: 'Últimos 3 días' },
                  { val: 'pasados_7', label: 'Últimos 7 días' },
                ].map((dt) => (
                  <button
                    key={dt.val}
                    type="button"
                    onClick={() => {
                      setFilterDate(dt.val as any);
                      setOpenDropdown(null);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-bold text-left transition-all ${filterDate === dt.val
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-foreground hover:bg-primary/10 hover:text-primary'
                      }`}
                  >
                    {dt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filtro Nivel (Dropdown) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'level' ? null : 'level')}
              className="w-full sm:w-auto h-9 px-2 sm:px-3 border border-border rounded-xl bg-card text-[11px] sm:text-xs font-semibold flex items-center justify-between sm:justify-start gap-1.5 outline-none focus:border-primary hover:border-primary/40"
            >
              <span className="truncate capitalize">
                {filterLevel === 'todos' ? 'Nivel' : filterLevel}
              </span>
              <ChevronDown
                size={14}
                className={`transition-transform text-muted-foreground shrink-0 ${openDropdown === 'level' ? 'rotate-180' : ''
                  }`}
              />
            </button>

            {openDropdown === 'level' && (
              <div className="absolute top-10 right-0 sm:right-auto sm:left-0 w-40 p-2 bg-card border border-border rounded-xl shadow-xl z-50 flex flex-col gap-1 animate-in fade-in slide-in-from-top-1">
                {[
                  { val: 'todos', label: 'Todos los niveles' },
                  { val: 'recreativo', label: 'Recreativo' },
                  { val: 'competitivo', label: 'Competitivo' },
                  { val: 'profesional', label: 'Profesional' },
                ].map((lvl) => (
                  <button
                    key={lvl.val}
                    type="button"
                    onClick={() => {
                      setFilterLevel(lvl.val);
                      setOpenDropdown(null);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-bold text-left transition-all ${filterLevel === lvl.val
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-foreground hover:bg-primary/10 hover:text-primary'
                      }`}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>


      </div>
      {(showForm || editingItem) && (
        <ChallengeFormModal
          key={editingItem?.id || 'new-convocatoria'}
          editingItem={editingItem}
          showAlert={showAlert}
          isConvocatoria={true}
          onClose={() => {
            setShowForm(false);
            setEditingItem(null);
          }}
          onSuccess={() => {
            setShowForm(false);
            setEditingItem(null);
            fetchConvocatorias();
          }}
        />
      )}

      {filtered.length === 0 && !showForm && !editingItem ? (
        <EmptyState icon={UserCheck} title="No hay convocatorias encontradas" desc="Prueba cambiar los filtros o publica la primera." />
      ) : (
        <div className="grid gap-4">
          {filtered.map(c => {
            const isOwner = c.creator_id === user?.id;
            return (
              <div key={c.id} className="p-5 bg-card border border-border rounded-2xl hover:border-primary/40 hover:shadow-sm transition-all">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center text-primary flex-shrink-0"><Users size={15} /></div>
                      {/* <span className="font-bold">{c.profiles?.full_name || 'Jugador'}</span> */}
                      <span className="font-bold capitalize">{c.profiles?.full_name || 'Jugador'}</span>
                      <span className="text-muted-foreground text-xs">necesita</span>
                      <span className="font-bold text-primary">{c.players_needed} jugador{c.players_needed > 1 ? 'es' : ''}</span>
                      {c.is_urgent && (
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold animate-pulse flex items-center gap-1">
                          <Flame size={11} /> Urgente
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span><CalendarIcon size={15} /> {new Date(c.date + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                      <span><Clock3Icon size={15} /> {c.time}</span>
                      <LevelBadge level={c.level} />
                    </div>

                    <div className="pt-1">
                      {c.pitches ? (
                        <button
                          type="button"
                          onClick={() => setPreviewPitch(c.pitches)}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all border border-emerald-200/80 shadow-sm cursor-pointer"
                        >
                          🏟️ {c.pitches.name.toUpperCase()}  <span className="text-[10px] text-emerald-600 font-semibold">(Ver cancha )</span>
                        </button>
                      ) : (
                        <span className="px-3 py-1.5 bg-secondary text-foreground rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border border-border">
                          📍 CANCHA: {c.custom_pitch_name || 'POR DEFINIR'.toUpperCase()}
                        </span>
                      )}
                    </div>

                    {c.message && (
                      <div className="mt-2 p-2.5 rounded-xl bg-secondary/60 border border-border/70 text-xs flex items-start gap-2">
                        <span className="text-primary text-sm shrink-0 leading-none">💬</span>
                        <p className="text-foreground/90 italic leading-relaxed break-words">{c.message}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                    {isOwner ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingItem(c)}
                          className="p-2 text-primary hover:bg-primary/10 rounded-xl transition-colors"
                          title="Editar"
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteConvocatoria(c.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={17} />
                        </button>
                      </>
                    ) : contacted.includes(c.id) ? (
                      <span className="bg-green-100 text-green-800 font-medium text-xs py-2.5 px-4 w-full sm:w-auto rounded-lg transition-colors
">
                        Ya te postulaste a esta convocatoria
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOffer(c)}
                        className="btn-primary text-xs py-2.5 px-4 w-full sm:w-auto"
                      >
                        Me ofrezco
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── FORMULARIO MODAL CREAR / EDITAR CON SELECTORES AVANZADOS DE FECHA Y HORA ──
function ChallengeFormModal({
  editingItem,
  isConvocatoria,
  onClose,
  onSuccess,
  showAlert,
}: {
  editingItem?: any;
  isConvocatoria: boolean;
  onClose: () => void;
  onSuccess: () => void;
  showAlert: (type: AlertModalState['type'], title: string, msg: string) => void;
}) {
  const today = useToday();
  const [date, setDate] = useState(editingItem?.date || '');
  const [time, setTime] = useState(editingItem?.time || '');
  const [level, setLevel] = useState(editingItem?.level || 'cualquiera');
  const [playersNeeded, setPlayersNeeded] = useState(editingItem?.players_needed ?? (isConvocatoria ? 1 : 0));
  const [isUrgent, setIsUrgent] = useState(editingItem?.is_urgent ?? false);
  const [locationZone, setLocationZone] = useState(editingItem?.location_zone || 'Todas');
  const [customPitchName, setCustomPitchName] = useState(editingItem?.custom_pitch_name || '');
  const [message, setMessage] = useState(editingItem?.message || '');
  const [loading, setLoading] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showAllHours, setShowAllHours] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<'zone' | 'level' | 'players' | null>(null);

  const [pitchId, setPitchId] = useState(editingItem?.pitch_id || '');
  const [pitchQuery, setPitchQuery] = useState(editingItem?.pitches?.name || editingItem?.custom_pitch_name || '');
  const [pitchSuggestions, setPitchSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { user, profile, ensureProfile } = useAuth();
  const supabase = createClient();

  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (profile?.phone && !phone) setPhone(profile.phone);
  }, [profile]);

  useEffect(() => {
    if (today && !date) setDate(today);
  }, [today]);

  // Próximas 6 fechas rápidas desde hoy
  const nextDays = useMemo(() => {
    if (!today) return [];
    const days = [];
    const base = new Date(today + 'T12:00:00');
    for (let i = 0; i < 6; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = i === 0 ? 'Hoy' : d.toLocaleDateString('es-CO', { weekday: 'short' });
      const dayNumber = d.getDate();
      const monthName = d.toLocaleDateString('es-CO', { month: 'short' });
      days.push({ dateStr, dayName, dayNumber, monthName, isToday: i === 0 });
    }
    return days;
  }, [today]);

  // Formatos de horas para el selector tipo Grid (12h y 24h)
  const timeSlots = useMemo(() => {
    return BOOKING_HOURS.map(h => {
      const [hourStr] = h.split(':');
      const hourNum = parseInt(hourStr, 10);
      const period = hourNum >= 12 ? 'pm' : 'am';
      const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;
      return {
        value24: h,
        label12: `${hour12}:00 ${period}`,
      };
    });
  }, []);

  const handlePitchSearch = async (q: string) => {
    setPitchQuery(q);
    setPitchId('');
    setCustomPitchName(q);

    if (q.length < 2) { setShowSuggestions(false); return; }

    const { data } = await supabase
      .from('pitches')
      .select('id, name, type, companies(name, zone)')
      .ilike('name', `%${q}%`)
      .limit(5);
    setPitchSuggestions(data || []);
    setShowSuggestions(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return showAlert('login_required', 'Iniciar Sesión', 'Debes iniciar sesión.');
    if (!date || !time) return showAlert('warning', 'Campos requeridos', 'Ingresa fecha y hora.');

    setLoading(true);
    await ensureProfile();

    const updateData: Record<string, any> = {
      creator_id: user.id,
      pitch_id: pitchId || null,
      custom_pitch_name: pitchId ? null : (pitchQuery.trim() || null),
      date,
      time,
      level,
      players_needed: isConvocatoria ? Math.max(1, playersNeeded) : 0,
      is_urgent: isUrgent,
      location_zone: locationZone,
      status: 'open',
      message: message.trim() || null,
    };

    try {
      if (editingItem?.id) {
        const res = await fetch('/api/community-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_challenge',
            payload: { challenge_id: editingItem.id, user_id: user.id, updateData }
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Error al actualizar');
      } else {
        const res = await supabase.from('challenges').insert(updateData);
        if (res.error) throw res.error;
      }

      if (phone && phone !== profile?.phone) {
        await supabase.from('profiles').update({ phone }).eq('id', user.id);
      }

      setLoading(false);
      showAlert('success', editingItem ? '¡Actualizado!' : '¡Publicado!', isConvocatoria ? 'Convocatoria guardada.' : 'Reto guardado con éxito.');
      onSuccess();
    } catch (err: any) {
      setLoading(false);
      console.error(err);
      showAlert('error', 'Error', err.message || 'No se pudo guardar.');
    }
  };

  return (
    <div className="p-5 bg-card border-2 border-primary/30 rounded-2xl mb-6 shadow-md relative animate-fade-in">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-lg">
          {editingItem ? '✏️ Editar' : '➕ Crear'} {isConvocatoria ? 'Convocatoria de Jugador' : 'Reto de Partido'}
        </h3>
        <button type="button" onClick={onClose} className="p-1 hover:bg-secondary rounded-lg">
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* ── SELECTOR MEJORADO DE FECHA (Píldoras Rápidas + Calendario de Mes) ── */}
        <div className="auth-field space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <CalendarDays size={13} className="text-primary" /> Fecha del partido
            </span>
            <button
              type="button"
              onClick={() => setShowCalendarModal(!showCalendarModal)}
              className="text-xs text-primary font-bold hover:underline flex items-center gap-1"
            >
              {showCalendarModal ? 'Ocultar mes' : '📅 Ver mes completo'}
            </button>
          </div>

          {/* Píldoras de Próximos Días (Hoy predeterminado) */}
          <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide snap-x">
            {nextDays.map(d => {
              const isSelected = date === d.dateStr;
              return (
                <button
                  key={d.dateStr}
                  type="button"
                  onClick={() => {
                    setDate(d.dateStr);
                    setShowCalendarModal(false);
                  }}
                  className={`flex-shrink-0 snap-start min-w-[75px] p-2.5 rounded-xl border text-center transition-all ${isSelected
                    ? 'bg-primary text-white border-primary shadow-md scale-105 ring-2 ring-primary/30'
                    : 'bg-card hover:bg-primary/10 border-border text-foreground hover:border-primary/40'
                    }`}
                >
                  <span className="text-[10px] uppercase font-bold tracking-wider block opacity-80">
                    {d.dayName}
                  </span>
                  <span className="text-base font-extrabold block leading-tight">
                    {d.dayNumber}
                  </span>
                  <span className="text-[9px] capitalize block opacity-70">
                    {d.monthName}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Widget Calendario de Mes Completo */}
          {showCalendarModal && (
            <div className="pt-2 animate-scale-up flex justify-center">
              <CustomMonthCalendar
                selectedDate={date}
                minDate={today}
                onSelectDate={(dateStr) => {
                  setDate(dateStr);
                  setShowCalendarModal(false);
                }}
              />
            </div>
          )}

          {date && (
            <p className="text-xs text-primary font-semibold capitalize pt-0.5">
              📅 Fecha elegida: {new Date(date + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          )}
        </div>

        {/* ── SELECTOR MEJORADO DE HORA (Grid Interactivo de 12h / 24h) ── */}
        <div className="auth-field space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Clock3 size={13} className="text-primary" /> Hora de inicio
            </span>
            <button
              type="button"
              onClick={() => setShowAllHours(!showAllHours)}
              className="text-primary text-xs font-bold cursor-pointer flex items-center justify-end gap-1 opacity-80 hover:opacity-100"
            >
              {showAllHours ? 'Ocultar horario' : 'Ver horario completo'} <ChevronRight size={14} className={`transform transition-transform ${showAllHours ? 'rotate-90' : ''}`} />
            </button>
          </div>

          {!showAllHours ? (
            <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide snap-x">
              {[
                { label12: '6:00 am', value24: '06:00' },
                { label12: '7:00 am', value24: '07:00' },
                { label12: '8:00 am', value24: '08:00' },
                { label12: '9:00 am', value24: '09:00' },
                { label12: '10:00 am', value24: '10:00' },
                { label12: '11:00 am', value24: '11:00' },
                { label12: '12:00 pm', value24: '12:00' },
                { label12: '1:00 pm', value24: '13:00' },
                { label12: '2:00 pm', value24: '14:00' },
                { label12: '3:00 pm', value24: '15:00' },
                { label12: '4:00 pm', value24: '16:00' },
                { label12: '5:00 pm', value24: '17:00' },
                { label12: '6:00 pm', value24: '18:00' },
                { label12: '7:00 pm', value24: '19:00' },
                { label12: '8:00 pm', value24: '20:00' },
                { label12: '9:00 pm', value24: '21:00' },
                { label12: '10:00 pm', value24: '22:00' },
              ].map((slot) => {
                const isSelected = time === slot.value24;
                return (
                  <button
                    key={slot.value24}
                    type="button"
                    onClick={() => setTime(isSelected ? '' : slot.value24)}
                    className={`flex-shrink-0 snap-start p-2.5 px-4 rounded-xl border text-center transition-all ${isSelected
                      ? 'bg-primary text-white border-primary shadow-md scale-105 ring-2 ring-primary/30'
                      : 'bg-primary/10 hover:bg-primary/20 border-primary text-primary'
                      }`}
                  >
                    <span className="text-[14px] font-extrabold block whitespace-nowrap">
                      {slot.label12}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-3 border border-border/70 rounded-xl bg-secondary/20 flex flex-col items-center justify-center space-y-2 animate-in fade-in slide-in-from-top-2">
              <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">
                Selecciona la hora exacta:
              </label>
              <div className="flex gap-2 items-center">
                {/* Hour select */}
                <select
                  value={time.split(":")[0] ?? ""}
                  onChange={(e) => {
                    const [, mins] = time.split(":");
                    setTime(`${e.target.value}:${mins ?? "00"}`);
                  }}
                  className="h-9 px-3 border border-border rounded-xl bg-card text-xs font-semibold outline-none focus:border-primary"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i.toString().padStart(2, "0")}> {i.toString().padStart(2, "0")} </option>
                  ))}
                </select>
                {/* Minute select */}
                <select
                  value={time.split(":")[1] ?? ""}
                  onChange={(e) => {
                    const [hrs] = time.split(":");
                    setTime(`${hrs ?? "00"}:${e.target.value}`);
                  }}
                  className="h-9 px-3 border border-border rounded-xl bg-card text-xs font-semibold outline-none focus:border-primary"
                >
                  {Array.from({ length: 60 }, (_, i) => (
                    <option key={i} value={i.toString().padStart(2, "0")} > {i.toString().padStart(2, "0")} </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {time && (
            <p className="text-xs text-primary font-semibold pt-0.5">
              ⏰ Hora seleccionada: {time}
            </p>
          )}
        </div>

        {/* Otros campos */}
        <div className="grid sm:grid-cols-1 gap-4 pt-1">

          <div className="auth-field space-y-2 relative">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Trophy size={13} className="text-primary" /> Nivel requerido
            </span>
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'level' ? null : 'level')}
              className="w-full h-[46px] px-4 rounded-xl border text-sm font-bold transition-all flex justify-between items-center bg-card text-foreground border-border hover:border-primary/40 focus:ring-2 focus:ring-primary/30"
            >
              <span className="capitalize">{level === 'cualquiera' ? 'Cualquier nivel' : level}</span>
              <ChevronDown size={16} className={`transition-transform text-muted-foreground ${openDropdown === 'level' ? 'rotate-180' : ''}`} />
            </button>
            {openDropdown === 'level' && (
              <div className="absolute top-[72px] left-0 right-0 p-2 bg-card border border-border rounded-xl shadow-xl z-50 flex flex-col gap-1 animate-in fade-in slide-in-from-top-1">
                {[
                  { val: 'cualquiera', label: 'Cualquier Nivel' },
                  { val: 'recreativo', label: 'Recreativo' },
                  { val: 'competitivo', label: 'Competitivo' },
                  { val: 'profesional', label: 'Profesional' },
                ].map((lvl) => (
                  <button
                    key={lvl.val}
                    type="button"
                    onClick={() => {
                      setLevel(lvl.val);
                      setOpenDropdown(null);
                    }}
                    className={`py-2 px-3 rounded-lg text-sm font-bold text-left transition-all ${level === lvl.val
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-foreground hover:bg-primary/10 hover:text-primary'
                      }`}
                  >
                    {lvl.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isConvocatoria && (
            <div className="auth-field space-y-2 sm:col-span-2 relative mt-2 z-40">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Users size={13} className="text-primary" /> Jugadores que necesitas
              </span>
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'players' ? null : 'players')}
                className="w-full h-[46px] px-4 rounded-xl border text-sm font-bold transition-all flex justify-between items-center bg-card text-foreground border-border hover:border-primary/40 focus:ring-2 focus:ring-primary/30"
              >
                <span>{playersNeeded} jugador{playersNeeded > 1 ? 'es' : ''}</span>
                <ChevronDown size={16} className={`transition-transform text-muted-foreground ${openDropdown === 'players' ? 'rotate-180' : ''}`} />
              </button>
              {openDropdown === 'players' && (
                <div className="absolute top-[72px] left-0 right-0 p-2 bg-card border border-border rounded-xl shadow-xl flex flex-col gap-1 animate-in fade-in slide-in-from-top-1 max-h-[220px] overflow-y-auto">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => {
                    const isSelected = playersNeeded === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          setPlayersNeeded(n);
                          setOpenDropdown(null);
                        }}
                        className={`py-2 px-3 rounded-lg text-sm font-bold text-left transition-all ${isSelected
                          ? 'bg-primary text-white shadow-sm'
                          : 'text-foreground hover:bg-primary/10 hover:text-primary'
                          }`}
                      >
                        {n} jugador{n > 1 ? 'es' : ''}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Autocompletado / Nombre Escrito de Cancha */}
          <div className="auth-field sm:col-span-2 relative">
            <span>Cancha del partido <span className="text-muted-foreground text-xs">(Selecciona una o escríbela)</span></span>
            <input
              type="text"
              value={pitchQuery}
              onChange={e => handlePitchSearch(e.target.value)}
              placeholder="Ej: El Golazo o cancha sintetica..."
              className="h-[46px] w-full px-3 border border-border rounded-lg bg-card text-sm"
            />
            {showSuggestions && pitchSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
                <div className="px-3 py-1.5 text-[11px] font-bold text-muted-foreground bg-secondary">
                  🏟️ Canchas registradas en el sistema (click para vincular)
                </div>
                {pitchSuggestions.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPitchId(p.id);
                      setPitchQuery(p.name);
                      setCustomPitchName('');
                      setShowSuggestions(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-primary/10 flex items-center justify-between transition-colors border-b border-border/40"
                  >
                    <span className="font-semibold text-foreground">🏟️ {p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.type} </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Teléfono de Contacto (WhatsApp) */}
        <div className="auth-field relative">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            📱 Número de WhatsApp
          </span>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="Ej: 3001234567"
            className="h-[46px] w-full px-4 border border-border rounded-xl bg-card text-sm font-semibold mt-1 focus:ring-2 focus:ring-primary/30 outline-none"
            required
          />
          <p className="text-[10px] text-muted-foreground mt-1 ml-1">
            Quienes quieran unirse te escribirán a este número.
          </p>
        </div>

        {/* Mensaje / Descripción Opcional */}
        <div className="auth-field">
          <label className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            <span className="flex items-center gap-1.5">
              💬 {isConvocatoria ? 'Mensaje o indicaciones para jugadores' : 'Mensaje o detalles del reto'}
            </span>
            <span className="text-[10px] lowercase text-muted-foreground/70 font-normal">(opcional)</span>
          </label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={
              isConvocatoria
                ? 'Ej: Nos falta arquero y delantero, jugamos a divertirnos, llevar camiseta blanca...'
                : 'Ej: Buscamos equipo nivel medio para amistoso de 1 hora, dividimos la cancha 50/50...'
            }
            rows={2}
            maxLength={250}
            className="w-full p-3 border border-border rounded-xl bg-card text-sm font-medium focus:ring-2 focus:ring-primary/30 outline-none resize-none transition-all placeholder:text-muted-foreground/60"
          />
          <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-0.5 px-1">
            <span>Información adicional que verán los demás usuarios</span>
            <span>{message.length}/250</span>
          </div>
        </div>

        {/* Toggle Por Empezar */}
        <label className="flex items-center gap-3 p-3 bg-secondary/50 rounded-xl cursor-pointer hover:bg-secondary">
          <input
            type="checkbox"
            checked={isUrgent}
            onChange={e => setIsUrgent(e.target.checked)}
            className="w-4 h-4 accent-red-500 rounded"
          />
          <div>
            <p className="text-sm font-bold flex items-center gap-1.5 text-red-600">
              <Flame size={15} /> Marcar como Urgente
            </p>
            <p className="text-xs text-muted-foreground">Destacará tu publicación con una insignia de urgencia.</p>
          </div>
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-primary bg-secondary text-foreground hover:bg-border text-xs py-2.5">
            Cancelar
          </button>
          <button type="submit" disabled={loading} className="btn-primary text-xs py-2.5">
            {loading ? <Loader2 size={16} className="animate-spin" /> : editingItem ? 'Guardar Cambios' : 'Publicar'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── TAB: BUSCAR EQUIPO ──────────────────────────────────────────────────────
function BuscarEquipoTab({ showAlert }: { showAlert: (type: AlertModalState['type'], title: string, msg: string, onConfirm?: () => void) => void }) {
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any | null>(null);
  const [query, setQuery] = useState('');

  const { user, profile } = useAuth();
  const supabase = createClient();

  useEffect(() => { fetchTeams(); }, []);

  const fetchTeams = async () => {
    const { data } = await supabase
      .from('teams')
      .select('*, profiles(full_name), team_members(user_id)')
      .order('created_at', { ascending: false });
    setTeams(data || []);
    setLoading(false);
  };

  const joinTeam = async (team: any) => {
    if (!user) {
      return showAlert('login_required', 'Iniciar Sesión', 'Debes iniciar sesión para unirte a un equipo.');
    }

    const { error } = await supabase.from('team_members').insert({ team_id: team.id, user_id: user.id });
    if (!error) {
      await supabase.from('notifications').insert({
        user_id: team.captain_id,
        sender_id: user.id,
        title: '🛡️ ¡Nuevo miembro en tu equipo!',
        message: `${profile?.full_name || 'Un jugador'} se ha unido a tu equipo "${team.name}".`,
        type: 'team_join',
      });

      showAlert('success', '¡Bienvenido al equipo!', `Te has unido a "${team.name}". El capitán ha sido notificado.`);
      fetchTeams();
    } else {
      console.error(error);
      showAlert('warning', 'Aviso', 'Ya eres miembro de este equipo.');
    }
  };

  const deleteTeam = async (teamId: string) => {
    showAlert('warning', 'Eliminar Equipo', '¿Estás seguro de eliminar tu equipo?', async () => {
      const { error } = await supabase.from('teams').delete().eq('id', teamId);
      if (!error) {
        setTeams(prev => prev.filter(t => t.id !== teamId));
        showAlert('success', 'Eliminado', 'Equipo eliminado con éxito.');
      } else {
        showAlert('error', 'Error', error.message || 'No se pudo eliminar.');
      }
    });
  };

  const filtered = teams.filter(t => (t.name || '').toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-2 flex-1 bg-card border border-border rounded-xl px-3 h-11">
          <Search size={16} className="text-muted-foreground" />
          <input
            className="bg-transparent text-sm outline-none flex-1"
            placeholder="Buscar equipo por nombre..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            if (!user) return showAlert('login_required', 'Iniciar Sesión', 'Debes iniciar sesión para crear tu equipo.');
            setEditingTeam(null);
            setShowForm(!showForm);
          }}
          className="btn-primary flex items-center gap-2 text-xs py-2.5"
        >
          <Plus size={16} /> Crear equipo
        </button>
      </div>

      {(showForm || editingTeam) && (
        <TeamFormModal
          editingTeam={editingTeam}
          showAlert={showAlert}
          onClose={() => {
            setShowForm(false);
            setEditingTeam(null);
          }}
          onSuccess={() => {
            setShowForm(false);
            setEditingTeam(null);
            fetchTeams();
          }}
        />
      )}

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 size={32} className="animate-spin text-primary" /></div>
      ) : filtered.length === 0 && !showForm && !editingTeam ? (
        <EmptyState icon={Shield} title="No hay equipos" desc="Crea el primero y empieza a reclutar jugadores." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(team => {
            const memberCount = team.team_members?.length || 0;
            const isAlreadyMember = team.team_members?.some((m: any) => m.user_id === user?.id);
            const isCaptain = team.captain_id === user?.id;
            const initials = (team.name || 'EQ').substring(0, 2).toUpperCase();

            return (
              <div key={team.id} className="p-5 bg-card border border-border rounded-2xl hover:border-primary/40 hover:shadow-md transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-primary/80 to-green-400 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-md">
                        {initials}
                      </div>
                      <div>
                        <h3 className="font-bold text-base leading-tight">{team.name}</h3>
                        <p className="text-xs text-muted-foreground">Cap. {team.profiles?.full_name || 'Jugador'}</p>
                      </div>
                    </div>
                    {isCaptain && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingTeam(team)}
                          className="p-1.5 text-primary hover:bg-primary/10 rounded-lg"
                          title="Editar equipo"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTeam(team.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                          title="Eliminar equipo"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 mb-4">
                    <LevelBadge level={team.level} />
                    <span className="px-2 py-1 bg-secondary rounded-lg text-xs font-semibold flex items-center gap-1">
                      <Users size={12} /> {memberCount} miembro{memberCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => joinTeam(team)}
                  disabled={isAlreadyMember || isCaptain}
                  className="w-full py-2 text-xs font-bold rounded-xl border border-primary/30 text-primary hover:bg-primary hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCaptain ? '⚽ Tu equipo' : isAlreadyMember ? '✅ Miembro' : 'Unirme al equipo'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Modal Crear/Editar Equipo
function TeamFormModal({
  editingTeam,
  onClose,
  onSuccess,
  showAlert,
}: {
  editingTeam?: any;
  onClose: () => void;
  onSuccess: () => void;
  showAlert: (type: AlertModalState['type'], title: string, msg: string) => void;
}) {
  const [name, setName] = useState(editingTeam?.name || '');
  const [level, setLevel] = useState(editingTeam?.level || 'recreativo');
  const [loading, setLoading] = useState(false);
  const { user, ensureProfile } = useAuth();
  const supabase = createClient();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return showAlert('login_required', 'Iniciar Sesión', 'Debes iniciar sesión.');
    if (!name.trim()) return showAlert('warning', 'Campo requerido', 'Ingresa el nombre del equipo.');

    setLoading(true);
    await ensureProfile();

    if (editingTeam?.id) {
      const { error } = await supabase.from('teams').update({ name: name.trim(), level }).eq('id', editingTeam.id);
      setLoading(false);
      if (!error) {
        showAlert('success', '¡Equipo Actualizado!', 'Los cambios fueron guardados.');
        onSuccess();
      } else {
        showAlert('error', 'Error', error.message);
      }
    } else {
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .insert({ name: name.trim(), level, captain_id: user.id })
        .select('id')
        .single();

      if (teamData?.id) {
        await supabase.from('team_members').insert({ team_id: teamData.id, user_id: user.id });
      }
      setLoading(false);

      if (!teamError) {
        showAlert('success', '¡Equipo Creado!', `El equipo "${name}" ha sido creado con éxito.`);
        onSuccess();
      } else {
        showAlert('error', 'Error', teamError.message);
      }
    }
  };

  return (
    <div className="p-5 bg-card border-2 border-primary/30 rounded-2xl mb-6 shadow-md relative animate-fade-in">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-lg">{editingTeam ? '✏️ Editar Equipo' : '🛡️ Crear Nuevo Equipo'}</h3>
        <button type="button" onClick={onClose} className="p-1 hover:bg-secondary rounded-lg">
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleCreate} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="auth-field">
            <span>Nombre del equipo</span>
            <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Los del Barrio FC" />
          </label>
          <label className="auth-field">
            <span>Nivel del equipo</span>
            <select className="h-[46px] px-3 border border-border rounded-lg bg-card text-sm" value={level} onChange={e => setLevel(e.target.value)}>
              <option value="recreativo">Recreativo</option>
              <option value="competitivo">Competitivo</option>
              <option value="profesional">Profesional</option>
            </select>
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-primary bg-secondary text-foreground hover:bg-border text-xs py-2.5">
            Cancelar
          </button>
          <button type="submit" disabled={loading} className="btn-primary text-xs py-2.5">
            {loading ? <Loader2 size={16} className="animate-spin" /> : editingTeam ? 'Guardar Cambios' : 'Crear Equipo'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── MODAL PREVIEW DE CANCHA REGISTRADA ─────────────────────────────────────
function PitchPreviewModal({ pitch, onClose }: { pitch: any; onClose: () => void }) {
  if (!pitch) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div className="w-full max-w-[340px] relative animate-scale-up" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-12 right-0 z-10 p-2 bg-black/50 text-white rounded-full hover:bg-black/80 transition-colors"
        >
          <X size={20} />
        </button>
        <PitchCard pitch={pitch as any} isAdmin={false} />
      </div>
    </div>
  );
}


// ── SHARED COMPONENTS ───────────────────────────────────────────────────────
function LevelBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    recreativo: 'bg-blue-100 text-blue-700',
    competitivo: 'bg-amber-100 text-amber-700',
    profesional: 'bg-red-100 text-red-700',
    cualquiera: 'bg-secondary text-muted-foreground',
  };
  const labels: Record<string, string> = {
    recreativo: 'Recreativo',
    competitivo: 'Competitivo',
    profesional: 'Profesional',
    cualquiera: 'Cualquier nivel',
  };
  return (
    <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${styles[level] || styles.cualquiera}`}>
      {labels[level] || level}
    </span>
  );
}

function EmptyState({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="text-center py-20 border-2 border-dashed border-border rounded-2xl">
      <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4 text-primary">

      </div>
      <h3 className="font-bold text-lg mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">{desc}</p>
    </div>
  );
}
