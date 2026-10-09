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

declare global {
  interface Window {
    google?: any;
  }
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
  const [isGsiReady, setIsGsiReady] = useState(false);
  const supabase = createClient();
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clientId =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    '865002599645-uelie4dpe5ulvbt2us9hdt50scfu759i.apps.googleusercontent.com';

  const setLoadingState = useCallback(
    (val: boolean) => {
      setLoading(val);
      onLoadingChange?.(val);
    },
    [onLoadingChange]
  );

  // ── 1. Cargar el script de Google Identity Services si no existe ───
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.google?.accounts?.id) {
      setIsGsiReady(true);
      return;
    }

    const existingScript = document.getElementById('google-gsi-client');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'google-gsi-client';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => setIsGsiReady(true);
      script.onerror = () => {
        console.warn('No se pudo cargar Google Identity Services (posible ad-blocker).');
      };
      document.head.appendChild(script);
    } else {
      const checkGsi = setInterval(() => {
        if (window.google?.accounts?.id) {
          setIsGsiReady(true);
          clearInterval(checkGsi);
        }
      }, 100);
      return () => clearInterval(checkGsi);
    }
  }, []);

  // ── 2. Manejar cuando el usuario cierra la ventana emergente de Google ───
  useEffect(() => {
    const handleFocus = () => {
      // Si la ventana recupera el foco tras cerrar el popup de Google,
      // esperamos brevemente y liberamos el botón para que pueda volver a presionar.
      setTimeout(() => {
        setLoadingState(false);
        if (safetyTimer.current) clearTimeout(safetyTimer.current);
      }, 700);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setTimeout(() => {
          setLoadingState(false);
          if (safetyTimer.current) clearTimeout(safetyTimer.current);
        }, 700);
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
    };
  }, [setLoadingState]);

  // ── 3. Manejador de credencial cuando el usuario selecciona su cuenta ───
  const handleCredentialResponse = useCallback(
    async (response: any) => {
      try {
        setLoadingState(true);
        onError?.('');

        const idToken = response?.credential;
        if (!idToken) {
          throw new Error('No se recibió la credencial de Google.');
        }

        const targetPath = role === 'owner' ? '/dashboard' : redirectPath;

        // Guardar preferencias en cookies y localStorage para el callback
        document.cookie = `sb_pending_role=${role}; path=/; max-age=600; SameSite=Lax`;
        document.cookie = `sb_pending_next=${encodeURIComponent(targetPath)}; path=/; max-age=600; SameSite=Lax`;
        if (fullName.trim()) {
          document.cookie = `sb_pending_company=${encodeURIComponent(fullName.trim())}; path=/; max-age=600; SameSite=Lax`;
        }
        localStorage.setItem('sb_pending_role', role);
        localStorage.setItem('sb_pending_next', targetPath);
        if (fullName.trim()) {
          localStorage.setItem('sb_pending_company', fullName.trim());
        }

        // ✅ signInWithIdToken puro y directo (sin nonce para garantizar 0 errores de coincidencia)
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        });

        if (error) {
          throw error;
        }

        // Redirigir a nuestro callback de cancheros.site para sincronizar perfiles y sesión
        const params = new URLSearchParams({ role, next: targetPath });
        if (fullName.trim()) params.set('company_name', fullName.trim());
        window.location.href = `/auth/callback?${params.toString()}`;
      } catch (err: any) {
        console.error('Google ID token auth error:', err);
        onError?.(err?.message || 'Error al autenticar con Google. Intenta nuevamente.');
        setLoadingState(false);
      }
    },
    [role, fullName, redirectPath, onError, supabase, setLoadingState]
  );

  // ── 4. Inicializar y renderizar botón nativo de Google en capa invisible ───
  useEffect(() => {
    if (!isGsiReady || !window.google?.accounts?.id || !googleBtnRef.current) return;

    try {
      // Inicializar GIS con cancheros.site
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
        itp_support: true,
      });

      // Renderizar el botón oficial de Google dentro del contenedor overlay
      googleBtnRef.current.innerHTML = '';
      const containerWidth = googleBtnRef.current.clientWidth || 360;
      const targetWidth = Math.min(Math.max(containerWidth, 240), 400);

      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: 'standard',
        shape: 'rectangular',
        theme: 'outline',
        text: mode === 'login' ? 'continue_with' : 'signup_with',
        size: 'large',
        logo_alignment: 'left',
        width: targetWidth,
        locale: 'es',
      });
    } catch (e) {
      console.warn('Error al inicializar Google Identity Services:', e);
    }
  }, [isGsiReady, clientId, mode, handleCredentialResponse]);

  // ── 5. Click de respaldo si se presiona fuera del iframe o antes de montar ───
  const handleClick = useCallback(() => {
    onError?.('');
    setLoadingState(true);

    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    safetyTimer.current = setTimeout(() => {
      setLoadingState(false);
    }, 15000);

    // Limpiar cookie de supresión de Google para asegurar que vuelva a abrir la ventana
    try {
      document.cookie = 'g_state=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    } catch {}

    if (window.google?.accounts?.id) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
        itp_support: true,
      });

      window.google.accounts.id.prompt((notification: any) => {
        if (
          notification.isNotDisplayed() ||
          notification.isSkippedMoment() ||
          notification.isDismissedMoment()
        ) {
          setLoadingState(false);
          if (safetyTimer.current) clearTimeout(safetyTimer.current);
        }
      });
    } else {
      setTimeout(() => {
        setLoadingState(false);
        onError?.('Cargando servicio de Google, intenta en un segundo.');
      }, 1000);
    }
  }, [clientId, handleCredentialResponse, onError, setLoadingState]);

  const defaultClasses =
    'w-full py-2.5 px-4 bg-card border border-border hover:border-emerald-500/50 hover:bg-secondary/70 text-foreground font-semibold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-3 transition-all shadow-xs cursor-pointer active:scale-98 disabled:opacity-60';

  return (
    <div className="relative w-full overflow-hidden rounded-2xl group">
      {/* ── BOTÓN VISUAL PERSONALIZADO (100% tu diseño, nunca cortado ni feo) ── */}
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        className={className || defaultClasses}
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin text-emerald-500" />
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

      {/* ── CAPA NATIVA OFICIAL DE GOOGLE IDENTITY (Abre ventana emergente con cancheros.site) ── */}
      {!loading && !disabled && (
        <div
          ref={googleBtnRef}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full opacity-[0.001] cursor-pointer flex items-center justify-center overflow-hidden z-10 [&_iframe]:!w-full [&_iframe]:!h-full [&>div]:!w-full [&>div]:!h-full"
          style={{ minHeight: '44px' }}
        />
      )}
    </div>
  );
}
