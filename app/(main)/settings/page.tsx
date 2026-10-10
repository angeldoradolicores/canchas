'use client';

import { useState } from 'react';
import {
  Bell, Lock, Moon, Sun, Monitor, Settings2, ScrollText,
  Shield, FileCheck2, ChevronRight, Info, Eye, EyeOff,
  Check, Globe, Languages, KeyRound, ShieldCheck, UserCog,
  Loader2, X,
} from 'lucide-react';
import Link from 'next/link';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';

/* ─────────────────────── Toggle Component ─────────────────────── */
function Toggle({ enabled, onToggle, id }: { enabled: boolean; onToggle: () => void; id: string }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${enabled ? 'bg-primary' : 'bg-muted'
        }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-300 ${enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
      />
    </button>
  );
}

/* ─────────────────────── Theme Selector ─────────────────────── */
type ThemeOpt = 'light' | 'dark' | 'system';

function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  const options: { value: ThemeOpt; label: string; Icon: React.ElementType }[] = [
    { value: 'light', label: 'Claro', Icon: Sun },
    { value: 'dark', label: 'Oscuro', Icon: Moon },
    // { value: 'system', label: 'Sistema', Icon: Monitor },
  ];

  return (
    <div className="flex gap-2 mt-3">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all duration-200 ${theme === value
            ? 'border-primary bg-primary/10 text-primary shadow-sm'
            : 'border-border bg-secondary/40 text-muted-foreground hover:border-primary/40 hover:bg-secondary'
            }`}
        >
          <Icon size={18} />
          <span className="text-xs font-semibold">{label}</span>
          {theme === value && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          )}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────── Password Modal ─────────────────────── */
function PasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (next.length < 6) { setError('La nueva contraseña debe tener al menos 6 caracteres.'); return; }
    if (next !== confirm) { setError('Las contraseñas no coinciden.'); return; }

    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password: next });
    setLoading(false);

    if (err) {
      setError(err.message);
    } else {
      setSuccess(true);
      setTimeout(onClose, 1800);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-primary" />
            <h3 className="font-bold text-base">Cambiar contraseña</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary transition-colors">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center">
              <Check size={22} className="text-primary" />
            </div>
            <p className="text-sm font-semibold text-foreground">¡Contraseña actualizada!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Nueva contraseña */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nueva contraseña</label>
              <div className="relative">
                <input
                  type={showNext ? 'text' : 'password'}
                  value={next}
                  onChange={e => setNext(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-secondary/60 border border-border rounded-xl px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => setShowNext(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showNext ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Confirmar */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Confirmar contraseña</label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                  className="w-full bg-secondary/60 border border-border rounded-xl px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button onClick={() => setShowCurrent(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 flex items-start gap-2">
                <span className="mt-0.5 shrink-0">⚠️</span>
                {error}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading || !next || !confirm}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-all mt-2"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {loading ? 'Actualizando…' : 'Actualizar contraseña'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────── Main Page ─────────────────────── */
export default function SettingsPage() {
  const { resolvedTheme } = useTheme();
  const { user } = useAuth();

  const NOTIF_KEY = 'cancheros_notif_prefs';
  const PRIVACY_KEY = 'cancheros_privacy';

  // Load from localStorage on mount
  const [notifs, setNotifs] = useState(() => {
    if (typeof window === 'undefined') return { reservas: true, promociones: false, recordatorios: true };
    try {
      const saved = localStorage.getItem(NOTIF_KEY);
      return saved ? JSON.parse(saved) : { reservas: true, promociones: false, recordatorios: true };
    } catch { return { reservas: true, promociones: false, recordatorios: true }; }
  });

  const [privacy, setPrivacy] = useState(() => {
    if (typeof window === 'undefined') return false;
    try { return localStorage.getItem(PRIVACY_KEY) === 'true'; } catch { return false; }
  });

  const [savedKey, setSavedKey] = useState<string | null>(null);

  const showSaved = (key: string) => {
    setSavedKey(key);
    setTimeout(() => setSavedKey(null), 2000);
  };

  const toggleNotif = (key: keyof typeof notifs) => {
    setNotifs((prev: typeof notifs) => {
      const updated = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(NOTIF_KEY, JSON.stringify(updated)); } catch { }
      showSaved(String(key));
      return updated;
    });
  };

  const togglePrivacy = () => {
    setPrivacy((p: boolean) => {
      const next = !p;
      try { localStorage.setItem(PRIVACY_KEY, String(next)); } catch { }
      showSaved('privacy');
      return next;
    });
  };

  // UI state
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const legalLinks = [
    {
      href: '/settings/terminos',
      icon: <ScrollText size={20} className="text-emerald-500" />,
      title: 'Términos y Condiciones',
      description: 'Reglas de uso, reservas, pagos y responsabilidades de la plataforma.',
      badge: null,
    },
    {
      href: '/settings/privacidad',
      icon: <Shield size={20} className="text-emerald-500" />,
      title: 'Política de Privacidad',
      description: 'Cómo recopilamos, usamos y protegemos tus datos personales. Ley 1581/2012.',
      badge: null,
    },
    {
      href: '/settings/tratamiento-datos',
      icon: <FileCheck2 size={20} className="text-emerald-500" />,
      title: 'Autorización de Tratamiento de Datos',
      description: 'Gestiona tu autorización de tratamiento de datos personales conforme a la ley colombiana.',
      badge: 'Requerido',
    },
  ];

  return (
    <div className="page-content max-w-4xl mx-auto py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-black mb-2 flex items-center gap-2">
          <Settings2 className="text-primary" /> Configuración de la cuenta
        </h1>
        <p className="text-muted-foreground text-sm">
          Administra tus preferencias, seguridad y ajustes generales.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">

        {/* ── Cuenta y Seguridad ── */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/50">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
              <Lock className="text-primary" size={20} />
            </div>
            <h2 className="font-bold text-lg">Cuenta y Seguridad</h2>
          </div>

          <div className="space-y-3">
            {/* Cambiar contraseña */}
            <button
              onClick={() => setShowPasswordModal(true)}
              disabled={!user}
              className="group w-full flex items-center justify-between p-3 -mx-1 rounded-xl hover:bg-secondary/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <KeyRound size={15} className="text-primary" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm group-hover:text-primary transition-colors">Cambiar contraseña</p>
                  <p className="text-xs text-muted-foreground">Actualiza tu contraseña periódicamente</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Privacidad del perfil */}
            <div className="flex items-center justify-between p-3 -mx-1 rounded-xl hover:bg-secondary/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                  <UserCog size={15} className="text-indigo-500" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Perfil privado</p>
                  <p className="text-xs text-muted-foreground">Ocultar historial de partidos</p>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-3">
                {savedKey === 'privacy' && (
                  <span className="text-[10px] font-bold text-primary animate-in fade-in duration-200">✓ Guardado</span>
                )}
                <Toggle
                  id="toggle-privacy"
                  enabled={privacy}
                  onToggle={togglePrivacy}
                />
              </div>
            </div>

            {!user && (
              <p className="text-xs text-muted-foreground/70 text-center pt-1 italic">
                Inicia sesión para gestionar tu seguridad
              </p>
            )}
          </div>
        </div>

        {/* ── Notificaciones ── */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/50">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
              <Bell className="text-amber-500" size={20} />
            </div>
            <h2 className="font-bold text-lg">Notificaciones</h2>
          </div>

          <div className="space-y-3">
            {[
              {
                key: 'reservas' as const,
                label: 'Alertas de reserva',
                desc: 'Email y WhatsApp al confirmar tu reserva',
                icon: <Bell size={15} className="text-amber-500" />,
                color: 'bg-amber-500/10',
              },
              {
                key: 'promociones' as const,
                label: 'Promociones y ofertas',
                desc: 'Descuentos exclusivos de canchas cercanas',
                icon: <ShieldCheck size={15} className="text-emerald-500" />,
                color: 'bg-emerald-500/10',
              },
              // {
              //   key: 'recordatorios' as const,
              //   label: 'Recordatorios de partido',
              //   desc: 'Te avisamos 2 horas antes de jugar',
              //   icon: <Bell size={15} className="text-blue-500" />,
              //   color: 'bg-blue-500/10',
              // },
            ].map(({ key, label, desc, icon, color }) => (
              <div key={key} className="flex items-center justify-between p-3 -mx-1 rounded-xl hover:bg-secondary/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>
                    {icon}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  {savedKey === key && (
                    <span className="text-[10px] font-bold text-primary animate-in fade-in duration-200">✓ Guardado</span>
                  )}
                  <Toggle
                    id={`toggle-${key}`}
                    enabled={notifs[key]}
                    onToggle={() => toggleNotif(key)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Apariencia y Accesibilidad ── */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm md:col-span-2">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border/50">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
              {resolvedTheme === 'dark'
                ? <Moon className="text-indigo-400" size={20} />
                : <Sun className="text-amber-500" size={20} />
              }
            </div>
            <div>
              <h2 className="font-bold text-lg">Apariencia y Accesibilidad</h2>
              <p className="text-xs text-muted-foreground">Tema actual: <span className="font-semibold text-foreground capitalize">{resolvedTheme === 'dark' ? 'Oscuro' : 'Claro'}</span></p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Tema */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Monitor size={14} className="text-muted-foreground" />
                <p className="font-semibold text-sm">Tema visual</p>
              </div>
              <p className="text-xs text-muted-foreground mb-1">Selecciona cómo quieres ver la aplicación</p>
              <ThemeSelector />
            </div>

            {/* Idioma */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Languages size={14} className="text-muted-foreground" />
                <p className="font-semibold text-sm">Idioma</p>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Idioma de la interfaz</p>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/60 border border-border">
                <Globe size={16} className="text-emerald-500" />
                <div>
                  <p className="font-semibold text-sm">Español (Colombia)</p>
                  <p className="text-xs text-muted-foreground">es-CO · Por defecto</p>
                </div>
                <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider">Activo</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sección Legal ── */}
      <div className="mt-8">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Info size={16} className="text-emerald-500" />
          </div>
          <div>
            <h2 className="font-bold text-base text-foreground">Más Información</h2>
            <p className="text-xs text-muted-foreground">Documentos legales y políticas de la plataforma</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm divide-y divide-border/60">
          {legalLinks.map(({ href, icon, title, description, badge }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-4 px-5 py-4 hover:bg-secondary/40 transition-colors group"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm text-foreground group-hover:text-emerald-600 transition-colors">
                    {title}
                  </h3>
                  {badge && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/25 uppercase tracking-wider">
                      {badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
              </div>
              <ChevronRight size={16} className="text-muted-foreground/50 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all shrink-0" />
            </Link>
          ))}
        </div>
      </div>

      {/* Password Modal */}
      {showPasswordModal && <PasswordModal onClose={() => setShowPasswordModal(false)} />}
    </div>
  );
}
