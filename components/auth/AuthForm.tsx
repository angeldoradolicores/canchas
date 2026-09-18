'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2, ArrowRight, Mail, CheckCircle2, RotateCw, Lock, User, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const router = useRouter();
  const supabase = createClient();

  const handleGoogleAuth = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const callbackUrl = `${origin}/auth/callback?role=${forcedRole}&next=${encodeURIComponent(redirectPath)}`;

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
      const { error, data } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError('Correo o contraseña incorrectos.');
      } else {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
        const role = profile?.role || data.user.user_metadata?.role;
        if (role === 'superadmin') router.push('/admin');
        else if (role === 'owner') router.push('/dashboard');
        else router.push(redirectPath);
      }
    } else {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const emailRedirectTo = `${origin}/auth/callback?role=${forcedRole}&next=${encodeURIComponent(redirectPath)}`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role: forcedRole },
          emailRedirectTo,
        },
      });
      if (error) {
        setError(error.message);
      } else {
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
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${origin}/auth/callback?role=${forcedRole}&next=${encodeURIComponent(redirectPath)}`,
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
            <ShieldCheck size={14} className="text-emerald-500" /> Pasos a seguir:
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

      {/* Botón de OAuth Google */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={handleGoogleAuth}
          disabled={googleLoading || loading}
          className="w-full py-3 px-4 bg-secondary/50 hover:bg-secondary border border-border/80 hover:border-emerald-500/40 text-foreground font-semibold text-sm rounded-2xl flex items-center justify-center gap-3 transition-all duration-200 shadow-xs active:scale-[0.98] disabled:opacity-60 cursor-pointer"
        >
          {googleLoading ? (
            <Loader2 size={18} className="animate-spin text-emerald-500" />
          ) : (
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
                {forcedRole === 'owner' ? 'Nombre del complejo o cancha' : 'Nombre completo'}
              </span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={forcedRole === 'owner' ? 'Ej: Complejo Deportivo San Juan' : 'Ej: Juan Pérez'}
              required
              autoComplete="name"
              className="w-full px-4 py-3 bg-secondary/30 border border-border focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-2xl text-sm outline-none transition-all placeholder:text-muted-foreground/50"
            />
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