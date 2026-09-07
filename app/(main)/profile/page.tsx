'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { Loader2, Save, LogOut, User, Shield, HelpCircle, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
          <label className="auth-field">
            <span>Nombre completo</span>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Tu nombre" />
          </label>
          <label className="auth-field">
            <span>Teléfono (WhatsApp)</span>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="3001234567" />
          </label>
        </div>

        <h3 className="font-bold text-lg border-b border-border pb-3 mt-2">Datos de jugador</h3>

        <div className="grid sm:grid-cols-3 gap-4">
          <label className="auth-field">
            <span>Pierna hábil</span>
            <select
              className="h-[46px] px-3 border border-border rounded-lg bg-card text-sm"
              value={preferredFoot}
              onChange={e => setPreferredFoot(e.target.value)}
            >
              <option value="">Sin especificar</option>
              <option value="diestro"> Diestro</option>
              <option value="zurdo"> Zurdo</option>
              <option value="ambidiestro"> Ambidiestro</option>
            </select>
          </label>

          <label className="auth-field">
            <span>Nivel de juego</span>
            <select
              className="h-[46px] px-3 border border-border rounded-lg bg-card text-sm"
              value={skillLevel}
              onChange={e => setSkillLevel(e.target.value)}
            >
              <option value="">Sin especificar</option>
              <option value="amateur"> Recreativo</option>
              <option value="intermedio"> Intermedio</option>
              <option value="avanzado"> Avanzado</option>
            </select>
          </label>

          <label className="auth-field">
            <span>Posición <span className="text-muted-foreground text-xs">(Opcional)</span></span>
            <select
              className="h-[46px] px-3 border border-border rounded-lg bg-card text-sm"
              value={position}
              onChange={e => setPosition(e.target.value)}
            >
              <option value="">Sin posición fija</option>
              <option value="Portero">Portero</option>
              <option value="Defensa">Defensa</option>
              <option value="Mediocampista">Mediocampista</option>
              <option value="Delantero">Delantero</option>
            </select>
          </label>
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
