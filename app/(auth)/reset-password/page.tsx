'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, CheckCircle2, Lock, ArrowRight, ShieldCheck, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

type PageState = 'loading' | 'ready' | 'success' | 'expired';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pageState, setPageState] = useState<PageState>('loading');
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    let resolved = false;

    const resolve = (state: PageState) => {
      if (!resolved) {
        resolved = true;
        setPageState(state);
      }
    };

    // ── Caso 0: Parámetros de error explícitos ──
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const hash = window.location.hash || '';
      if (sp.get('error') || hash.includes('error=')) {
        resolve('expired');
        return;
      }

      // ── Caso 1: token_hash en query params (enlaces directos o fallback) ──
      const tokenHash = sp.get('token_hash');
      const typeParam = sp.get('type') as any;
      if (tokenHash && typeParam === 'recovery') {
        supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
          .then(({ data, error }) => {
            if (!error && data.session) {
              resolve('ready');
            } else {
              resolve('expired');
            }
          })
          .catch(() => resolve('expired'));
        return;
      }

      // ── Caso 2: code en query params (si llegó directo sin pasar por callback) ──
      const codeParam = sp.get('code');
      if (codeParam) {
        supabase.auth.exchangeCodeForSession(codeParam)
          .then(({ data, error }) => {
            if (!error && data.session) {
              resolve('ready');
            } else {
              resolve('expired');
            }
          })
          .catch(() => resolve('expired'));
        return;
      }
    }

    // ── Caso 3: PKCE (flujo principal con @supabase/ssr) ──
    // El /auth/callback ya intercambió el code y estableció la sesión en cookies.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        resolve('ready');
      }
    });

    // ── Caso 4: Flujo implícito / hash ──
    // Supabase pone el token en el hash (#access_token=...&type=recovery)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        resolve('ready');
      }
    });

    // ── Caso 5: Timeout — enlace expirado o inválido ──
    const timeout = setTimeout(() => {
      resolve('expired');
    }, 6000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        if (error.message.toLowerCase().includes('expired') || error.message.toLowerCase().includes('invalid')) {
          setPageState('expired');
        } else {
          setError(error.message || 'Error al actualizar la contraseña.');
        }
      } else {
        setPageState('success');
      }
    } catch (err: any) {
      setError(err.message || 'Error inesperado.');
    } finally {
      setSaving(false);
    }
  };

  // Indicador de fortaleza de contraseña
  const strength = password.length === 0 ? 0 : password.length < 8 ? 1 : password.length < 12 ? 2 : 3;
  const strengthLabel = ['', 'Débil', 'Buena', 'Fuerte'][strength];
  const strengthColor = ['', 'bg-red-500', 'bg-amber-400', 'bg-emerald-500'][strength];

  return (
    <div className="min-h-[85vh] w-full flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border/80 rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xl shadow-black/5 min-w-0 overflow-hidden transition-all">

        {/* ── Cargando ── */}
        {pageState === 'loading' && (
          <div className="py-10 text-center space-y-4 animate-in fade-in duration-200">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Loader2 size={28} className="animate-spin text-primary" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-black text-foreground uppercase tracking-tight">Verificando enlace</h2>
              <p className="text-xs text-muted-foreground">Estamos validando tu enlace de seguridad...</p>
            </div>
          </div>
        )}

        {/* ── Enlace expirado ── */}
        {pageState === 'expired' && (
          <div className="py-4 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
              <AlertTriangle size={30} />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-black text-foreground uppercase tracking-tight">Enlace expirado</h2>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                Este enlace de recuperación ya no es válido. Solicita uno nuevo desde la pantalla de inicio de sesión.
              </p>
            </div>
            <Link
              href="/forgot-password"
              className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              Solicitar nuevo enlace
            </Link>
            <Link
              href="/login"
              className="block text-xs font-bold text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Volver a Iniciar Sesión
            </Link>
          </div>
        )}

        {/* ── Éxito ── */}
        {pageState === 'success' && (
          <div className="py-2 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={30} />
            </div>
            <div className="space-y-1">
              <h3 className="font-extrabold text-base sm:text-lg text-foreground">¡Contraseña actualizada!</h3>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                Tu clave ha sido cambiada exitosamente. Ya puedes iniciar sesión con tu nueva contraseña.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>Iniciar Sesión</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* ── Formulario ── */}
        {pageState === 'ready' && (
          <>
            <div className="text-center space-y-2 mb-6">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <ShieldCheck size={22} />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-foreground uppercase tracking-tight">
                Nueva Contraseña
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                Elige una contraseña segura de al menos 8 caracteres.
              </p>
            </div>

            <form onSubmit={handleUpdate} className="space-y-4">

              {/* Nueva Contraseña */}
              <div className="space-y-1.5 text-left">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Nueva Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
                    minLength={8}
                    className="w-full h-11 pl-3.5 pr-10 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-0 top-0 h-11 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {/* Barra de fortaleza */}
                {password.length > 0 && (
                  <div className="space-y-1 pt-0.5">
                    <div className="flex gap-1">
                      {[1, 2, 3].map(i => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength ? strengthColor : 'bg-border'}`}
                        />
                      ))}
                    </div>
                    <p className={`text-[10px] font-bold ${strength === 1 ? 'text-red-500' : strength === 2 ? 'text-amber-500' : 'text-emerald-600'}`}>
                      Contraseña {strengthLabel}
                    </p>
                  </div>
                )}
              </div>

              {/* Confirmar Contraseña */}
              <div className="space-y-1.5 text-left">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Confirmar Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repite tu contraseña"
                    required
                    minLength={8}
                    className="w-full h-11 pl-3.5 pr-10 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute right-0 top-0 h-11 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    {showConfirmPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {confirmPassword.length > 0 && (
                  <p className={`text-[10px] font-bold ${password === confirmPassword ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {password === confirmPassword ? '✓ Las contraseñas coinciden' : '✗ Las contraseñas no coinciden'}
                  </p>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 text-center animate-in fade-in">
                  {error}
                </div>
              )}

              {/* Botón */}
              <button
                type="submit"
                disabled={saving || password !== confirmPassword || password.length < 8}
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <span>Cambiar Contraseña</span>
                    <Lock size={16} />
                  </>
                )}
              </button>

              <div className="text-center pt-1">
                <Link
                  href="/login"
                  className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors p-1 inline-block"
                >
                  Volver a Iniciar Sesión
                </Link>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
