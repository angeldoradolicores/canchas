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
    <div className="min-h-[85vh] w-full flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border/80 rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xl shadow-black/5 min-w-0 overflow-hidden transition-all">

        {/* Cabecera */}
        <div className="text-center space-y-2 mb-6">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mx-auto animate-pulse" />
          <h2 className="text-xl sm:text-2xl font-black text-foreground uppercase tracking-tight">
            Nueva Contraseña
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
            Ingresa tu nueva contraseña para acceder a tu cuenta.
          </p>
        </div>

        {success ? (
          /* Estado: Contraseña Actualizada Exitosamente */
          <div className="py-2 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-xs">
              <CheckCircle2 size={30} />
            </div>

            <div className="space-y-1 min-w-0">
              <h3 className="font-extrabold text-base sm:text-lg text-foreground">
                ¡Contraseña actualizada!
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                Tu clave ha sido cambiada exitosamente. Ya puedes iniciar sesión con tu nueva credencial.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push('/login')}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
            >
              <span>Iniciar Sesión</span>
              <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          /* Formulario para Establecer Nueva Contraseña */
          <form onSubmit={handleUpdate} className="space-y-4">

            {/* Campo 1: Nueva Contraseña */}
            <div className="space-y-1.5 text-left">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Nueva Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  className="w-full h-11 pl-3.5 pr-10 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-0 top-0 h-11 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Campo 2: Confirmar Contraseña */}
            <div className="space-y-1.5 text-left">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Confirmar Nueva Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite tu contraseña"
                  required
                  minLength={6}
                  className="w-full h-11 pl-3.5 pr-10 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
              </div>
            </div>

            {/* Mensaje de Error */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 text-center animate-in fade-in">
                {error}
              </div>
            )}

            {/* Botón Guardar */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
            >
              {loading ? (
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

            {/* Enlace Volver */}
            <div className="mt-6 pt-5 border-t border-emerald-800/10 text-center">
              <Link
                href="/login"
                className="text-xs sm:text-sm font-extrabold text-emerald-700 hover:text-emerald-800 underline underline-offset-4 decoration-emerald-500/40 hover:decoration-emerald-600 transition-all py-1 px-1 active:scale-95 inline-block"
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
