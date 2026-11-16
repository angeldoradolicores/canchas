'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, MoveHorizontal } from 'lucide-react';

/**
 * Contenedor para tablas anchas. En pantallas pequeñas avisa que se puede deslizar,
 * muestra una sombra y una flecha a la derecha mientras queden columnas por ver.
 */
export function ScrollableTable({ children, minWidth = 640, className = '' }: { children: ReactNode; minWidth?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setCanScroll(el.scrollWidth > el.clientWidth + 4);
      setAtStart(el.scrollLeft <= 4);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
    };
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    return () => { ro?.disconnect(); el.removeEventListener('scroll', update); };
  }, []);

  return (
    <div className={`w-full min-w-0 ${className}`}>
      {canScroll && atStart && (
        <p className="flex items-center gap-2 text-[11px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded-xl px-3 py-2 mb-2">
          <MoveHorizontal size={15} className="shrink-0 animate-pulse" />
          Desliza la tabla hacia la izquierda para ver todas las columnas
        </p>
      )}
      <div className="relative">
        <div ref={ref} className="overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
          <div style={{ minWidth }}>{children}</div>
        </div>
        {canScroll && !atEnd && (
          <>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-black/15 to-transparent dark:from-black/40 rounded-r-2xl" />
            <button
              type="button"
              onClick={() => ref.current?.scrollBy({ left: 260, behavior: 'smooth' })}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center cursor-pointer"
              aria-label="Ver más columnas"
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
