'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  ImagePlay,
  Download,
  Share2,
  Loader2,
  Sparkles,
  Clock,
  CalendarDays,
  CheckCircle2,
  XCircle,
  Palette,
  LayoutTemplate,
  Type,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  RotateCcw,
  Link2,
  Plus,
  Upload,
  Shuffle,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════════
   Tipos y constantes
═══════════════════════════════════════════════════════════════════════════ */
type SectionId = 'header' | 'title' | 'hours' | 'message' | 'footer';
type Align = 'left' | 'center' | 'right';
type FormatId = 'story' | 'post' | 'square';
type LogoPos = 'left' | 'right' | 'top' | 'hidden';
type LogoStyle = 'badge' | 'original' | 'text' | 'accent';
type CardStyle = 'round' | 'square' | 'pill' | 'solid';
type Pattern = 'none' | 'dots' | 'diagonal' | 'pitch';
type FontId = 'sans' | 'display' | 'serif' | 'rounded';
type TabId = 'content' | 'brand' | 'colors' | 'layout';

interface Palette {
  bg1: string;
  bg2: string;
  accent: string;
  text: string;
  angle: number;
}

interface Settings {
  format: FormatId;
  palette: Palette;
  pattern: Pattern;
  font: FontId;
  order: SectionId[];
  hidden: SectionId[];
  align: Align;
  logoPos: LogoPos;
  logoStyle: LogoStyle;
  logoSize: number;
  nameSize: number;
  textScale: number;
  padding: number;
  cols: 'auto' | 2 | 3 | 4;
  cardStyle: CardStyle;
  name: string;
  address: string;
  title: string;
  tag: string;
  message: string;
  price: string;
  phone: string;
  cta: string;
  website: string;
}

const FORMATS: Record<FormatId, { w: number; h: number; label: string; hint: string }> = {
  story: { w: 1080, h: 1920, label: 'Estado', hint: '9:16' },
  post: { w: 1080, h: 1350, label: 'Post', hint: '4:5' },
  square: { w: 1080, h: 1080, label: 'Cuadrado', hint: '1:1' },
};

const PRESETS: { id: string; label: string; p: Palette }[] = [
  { id: 'emerald', label: 'Esmeralda', p: { bg1: '#064e3b', bg2: '#047857', accent: '#34d399', text: '#ffffff', angle: 135 } },
  { id: 'night', label: 'Noche', p: { bg1: '#0f0c29', bg2: '#302b63', accent: '#818cf8', text: '#ffffff', angle: 135 } },
  { id: 'sunset', label: 'Atardecer', p: { bg1: '#7f1d1d', bg2: '#b45309', accent: '#fbbf24', text: '#ffffff', angle: 135 } },
  { id: 'ocean', label: 'Océano', p: { bg1: '#0c4a6e', bg2: '#0369a1', accent: '#38bdf8', text: '#ffffff', angle: 135 } },
  { id: 'neon', label: 'Neón', p: { bg1: '#09090b', bg2: '#18181b', accent: '#a3e635', text: '#fafafa', angle: 160 } },
  { id: 'gold', label: 'Carbón y oro', p: { bg1: '#1c1917', bg2: '#44403c', accent: '#facc15', text: '#fafaf9', angle: 145 } },
  { id: 'fuchsia', label: 'Fucsia', p: { bg1: '#4a044e', bg2: '#be185d', accent: '#f9a8d4', text: '#ffffff', angle: 135 } },
  { id: 'red', label: 'Pasión', p: { bg1: '#450a0a', bg2: '#dc2626', accent: '#fde047', text: '#ffffff', angle: 150 } },
  { id: 'violet', label: 'Violeta', p: { bg1: '#2e1065', bg2: '#6d28d9', accent: '#f0abfc', text: '#ffffff', angle: 135 } },
  { id: 'clean', label: 'Claro', p: { bg1: '#f8fafc', bg2: '#dbeafe', accent: '#16a34a', text: '#0f172a', angle: 135 } },
];

const QUICK_COLORS = [
  '#34d399', '#a3e635', '#facc15', '#fb923c', '#f87171', '#f472b6',
  '#c084fc', '#818cf8', '#38bdf8', '#22d3ee', '#ffffff', '#111827',
];

const FONTS: Record<FontId, { label: string; css: string }> = {
  sans: { label: 'Moderna', css: "'Inter','Segoe UI',Arial,sans-serif" },
  display: { label: 'Impacto', css: "'Arial Black','Impact','Segoe UI',sans-serif" },
  rounded: { label: 'Redonda', css: "'Trebuchet MS','Segoe UI',Arial,sans-serif" },
  serif: { label: 'Elegante', css: "Georgia,'Times New Roman',serif" },
};

const SECTION_LABELS: Record<SectionId, string> = {
  header: 'Nombre y logo',
  title: 'Título y fecha',
  hours: 'Horas disponibles',
  message: 'Mensaje',
  footer: 'Reservar',
};

const HOUR_OPTIONS = [
  '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
  '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
  '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM', '11:00 PM',
];

const MAX_HOURS = 12;
const BASE_LOGO = '/cancheros.png';
const STORAGE_KEY = 'cancheros-poster-settings-v2';
const TZ = 'America/Bogota';

const DEFAULTS: Settings = {
  format: 'story',
  palette: PRESETS[0].p,
  pattern: 'pitch',
  font: 'sans',
  order: ['header', 'title', 'hours', 'message', 'footer'],
  hidden: [],
  align: 'left',
  logoPos: 'right',
  logoStyle: 'badge',
  logoSize: 150,
  nameSize: 72,
  textScale: 1,
  padding: 70,
  cols: 'auto',
  cardStyle: 'round',
  name: '',
  address: '',
  title: 'Canchas Disponibles',
  tag: '',
  message: '',
  price: '',
  phone: '',
  cta: 'Reserva ahora',
  website: 'cancheros.site',
};

