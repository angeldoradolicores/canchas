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
        redirectTo: `${origin}/reset-password`,
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
    <div className="auth-container">
      <div className="auth-box">
        <div className="auth-head">
          <div className="auth-logo-dot" />
          <h2>Recuperar Contraseña</h2>
          <p>Te enviaremos un enlace seguro a tu correo para restablecer tu contraseña.</p>
        </div>

        {sent ? (
          <div className="py-6 text-center space-y-4 animate-in fade-in">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 shadow-lg shadow-emerald-500/10">
              <CheckCircle2 size={32} />
            </div>
            
            <div className="space-y-1">
              <h3 className="font-bold text-lg text-foreground">¡Correo enviado!</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Hemos enviado las instrucciones a <strong className="text-foreground">{email}</strong>.
              </p>
            </div>

            <div className="p-3.5 bg-secondary/50 rounded-xl border border-border text-xs text-muted-foreground text-left space-y-1.5">
              <p className="font-semibold text-foreground">Pasos siguientes:</p>
              <p>1. Abre tu bandeja de entrada o spam.</p>
              <p>2. Haz clic en el botón <strong>Restablecer contraseña</strong>.</p>
              <p>3. Define tu nueva clave y vuelve a iniciar sesión.</p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <a
                href="https://mail.google.com"
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/20"
              >
                <Mail size={16} />
                <span>Abrir Gmail</span>
              </a>

              <Link
                href="/login"
                className="w-full py-2.5 px-4 border border-border rounded-xl text-sm font-semibold hover:bg-secondary transition-all text-center"
              >
                Volver a Iniciar Sesión
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleReset} className="auth-form">
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

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="btn-primary auth-submit" disabled={loading}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              {loading ? 'Enviando enlace...' : 'Enviar enlace de recuperación'}
              {!loading && <ArrowRight size={16} />}
            </button>

            <div className="text-center pt-2">
              <Link
                href="/login"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
              >
                <ArrowLeft size={13} /> Regresar a Iniciar Sesión
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
