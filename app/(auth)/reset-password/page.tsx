'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, CheckCircle2, Lock, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Verificar si hay sesión activa para actualizar
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Supabase auto-inicia sesión al abrir el recovery link
    });
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        setError(error.message || 'Error al actualizar contraseña. El enlace puede haber expirado.');
      } else {
        setSuccess(true);
      }
    } catch (err: any) {
      setError(err.message || 'Error al restablecer la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <div className="auth-head">
          <div className="auth-logo-dot" />
          <h2>Nueva Contraseña</h2>
          <p>Ingresa tu nueva contraseña para acceder a tu cuenta.</p>
        </div>

        {success ? (
          <div className="py-6 text-center space-y-4 animate-in fade-in">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 shadow-lg shadow-emerald-500/10">
              <CheckCircle2 size={32} />
            </div>

            <div className="space-y-1">
              <h3 className="font-bold text-lg text-foreground">¡Contraseña actualizada!</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Tu clave ha sido cambiada exitosamente. Ya puedes iniciar sesión con tu nueva credencial.
              </p>
            </div>

            <button
              onClick={() => router.push('/login')}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/20"
            >
              <span>Iniciar Sesión</span>
              <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <form onSubmit={handleUpdate} className="auth-form">
            <label className="auth-field">
              <span>Nueva Contraseña</span>
              <div className="password-wrap">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                />
                <button type="button" className="pass-toggle" onClick={() => setShowPass(!showPass)}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <label className="auth-field">
              <span>Confirmar Nueva Contraseña</span>
              <div className="password-wrap">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite tu contraseña"
                  required
                  minLength={6}
                />
              </div>
            </label>

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="btn-primary auth-submit" disabled={loading}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              {loading ? 'Guardando...' : 'Cambiar Contraseña'}
              {!loading && <Lock size={16} />}
            </button>

            <div className="text-center pt-2">
              <Link
                href="/login"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
              >
                Volver a Iniciar Sesión
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
