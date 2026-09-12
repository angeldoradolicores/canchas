'use client';

import { useState, useEffect } from 'react';

export function AppSplashScreen() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Detectar si está en modo aplicación (PWA)
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    
    if (!isPWA) {
      // Si estamos en web normal, lo ocultamos inmediatamente
      setVisible(false);
      return;
    }

    // Iniciar desvanecimiento a los 1400ms (solo en App)
    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, 1400);

    // Ocultar completamente a los 1900ms (solo en App)
    const hideTimer = setTimeout(() => {
      setVisible(false);
    }, 1900);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <>
      {/* Evitar el parpadeo en la web antes de que React se hidrate */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media not all and (display-mode: standalone) {
          #app-splash-screen {
            display: none !important;
          }
        }
      `}} />
      <div
        id="app-splash-screen"
        className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-white text-[#0f3822] transition-opacity duration-500 ease-out ${fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        aria-hidden={fading}
      >
      {/* Contenedor de la Imagen Cancheros */}
      <div className="relative flex flex-col items-center justify-center px-6 max-w-sm w-full animate-in zoom-in-95 duration-500">
        <div className="relative w-48 sm:w-60 max-w-[80vw] flex items-center justify-center">
          <img
            src="/cancheros.png"
            alt="Cancheros"
            className="w-full h-auto object-contain drop-shadow-[0_10px_20px_rgba(0,122,62,0.15)]"
          />
        </div>

        {/* Carga con Temática de Fútbol: Balón Rebotando + Sombra */}
        <div className="mt-8 flex flex-col items-center justify-center h-16">
          <div className="animate-bounce">
            <svg
              className="w-9 h-9 text-[#007a3e]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m12 2 3 5-3 3-3-3 3-5z" />
              <path d="M12 10v4" />
              <path d="M7.5 12 5 16" />
              <path d="M16.5 12 19 16" />
              <path d="m15 7 4.5 1.5" />
              <path d="M9 7 4.5 8.5" />
              <path d="m9 17-2 3" />
              <path d="m15 17 2 3" />
            </svg>
          </div>
          {/* Sombra Dinámica del Balón */}
          <div className="w-6 h-1 bg-[#007a3e]/20 rounded-full animate-pulse mt-1" />
        </div>

        <p className="text-[11px] font-black text-[#1b5e39]/60 tracking-widest uppercase mt-3">
          Cargando experiencia...
        </p>
      </div>
    </div>
    </>
  );
}