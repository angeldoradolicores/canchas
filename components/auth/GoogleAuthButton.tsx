'use client';

import { useEffect, useState, useCallback } from 'react';
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

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const isGISAvailable = Boolean(clientId && clientId.trim() !== '');

  // 1. Cargar el script de Google Identity Services en segundo plano si hay Client ID
  useEffect(() => {
    if (!isGISAvailable) return;

    if (window.google?.accounts?.id) {
      setIsGsiReady(true);
      return;
    }

    const scriptId = 'google-gsi-client';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        setIsGsiReady(true);
      };
      script.onerror = () => {
        console.warn('No se pudo cargar Google Identity Services, usando fallback.');
      };
      document.body.appendChild(script);
    } else {
      const checkInterval = setInterval(() => {
        if (window.google?.accounts?.id) {
          setIsGsiReady(true);
          clearInterval(checkInterval);
        }
      }, 150);
      return () => clearInterval(checkInterval);
    }
  }, [isGISAvailable]);

  // 2. Manejador de credencial de Google Identity Services (Token JWT directo)
  const handleCredentialResponse = useCallback(
    async (response: any) => {
      try {
        setLoading(true);
        onLoadingChange?.(true);
        onError?.('');

        const idToken = response.credential;
        if (!idToken) {
          throw new Error('No se recibió la credencial de Google');
        }

        const targetPath = role === 'owner' ? '/dashboard' : redirectPath;

        // Guardar preferencias temporales en cookies y localStorage
        if (typeof document !== 'undefined') {
          document.cookie = `sb_pending_role=${role}; path=/; max-age=600; SameSite=Lax`;
          document.cookie = `sb_pending_next=${encodeURIComponent(targetPath)}; path=/; max-age=600; SameSite=Lax`;
          if (fullName.trim()) {
            document.cookie = `sb_pending_company=${encodeURIComponent(fullName.trim())}; path=/; max-age=600; SameSite=Lax`;
          }
        }
        if (typeof window !== 'undefined') {
          localStorage.setItem('sb_pending_role', role);
          localStorage.setItem('sb_pending_next', targetPath);
          if (fullName.trim()) {
            localStorage.setItem('sb_pending_company', fullName.trim());
          }
        }

        // Autenticar en Supabase usando el ID Token nativo de Google (asociado a cancheros.site)
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        });

        if (error) {
          throw error;
        }

        // Redirigir al callback para asegurar sincronización de perfiles y empresas
        const params = new URLSearchParams({
          role,
          next: targetPath,
        });
        if (fullName.trim()) {
          params.set('company_name', fullName.trim());
        }

        window.location.href = `/auth/callback?${params.toString()}`;
      } catch (err: any) {
        console.error('Google ID token auth error:', err);
        const msg = err?.message || 'Error al autenticar con Google.';
        onError?.(msg);
        setLoading(false);
        onLoadingChange?.(false);
      }
    },
    [role, fullName, redirectPath, onError, onLoadingChange, supabase]
  );

  // Inicializar Google Identity Services cuando el script esté listo
  useEffect(() => {
    if (!isGISAvailable || !isGsiReady || !window.google?.accounts?.id) return;

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
    } catch (e) {
      console.warn('Error al inicializar Google Identity Services:', e);
    }
  }, [isGISAvailable, isGsiReady, clientId, handleCredentialResponse]);

  // 3. Fallback tradicional OAuth si One Tap no está disponible o es bloqueado
  const handleFallbackOAuth = async () => {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const targetPath = role === 'owner' ? '/dashboard' : redirectPath;
      const params = new URLSearchParams({
        role,
        next: targetPath,
      });
      if (fullName.trim()) {
        params.set('company_name', fullName.trim());
      }
      const callbackUrl = `${origin}/auth/callback?${params.toString()}`;

      if (typeof document !== 'undefined') {
        document.cookie = `sb_pending_role=${role}; path=/; max-age=600; SameSite=Lax`;
        document.cookie = `sb_pending_next=${encodeURIComponent(targetPath)}; path=/; max-age=600; SameSite=Lax`;
        if (fullName.trim()) {
          document.cookie = `sb_pending_company=${encodeURIComponent(fullName.trim())}; path=/; max-age=600; SameSite=Lax`;
        }
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('sb_pending_role', role);
        localStorage.setItem('sb_pending_next', targetPath);
        if (fullName.trim()) {
          localStorage.setItem('sb_pending_company', fullName.trim());
        }
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account', // Fuerza siempre el selector de cuenta de Google
          },
        },
      });

      if (error) {
        onError?.(error.message || 'Error al iniciar con Google.');
        setLoading(false);
        onLoadingChange?.(false);
      }
    } catch (err: any) {
      onError?.(err?.message || 'Error de conexión con Google.');
      setLoading(false);
      onLoadingChange?.(false);
    }
  };

  // 4. Click en el botón de Google (tu botón original con diseño exacto)
  const handleClick = async () => {
    onError?.('');
    setLoading(true);
    onLoadingChange?.(true);

    // Si GIS está disponible y listo en el navegador, intentar abrir el selector nativo de Google
    if (isGISAvailable && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        window.google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            console.log('Google One Tap no se mostró, activando login OAuth estándar.');
            handleFallbackOAuth();
          }
        });
        return;
      } catch (err) {
        console.warn('Excepción al abrir Google GIS prompt, pasando a OAuth:', err);
      }
    }

    // Fallback directo si no hay GIS
    await handleFallbackOAuth();
  };

  // Estilos por defecto idénticos a los originales del proyecto
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
