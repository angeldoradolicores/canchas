'use client';

import React from 'react';

export type KnownPaymentMethod = 'nequi' | 'daviplata' | 'bancolombia' | 'bre-b' | 'efectivo' | 'transferencia' | 'tarjeta' | 'other';

export function normalizePaymentType(raw?: string | null): KnownPaymentMethod {
  if (!raw) return 'other';
  const clean = raw.toLowerCase().trim();
  if (clean.includes('nequi')) return 'nequi';
  if (clean.includes('daviplata') || clean.includes('davivienda')) return 'daviplata';
  if (clean.includes('bancolombia')) return 'bancolombia';
  if (clean.includes('bre-b') || clean.includes('bre b') || clean.includes('breb')) return 'bre-b';
  if (clean.includes('efectivo') || clean.includes('cash')) return 'efectivo';
  if (clean.includes('tarjeta') || clean.includes('card') || clean.includes('datafono')) return 'tarjeta';
  if (clean.includes('transf') || clean.includes('banco') || clean.includes('cuenta')) return 'transferencia';
  return 'other';
}

interface PaymentMethodLogoProps {
  method?: string | null;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

/**
 * Logos Vectoriales Oficiales Basados en las Imágenes Proporcionadas
 */
export function PaymentMethodLogo({
  method,
  className = '',
  size = 'md',
  showLabel = false,
}: PaymentMethodLogoProps) {
  const norm = normalizePaymentType(method);

  const sizeClasses = {
    xs: 'w-4 h-4 text-[9px]',
    sm: 'w-5 h-5 text-[10px]',
    md: 'w-7 h-7 text-xs',
    lg: 'w-9 h-9 text-sm',
  };

  const currentSize = sizeClasses[size] || sizeClasses.md;

  let logoElement: React.ReactNode = null;
  let labelText = method || 'Método';

  switch (norm) {
    case 'nequi':
      labelText = 'Nequi';
      logoElement = (
        <div
          className={`${currentSize} rounded-xl flex items-center justify-center shrink-0 shadow-sm overflow-hidden bg-white dark:bg-zinc-900 border border-border/40`}
          title="Nequi"
        >
          {/* Isotipo Nequi: rombos superpuestos (Rosa, Cian y Morado Oscuro) */}
          <svg viewBox="0 0 100 100" className="w-[85%] h-[85%]" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="25" y="15" width="48" height="48" rx="10" transform="rotate(18 49 39)" fill="#FF007A" />
            <rect x="20" y="25" width="48" height="48" rx="10" transform="rotate(-15 44 49)" fill="#2BB6D6" />
            <rect x="26" y="22" width="48" height="48" rx="8" transform="rotate(28 50 46)" fill="#1B002C" />
          </svg>
        </div>
      );
      break;

    case 'daviplata':
      labelText = 'Daviplata';
      logoElement = (
        <div
          className={`${currentSize} rounded-2xl flex items-center justify-center shrink-0 shadow-md overflow-hidden p-1.5`}
          style={{ background: '#E31C25' }} // Rojo oficial Davivienda/Daviplata
          title="Daviplata"
        >
          {/* Logo Daviplata: Tipografía refinada + Casita estilizada en blanco */}
          <svg
            viewBox="0 0 160 50"
            className="w-full h-full object-contain"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Casita icónica Davivienda / Daviplata */}
            <g stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
              {/* Techo */}
              <path d="M16 26 L27 15 L38 26" />
              {/* Paredes de la casa */}
              <path d="M19 25 V37 H35 V25" />
              {/* Chimenea / detalle característico */}
              <path d="M32 18 V14 H35 V21" />
            </g>

            {/* Texto "daviplata" estilizado */}
            <text
              x="46"
              y="35"
              fill="#FFFFFF"
              fontSize="23"
              fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
              fontWeight="800"
              letterSpacing="-0.5px"
            >
              davi<tspan fontWeight="400">plata</tspan>
            </text>
          </svg>
        </div>
      );
      break;

    case 'bancolombia':
      labelText = 'Bancolombia';
      logoElement = (
        <div
          className={`${currentSize} rounded-xl flex items-center justify-center shrink-0 shadow-sm overflow-hidden bg-white dark:bg-zinc-900 border border-border/40`}
          title="Bancolombia"
        >
          {/* Isotipo Bancolombia: Barras Azul, Amarilla y Roja inclinadas */}
          <svg viewBox="0 0 100 100" className="w-[85%] h-[85%]" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Barra Azul */}
            <rect x="20" y="12" width="65" height="15" rx="5" transform="rotate(-8 52 19)" fill="#002B7F" />
            {/* Barra Amarilla Central */}
            <rect x="8" y="38" width="78" height="22" rx="6" transform="rotate(-10 47 49)" fill="#FCD116" />
            {/* Barra Roja */}
            <rect x="36" y="70" width="55" height="18" rx="5" transform="rotate(-12 63 79)" fill="#E30613" />
          </svg>
        </div>
      );
      break;

