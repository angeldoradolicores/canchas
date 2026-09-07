'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { Loader2, Save, LogOut, User, Shield, HelpCircle, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function CustomSelect({ value, onChange, options }: {
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
    <div ref={ref} className="relative mt-1.5">
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

export default function ProfilePage() {
  const { user, profile, signOut } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [preferredFoot, setPreferredFoot] = useState('');
  const [skillLevel, setSkillLevel] = useState('');
  const [lookingForTeam, setLookingForTeam] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const FAQS = [
    { q: '¿Cómo reservo una cancha?', a: 'Busca la cancha en "Explorar cancha ", elige la fecha y hora disponible, y presiona "Reservar".' },
    { q: '¿Cómo pago mi reserva?', a: 'El pago se realiza directamente con la administración de la cancha el día del partido, o según sus políticas de abono previo.' },
    { q: '¿Puedo cancelar una reserva?', a: 'Sí, desde la sección "Mis Reservas". Ten en cuenta las políticas de cancelación de cada cancha.' },
    { q: '¿Qué significa "pendiente de confirmación"?', a: 'Significa que el administrador de la cancha debe revisar y aprobar tu solicitud antes de ser definitiva.' },
    { q: '¿Cómo contacto al dueño de la cancha?', a: 'En el perfil de la cancha y en el detalle de tu reserva encontrarás un botón directo para enviarles un WhatsApp.' },
    { q: '¿Cómo creo un campeonato?', a: 'Ve a la sección "Campeonatos" en el menú principal y presiona el botón "Crear Campeonato".' },
  ];

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone((profile as any).phone || '');
      setPosition((profile as any).position || '');
      setPreferredFoot((profile as any).preferred_foot || '');
      setSkillLevel((profile as any).skill_level || '');
      setLookingForTeam((profile as any).looking_for_team || false);
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        phone,
        position: position || null,
        preferred_foot: preferredFoot || null,
        skill_level: skillLevel || null,
        looking_for_team: lookingForTeam,
      })
      .eq('id', user.id);
    setLoading(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const handleLogout = async () => {
    await signOut();
    router.push('/');
  };

  if (!user) {
    return (
      <div className="page-content fade-in max-w-2xl mx-auto text-center py-20">
        <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mx-auto mb-6 text-primary">
          <User size={36} />
        </div>
        <h2 className="text-2xl font-bold mb-3">Inicia sesión para ver tu perfil</h2>
        <p className="text-muted-foreground mb-6">Crea una cuenta gratis para reservar canchas, unirte a retos y más.</p>
        <Link href="/login" className="btn-primary">Ingresar</Link>
      </div>
    );
  }

  const initials = (fullName || user.email || 'US').substring(0, 2).toUpperCase();

  return (
    <div className="page-content fade-in max-w-2xl mx-auto">
      <div className="page-heading mb-8">
        <p className="eyebrow accent-label">CUENTA</p>
        <h1>Mi Perfil</h1>
      </div>

      {/* Avatar y datos básicos */}
      <div className="flex items-center gap-5 mb-8 p-5 bg-card border border-border rounded-2xl shadow-sm">
        <div className="w-20 h-20 bg-gradient-to-br from-primary to-green-400 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-lg flex-shrink-0">
          {initials}
        </div>
        <div>
          <h2 className="text-xl font-bold">{fullName || 'Jugador'}</h2>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <div className="mt-2 flex gap-2">
            {profile?.role === 'owner' && (
              <Link href="/dashboard" className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-lg flex items-center gap-1">
                <Shield size={12} /> Ir a mi Dashboard
              </Link>
            )}
            {(profile as any)?.looking_for_team && (
              <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-lg">🔍 Buscando equipo</span>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="dashboard-card grid gap-5">
        <h3 className="font-bold text-lg border-b border-border pb-3">Información personal</h3>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Nombre completo</span>
            <input 
              type="text" 
              value={fullName} 
              onChange={e => setFullName(e.target.value)} 
              placeholder="Tu nombre" 
              className="w-full h-11 px-3 border border-border rounded-xl bg-background text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Teléfono (WhatsApp)</span>
            <input 
              type="tel" 
              value={phone} 
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '');
                setPhone(val);
              }} 
              placeholder="3001234567" 
              className="w-full h-11 px-3 border border-border rounded-xl bg-background text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <h3 className="font-bold text-lg border-b border-border pb-3 mt-2">Datos de jugador</h3>

        <div className="grid sm:grid-cols-3 gap-4">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Pierna hábil</span>
            <CustomSelect
              value={preferredFoot}
              onChange={setPreferredFoot}
              options={[
                { value: '', label: 'Sin especificar' },
                { value: 'diestro', label: 'Diestro' },
                { value: 'zurdo', label: 'Zurdo' },
                { value: 'ambidiestro', label: 'Ambidiestro' },
              ]}
            />
          </div>

          <div className="flex flex-col">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Nivel de juego</span>
            <CustomSelect
              value={skillLevel}
              onChange={setSkillLevel}
              options={[
                { value: '', label: 'Sin especificar' },
                { value: 'amateur', label: 'Recreativo' },
                { value: 'intermedio', label: 'Intermedio' },
                { value: 'avanzado', label: 'Avanzado' },
              ]}
            />
          </div>

          <div className="flex flex-col">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Posición <span className="text-muted-foreground text-[10px] normal-case font-normal">(Opcional)</span></span>
            <CustomSelect
              value={position}
              onChange={setPosition}
              options={[
                { value: '', label: 'Sin posición fija' },
                { value: 'Portero', label: 'Portero' },
                { value: 'Defensa', label: 'Defensa' },
                { value: 'Mediocampista', label: 'Mediocampista' },
                { value: 'Delantero', label: 'Delantero' },
              ]}
            />
          </div>
        </div>



        <div className="flex gap-4 mt-2">
          <button type="submit" disabled={loading} className="btn-primary flex-1">
            {loading ? <Loader2 size={16} className="animate-spin" /> : saved ? '¡Guardado!' : <><Save size={16} className="mr-1.5" /> Guardar cambios</>}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-sm font-semibold transition-colors"
          >
            <LogOut size={16} /> Salir
          </button>
        </div>
      </form>

      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        {/* Ver mis reservas */}
        <Link
          href="/reservations"
          className="flex items-center justify-between p-4 bg-card border border-border rounded-2xl hover:border-primary/40 transition-all"
        >
          <div>
            <p className="font-semibold">📅 Mis reservas</p>
            <p className="text-xs text-muted-foreground">Ver todos mis partidos reservados</p>
          </div>
          <span className="text-primary font-bold">→</span>
        </Link>

        {/* Tarjeta de Jugador */}
        <Link
          href={`/profile/${user.id}`}
          className="flex items-center justify-between p-4 bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-2xl hover:border-primary/50 transition-all"
        >
          <div>
            <p className="font-bold text-primary">🏆 Mi Tarjeta Pública</p>
            <p className="text-xs text-muted-foreground">Comparte tus estadísticas en redes</p>
          </div>
          <span className="text-primary font-bold">→</span>
        </Link>
      </div>

      {/* Preguntas Frecuentes (FAQ) */}
      <div className="mt-8 bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-border">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <HelpCircle size={20} className="text-primary" /> Preguntas frecuentes
          </h3>
        </div>
        <div className="divide-y divide-border">
          {FAQS.map((faq, idx) => (
            <div key={idx}>
              <button
                onClick={() => toggleFaq(idx)}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-secondary/50 transition-colors focus:outline-none"
              >
                <span className="font-semibold text-sm">{faq.q}</span>
                {openFaq === idx ? (
                  <ChevronUp size={16} className="text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronDown size={16} className="text-muted-foreground flex-shrink-0" />
                )}
              </button>
              {openFaq === idx && (
                <div className="px-5 pb-4 pt-1 text-sm text-muted-foreground leading-relaxed animate-in slide-in-from-top-2 fade-in duration-200">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="mt-6 mb-12 p-5 bg-card border border-border rounded-3xl">
        <h3 className="text-red-500 font-bold flex items-center gap-2 mb-2">
          <AlertTriangle size={18} /> TEN ENCUENTA
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Esta acción es permanente e irreversible. Se eliminarán tu cuenta, reservas y publicaciones.
        </p>
        <button className="w-full py-3 rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/10 font-bold text-sm transition-colors">
          Eliminar mi cuenta
        </button>
      </div>
    </div>
  );
}
