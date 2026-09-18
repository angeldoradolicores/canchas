'use client';

import { useState } from 'react';
import { X, Eye, EyeOff, Loader2, Trophy, User, Building2, Mail, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface AuthModalProps {
  isOpen?: boolean;
  onClose: () => void;
  defaultMode?: 'login' | 'register';
  defaultRole?: 'player' | 'owner';
}

export function AuthModal({ isOpen = true, onClose, defaultMode = 'login', defaultRole = 'player' }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);
  const [role, setRole] = useState<'player' | 'owner'>(defaultRole);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  if (isOpen === false) return null;

  const handleGoogleAuth = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const redirectPath = role === 'owner' ? '/dashboard' : '/';
      const callbackUrl = `${origin}/auth/callback?role=${role}&next=${encodeURIComponent(redirectPath)}`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (error) {
        setError(error.message || 'Error al iniciar con Google.');
        setGoogleLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión con Google.');
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (mode === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError('Correo o contraseña incorrectos.');
      } else {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();

        const userRole = profile?.role || data.user.user_metadata?.role;
        onClose();
        if (userRole === 'owner') {
          router.push('/dashboard');
        } else if (userRole === 'superadmin') {
          router.push('/admin');
        }
      }
    } else {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const redirectPath = role === 'owner' ? '/dashboard' : '/';
      const emailRedirectTo = `${origin}/auth/callback?role=${role}&next=${encodeURIComponent(redirectPath)}`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role },
          emailRedirectTo,
        },
      });
      if (error) {
        setError(error.message);
      } else {
        if (data.session) {
          onClose();
          if (role === 'owner') {
            router.push('/dashboard');
          }
        } else {
          setSuccess('¡Cuenta creada! Revisa tu correo electrónico para confirmar tu registro y poder ingresar.');
        }
      }
    }
    setLoading(false);
  };

  return (
    <div className="auth-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="auth-modal">
        {/* Header */}
        <div className="auth-modal-head">
          <div>
            <div className="auth-logo-dot" />
            <h2>{mode === 'login' ? 'Bienvenido de vuelta' : 'Crea tu cuenta'}</h2>
            <p>{mode === 'login' ? 'Inicia sesión para reservar y jugar' : 'Únete a la comunidad de Canchas Pasto'}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div className="auth-success space-y-4 py-4 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center text-emerald-600 shadow-lg shadow-emerald-500/20">
              <CheckCircle2 size={32} />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-foreground">¡Verifica tu correo!</h3>
              <p className="text-xs text-muted-foreground">{success}</p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <a
                href="https://mail.google.com"
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/20"
              >
                <Mail size={14} />
                <span>Abrir Gmail</span>
              </a>
              <button className="btn-primary text-xs py-2" onClick={onClose}>
                Entendido
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Botón de Google OAuth */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={googleLoading || loading}
                className="w-full py-2.5 px-4 bg-card border border-border hover:border-emerald-500/50 hover:bg-secondary/70 text-foreground font-semibold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-3 transition-all shadow-xs cursor-pointer active:scale-98 disabled:opacity-60"
              >
                {googleLoading ? (
                  <Loader2 size={16} className="animate-spin text-emerald-600" />
                ) : (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span>{mode === 'login' ? 'Continuar con Google' : 'Registrarme con Google'}</span>
              </button>

              <div className="relative my-3">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase">
                  <span className="bg-card px-2 text-muted-foreground font-medium">o continúa con correo</span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              {/* Selector de Rol (solo en registro) */}
              {mode === 'register' && (
                <div className="role-selector">
                  <button
                    type="button"
                    className={`role-card ${role === 'player' ? 'active' : ''}`}
                    onClick={() => setRole('player')}
                  >
                    <User size={20} />
                    <strong>Jugador</strong>
                    <span>Busca y reserva canchas</span>
                  </button>
                  <button
                    type="button"
                    className={`role-card ${role === 'owner' ? 'active' : ''}`}
                    onClick={() => setRole('owner')}
                  >
                    <Building2 size={20} />
                    <strong>Dueño de cancha</strong>
                    <span>Administra tu complejo</span>
                  </button>
                </div>
              )}

              {/* Nombre (solo en registro) */}
              {mode === 'register' && (
                <label className="auth-field">
                  <span>
                    {role === 'owner'
                      ? '¿Cuál es el nombre de tu cancha o complejo?'
                      : '¿Cómo te llamas?'}
                  </span>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={role === 'owner' ? 'Ej: Complejo Deportivo San Juan' : 'Ej: Juan Pérez'}
                    required
                    autoComplete="name"
                  />
                </label>
              )}

              <label className="auth-field">
                <span>Correo electrónico</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  required
                  autoComplete="email"
                />
              </label>

              <label className="auth-field">
                <div className="flex items-center justify-between">
                  <span>Contraseña</span>
                  {mode === 'login' && (
                    <Link
                      href="/forgot-password"
                      onClick={onClose}
                      className="text-[11px] text-emerald-600 hover:text-emerald-500 font-semibold hover:underline"
                    >
                      ¿Olvidaste tu contraseña?
                    </Link>
                  )}
                </div>
                <div className="password-wrap">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                  <button type="button" className="pass-toggle" onClick={() => setShowPass(!showPass)}>
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              {error && <p className="auth-error">{error}</p>}

              <button type="submit" className="btn-primary auth-submit" disabled={loading || googleLoading}>
                {loading ? <Loader2 size={18} className="spin" /> : null}
                {loading ? 'Cargando...' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
              </button>

              <p className="auth-switch">
                {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
                <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
                  {mode === 'login' ? 'Regístrate gratis' : 'Inicia sesión'}
                </button>
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
