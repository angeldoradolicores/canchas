'use client';

import { useState } from 'react';
import { Mail, ArrowLeft, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const supabase = createClient();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Por favor ingresa tu correo electrónico.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        // PKCE: Supabase envía code como query param → /auth/callback lo intercambia
        // El callback detecta type=recovery y redirige a /reset-password con sesión activa
        redirectTo: `${origin}/auth/callback?type=recovery&next=/reset-password`,
      });

      if (error) {
        setError(error.message || 'No se pudo enviar el correo de recuperación.');
      } else {
        setSent(true);
      }
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error inesperado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] w-full flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border/80 rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xl shadow-black/5 min-w-0 overflow-hidden transition-all">

        {/* Cabecera */}
        <div className="text-center space-y-2 mb-6">
          {/* <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mx-auto animate-pulse" /> */}
          <h2 className="text-xl sm:text-2xl font-black text-foreground uppercase tracking-tight">
            Recuperar Contraseña
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
            Te enviaremos un enlace seguro a tu correo para restablecer tu contraseña.
          </p>
        </div>

        {sent ? (
          /* Estado: Correo Enviado Exitosamente */
          <div className="py-2 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-xs">
              <CheckCircle2 size={30} />
            </div>

            <div className="space-y-1 min-w-0">
              <h3 className="font-extrabold text-base sm:text-lg text-foreground">
                ¡Correo enviado!
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground break-words max-w-xs mx-auto">
                Hemos enviado las instrucciones a{' '}
                <strong className="text-foreground font-bold">{email}</strong>.
              </p>
            </div>

            {/* Pasos a seguir */}
            <div className="p-3.5 bg-secondary/40 rounded-2xl border border-border/60 text-xs text-muted-foreground text-left space-y-1.5">
              <p className="font-bold text-foreground text-[11px] uppercase tracking-wider">
                Pasos siguientes:
              </p>
              <div className="space-y-1 leading-snug">
                <p>1. Abre tu bandeja de entrada o carpeta de spam.</p>
                <p>
                  2. Haz clic en el botón{' '}
                  <strong className="text-foreground font-semibold">Restablecer contraseña</strong>.
                </p>
                <p>3. Define tu nueva clave y vuelve a iniciar sesión.</p>
              </div>
            </div>

            {/* Acciones del estado Enviado */}
            <div className="pt-2 flex flex-col gap-2">
              <a
                href="https://mail.google.com"
                target="_blank"
                rel="noreferrer"
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
              >
                <Mail size={16} />
                <span>Abrir Gmail</span>
              </a>

              <Link
                href="/login"
                className="w-full h-11 border border-border rounded-xl text-xs sm:text-sm font-bold text-foreground hover:bg-secondary active:scale-[0.98] transition-all flex items-center justify-center cursor-pointer"
              >
                Volver a Iniciar Sesión
              </Link>
            </div>
          </div>
        ) : (
          /* Formulario de Recuperación */
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-1.5 text-left">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                autoComplete="email"
                className="w-full h-11 px-3.5 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 text-center animate-in fade-in">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Enviando enlace...</span>
                </>
              ) : (
                <>
                  <span>Enviar enlace de recuperación</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <Link
                href="/login"
                className="text-xs font-bold text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors p-1"
              >
                <ArrowLeft size={14} /> Regresar a Iniciar Sesión
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
