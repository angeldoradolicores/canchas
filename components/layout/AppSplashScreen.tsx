'use client';

import { useState, useEffect } from 'react';

export function AppSplashScreen() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Detectar si está en modo aplicación (PWA / Standalone)
    const isPWA =
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://'));

    if (!isPWA) {
      // Si estamos en navegador normal, ocultar inmediatamente sin parpadeo
      setVisible(false);
      return;
    }

    // Iniciar desvanecimiento a los 1300ms (solo en App instalada)
    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, 1300);

    // Ocultar completamente a los 1700ms
    const hideTimer = setTimeout(() => {
      setVisible(false);
    }, 1700);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <>
      {/* Ocultar inmediatamente en navegadores estándar para no retrasar la web */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media not all and (display-mode: standalone) {
          #app-splash-screen {
            display: none !important;
          }
        }
      `,
        }}
      />
      <div
        id="app-splash-screen"
        className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-white transition-opacity duration-400 ease-out ${
          fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        aria-hidden={fading}
      >
        {/* Contenedor del Logo de Cancheros */}
        <div className="relative flex flex-col items-center justify-center px-6 max-w-sm w-full animate-in zoom-in-95 duration-500">
          <div className="relative w-56 sm:w-64 max-w-[75vw] flex items-center justify-center">
            <img
              src="/cancheros.png"
              alt="Cancheros"
              width={512}
              height={512}
              priority-load="true"
              className="w-full h-auto object-contain drop-shadow-[0_8px_24px_rgba(0,122,61,0.12)]"
            />
          </div>

          {/* Animación de carga temática en verde oficial */}
          <div className="mt-8 flex flex-col items-center gap-3">
            <div className="flex gap-2 items-center">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <p className="text-[11px] font-black text-emerald-800 tracking-[0.2em] uppercase">
              Cargando Cancheros...
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
