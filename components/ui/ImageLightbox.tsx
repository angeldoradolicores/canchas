'use client';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Muestra una imagen a pantalla completa. Se cierra con la X, tocando fuera o con Escape. */
export function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/90 p-3 sm:p-8 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 sm:top-5 sm:right-5 p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white cursor-pointer"
        aria-label="Cerrar imagen"
      >
        <X size={22} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onClick={e => e.stopPropagation()}
        className="max-h-[88vh] max-w-full object-contain rounded-xl shadow-2xl"
      />
    </div>,
    document.body,
  );
}
