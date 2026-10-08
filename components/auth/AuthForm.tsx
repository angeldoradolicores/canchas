'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Loader2, ArrowRight, Mail, CheckCircle2, RotateCw, Lock, User, ShieldCheck, Phone } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { GoogleAuthButton } from './GoogleAuthButton';

interface AuthFormProps {
  mode: 'login' | 'register';
  forcedRole?: 'player' | 'owner' | 'superadmin';
  title: string;
  subtitle: string;
  redirectPath?: string;
}

export function AuthForm({ mode, forcedRole = 'player', title, subtitle, redirectPath = '/' }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const router = useRouter();
  const supabase = createClient();

  // Resetear estado de carga cuando la página vuelve a ser visible
  // (cubre: cerrar popup, botón atrás, bfcache)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setTimeout(() => {
          setGoogleLoading(false);
          setLoading(false);
        }, 600);
      }
    };
    const handlePageShow = () => {
      setGoogleLoading(false);
      setLoading(false);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (mode === 'login') {
      const { error, data } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.message?.toLowerCase().includes('email not confirmed')) {
          setError('Tu correo electrónico no ha sido confirmado aún. Por favor revisa tu bandeja de entrada o spam.');
        } else {
          try {
            const checkRes = await fetch('/api/auth/verify-login-error', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email }),
            });
            const checkData = await checkRes.json();
            setError(checkData.message || 'Correo o contraseña incorrectos.');
          } catch {
            setError('Correo o contraseña incorrectos.');
          }
        }
      } else {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
        const role = profile?.role || data.user.user_metadata?.role;
        if (role === 'superadmin') router.push('/admin');
        else if (role === 'owner') router.push('/dashboard');
        else router.push(redirectPath);
      }
    } else {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const params = new URLSearchParams({
        role: forcedRole,
        next: redirectPath,
      });
      if (fullName.trim()) {
        params.set('company_name', fullName.trim());
      }
      const emailRedirectTo = `${origin}/auth/callback?${params.toString()}`;

      if (typeof document !== 'undefined') {
        document.cookie = `sb_pending_role=${forcedRole}; path=/; max-age=600; SameSite=Lax`;
        document.cookie = `sb_pending_next=${encodeURIComponent(redirectPath)}; path=/; max-age=600; SameSite=Lax`;
        if (fullName.trim()) {
          document.cookie = `sb_pending_company=${encodeURIComponent(fullName.trim())}; path=/; max-age=600; SameSite=Lax`;
        }
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('sb_pending_role', forcedRole);
        localStorage.setItem('sb_pending_next', redirectPath);
        if (fullName.trim()) {
          localStorage.setItem('sb_pending_company', fullName.trim());
        }
      }

      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length !== 10) {
        setError('Ingresa un número de celular/WhatsApp válido de 10 dígitos (ej: 3123456789).');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role: forcedRole, phone: cleanPhone },
          emailRedirectTo,
        },
      });
      if (error) {
        setError(error.message);
      } else {
        if (data.user) {
          try {
            await supabase.from('profiles').update({ phone: cleanPhone, full_name: fullName }).eq('id', data.user.id);
          } catch { }
        }
        if (data.session) {
          if (forcedRole === 'owner') router.push('/dashboard');
          else router.push(redirectPath);
        } else {
          setSuccess(true);
        }
      }
    }
    setLoading(false);
  };

  const handleResendConfirmation = async () => {
    if (!email) return;
    setResendStatus('sending');
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const params = new URLSearchParams({
        role: forcedRole,
        next: redirectPath,
      });
      if (fullName.trim()) {
        params.set('company_name', fullName.trim());
      }
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${origin}/auth/callback?${params.toString()}`,
        },
      });
      if (error) {
        setError('No se pudo reenviar: ' + error.message);
      } else {
        setResendStatus('sent');
      }
    } catch {
      setError('Error al reenviar el correo.');
    } finally {
      setTimeout(() => setResendStatus('idle'), 5000);
    }
  };

  if (success) {
    return (
      <div className="w-full max-w-md mx-auto bg-card/90 backdrop-blur-xl border border-emerald-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-emerald-950/20 text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping opacity-75" />
          <div className="relative w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center text-emerald-500 shadow-lg shadow-emerald-500/20">
            <CheckCircle2 size={36} />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-black tracking-tight text-foreground">¡Cuenta Creada!</h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Hemos enviado un enlace de confirmación a:
          </p>
          <div className="inline-block px-3.5 py-1.5 bg-emerald-500/10 text-emerald-500 font-bold text-sm rounded-full border border-emerald-500/30 shadow-inner">
            {email}
          </div>
        </div>

        <div className="p-4 bg-secondary/50 rounded-2xl border border-border text-left space-y-2.5 text-xs text-muted-foreground">
          <p className="font-bold text-foreground uppercase tracking-wider text-[10px] flex items-center gap-1.5">
            Pasos a seguir:
          </p>
          <div className="space-y-2">
            <p className="flex items-start gap-2">
              <span className="w-4 h-4 rounded-full bg-emerald-500 text-black flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
              <span>Revisa tu bandeja de entrada o carpeta de correo no deseado (Spam).</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="w-4 h-4 rounded-full bg-emerald-500 text-black flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
              <span>Haz clic en el botón de <strong>Confirmar Correo</strong>.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="w-4 h-4 rounded-full bg-emerald-500 text-black flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
              <span>¡Todo listo! Podrás ingresar de inmediato.</span>
            </p>
          </div>
        </div>

        <div className="pt-2 flex flex-col gap-3">
          <a
            href="https://mail.google.com"
            target="_blank"
            rel="noreferrer"
            className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-2xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/25 active:scale-95"
          >
            <Mail size={18} />
            <span>Abrir Gmail</span>
          </a>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResendConfirmation}
              disabled={resendStatus !== 'idle'}
              className="flex-1 py-2.5 px-3 border border-border rounded-xl text-xs font-medium hover:bg-secondary transition-all flex items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <RotateCw size={13} className={resendStatus === 'sending' ? 'animate-spin text-emerald-500' : ''} />
              <span>{resendStatus === 'sending' ? 'Reenviando...' : resendStatus === 'sent' ? '¡Enviado!' : 'Reenviar correo'}</span>
            </button>

            <button
              type="button"
              onClick={() => router.push('/login')}
              className="flex-1 py-2.5 px-3 bg-secondary hover:bg-secondary/80 text-foreground rounded-xl text-xs font-bold transition-all text-center"
            >
              Iniciar Sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto bg-card border border-border/80 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-md">
      {/* Decoración Glowing de fondo */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header con Imagen de Marca en estilo App Icon */}
      <div className="flex flex-col items-center text-center space-y-3 mb-6 relative">
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl blur-md opacity-30 group-hover:opacity-60 transition duration-300" />
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 bg-background rounded-2xl p-0.5 border border-border/60 shadow-md overflow-hidden flex items-center justify-center">
            <img
              src="cancheros.png"
              alt="Cancheros Logo"
              className="w-full h-full object-cover rounded-[14px]"
            />
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            {title}
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-xs">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Botón de OAuth Google / Identity Services */}
      <div className="space-y-4">
        <GoogleAuthButton
          mode={mode}
          role={forcedRole === 'superadmin' ? 'player' : forcedRole}
          fullName={fullName}
          redirectPath={redirectPath}
          onError={(err) => setError(err)}
          onLoadingChange={(isLoading) => setGoogleLoading(isLoading)}
          disabled={googleLoading || loading}
          className="w-full py-3 px-4 bg-secondary/50 hover:bg-secondary border border-border/80 hover:border-emerald-500/40 text-foreground font-semibold text-sm rounded-2xl flex items-center justify-center gap-3 transition-all duration-200 shadow-xs active:scale-[0.98] disabled:opacity-60 cursor-pointer"
        />

        <div className="relative flex items-center justify-center my-2">
          <div className="w-full border-t border-border/60" />
          <span className="absolute bg-card px-3 text-[10px] font-bold tracking-wider uppercase text-muted-foreground/80">
            o correo electrónico
          </span>
        </div>
      </div>

      {/* Formulario Principal */}
      <form onSubmit={handleSubmit} className="space-y-4 mt-4">
        {mode === 'register' && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <User size={14} className="text-emerald-500" />
              <span>
                {forcedRole === 'owner' ? 'Nombre del complejo (Sede principal)' : 'Nombre completo'}
              </span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={forcedRole === 'owner' ? 'Ej: Complejo Deportivo...' : 'Tu Nombre'}
              required
              autoComplete="name"
              className="w-full px-4 py-3 bg-secondary/30 border border-border focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-2xl text-sm outline-none transition-all placeholder:text-muted-foreground/50"
            />
            {forcedRole === 'owner' && (
              <p className="text-[11px] text-muted-foreground leading-tight">
                Este nombre será el principal de tu sede (ej. <em>Complejo San Juan</em>). Luego podrás asociarle Cancha 1, Cancha 2, Cancha 3, etc.
              </p>
            )}
          </div>
        )}

        {mode === 'register' && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Phone size={14} className="text-emerald-500" />
              <span>Número de Celular / WhatsApp *</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="Ej: 3123456789"
              required
              autoComplete="tel"
              className="w-full px-4 py-3 bg-secondary/30 border border-border focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-2xl text-sm outline-none transition-all placeholder:text-muted-foreground/50"
            />
            <p className="text-[11px] text-muted-foreground leading-tight">
              Para enviarte confirmaciones de reservas y tickets de partidos.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Mail size={14} className="text-emerald-500" />
            <span>Correo electrónico</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            required
            autoComplete="email"
            className="w-full px-4 py-3 bg-secondary/30 border border-border focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-2xl text-sm outline-none transition-all placeholder:text-muted-foreground/50"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Lock size={14} className="text-emerald-500" />
              <span>Contraseña</span>
            </label>
            {mode === 'login' && (
              <Link
                href="/forgot-password"
                className="text-[11px] text-emerald-500 hover:text-emerald-400 font-semibold transition-colors hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            )}
          </div>
          <div className="relative flex items-center">
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full pl-4 pr-11 py-3 bg-secondary/30 border border-border focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-2xl text-sm outline-none transition-all placeholder:text-muted-foreground/50"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3.5 text-muted-foreground hover:text-foreground transition-colors p-1"
            >
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs font-medium text-center animate-shake">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || googleLoading}
          className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-2xl text-sm flex items-center justify-center gap-2 transition-all duration-200 shadow-lg shadow-emerald-500/20 active:scale-[0.98] disabled:opacity-60 cursor-pointer mt-2"
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin text-black" />
          ) : (
            <>
              <span>{mode === 'login' ? 'Ingresar a mi cuenta' : 'Completar registro'}</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>
    </div>
  );
}