    case 'bre-b':
      labelText = 'Bre-B';
      logoElement = (
        <div
          className={`${currentSize} rounded-xl flex items-center justify-center shrink-0 shadow-sm overflow-hidden`}
          style={{ background: '#32005A' }}
          title="Bre-B"
        >
          {/* Logo Bre-B: Texto estilizado con gradiente de azul a verde */}
          <svg viewBox="0 0 100 100" className="w-[90%] h-[90%]" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="brebGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#00D2FF" />
                <stop offset="100%" stopColor="#00FF87" />
              </linearGradient>
            </defs>
            <text x="50%" y="62%" textAnchor="middle" fill="url(#brebGrad)" fontSize="32" fontFamily="sans-serif" fontWeight="900" letterSpacing="-1">
              Bre-B
            </text>
          </svg>
        </div>
      );
      break;

    case 'efectivo':
      labelText = 'Efectivo';
      logoElement = (
        <div
          className={`${currentSize} rounded-xl flex items-center justify-center shrink-0 shadow-sm bg-emerald-600 text-white font-black`}
          title="Efectivo"
        >
          💵
        </div>
      );
      break;

    case 'tarjeta':
      labelText = 'Tarjeta';
      logoElement = (
        <div
          className={`${currentSize} rounded-xl flex items-center justify-center shrink-0 shadow-sm bg-indigo-600 text-white font-black`}
          title="Tarjeta"
        >
          💳
        </div>
      );
      break;

    default:
      labelText = method || 'Transferencia';
      logoElement = (
        <div
          className={`${currentSize} rounded-xl flex items-center justify-center shrink-0 shadow-sm bg-secondary border border-border text-foreground font-black`}
          title={labelText}
        >
          🏦
        </div>
      );
      break;
  }

  if (!showLabel) {
    return <span className={`inline-flex items-center shrink-0 ${className}`}>{logoElement}</span>;
  }

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      {logoElement}
      <span className="font-bold text-foreground text-xs leading-none">{labelText}</span>
    </div>
  );
}

/**
 * Chip / Pill elegante de método de pago
 */
export function PaymentMethodPill({
  method,
  number,
  name,
  className = '',
}: {
  method?: string | null;
  number?: string | null;
  name?: string | null;
  className?: string;
}) {
  const norm = normalizePaymentType(method);

  const brandStyles: Record<KnownPaymentMethod, string> = {
    nequi: 'bg-[#1B002C]/5 hover:bg-[#1B002C]/10 border-[#1B002C]/20 text-[#1B002C] dark:bg-[#1B002C]/30 dark:border-[#FF007A]/40 dark:text-pink-300',
    daviplata: 'bg-[#E31C23]/5 hover:bg-[#E31C23]/10 border-[#E31C23]/25 text-[#E31C23] dark:bg-[#E31C23]/20 dark:border-[#E31C23]/40 dark:text-red-300',
    bancolombia: 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/30 text-amber-900 dark:text-amber-200 dark:bg-amber-500/20',
    'bre-b': 'bg-[#32005A]/10 hover:bg-[#32005A]/15 border-[#00D2FF]/30 text-[#32005A] dark:text-cyan-300 dark:bg-[#32005A]/40',
    efectivo: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300',
    tarjeta: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-800 dark:text-indigo-300',
    transferencia: 'bg-secondary/70 border-border text-foreground',
    other: 'bg-secondary/70 border-border text-foreground',
  };

  const style = brandStyles[norm] || brandStyles.other;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-bold shadow-2xs transition-all ${style} ${className}`}
    >
      <PaymentMethodLogo method={method} size="sm" />
      <span className="truncate">{method}</span>
      {number && (
        <span className="font-mono text-[10px] opacity-75 truncate max-w-[120px]">
          {number}
        </span>
      )}
    </div>
  );
}