/* ═══════════════════════════════════════════════════════════════════════════
   Utilidades de color
═══════════════════════════════════════════════════════════════════════════ */
const hexToRgb = (hex: string): [number, number, number] => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const onColor = (hex: string) => (luminance(hex) > 0.45 ? '#0b0b0b' : '#ffffff');
const hslToHex = (h: number, s: number, l: number) => {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
};
const isHex = (v: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);

/* ═══════════════════════════════════════════════════════════════════════════
   Utilidades de horas y fechas (zona horaria de Colombia)
═══════════════════════════════════════════════════════════════════════════ */
const toLabel = (h: number, min: string) => {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${suffix}`;
};

/** Convierte "18:00", "6 pm", "6:00 PM", "2026-10-10T18:00:00" → "6:00 PM" */
const normalizeHour = (raw: any): string | null => {
  if (raw == null) return null;
  const str = String(
    typeof raw === 'object' ? raw.hour ?? raw.time ?? raw.label ?? raw.start ?? raw.start_time ?? '' : raw
  ).trim();
  const iso = str.match(/T(\d{2}):(\d{2})/);
  if (iso) return toLabel(+iso[1], iso[2]);
  const m = str.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/i);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ?? '00';
  const ap = m[3]?.toLowerCase().replace(/[.\s]/g, '');
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23) return null;
  return toLabel(h, min);
};

const hourToMinutes = (label: string) => {
  const m = label.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return 0;
  let h = +m[1] % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return h * 60 + +m[2];
};

const sortHours = (list: string[]) =>
  Array.from(new Set(list)).sort((a, b) => hourToMinutes(a) - hourToMinutes(b));

const bogotaNow = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: (+get('hour') % 24) * 60 + +get('minute'),
  };
};

const addDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

const formatDate = (ymd: string) => {
  const s = new Date(`${ymd}T12:00:00-05:00`).toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ,
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/* ═══════════════════════════════════════════════════════════════════════════
   Teñir el logo (canvas) para que combine con la paleta
═══════════════════════════════════════════════════════════════════════════ */
function tintImage(src: string, color: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 512;
        c.height = img.naturalHeight || 512;
        const ctx = c.getContext('2d');
        if (!ctx) return resolve(src);
        ctx.drawImage(img, 0, 0);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   Póster (se renderiza a tamaño real; la vista previa solo lo escala)
═══════════════════════════════════════════════════════════════════════════ */
interface PosterProps {
  innerRef?: React.Ref<HTMLDivElement>;
  s: Settings;
  name: string;
  address: string;
  hours: string[];
  dayLabel: string;
  dateStr: string;
  logoSrc: string;
}

function Poster({ innerRef, s, name, address, hours, dayLabel, dateStr, logoSrc }: PosterProps) {
  const dims = FORMATS[s.format];
  const { bg1, bg2, accent, text, angle } = s.palette;
  const sub = rgba(text, 0.78);
  const cardBg = rgba(text, 0.1);
  const cardBorder = rgba(accent, 0.45);
  const onAccent = onColor(accent);
  const k = s.textScale;
  const justify = s.align === 'left' ? 'flex-start' : s.align === 'center' ? 'center' : 'flex-end';
  const visible = s.order.filter((id) => !s.hidden.includes(id));
  const compact = s.format !== 'story';
  const gap = compact ? 40 : 56;

  /* — Logo — */
  const L = s.logoSize;
  const showLogo = s.logoPos !== 'hidden' && !!logoSrc;
  const logo = showLogo ? (
    s.logoStyle === 'badge' ? (
      <div
        style={{
          width: L, height: L, flexShrink: 0, borderRadius: '50%', background: '#ffffff',
          border: `8px solid ${accent}`, boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxSizing: 'border-box', padding: L * 0.12,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoSrc} alt="" style={{ width: L, height: L, objectFit: 'contain', flexShrink: 0 }} />
    )
  ) : null;

  /* — Secciones — */
  const sections: Record<SectionId, React.ReactNode> = {
    header: (
      <div
        style={{
          display: 'flex',
          flexDirection: s.logoPos === 'top' ? 'column' : 'row',
          alignItems: s.logoPos === 'top' ? justify : 'center',
          gap: 36,
        }}
      >
        {(s.logoPos === 'left' || s.logoPos === 'top') && logo}
        <div style={{ flex: s.logoPos === 'top' ? undefined : 1, minWidth: 0, textAlign: s.align }}>
          <div
            style={{
              fontSize: s.nameSize, fontWeight: 900, lineHeight: 1.02, letterSpacing: '-1px',
              textTransform: 'uppercase', color: text, wordBreak: 'break-word',
              textShadow: '0 4px 24px rgba(0,0,0,0.3)',
            }}
          >
            {name}
          </div>
          <div
            style={{
              width: 180, height: 10, borderRadius: 999, background: accent,
              margin: s.align === 'center' ? '20px auto 0' : s.align === 'right' ? '20px 0 0 auto' : '20px 0 0 0',
            }}
          />
          {address && (
            <div style={{ fontSize: 28 * k, color: sub, marginTop: 18, fontWeight: 500 }}>📍 {address}</div>
          )}
        </div>
        {s.logoPos === 'right' && logo}
      </div>
    ),

    title: (
      <div style={{ textAlign: s.align }}>
        {(s.tag || s.price) && (
          <div style={{ display: 'flex', gap: 14, justifyContent: justify, flexWrap: 'wrap', marginBottom: 24 }}>
            {s.tag && (
              <span
                style={{
                  border: `3px solid ${accent}`, color: accent, borderRadius: 999,
                  padding: '8px 26px', fontSize: 26 * k, fontWeight: 800,
                }}
              >
                {s.tag}
              </span>
            )}
            {s.price && (
              <span
                style={{
                  background: cardBg, color: text, borderRadius: 999,
                  padding: '8px 26px', fontSize: 26 * k, fontWeight: 800,
                }}
              >
                {s.price}
              </span>
            )}
          </div>
        )}
        <div style={{ fontSize: 66 * k, fontWeight: 900, lineHeight: 1.05, color: text }}>⚡ {s.title}</div>
        <div
          style={{
            display: 'inline-block', marginTop: 24, background: accent, color: onAccent,
            borderRadius: 999, padding: '14px 36px', fontSize: 34 * k, fontWeight: 800,
          }}
        >
          {dayLabel} · {dateStr}
        </div>
      </div>
    ),

    hours: (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {hours.length > 0 ? (
          (() => {
            const n = hours.length;
            const cols = s.cols === 'auto' ? (n <= 4 ? 2 : n <= 9 ? 3 : 4) : s.cols;
            const big = (cols === 2 ? 56 : cols === 3 ? 44 : 34) * k;
            const radius = s.cardStyle === 'square' ? 10 : s.cardStyle === 'pill' ? 999 : 30;
            const solid = s.cardStyle === 'solid';
            return (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 24 }}>
                {hours.map((h) => {
                  const [t, ap] = h.split(' ');
                  return (
                    <div
                      key={h}
                      style={{
                        background: solid ? accent : cardBg,
                        border: solid ? 'none' : `2px solid ${cardBorder}`,
                        borderRadius: radius,
                        padding: `${(compact ? 26 : 34) * k}px 16px`,
                        textAlign: 'center',
                        color: solid ? onAccent : accent,
                      }}
                    >
                      <div style={{ fontSize: big, fontWeight: 900, lineHeight: 1 }}>
                        {t}
                        <span style={{ fontSize: big * 0.5, fontWeight: 800, marginLeft: 8 }}>{ap}</span>
                      </div>
                      <div
                        style={{
                          fontSize: 20 * k, marginTop: 10, fontWeight: 600,
                          color: solid ? onAccent : sub, opacity: solid ? 0.8 : 1,
                        }}
                      >
                        ● Disponible
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()
        ) : (
          <div style={{ textAlign: 'center', opacity: 0.35, fontSize: 36, fontWeight: 600 }}>
            <div style={{ fontSize: 90 }}>⏰</div>
            Selecciona las horas disponibles
          </div>
        )}
      </div>
    ),

    message: s.message ? (
      <div
        style={{
          background: cardBg, border: `2px solid ${cardBorder}`, borderRadius: 30,
          padding: '36px 44px', textAlign: 'center', fontSize: 36 * k, fontWeight: 700,
          fontStyle: 'italic', color: text,
        }}
      >
        “{s.message}”
      </div>
    ) : null,

    footer: (
      <div
        style={{
          borderTop: `2px solid ${cardBorder}`, paddingTop: 44,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 36 * k, fontWeight: 900, color: accent }}>📲 {s.cta}</div>
          <div style={{ fontSize: 24 * k, color: sub, marginTop: 8, fontWeight: 500 }}>
            {s.phone ? `📞 ${s.phone}` : 'Disponibilidad limitada'}
          </div>
        </div>
        {s.website && (
          <div
            style={{
              background: accent, color: onAccent, fontWeight: 900, fontSize: 26 * k,
              borderRadius: 999, padding: '20px 40px', whiteSpace: 'nowrap',
            }}
          >
            {s.website}
          </div>
        )}
      </div>
    ),
  };

  /* — Patrón de fondo — */
  const patternEl = (() => {
    if (s.pattern === 'dots')
      return (
        <div
          style={{
            position: 'absolute', inset: 0,
            backgroundImage: `radial-gradient(${rgba(text, 0.12)} 3px, transparent 3.5px)`,
            backgroundSize: '46px 46px',
          }}
        />
      );
    if (s.pattern === 'diagonal')
      return (
        <div
          style={{
            position: 'absolute', inset: 0,
            backgroundImage: `repeating-linear-gradient(45deg, ${rgba(text, 0.06)} 0 3px, transparent 3px 34px)`,
          }}
        />
      );
    if (s.pattern === 'pitch') {
      const stroke = rgba(text, 0.1);
      const { w, h } = dims;
      return (
        <svg
          width={w} height={h} viewBox={`0 0 ${w} ${h}`}
          style={{ position: 'absolute', inset: 0 }}
        >
          <rect x="40" y="40" width={w - 80} height={h - 80} rx="24" fill="none" stroke={stroke} strokeWidth="6" />
          <line x1="40" y1={h / 2} x2={w - 40} y2={h / 2} stroke={stroke} strokeWidth="6" />
          <circle cx={w / 2} cy={h / 2} r="170" fill="none" stroke={stroke} strokeWidth="6" />
          <circle cx={w / 2} cy={h / 2} r="12" fill={stroke} />
        </svg>
      );
    }
    return null;
  })();

  return (
    <div
      ref={innerRef}
      style={{
        width: dims.w, height: dims.h, position: 'relative', overflow: 'hidden',
        boxSizing: 'border-box', padding: compact ? Math.min(s.padding, 60) : s.padding,
        background: `linear-gradient(${angle}deg, ${bg1} 0%, ${bg2} 100%)`,
        fontFamily: FONTS[s.font].css, color: text,
        display: 'flex', flexDirection: 'column',
      }}
    >
      {patternEl}
      <div
        style={{
          position: 'absolute', top: -160, right: -160, width: 640, height: 640, borderRadius: '50%',
          background: `radial-gradient(circle, ${rgba(accent, 0.22)} 0%, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: 'absolute', bottom: 100, left: -140, width: 500, height: 500, borderRadius: '50%',
          background: `radial-gradient(circle, ${rgba(accent, 0.14)} 0%, transparent 70%)`,
        }}
      />
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap }}>
        {visible.map((id, i) => {
          const node = sections[id];
          if (!node) return null;
          const isLast = i === visible.length - 1;
          return (
            <div
              key={id}
              style={
                id === 'hours'
                  ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
                  : { marginTop: id === 'footer' && isLast ? 'auto' : 0 }
              }
            >
              {node}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Controles reutilizables
═══════════════════════════════════════════════════════════════════════════ */
const inputCls =
  'w-full px-3 py-2.5 bg-background border border-border rounded-xl text-xs font-medium outline-none focus:border-emerald-600 transition-colors';

function Panel({ title, icon, children, right }: { title: string; icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
          {icon} {title}
        </h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function Seg<T extends string | number>({
  value, options, onChange,
}: {
  value: T;
  options: { v: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          onClick={() => onChange(o.v)}
          className={`flex-1 min-w-[56px] py-2 px-2 rounded-xl text-[11px] font-bold border transition-all flex items-center justify-center gap-1 ${value === o.v
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
              : 'bg-secondary text-foreground border-border hover:bg-muted'
            }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Range({
  label, value, min, max, step = 1, onChange, unit = '',
}: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <div className="flex justify-between text-[11px] font-semibold text-muted-foreground">
        <span>{label}</span>
        <span>{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-600"
      />
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="space-y-1">
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color" value={value} onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 rounded-lg border border-border bg-transparent cursor-pointer p-0.5"
        />
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (isHex(e.target.value)) onChange(e.target.value);
          }}
          className={`${inputCls} font-mono uppercase`}
          maxLength={7}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Página
═══════════════════════════════════════════════════════════════════════════ */
export default function CreateStatusPage() {
  const { user, profile, session } = useAuth();

  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingHours, setLoadingHours] = useState(false);
  const [busy, setBusy] = useState<null | 'download' | 'share' | 'cloud'>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [tab, setTab] = useState<TabId>('content');
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);
  const [forTomorrow, setForTomorrow] = useState(false);
  const [selectedHours, setSelectedHours] = useState<string[]>([]);
  const [apiHours, setApiHours] = useState<string[]>([]);
  const [customTime, setCustomTime] = useState('');
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const [logoSrc, setLogoSrc] = useState(BASE_LOGO);

  const exportRef = useRef<HTMLDivElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [previewW, setPreviewW] = useState(340);

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setS((prev) => ({ ...prev, [key]: value }));
  }, []);
  const setPalette = (patch: Partial<Palette>) => setS((prev) => ({ ...prev, palette: { ...prev.palette, ...patch } }));

  const dims = FORMATS[s.format];

  /* — Cargar y guardar diseño en el dispositivo — */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        setS({ ...DEFAULTS, ...saved, palette: { ...DEFAULTS.palette, ...(saved.palette || {}) } });
      }
    } catch { /* sin almacenamiento disponible */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignorar */ }
  }, [s, hydrated]);

  /* — Cargar empresa — */
  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    (async () => {
      try {
        const token = session?.access_token;
        const res = await fetch('/api/admin-actions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            action: 'ensure_company',
            payload: {
              owner_id: user.id,
              company_name: profile?.full_name ? `Complejo ${profile.full_name}` : 'Mi Complejo Deportivo',
            },
          }),
        });
        const json = await res.json();
        if (json.success && json.data) setCompany(json.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, profile, session]);

  /* — Logo adaptado a la paleta — */
  useEffect(() => {
    let cancel = false;
    const base = customLogo || BASE_LOGO;
    (async () => {
      let out = base;
      if (s.logoStyle === 'text') out = await tintImage(base, s.palette.text);
      else if (s.logoStyle === 'accent') out = await tintImage(base, s.palette.accent);
      if (!cancel) setLogoSrc(out);
    })();
    return () => { cancel = true; };
  }, [s.logoStyle, s.palette.text, s.palette.accent, customLogo]);

  /* — Tamaño de la vista previa — */
  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    const update = () => setPreviewW(Math.max(220, Math.min(el.clientWidth, 380)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  const scale = previewW / dims.w;
  const previewH = dims.h * scale;

  /* — Datos derivados — */
  const displayName = s.name || company?.name || 'Mi Complejo';
  const displayAddress = s.address || company?.address || '';
  const todayInfo = bogotaNow();
  const targetYmd = forTomorrow ? addDays(todayInfo.ymd, 1) : todayInfo.ymd;
  const dayLabel = forTomorrow ? 'Mañana' : 'Hoy';
  const dateStr = formatDate(targetYmd);

  const hourChoices = useMemo(
    () => sortHours([...HOUR_OPTIONS, ...selectedHours, ...apiHours]),
    [selectedHours, apiHours]
  );
  const orderedSelected = useMemo(() => sortHours(selectedHours), [selectedHours]);

  const posterProps: PosterProps = {
    s, name: displayName, address: displayAddress, hours: orderedSelected,
    dayLabel, dateStr, logoSrc,
  };

  /* — Horas disponibles automáticas — */
  const handleAutoLoad = async () => {
    if (!company?.id) {
      setNotice({ kind: 'warn', text: 'Aún no se cargó tu complejo. Intenta de nuevo en unos segundos.' });
      return;
    }
    setLoadingHours(true);
    setNotice(null);
    try {
      const { ymd, minutes } = bogotaNow();
      const date = forTomorrow ? addDays(ymd, 1) : ymd;
      const res = await fetch('/api/generate-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: company.id, forTomorrow, date, timezone: TZ }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error || 'No se pudo consultar la disponibilidad');

      const rawList: any[] = json.data?.availableHours ?? json.data?.hours ?? [];
      let list = sortHours(rawList.map(normalizeHour).filter((h): h is string => !!h));
      setApiHours(list);

      // Si es hoy, descartamos las horas que ya pasaron
      if (!forTomorrow) {
        const before = list.length;
        list = list.filter((h) => hourToMinutes(h) > minutes);
        if (before > list.length && list.length === 0) {
          setNotice({ kind: 'warn', text: 'Las horas libres de hoy ya pasaron. Prueba con “Mañana”.' });
          setSelectedHours([]);
          return;
        }
      }

      if (list.length === 0) {
        setSelectedHours([]);
        setNotice({ kind: 'warn', text: `No hay horas libres para ${dayLabel.toLowerCase()}. Puedes elegirlas a mano.` });
        return;
      }
      setSelectedHours(list.slice(0, MAX_HOURS));
      setNotice({
        kind: 'ok',
        text:
          list.length > MAX_HOURS
            ? `Se cargaron ${MAX_HOURS} de ${list.length} horas libres. Ajusta la selección si quieres otras.`
            : `Se cargaron ${list.length} horas libres de ${dayLabel.toLowerCase()}.`,
      });
    } catch (err: any) {
      setNotice({ kind: 'error', text: err?.message || 'Error consultando la disponibilidad.' });
    } finally {
      setLoadingHours(false);
    }
  };

  const toggleHour = (h: string) =>
    setSelectedHours((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : prev.length >= MAX_HOURS ? prev : [...prev, h]
    );

  const addCustomHour = () => {
    const label = normalizeHour(customTime);
    if (!label) return;
    setSelectedHours((prev) => (prev.includes(label) || prev.length >= MAX_HOURS ? prev : [...prev, label]));
    setCustomTime('');
  };

  /* — Logo propio — */
  const handleLogoFile = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCustomLogo(String(reader.result));
    reader.readAsDataURL(file);
  };

  /* — Orden de secciones — */
  const moveSection = (id: SectionId, dir: -1 | 1) =>
    setS((prev) => {
      const order = [...prev.order];
      const i = order.indexOf(id);
      const j = i + dir;
      if (j < 0 || j >= order.length) return prev;
      [order[i], order[j]] = [order[j], order[i]];
      return { ...prev, order };
    });

  const toggleSection = (id: SectionId) =>
    setS((prev) => ({
      ...prev,
      hidden: prev.hidden.includes(id) ? prev.hidden.filter((x) => x !== id) : [...prev.hidden, id],
    }));

  const surprise = () => {
    const h = Math.floor(Math.random() * 360);
    const light = Math.random() < 0.15;
    setPalette(
      light
        ? { bg1: hslToHex(h, 60, 96), bg2: hslToHex(h, 70, 88), accent: hslToHex((h + 180) % 360, 70, 38), text: '#0f172a', angle: 135 }
        : {
          bg1: hslToHex(h, 70, 12), bg2: hslToHex((h + 25) % 360, 65, 30),
          accent: hslToHex((h + 150) % 360, 85, 62), text: '#ffffff',
          angle: [120, 135, 150, 160][Math.floor(Math.random() * 4)],
        }
    );
  };

  /* ───────────────────────────────────────────────────────────────────────
     Exportar imagen: se captura un póster a tamaño real (sin escala),
     por eso la imagen sale completa y sin recortes.
  ─────────────────────────────────────────────────────────────────────── */
  const fileName = `estado-${(displayName || 'cancha').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${targetYmd}.png`;

  const renderBlob = async (): Promise<Blob> => {
    if (!exportRef.current) throw new Error('No se encontró el póster');
    const { toBlob } = await import('html-to-image');
    if ((document as any).fonts?.ready) await (document as any).fonts.ready;
    const opts = {
      width: dims.w, height: dims.h, canvasWidth: dims.w, canvasHeight: dims.h,
      pixelRatio: 1, cacheBust: true, style: { transform: 'none', margin: '0' },
    };
    await toBlob(exportRef.current, opts); // primer render: precarga imágenes y fuentes (Safari)
    const blob = await toBlob(exportRef.current, opts);
    if (!blob) throw new Error('No se pudo generar la imagen');
    return blob;
  };

  const saveBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const requireHours = () => {
    if (selectedHours.length === 0) {
      setNotice({ kind: 'warn', text: 'Selecciona al menos una hora para generar el póster.' });
      return false;
    }
    return true;
  };

  const handleDownload = async () => {
    if (!requireHours()) return;
    setBusy('download');
    setNotice(null);
    try {
      saveBlob(await renderBlob());
      setNotice({ kind: 'ok', text: 'Imagen descargada. En el celular búscala en Descargas o en tu galería.' });
    } catch (e: any) {
      setNotice({ kind: 'error', text: e?.message || 'Error generando la imagen' });
    } finally {
      setBusy(null);
    }
  };

  const handleShare = async () => {
    if (!requireHours()) return;
    setBusy('share');
    setNotice(null);
    try {
      const blob = await renderBlob();
      const file = new File([blob], fileName, { type: 'image/png' });
      const text = `⚡ Canchas disponibles ${dayLabel.toLowerCase()} en ${displayName}${s.phone ? ` · ${s.phone}` : ''}`;
      const nav = navigator as any;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: displayName, text });
      } else {
        // Escritorio / navegador sin compartir archivos: descarga + abre WhatsApp con el texto
        saveBlob(blob);
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        setNotice({ kind: 'ok', text: 'Imagen descargada. Adjúntala en tu estado o chat de WhatsApp.' });
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') setNotice({ kind: 'error', text: e?.message || 'No se pudo compartir' });
    } finally {
      setBusy(null);
    }
  };

  const handleCloud = async () => {
    if (!requireHours()) return;
    setBusy('cloud');
    setNotice(null);
    try {
      const blob = await renderBlob();
      const formData = new FormData();
      formData.append('file', new File([blob], fileName, { type: 'image/png' }));
      formData.append('folder', 'status-posts');
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (!json.url) throw new Error('No se pudo subir la imagen');
      setUploadedUrl(json.url);
      await navigator.clipboard.writeText(json.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e: any) {
      setNotice({ kind: 'error', text: e?.message || 'Error subiendo la imagen' });
    } finally {
      setBusy(null);
    }
  };

  const resetAll = () => {
    setS(DEFAULTS);
    setCustomLogo(null);
    setNotice(null);
  };

  /* ───────────────────────────────────────────────────────────────────────
     UI
  ─────────────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <Loader2 size={32} className="animate-spin text-emerald-600" />
        <span className="text-xs font-semibold text-zinc-500">Cargando tu complejo...</span>
      </div>
    );
  }

  const ActionButtons = (
    <div className="flex gap-2 w-full">
      <button
        onClick={handleDownload}
        disabled={!!busy}
        className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg transition-all"
      >
        {busy === 'download' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        Descargar
      </button>
      <button
        onClick={handleShare}
        disabled={!!busy}
        className="flex-1 py-3.5 bg-[#25D366] hover:bg-[#1fb957] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg transition-all"
      >
        {busy === 'share' ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
        Compartir
      </button>
    </div>
  );

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'content', label: 'Contenido', icon: <Clock size={13} /> },
    { id: 'brand', label: 'Marca', icon: <ImageIcon size={13} /> },
    { id: 'colors', label: 'Colores', icon: <Palette size={13} /> },
    { id: 'layout', label: 'Diseño', icon: <LayoutTemplate size={13} /> },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-32 lg:pb-16 p-4">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600">
            Marketing · Estados de WhatsApp
          </span>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground mt-1">
            <ImagePlay className="text-emerald-600" size={24} /> Crear publicación
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Diseña un póster con tus horas libres, descárgalo o compártelo directo a tu estado.
          </p>
        </div>
        <button
          onClick={resetAll}
          className="text-[11px] font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0 mt-1"
        >
          <RotateCcw size={12} /> Restablecer
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-6 items-start">
        {/* ───────── Panel de edición ───────── */}
        <div className="space-y-4 order-2 lg:order-1">
          {/* Pestañas */}
          <div className="grid grid-cols-4 gap-1.5 bg-secondary p-1.5 rounded-2xl sticky top-2 z-20">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`py-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${tab === t.id ? 'bg-card text-emerald-600 shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* ── Contenido ── */}
          {tab === 'content' && (
            <div className="space-y-4">
              <Panel title="¿Para cuándo?" icon={<CalendarDays size={14} />}>
                <Seg
                  value={forTomorrow ? 'tomorrow' : 'today'}
                  onChange={(v) => { setForTomorrow(v === 'tomorrow'); setApiHours([]); }}
                  options={[
                    { v: 'today', label: '⚡ Hoy' },
                    { v: 'tomorrow', label: '📅 Mañana' },
                  ]}
                />
                <p className="text-[11px] text-muted-foreground">{dateStr}</p>
              </Panel>

              <Panel
                title={`Horas disponibles (${selectedHours.length}/${MAX_HOURS})`}
                icon={<Clock size={14} />}
                right={
                  <button
                    onClick={handleAutoLoad}
                    disabled={loadingHours}
                    className="text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                  >
                    {loadingHours ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    Cargar automático
                  </button>
                }
              >
                {notice && (
                  <div
                    className={`text-[11px] font-semibold rounded-xl px-3 py-2 ${notice.kind === 'ok'
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400'
                        : notice.kind === 'warn'
                          ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400'
                          : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                      }`}
                  >
                    {notice.text}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  {hourChoices.map((h) => {
                    const selected = selectedHours.includes(h);
                    const fromApi = apiHours.includes(h);
                    return (
                      <button
                        key={h}
                        onClick={() => toggleHour(h)}
                        className={`relative py-2 px-1 rounded-xl text-[11px] font-bold border transition-all ${selected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-secondary text-foreground border-border hover:bg-muted'
                          }`}
                      >
                        {selected && <CheckCircle2 size={10} className="inline mr-1" />}
                        {h}
                        {fromApi && !selected && (
                          <span className="absolute top-1 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {apiHours.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">● Punto verde = hora libre según tus reservas.</p>
                )}

                <div className="flex gap-2 items-center">
                  <input
                    type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)}
                    className={inputCls}
                  />
                  <button
                    onClick={addCustomHour}
                    disabled={!customTime}
                    className="shrink-0 py-2.5 px-3 rounded-xl text-[11px] font-bold border border-border bg-secondary hover:bg-muted disabled:opacity-50 flex items-center gap-1"
                  >
                    <Plus size={12} /> Otra hora
                  </button>
                </div>

                {selectedHours.length > 0 && (
                  <button
                    onClick={() => setSelectedHours([])}
                    className="text-[11px] font-bold text-red-500 hover:text-red-600 flex items-center gap-1"
                  >
                    <XCircle size={12} /> Limpiar selección
                  </button>
                )}
              </Panel>

              <Panel title="Textos del póster" icon={<Type size={14} />}>
                <div className="space-y-2.5">
                  <input className={inputCls} value={s.title} maxLength={32} onChange={(e) => set('title', e.target.value)} placeholder="Título (ej: Canchas Disponibles)" />
                  <input className={inputCls} value={s.tag} maxLength={28} onChange={(e) => set('tag', e.target.value)} placeholder="Etiqueta (ej: ¡Últimos cupos!)" />
                  <input className={inputCls} value={s.price} maxLength={28} onChange={(e) => set('price', e.target.value)} placeholder="Precio (ej: Desde $60.000/hora)" />
                  <textarea
                    value={s.message} maxLength={80} rows={2}
                    onChange={(e) => set('message', e.target.value)}
                    placeholder="Mensaje adicional (ej: ¡Reserva ya y asegura tu cancha!)"
                    className={`${inputCls} resize-none`}
                  />
                  <p className="text-[10px] text-muted-foreground text-right">{s.message.length}/80</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <input className={inputCls} value={s.cta} maxLength={24} onChange={(e) => set('cta', e.target.value)} placeholder="Botón (ej: Reserva ahora)" />
                    <input className={inputCls} value={s.phone} maxLength={20} onChange={(e) => set('phone', e.target.value)} placeholder="WhatsApp" inputMode="tel" />
                  </div>
                  <input className={inputCls} value={s.website} maxLength={30} onChange={(e) => set('website', e.target.value)} placeholder="Sitio web" />
                </div>
              </Panel>
            </div>
          )}

          {/* ── Marca ── */}
          {tab === 'brand' && (
            <div className="space-y-4">
              <Panel title="Nombre del complejo" icon={<Type size={14} />}>
                <input className={inputCls} value={s.name} maxLength={40} onChange={(e) => set('name', e.target.value)} placeholder={company?.name || 'Nombre del complejo'} />
                <input className={inputCls} value={s.address} maxLength={50} onChange={(e) => set('address', e.target.value)} placeholder={company?.address || 'Dirección o barrio'} />
                <Range label="Tamaño del nombre" value={s.nameSize} min={36} max={120} onChange={(v) => set('nameSize', v)} unit="px" />
              </Panel>

              <Panel title="Logo" icon={<ImageIcon size={14} />}>
                <p className="text-[11px] font-semibold text-muted-foreground">Posición</p>
                <Seg
                  value={s.logoPos}
                  onChange={(v) => set('logoPos', v)}
                  options={[
                    { v: 'left', label: 'Izquierda' },
                    { v: 'right', label: 'Derecha' },
                    { v: 'top', label: 'Arriba' },
                    { v: 'hidden', label: 'Oculto' },
                  ]}
                />
                <p className="text-[11px] font-semibold text-muted-foreground pt-1">Estilo según la paleta</p>
                <Seg
                  value={s.logoStyle}
                  onChange={(v) => set('logoStyle', v)}
                  options={[
                    { v: 'badge', label: 'Medallón' },
                    { v: 'text', label: 'Color texto' },
                    { v: 'accent', label: 'Color acento' },
                    { v: 'original', label: 'Original' },
                  ]}
                />
                <p className="text-[10px] text-muted-foreground">
                  “Color texto” y “Color acento” pintan el logo con tu paleta (funciona mejor con PNG de fondo transparente). “Medallón” lo pone sobre un círculo blanco y se ve bien con cualquier color.
                </p>
                <Range label="Tamaño del logo" value={s.logoSize} min={80} max={260} onChange={(v) => set('logoSize', v)} unit="px" />
                <div className="flex gap-2">
                  <label className="flex-1 cursor-pointer py-2.5 rounded-xl text-[11px] font-bold border border-border bg-secondary hover:bg-muted flex items-center justify-center gap-1.5">
                    <Upload size={12} /> Subir mi logo
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoFile(e.target.files?.[0])} />
                  </label>
                  {customLogo && (
                    <button
                      onClick={() => setCustomLogo(null)}
                      className="py-2.5 px-3 rounded-xl text-[11px] font-bold border border-border bg-secondary hover:bg-muted"
                    >
                      Usar el de Cancheros
                    </button>
                  )}
                </div>
              </Panel>
            </div>
          )}

          {/* ── Colores ── */}
          {tab === 'colors' && (
            <div className="space-y-4">
              <Panel
                title="Paletas listas"
                icon={<Palette size={14} />}
                right={
                  <button onClick={surprise} className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                    <Shuffle size={12} /> Sorpréndeme
                  </button>
                }
              >
                <div className="grid grid-cols-5 gap-2">
                  {PRESETS.map((p) => {
                    const active =
                      s.palette.bg1 === p.p.bg1 && s.palette.bg2 === p.p.bg2 && s.palette.accent === p.p.accent;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setS((prev) => ({ ...prev, palette: p.p }))}
                        title={p.label}
                        className={`relative h-12 rounded-xl border-2 transition-all overflow-hidden ${active ? 'border-emerald-500 scale-[0.94] shadow-md' : 'border-transparent opacity-80 hover:opacity-100'
                          }`}
                        style={{ background: `linear-gradient(${p.p.angle}deg, ${p.p.bg1}, ${p.p.bg2})` }}
                      >
                        <span className="absolute bottom-1 right-1 h-3 w-3 rounded-full ring-2 ring-white/40" style={{ background: p.p.accent }} />
                      </button>
                    );
                  })}
                </div>
              </Panel>

              <Panel title="Colores personalizados" icon={<Palette size={14} />}>
                <div className="grid grid-cols-2 gap-3">
                  <ColorField label="Fondo (inicio)" value={s.palette.bg1} onChange={(v) => setPalette({ bg1: v })} />
                  <ColorField label="Fondo (final)" value={s.palette.bg2} onChange={(v) => setPalette({ bg2: v })} />
                  <ColorField label="Acento (horas y botones)" value={s.palette.accent} onChange={(v) => setPalette({ accent: v })} />
                  <ColorField label="Texto" value={s.palette.text} onChange={(v) => setPalette({ text: v })} />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground">Acento rápido</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {QUICK_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setPalette({ accent: c })}
                        className={`h-7 w-7 rounded-full border-2 ${s.palette.accent.toLowerCase() === c ? 'border-emerald-500 scale-110' : 'border-border'}`}
                        style={{ background: c }}
                        aria-label={`Acento ${c}`}
                      />
                    ))}
                  </div>
                </div>
                <Range label="Ángulo del degradado" value={s.palette.angle} min={0} max={360} step={5} onChange={(v) => setPalette({ angle: v })} unit="°" />
              </Panel>

              <Panel title="Textura de fondo" icon={<LayoutTemplate size={14} />}>
                <Seg
                  value={s.pattern}
                  onChange={(v) => set('pattern', v)}
                  options={[
                    { v: 'pitch', label: '⚽ Cancha' },
                    { v: 'dots', label: 'Puntos' },
                    { v: 'diagonal', label: 'Líneas' },
                    { v: 'none', label: 'Liso' },
                  ]}
                />
              </Panel>
            </div>
          )}

          {/* ── Diseño ── */}
          {tab === 'layout' && (
            <div className="space-y-4">
              <Panel title="Formato de imagen" icon={<LayoutTemplate size={14} />}>
                <Seg
                  value={s.format}
                  onChange={(v) => set('format', v)}
                  options={(Object.keys(FORMATS) as FormatId[]).map((f) => ({
                    v: f,
                    label: `${FORMATS[f].label} ${FORMATS[f].hint}`,
                  }))}
                />
                <p className="text-[10px] text-muted-foreground">
                  {dims.w}×{dims.h} px. “Estado” llena toda la pantalla en WhatsApp.
                </p>
              </Panel>

              <Panel title="Orden de los bloques" icon={<LayoutTemplate size={14} />}>
                <div className="space-y-1.5">
                  {s.order.map((id, i) => {
                    const hidden = s.hidden.includes(id);
                    return (
                      <div
                        key={id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-secondary ${hidden ? 'opacity-50' : ''}`}
                      >
                        <span className="flex-1 text-xs font-bold">{SECTION_LABELS[id]}</span>
                        <button onClick={() => moveSection(id, -1)} disabled={i === 0} className="p-1 rounded-lg hover:bg-muted disabled:opacity-30" aria-label="Subir">
                          <ArrowUp size={14} />
                        </button>
                        <button onClick={() => moveSection(id, 1)} disabled={i === s.order.length - 1} className="p-1 rounded-lg hover:bg-muted disabled:opacity-30" aria-label="Bajar">
                          <ArrowDown size={14} />
                        </button>
                        <button onClick={() => toggleSection(id)} className="p-1 rounded-lg hover:bg-muted" aria-label={hidden ? 'Mostrar' : 'Ocultar'}>
                          {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Panel title="Alineación del texto" icon={<AlignLeft size={14} />}>
                <Seg
                  value={s.align}
                  onChange={(v) => set('align', v)}
                  options={[
                    { v: 'left', label: <AlignLeft size={16} /> },
                    { v: 'center', label: <AlignCenter size={16} /> },
                    { v: 'right', label: <AlignRight size={16} /> },
                  ]}
                />
              </Panel>

              <Panel title="Tarjetas de horas" icon={<Clock size={14} />}>
                <Seg
                  value={s.cardStyle}
                  onChange={(v) => set('cardStyle', v)}
                  options={[
                    { v: 'round', label: 'Redondas' },
                    { v: 'square', label: 'Cuadradas' },
                    { v: 'pill', label: 'Píldora' },
                    { v: 'solid', label: 'Sólidas' },
                  ]}
                />
                <p className="text-[11px] font-semibold text-muted-foreground pt-1">Columnas</p>
                <Seg
                  value={s.cols}
                  onChange={(v) => set('cols', v)}
                  options={[
                    { v: 'auto', label: 'Auto' },
                    { v: 2, label: '2' },
                    { v: 3, label: '3' },
                    { v: 4, label: '4' },
                  ]}
                />
              </Panel>

              <Panel title="Tipografía y espacios" icon={<Type size={14} />}>
                <Seg
                  value={s.font}
                  onChange={(v) => set('font', v)}
                  options={(Object.keys(FONTS) as FontId[]).map((f) => ({ v: f, label: FONTS[f].label }))}
                />
                <Range label="Tamaño del texto" value={Math.round(s.textScale * 100)} min={80} max={130} step={5} onChange={(v) => set('textScale', v / 100)} unit="%" />
                <Range label="Márgenes" value={s.padding} min={40} max={120} step={5} onChange={(v) => set('padding', v)} unit="px" />
              </Panel>
            </div>
          )}
        </div>

        {/* ───────── Vista previa ───────── */}
        <div className="order-1 lg:order-2 lg:sticky lg:top-4 space-y-3">
          <p className="text-xs font-bold text-muted-foreground px-1">
            Vista previa · {dims.w}×{dims.h} px
          </p>

          <div ref={previewBoxRef} className="w-full flex justify-center">
            <div
              style={{ width: previewW, height: previewH }}
              className="relative overflow-hidden rounded-2xl shadow-2xl border border-border"
            >
              <div style={{ position: 'absolute', top: 0, left: 0, transformOrigin: 'top left', transform: `scale(${scale})` }}>
                <Poster {...posterProps} />
              </div>
            </div>
          </div>

          <div className="hidden lg:block space-y-3">
            {ActionButtons}
            <button
              onClick={handleCloud}
              disabled={!!busy}
              className="w-full text-[11px] font-bold text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 py-1"
            >
              {busy === 'cloud' ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
              {copied ? '✅ Enlace copiado' : 'Subir a la nube y copiar enlace'}
            </button>
            {uploadedUrl && (
              <p className="text-[10px] text-center text-emerald-700 dark:text-emerald-400 break-all">{uploadedUrl}</p>
            )}
          </div>

          <p className="text-[10px] text-center text-muted-foreground">
            iPhone: toca “Compartir” y elige “Guardar imagen” para que quede en tu galería.
          </p>
        </div>
      </div>

      {/* Barra de acciones fija en móvil */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 p-3 bg-background/95 backdrop-blur border-t border-border">
        <div className="max-w-md mx-auto">{ActionButtons}</div>
      </div>

      {/* Póster a tamaño real, fuera de pantalla, solo para exportar */}
      <div aria-hidden style={{ position: 'fixed', left: -20000, top: 0, pointerEvents: 'none' }}>
        <Poster {...posterProps} innerRef={exportRef} />
      </div>
    </div>
  );
}