'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface GoogleAuthButtonProps {
  mode?: 'login' | 'register';
  role?: 'player' | 'owner';
  fullName?: string;
  redirectPath?: string;
  onError?: (error: string) => void;
  onLoadingChange?: (loading: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function GoogleAuthButton({
  mode = 'login',
  role = 'player',
  fullName = '',
  redirectPath = '/',
  onError,
  onLoadingChange,
  disabled = false,
  className,
}: GoogleAuthButtonProps) {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  // Ref para el timeout de seguridad que resetea el loading
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setLoadingState = useCallback(
    (val: boolean) => {
      setLoading(val);
      onLoadingChange?.(val);
    },
    [onLoadingChange]
  );

  // Resetear loading cuando la ventana recupera el foco
  // (cubre cierre de popup, navegación con botón atrás, etc.)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Esperar brevemente para no interrumpir un login que sí completó
        setTimeout(() => setLoadingState(false), 500);
      }
    };
    const handlePageShow = (e: PageTransitionEvent) => {
      // bfcache: usuario regresó con el botón atrás
      setLoadingState(false);
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
    };
  }, [setLoadingState]);

  const handleClick = useCallback(async () => {
    onError?.('');
    setLoadingState(true);

    // Timeout de seguridad: si en 25s no hubo redireccion, resetear el botón
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    safetyTimer.current = setTimeout(() => {
      setLoadingState(false);
    }, 25000);

    try {
      const origin = window.location.origin;
      const targetPath = role === 'owner' ? '/dashboard' : redirectPath;

      // Guardar preferencias en cookies (para el callback)
      document.cookie = `sb_pending_role=${role}; path=/; max-age=600; SameSite=Lax`;
      document.cookie = `sb_pending_next=${encodeURIComponent(targetPath)}; path=/; max-age=600; SameSite=Lax`;
      if (fullName.trim()) {
        document.cookie = `sb_pending_company=${encodeURIComponent(fullName.trim())}; path=/; max-age=600; SameSite=Lax`;
      }
      localStorage.setItem('sb_pending_role', role);
      localStorage.setItem('sb_pending_next', targetPath);
      if (fullName.trim()) localStorage.setItem('sb_pending_company', fullName.trim());

      // Construir URL de callback hacia tu propio dominio (no supabase.co)
      const params = new URLSearchParams({ role, next: targetPath });
      if (fullName.trim()) params.set('company_name', fullName.trim());
      const callbackUrl = `${origin}/auth/callback?${params.toString()}`;

      // OAuth redirect puro — siempre funciona, no depende de GIS One Tap
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account', // Siempre muestra el selector de cuenta
          },
        },
      });

      if (error) {
        throw error;
      }
      // Si no hay error, el navegador redirige a Google → resetear se hace en pageshow
    } catch (err: any) {
      console.error('Google OAuth error:', err);
      onError?.(err?.message || 'Error al conectar con Google. Intenta de nuevo.');
      setLoadingState(false);
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
    }
  }, [role, fullName, redirectPath, onError, supabase, setLoadingState]);

  const defaultClasses =
    'w-full py-2.5 px-4 bg-card border border-border hover:border-emerald-500/50 hover:bg-secondary/70 text-foreground font-semibold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-3 transition-all shadow-xs cursor-pointer active:scale-98 disabled:opacity-60';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className={className || defaultClasses}
    >
      {loading ? (
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
  );
}
