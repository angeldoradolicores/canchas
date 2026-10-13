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
 * Logos Vectoriales Oficiales de Métodos de Pago Colombianos:
 * Nequi, Daviplata, Bancolombia, Bre-B
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
          className={`${currentSize} rounded-lg flex items-center justify-center shrink-0 shadow-xs overflow-hidden`}
          style={{ background: '#200020' }}
          title="Nequi"
        >
          <svg viewBox="0 0 40 40" className="w-[82%] h-[82%]" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Nequi stylized "N" logo mark */}
            <rect width="40" height="40" rx="8" fill="#200020" />
            <path
              d="M10 29.5V10.5H16.2L24.5 22.8V10.5H29.5V29.5H23.5L15 17V29.5H10Z"
              fill="#FF007A"
            />
            <circle cx="30" cy="9.5" r="3" fill="#00E5FF" />
          </svg>
        </div>
      );
      break;

    case 'daviplata':
      labelText = 'Daviplata';
      logoElement = (
        <div
          className={`${currentSize} rounded-lg flex items-center justify-center shrink-0 shadow-xs overflow-hidden`}
          style={{ background: '#ED1C24' }}
          title="Daviplata"
        >
          <svg viewBox="0 0 40 40" className="w-[85%] h-[85%]" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="8" fill="#ED1C24" />
            {/* Daviplata casita / bird smile mark */}
            <path
              d="M20 7L8 17.5H12V31H28V17.5H32L20 7Z"
              fill="white"
            />
            <circle cx="20" cy="22" r="3.5" fill="#ED1C24" />
            <path
              d="M13 24C16.5 29 23.5 29 27 24"
              stroke="#ED1C24"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      );
      break;

    case 'bancolombia':
      labelText = 'Bancolombia';
      logoElement = (
        <div
          className={`${currentSize} rounded-lg flex items-center justify-center shrink-0 shadow-xs overflow-hidden bg-white dark:bg-zinc-900 border border-border/60`}
          title="Bancolombia"
        >
          <svg viewBox="0 0 40 40" className="w-[85%] h-[85%]" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="8" fill="transparent" />
            {/* Bancolombia iconic tricolor stroke ribbons */}
            <path
              d="M8 25C13 25 17 21 21 16C25 11 28 9 32 9"
              stroke="#FDDA24"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            <path
              d="M8 28.5C13 28.5 17 24.5 21 19.5C25 14.5 28 12.5 32 12.5"
              stroke="#002D62"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            <path
              d="M8 32C13 32 17 28 21 23C25 18 28 16 32 16"
              stroke="#C8102E"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      );
      break;

    case 'bre-b':
      labelText = 'Bre-B';
      logoElement = (
        <div
          className={`${currentSize} rounded-lg flex items-center justify-center shrink-0 shadow-xs overflow-hidden`}
          style={{ background: '#0B2545' }}
          title="Bre-B (Banco de la República)"
        >
          <svg viewBox="0 0 40 40" className="w-[88%] h-[88%]" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="8" fill="#0B2545" />
            {/* Bre-B stylized icon mark */}
            <circle cx="14" cy="20" r="7.5" stroke="#00D2FF" strokeWidth="3" />
            <circle cx="26" cy="20" r="7.5" stroke="#00FF87" strokeWidth="3" />
            <path
              d="M14 20L26 20"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <circle cx="20" cy="20" r="2.5" fill="white" />
          </svg>
        </div>
      );
      break;

    case 'efectivo':
      labelText = 'Efectivo';
      logoElement = (
        <div
          className={`${currentSize} rounded-lg flex items-center justify-center shrink-0 shadow-xs bg-emerald-600 text-white font-black`}
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
          className={`${currentSize} rounded-lg flex items-center justify-center shrink-0 shadow-xs bg-indigo-600 text-white font-black`}
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
          className={`${currentSize} rounded-lg flex items-center justify-center shrink-0 shadow-xs bg-secondary border border-border text-foreground font-black`}
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
 * Chip / Pill elegante de método de pago con su logo oficial
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
    nequi: 'bg-[#200020]/5 hover:bg-[#200020]/10 border-[#200020]/20 text-[#200020] dark:bg-[#200020]/30 dark:border-[#FF007A]/40 dark:text-pink-300',
    daviplata: 'bg-[#ED1C24]/5 hover:bg-[#ED1C24]/10 border-[#ED1C24]/25 text-[#ED1C24] dark:bg-[#ED1C24]/20 dark:border-[#ED1C24]/40 dark:text-red-300',
    bancolombia: 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/30 text-amber-900 dark:text-amber-200 dark:bg-amber-500/20',
    'bre-b': 'bg-[#0B2545]/10 hover:bg-[#0B2545]/15 border-[#00D2FF]/30 text-[#0B2545] dark:text-cyan-300 dark:bg-[#0B2545]/40',
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
