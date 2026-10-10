'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  Download, Share2, Loader2, Sparkles, Clock, CalendarDays,
  CheckCircle2, XCircle, Palette, LayoutTemplate,
  RotateCcw, Shuffle, AlignLeft, AlignCenter,
  AlignRight, Upload, Plus, Type, X, ChevronRight,
  Sliders, Crop, Layers
} from 'lucide-react';
import Link from 'next/link';

/* ══════════════════════════════════════════════════════════
   TIPOS
══════════════════════════════════════════════════════════ */
type FormatId = 'story' | 'post' | 'square';
type Pattern = 'none' | 'dots' | 'diagonal' | 'pitch';
type CardStyle = 'round' | 'pill' | 'solid';
type LogoStyle = 'badge' | 'tint' | 'original';
type Align = 'left' | 'center' | 'right';
type SectionId = 'header' | 'title' | 'hours' | 'message' | 'footer';
type MenuSheet = 'none' | 'pitches' | 'hours' | 'colors' | 'texts' | 'design' | 'format';

interface Pal { bg1: string; bg2: string; accent: string; text: string; angle: number }
interface Cfg {
  format: FormatId; pal: Pal; pattern: Pattern; cardStyle: CardStyle;
  logoStyle: LogoStyle; logoSize: number; nameSize: number; align: Align; padding: number;
  order: SectionId[]; hidden: SectionId[];
  name: string; address: string; title: string; tag: string;
  message: string; phone: string; cta: string; website: string;
}

/* ══════════════════════════════════════════════════════════
   CONSTANTES
══════════════════════════════════════════════════════════ */
const FMT: Record<FormatId, { w: number; h: number; ar: string; label: string }> = {
  story: { w: 1080, h: 1920, ar: '9/16', label: 'Estado WhatsApp (9:16)' },
  post: { w: 1080, h: 1350, ar: '4/5', label: 'Post Instagram (4:5)' },
  square: { w: 1080, h: 1080, ar: '1/1', label: 'Cuadrado (1:1)' },
};

const PRESETS: { id: string; label: string; p: Pal }[] = [
  { id: 'emerald', label: 'Esmeralda', p: { bg1: '#064e3b', bg2: '#047857', accent: '#34d399', text: '#ffffff', angle: 135 } },
  { id: 'night', label: 'Noche', p: { bg1: '#0f0c29', bg2: '#302b63', accent: '#818cf8', text: '#ffffff', angle: 135 } },
  { id: 'sunset', label: 'Atardecer', p: { bg1: '#7f1d1d', bg2: '#b45309', accent: '#fbbf24', text: '#ffffff', angle: 135 } },
  { id: 'ocean', label: 'Océano', p: { bg1: '#0c4a6e', bg2: '#0369a1', accent: '#38bdf8', text: '#ffffff', angle: 135 } },
  { id: 'neon', label: 'Neón', p: { bg1: '#09090b', bg2: '#18181b', accent: '#a3e635', text: '#fafafa', angle: 160 } },
  { id: 'gold', label: 'Oro', p: { bg1: '#1c1917', bg2: '#44403c', accent: '#facc15', text: '#fafaf9', angle: 145 } },
  { id: 'passion', label: 'Pasión', p: { bg1: '#450a0a', bg2: '#dc2626', accent: '#fde047', text: '#ffffff', angle: 150 } },
  { id: 'violet', label: 'Violeta', p: { bg1: '#2e1065', bg2: '#6d28d9', accent: '#f0abfc', text: '#ffffff', angle: 135 } },
  { id: 'clean', label: 'Claro', p: { bg1: '#f0fdf4', bg2: '#dcfce7', accent: '#16a34a', text: '#0f172a', angle: 135 } },
];

const QUICK_ACCENT = [
  '#34d399', '#a3e635', '#facc15', '#fb923c', '#f87171', '#f472b6',
  '#c084fc', '#818cf8', '#38bdf8', '#22d3ee', '#ffffff', '#111827',
];

const ALL_HOURS = [
  '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
  '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
  '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM',
];

const MAX_H = 12;
const TZ = 'America/Bogota';
const LOGO = '';
const STORE = 'cancheros-status-v4';

const DEFAULTS: Cfg = {
  format: 'story', pattern: 'pitch', cardStyle: 'round', logoStyle: 'original',
  logoSize: 140, nameSize: 64, align: 'left', padding: 70,
  order: ['header', 'title', 'hours', 'message', 'footer'], hidden: [],
  name: '', address: '', title: 'Horarios Disponibles',
  tag: '', message: '', phone: '', cta: 'Reserva ahora', website: 'CANCHEROS.SITE',
  pal: PRESETS[0].p,
};

/* ══════════════════════════════════════════════════════════
   COLOR UTILS
══════════════════════════════════════════════════════════ */
const hexRgb = (h: string): [number, number, number] => {
  let s = h.replace('#', ''); if (s.length === 3) s = s.split('').map(c => c + c).join('');
  const n = parseInt(s, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (h: string, a: number) => { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; };
const lum = (h: string) => { const [r, g, b] = hexRgb(h).map(v => { const c = v / 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
const onC = (h: string) => lum(h) > .4 ? '#0b0b0b' : '#ffffff';
const hslH = (h: number, s: number, l: number) => { s /= 100; l /= 100; const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))), t = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0'); return `#${t(f(0))}${t(f(8))}${t(f(4))}`; };

/* ══════════════════════════════════════════════════════════
   HOUR / DATE UTILS (Colombia)
══════════════════════════════════════════════════════════ */
const bogotaNow = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const g = (t: string) => p.find(x => x.type === t)?.value ?? '0';
  return { ymd: `${g('year')}-${g('month')}-${g('day')}`, min: (+g('hour') % 24) * 60 + (+g('minute')) };
};
const addDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const fmtDate = (ymd: string) => { const s = new Date(`${ymd}T12:00:00-05:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }); return s[0].toUpperCase() + s.slice(1); };
const h2min = (l: string) => { const m = l.match(/(\d+):(\d+)\s*(AM|PM)/i); if (!m) return 0; let h = +m[1] % 12; if (m[3].toUpperCase() === 'PM') h += 12; return h * 60 + (+m[2]); };
const sortH = (arr: string[]) => [...new Set(arr)].sort((a, b) => h2min(a) - h2min(b));

/* ══════════════════════════════════════════════════════════
   TINT LOGO
══════════════════════════════════════════════════════════ */
function tintLogo(src: string, color: string): Promise<string> {
  return new Promise(res => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { try { const c = document.createElement('canvas'); c.width = img.naturalWidth || 512; c.height = img.naturalHeight || 512; const ctx = c.getContext('2d'); if (!ctx) return res(src); ctx.drawImage(img, 0, 0); ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = color; ctx.fillRect(0, 0, c.width, c.height); res(c.toDataURL('image/png')); } catch { res(src); } };
    img.onerror = () => res(src); img.src = src;
  });
}

/* ══════════════════════════════════════════════════════════
   POSTER COMPONENT
══════════════════════════════════════════════════════════ */
interface PosterProps {
  innerRef?: React.Ref<HTMLDivElement>;
  cfg: Cfg; hours: string[]; dayLabel: string; dateStr: string; logoSrc: string; pitchName?: string;
}

function Poster({ innerRef, cfg, hours, dayLabel, dateStr, logoSrc, pitchName }: PosterProps) {
  const dims = FMT[cfg.format];
  const { bg1, bg2, accent, text, angle } = cfg.pal;
  const sub = rgba(text, .75);
  const cardBg = rgba(text, .1);
  const cardBdr = rgba(accent, .45);
  const onAccent = onC(accent);
  const compact = cfg.format !== 'story';
  const gap = compact ? 40 : 58;
  const L = cfg.logoSize;
  const visible = cfg.order.filter(id => !cfg.hidden.includes(id));

  const n = hours.length;
  const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const fsBig = (cols === 2 ? 58 : cols === 3 ? 46 : 36);
  const radius = cfg.cardStyle === 'pill' ? 999 : cfg.cardStyle === 'solid' ? 16 : 30;
  const solid = cfg.cardStyle === 'solid';

  /* — Logo con efecto medallón + glow grande — */
  const logoEl = logoSrc ? (
    cfg.logoStyle === 'original' ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoSrc} alt="" style={{
        width: L, height: L, objectFit: 'contain', flexShrink: 0,
        filter: `drop-shadow(0 12px 32px ${rgba(accent, .5)})`
      }} />
    ) : (
      <div style={{
        width: L, height: L, borderRadius: '50%', flexShrink: 0,
        background: '#ffffff', border: `10px solid ${accent}`,
        boxShadow: `0 0 0 6px ${rgba(accent, .25)}, 0 20px 60px ${rgba(accent, .5)}, 0 8px 24px rgba(0,0,0,.4)`,
        boxSizing: 'border-box', padding: L * .1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
    )
  ) : null;

  const secs: Partial<Record<SectionId, React.ReactNode>> = {
    header: (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 32 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: cfg.nameSize, fontWeight: 900, letterSpacing: '-1px',
            textTransform: 'uppercase', color: text, lineHeight: 1.02, wordBreak: 'break-word',
            textShadow: '0 4px 20px rgba(0,0,0,.3)'
          }}>
            {cfg.name || 'Mi Complejo'}
          </div>
          <div style={{ width: 160, height: 8, borderRadius: 999, background: accent, marginTop: 18 }} />
          {cfg.address && <div style={{ fontSize: 26, color: sub, marginTop: 14, fontWeight: 500 }}>📍 {cfg.address}</div>}
        </div>
        {logoEl}
      </div>
    ),

    title: (
      <div style={{ textAlign: cfg.align }}>
        {cfg.tag ? (
          <div style={{
            display: 'inline-block', border: `3px solid ${accent}`, color: accent,
            borderRadius: 999, padding: '8px 28px', fontSize: 26, fontWeight: 800, marginBottom: 16
          }}>
            {cfg.tag}
          </div>
        ) : pitchName ? (
          <div style={{
            display: 'inline-block', border: `3px solid ${accent}`, color: accent,
            borderRadius: 999, padding: '8px 28px', fontSize: 26, fontWeight: 800, marginBottom: 16
          }}>
            {pitchName}
          </div>
        ) : null}
        <div style={{ fontSize: compact ? 56 : 68, fontWeight: 900, lineHeight: 1.05, color: text }}>{cfg.title}</div>
        <div style={{
          display: 'inline-block', marginTop: 18, background: accent, color: onAccent,
          borderRadius: 999, padding: '14px 36px', fontSize: 32, fontWeight: 800, textTransform: 'capitalize'
        }}>
          {dayLabel} · {dateStr}
        </div>
      </div>
    ),

    hours: (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {hours.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 22 }}>
            {hours.map(h => {
              const [t, ap] = h.split(' ');
              return (
                <div key={h} style={{
                  background: solid ? accent : cardBg, border: solid ? 'none' : `2px solid ${cardBdr}`,
                  borderRadius: radius, padding: `${compact ? 24 : 30}px 14px`,
                  textAlign: 'center', color: solid ? onAccent : accent,
                }}>
                  <div style={{ fontSize: fsBig, fontWeight: 900, lineHeight: 1 }}>
                    {t}<span style={{ fontSize: fsBig * .5, fontWeight: 800, marginLeft: 6 }}>{ap}</span>
                  </div>
                  <div style={{
                    fontSize: 19, marginTop: 8, fontWeight: 600,
                    color: solid ? rgba(onAccent, .8) : sub
                  }}>● Disponible</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', opacity: .35, fontSize: 36 }}>
            <div style={{ fontSize: 90, marginBottom: 16 }}>⏰</div>
            Selecciona las horas disponibles
          </div>
        )}
      </div>
    ),

    message: cfg.message ? (
      <div style={{
        background: cardBg, border: `2px solid ${cardBdr}`, borderRadius: 30,
        padding: '36px 44px', textAlign: 'center', fontSize: 34, fontWeight: 700,
        fontStyle: 'italic', color: text
      }}>"{cfg.message}"</div>
    ) : undefined,

    footer: (
      <div style={{
        borderTop: `2px solid ${cardBdr}`, paddingTop: 48,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24
      }}>
        <div>
          <div style={{ fontSize: 32, fontWeight: 900, color: accent }}>📲 {cfg.cta}</div>
          <div style={{ fontSize: 22, color: sub, marginTop: 8 }}>
            {cfg.phone ? `📞 ${cfg.phone}` : 'Disponibilidad limitada'}
          </div>
        </div>
        {cfg.website && (
          <div style={{
            background: accent, color: onAccent, fontWeight: 900, fontSize: 24,
            borderRadius: 999, padding: '18px 34px', whiteSpace: 'nowrap'
          }}>
            {cfg.website}
          </div>
        )}
      </div>
    ),
  };

  const patEl = cfg.pattern === 'dots' ? (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      backgroundImage: `radial-gradient(${rgba(text, .12)} 3px,transparent 3.5px)`, backgroundSize: '46px 46px'
    }} />
  ) : cfg.pattern === 'diagonal' ? (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      backgroundImage: `repeating-linear-gradient(45deg,${rgba(text, .06)} 0 3px,transparent 3px 34px)`
    }} />
  ) : cfg.pattern === 'pitch' ? (
    <svg width={dims.w} height={dims.h} viewBox={`0 0 ${dims.w} ${dims.h}`}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <rect x="50" y="50" width={dims.w - 100} height={dims.h - 100} rx="28"
        fill="none" stroke={rgba(text, .1)} strokeWidth="7" />
      <line x1="50" y1={dims.h / 2} x2={dims.w - 50} y2={dims.h / 2} stroke={rgba(text, .1)} strokeWidth="7" />
      <circle cx={dims.w / 2} cy={dims.h / 2} r="180" fill="none" stroke={rgba(text, .1)} strokeWidth="7" />
      <circle cx={dims.w / 2} cy={dims.h / 2} r="14" fill={rgba(text, .1)} />
    </svg>
  ) : null;

  return (
    <div ref={innerRef} style={{
      width: dims.w, height: dims.h, position: 'relative', overflow: 'hidden',
      boxSizing: 'border-box', padding: compact ? Math.min(cfg.padding, 55) : cfg.padding,
      background: `linear-gradient(${angle}deg,${bg1} 0%,${bg2} 100%)`,
      fontFamily: "'Inter','Segoe UI',Arial,sans-serif", color: text,
      display: 'flex', flexDirection: 'column',
    }}>
      {patEl}
      <div style={{
        position: 'absolute', top: -180, right: -180, width: 640, height: 640, borderRadius: '50%',
        background: `radial-gradient(circle,${rgba(accent, .22)} 0%,transparent 70%)`, pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute', bottom: 80, left: -120, width: 480, height: 480, borderRadius: '50%',
        background: `radial-gradient(circle,${rgba(accent, .13)} 0%,transparent 70%)`, pointerEvents: 'none'
      }} />
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap }}>
        {visible.map((id, i) => {
          const node = secs[id];
          if (!node) return null;
          return (
            <div key={id} style={
              id === 'hours' ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
                : id === 'footer' && i === visible.length - 1 ? { marginTop: 'auto' } : {}
            }>{node}</div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
══════════════════════════════════════════════════════════ */
export default function CreateStatusPage() {
  const { user, profile, session, loading: authLoading } = useAuth();

  const [company, setCompany] = useState<any>(null);
  const [pitches, setPitches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingH, setLoadingH] = useState(false);
  const [busy, setBusy] = useState<null | 'dl' | 'share'>(null);
  const [notice, setNotice] = useState<{ k: 'ok' | 'warn' | 'err'; t: string } | null>(null);

  const [cfg, setCfg] = useState<Cfg>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  const [forTomorrow, setForTomorrow] = useState(false);
  const [selPitch, setSelPitch] = useState<string>('all');
  const [hours, setHours] = useState<string[]>([]);
  const [freeSet, setFreeSet] = useState<Set<string>>(new Set());
  const [bookedSet, setBookedSet] = useState<Set<string>>(new Set());
  const [customTime, setCustomTime] = useState('');

  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const [logoSrc, setLogoSrc] = useState(LOGO);

  /* Menú flotante estilo Snapchat */
  const [activeSheet, setActiveSheet] = useState<MenuSheet>('none');

  const exportRef = useRef<HTMLDivElement>(null);
  const mobilePvRef = useRef<HTMLDivElement>(null);
  const desktopPvRef = useRef<HTMLDivElement>(null);
  const [pvScale, setPvScale] = useState(0.3);
  const [deskW, setDeskW] = useState(320);

  const set = useCallback(<K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg(p => ({ ...p, [k]: v })), []);
  const setPal = (patch: Partial<Pal>) => setCfg(p => ({ ...p, pal: { ...p.pal, ...patch } }));

  /* — persistencia — */
  useEffect(() => {
    try {
      const r = localStorage.getItem(STORE);
      if (r) {
        const s = JSON.parse(r);
        setCfg({ ...DEFAULTS, ...s, pal: { ...DEFAULTS.pal, ...(s.pal || {}) } });
      }
    } catch { }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch { }
  }, [cfg, hydrated]);

  /* ══ 1. CARGA CONFIABLE DE CANCHAS Y COMPLEJO DE RAÍZ ══ */
  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadData = async () => {
      try {
        const token = session?.access_token;
        const headers = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };

        // Consultamos con get_pitches
        const res = await fetch('/api/admin-actions', {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'get_pitches', payload: { owner_id: user.id } }),
        });
        const resJson = await res.json();

        let currentCompany = resJson?.company || null;
        let pitchList = (resJson?.data || []).map((p: any) => ({ id: p.id, name: p.name }));

        // Si no encontró compañía, asegurar que exista
        if (!currentCompany) {
          const compRes = await fetch('/api/admin-actions', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              action: 'ensure_company',
              payload: {
                owner_id: user.id,
                company_name: profile?.full_name ? `Complejo ${profile.full_name}` : 'Mi Complejo Deportivo',
              },
            }),
          });
          const compJson = await compRes.json();
          if (compJson?.success && compJson?.data) {
            currentCompany = compJson.data;
          }
        }

        if (!isMounted) return;

        if (currentCompany) {
          setCompany(currentCompany);
          setCfg(prev => ({
            ...prev,
            name: prev.name || currentCompany.name || '',
            address: prev.address || currentCompany.address || currentCompany.zone || '',
          }));
        }

        if (pitchList.length > 0) {
          setPitches(pitchList);
        }

        // Si tenemos compañía, cargar disponibilidad de horas
        if (currentCompany?.id) {
          try {
            const hRes = await fetch('/api/generate-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ companyId: currentCompany.id, forTomorrow: false }),
            });
            const hJson = await hRes.json();
            if (hJson?.success && hJson.data) {
              if (hJson.data.pitches?.length > 0 && pitchList.length === 0) {
                setPitches(hJson.data.pitches);
              }
              const free: string[] = hJson.data.freeHours ?? [];
              const booked: string[] = hJson.data.bookedHours ?? [];
              setFreeSet(new Set(free));
              setBookedSet(new Set(booked));

              const minNow = bogotaNow().min;
              const available = free.filter(h => h2min(h) > minNow);
              setHours(available.slice(0, MAX_H));
            }
          } catch (hErr) {
            console.error('Error inicial en horas:', hErr);
          }
        }
      } catch (err) {
        console.error('Error cargando complejo y canchas:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [user?.id, session?.access_token, authLoading, profile?.full_name]);

  /* — logo — */
  useEffect(() => {
    let c = false; const base = customLogo || LOGO;
    (async () => { let o = base; if (cfg.logoStyle === 'tint') o = await tintLogo(base, cfg.pal.accent); if (!c) setLogoSrc(o); })();
    return () => { c = true; };
  }, [cfg.logoStyle, cfg.pal.accent, customLogo]);

  /* — datos derivados — */
  const dims = FMT[cfg.format];
  const now = bogotaNow();
  const tgtYmd = forTomorrow ? addDays(now.ymd, 1) : now.ymd;
  const dayLabel = forTomorrow ? 'Mañana' : 'Hoy';
  const dateStr = fmtDate(tgtYmd);
  const sortedH = useMemo(() => sortH(hours), [hours]);
  const fileName = `poster-${(cfg.name || 'cancha').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${tgtYmd}.png`;
  const selPitchName = useMemo(() => {
    if (selPitch === 'all') return pitches.length > 0 ? 'Todas las Canchas' : '';
    return pitches.find(p => p.id === selPitch)?.name || '';
  }, [selPitch, pitches]);

  /* — Escalado del preview móvil a pantalla completa — */
  useEffect(() => {
    const el = mobilePvRef.current;
    if (!el) return;
    const updateScale = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      // Ajustar escala para que el póster quepa al 100% en la pantalla móvil
      const sX = (w - 24) / dims.w;
      const sY = (h - 80) / dims.h;
      setPvScale(Math.min(sX, sY));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [dims.w, dims.h, loading]);

  /* — Ancho preview desktop — */
  useEffect(() => {
    const el = desktopPvRef.current;
    if (!el) return;
    const upd = () => setDeskW(Math.max(260, el.clientWidth));
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  /* ══ Cargar horas automáticamente al cambiar cancha o día ══ */
  const fetchHours = useCallback(async (pitchId: string, tomorrow: boolean, companyId: string) => {
    setLoadingH(true);
    setNotice(null);
    try {
      const ymd = tomorrow ? addDays(bogotaNow().ymd, 1) : bogotaNow().ymd;
      const res = await fetch('/api/generate-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, pitchId, forTomorrow: tomorrow, date: ymd }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error || 'Error consultando horas');

      if (json.data?.pitches?.length > 0 && pitches.length === 0) {
        setPitches(json.data.pitches);
      }
      const free: string[] = json.data?.freeHours ?? [];
      const booked: string[] = json.data?.bookedHours ?? [];
      setFreeSet(new Set(free));
      setBookedSet(new Set(booked));

      const minNow = bogotaNow().min;
      const available = tomorrow ? free : free.filter(h => h2min(h) > minNow);
      if (available.length === 0) {
        setHours([]);
        setNotice({
          k: 'warn',
          t: tomorrow ? 'No hay horas libres para mañana. Selecciona manualmente si deseas.' : 'No hay más horas libres hoy. Elige mañana o selecciona manualmente.'
        });
        return;
      }
      setHours(available.slice(0, MAX_H));
      setNotice({
        k: 'ok',
        t: `${available.length} hora${available.length !== 1 ? 's' : ''} libre${available.length !== 1 ? 's' : ''} detectada${available.length !== 1 ? 's' : ''}.`
      });
    } catch (e: any) {
      setNotice({ k: 'err', t: e?.message || 'Error al actualizar horas.' });
    } finally {
      setLoadingH(false);
    }
  }, [pitches.length]);

  const handleSelectPitch = (pitchId: string) => {
    setSelPitch(pitchId);
    if (company?.id) {
      fetchHours(pitchId, forTomorrow, company.id);
    }
  };

  const handleToggleDay = (tomorrow: boolean) => {
    setForTomorrow(tomorrow);
    if (company?.id) {
      fetchHours(selPitch, tomorrow, company.id);
    }
  };

  const toggleHour = (h: string) => {
    setHours(p => p.includes(h) ? p.filter(x => x !== h) : p.length >= MAX_H ? p : [...p, h]);
  };

  const addCustomTime = () => {
    if (!customTime) return;
    const [hS, mS] = customTime.split(':');
    let hh = +hS;
    const mm = mS || '00';
    const suf = hh >= 12 ? 'PM' : 'AM';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    const label = `${h12}:${mm} ${suf}`;
    if (hours.includes(label) || hours.length >= MAX_H) return;
    setHours(p => [...p, label]);
    setCustomTime('');
  };

  /* ══ Export & Share ══ */
  const renderBlob = async (): Promise<Blob> => {
    if (!exportRef.current) throw new Error('Póster no listo');
    const { toBlob } = await import('html-to-image');
    if ((document as any).fonts?.ready) await (document as any).fonts.ready;
    const opts = {
      width: dims.w, height: dims.h, canvasWidth: dims.w, canvasHeight: dims.h,
      pixelRatio: 1, cacheBust: true, style: { transform: 'none', margin: '0' }
    };
    await toBlob(exportRef.current, opts);
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

  const needHours = () => {
    if (hours.length > 0) return true;
    setNotice({ k: 'warn', t: 'Selecciona al menos una hora antes de generar el póster.' });
    return false;
  };

  const handleDownload = async () => {
    if (!needHours()) return;
    setBusy('dl');
    setNotice(null);
    try {
      saveBlob(await renderBlob());
      setNotice({ k: 'ok', t: '¡Póster descargado con éxito!' });
    } catch (e: any) {
      setNotice({ k: 'err', t: e?.message || 'Error al generar imagen' });
    } finally {
      setBusy(null);
    }
  };

  const handleShare = async () => {
    if (!needHours()) return;
    setBusy('share');
    setNotice(null);
    try {
      const blob = await renderBlob();
      const file = new File([blob], fileName, { type: 'image/png' });
      const text = `${cfg.title} - ${dayLabel} · ${dateStr}${cfg.phone ? ` · ${cfg.phone}` : ''}`;
      const nav = navigator as any;
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: cfg.name, text });
      } else {
        saveBlob(blob);
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        setNotice({ k: 'ok', t: 'Imagen descargada para subir a WhatsApp.' });
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') setNotice({ k: 'err', t: e?.message || 'No se pudo compartir' });
    } finally {
      setBusy(null);
    }
  };

  const surprise = () => {
    const h = Math.floor(Math.random() * 360);
    const light = Math.random() < 0.12;
    setPal(light ? {
      bg1: hslH(h, 60, 96), bg2: hslH(h, 70, 88),
      accent: hslH((h + 180) % 360, 70, 38), text: '#0f172a', angle: 135
    } : {
      bg1: hslH(h, 70, 12), bg2: hslH((h + 25) % 360, 65, 30),
      accent: hslH((h + 150) % 360, 85, 62), text: '#ffffff',
      angle: [120, 135, 150, 160][Math.floor(Math.random() * 4)]
    });
  };

  const inp = 'w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm font-medium outline-none focus:border-emerald-600 transition-colors';

  if (loading) return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
      <Loader2 size={36} className="animate-spin text-emerald-500" />
      <span className="text-sm font-semibold text-muted-foreground">Cargando complejo y canchas...</span>
    </div>
  );

  /* Póster oculto para exportar a 1080px */
  const HiddenPoster = (
    <div style={{ position: 'fixed', left: '-9999px', top: 0, width: dims.w, height: dims.h, pointerEvents: 'none' }}>
      <Poster innerRef={exportRef} cfg={cfg} hours={sortedH} dayLabel={dayLabel} dateStr={dateStr} logoSrc={logoSrc} pitchName={selPitchName} />
    </div>
  );

  const NoticeBanner = notice && (
    <div className={`rounded-xl px-3 py-2 text-xs font-semibold flex items-start gap-2 shadow-sm ${notice.k === 'ok' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
      : notice.k === 'warn' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
        : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
      <span className="mt-0.5 shrink-0">{notice.k === 'ok' ? '✅' : notice.k === 'warn' ? '⚠️' : '❌'}</span>
      <span className="flex-1">{notice.t}</span>
      <button className="shrink-0 opacity-70 hover:opacity-100" onClick={() => setNotice(null)}>×</button>
    </div>
  );

  /* ══════════════════════════════════════════════════════════
     CONTENIDO DE CADA SECCIÓN DE EDICIÓN
  ══════════════════════════════════════════════════════════ */
  const PitchesSection = (
    <div className="space-y-4">
      {/* Selector Hoy / Mañana */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
          <CalendarDays size={14} className="text-emerald-400" /> Fecha de disponibilidad
        </label>
        <div className="grid grid-cols-2 gap-2">
          {([false, true] as const).map(v => (
            <button key={String(v)} onClick={() => handleToggleDay(v)}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${forTomorrow === v
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                }`}>
              {v ? 'Mañana' : 'Hoy'}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-zinc-400">{dateStr}</p>
      </div>

      {/* Selector de Canchas */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
            <span></span> Seleccionar Cancha
          </label>
          <span className="text-[11px] text-zinc-400">{pitches.length} {pitches.length === 1 ? 'cancha' : 'canchas'}</span>
        </div>

        {pitches.length > 0 ? (
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            <button onClick={() => handleSelectPitch('all')}
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold border text-left transition-all flex items-center gap-2 ${selPitch === 'all'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                : 'bg-zinc-800/90 text-zinc-200 border-zinc-700 hover:bg-zinc-700'
                }`}>
              <span className="text-base"></span>
              <span className="flex-1 truncate">Todas las canchas (General)</span>
              {selPitch === 'all' && <CheckCircle2 size={15} className="ml-auto text-white" />}
            </button>

            {pitches.map(p => (
              <button key={p.id} onClick={() => handleSelectPitch(p.id)}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold border text-left transition-all flex items-center gap-2 ${selPitch === p.id
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                  : 'bg-zinc-800/90 text-zinc-200 border-zinc-700 hover:bg-zinc-700'
                  }`}>
                <span className="text-base"></span>
                <span className="flex-1 truncate">{p.name}</span>
                {selPitch === p.id && <CheckCircle2 size={15} className="ml-auto text-white" />}
              </button>
            ))}
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center space-y-2">
            <p className="text-xs text-zinc-400">No se encontraron canchas en el complejo.</p>
            <Link href="/dashboard/pitches/new"
              className="inline-block px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">
              + Crear Cancha
            </Link>
          </div>
        )}
      </div>

      <button onClick={() => company?.id && fetchHours(selPitch, forTomorrow, company.id)}
        disabled={loadingH || !company?.id}
        className="w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition-all shadow-md">
        {loadingH ? <Loader2 size={14} className="animate-spin" /> : ''}
        {loadingH ? 'Calculando disponibilidad...' : 'Recargar disponibilidad real'}
      </button>
    </div>
  );

  const HoursSection = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
          <Clock size={14} className="text-emerald-400" /> Franjas ({hours.length}/{MAX_H})
        </label>
        {hours.length > 0 && (
          <button onClick={() => setHours([])} className="text-xs font-bold text-red-400 hover:text-red-300 flex items-center gap-1">
            <XCircle size={12} /> Limpiar
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5 max-h-60 overflow-y-auto pr-1">
        {ALL_HOURS.map(h => {
          const isSelected = hours.includes(h);
          const isFree = freeSet.has(h);
          const isBooked = bookedSet.has(h);
          return (
            <button key={h} onClick={() => !isBooked && toggleHour(h)} disabled={isBooked && !isSelected}
              className={`relative py-2 px-1 rounded-xl text-[11px] font-bold border transition-all ${isSelected
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md ring-1 ring-emerald-400'
                : isBooked
                  ? 'bg-red-950/30 text-red-400/60 border-red-900/40 opacity-50 cursor-not-allowed line-through'
                  : isFree
                    ? 'bg-emerald-950/40 text-emerald-300 border-emerald-700 hover:bg-emerald-900/60'
                    : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                }`}>
              {isSelected && <CheckCircle2 size={10} className="inline mr-1 text-white" />}
              {h}
              {isBooked && <span className="absolute top-0.5 right-1 text-[8px] font-black text-red-400">✗</span>}
              {isFree && !isSelected && !isBooked && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 text-[10px] text-zinc-400">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" />Libre</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Ocupada</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-600" />En póster</span>
      </div>

      {/* Hora personalizada */}
      <div className="flex gap-2 pt-2 border-t border-zinc-800">
        <input type="time" value={customTime} onChange={e => setCustomTime(e.target.value)}
          className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white outline-none focus:border-emerald-500" />
        <button onClick={addCustomTime} disabled={!customTime || hours.length >= MAX_H}
          className="py-2 px-3 rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 border border-zinc-700 flex items-center gap-1">
          <Plus size={12} /> Añadir
        </button>
      </div>
    </div>
  );

  const ColorsSection = (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
          <Palette size={14} className="text-emerald-400" /> Paletas Destacadas
        </label>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map(p => {
            const active = cfg.pal.bg1 === p.p.bg1 && cfg.pal.accent === p.p.accent;
            return (
              <button key={p.id} onClick={() => setCfg(pr => ({ ...pr, pal: p.p }))}
                className={`relative h-12 rounded-xl border-2 transition-all overflow-hidden flex items-end p-1.5 ${active ? 'border-emerald-400 scale-[1.03] shadow-lg ring-1 ring-emerald-400' : 'border-transparent opacity-80 hover:opacity-100'
                  }`}
                style={{ background: `linear-gradient(${p.p.angle}deg, ${p.p.bg1}, ${p.p.bg2})` }}>
                <span className="text-[10px] font-bold text-white drop-shadow-md truncate">{p.label}</span>
                <span className="absolute top-1 right-1 h-3 w-3 rounded-full ring-1 ring-white/50" style={{ background: p.p.accent }} />
              </button>
            );
          })}
        </div>
        <button onClick={surprise}
          className="w-full py-2.5 rounded-xl text-xs font-bold border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center justify-center gap-1.5 shadow-sm">
          <Shuffle size={13} className="text-violet-400" /> Mezclar Colores (Sorpréndeme)
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-300">Color Acento</label>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACCENT.map(c => (
            <button key={c} onClick={() => setPal({ accent: c })}
              className={`h-8 w-8 rounded-full border-2 transition-all ${cfg.pal.accent.toLowerCase() === c.toLowerCase() ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-80 hover:opacity-100'
                }`}
              style={{ background: c }} />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-300">Textura de Fondo</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: 'pitch' as const, label: 'Cancha' },
            { v: 'dots' as const, label: 'Puntos' },
            { v: 'diagonal' as const, label: 'Líneas' },
            { v: 'none' as const, label: 'Liso' },
          ].map(o => (
            <button key={o.v} onClick={() => set('pattern', o.v)}
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${cfg.pattern === o.v
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                }`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const TextsSection = (
    <div className="space-y-3">
      {[
        { label: 'Nombre del complejo', key: 'name' as const, ph: company?.name || 'Mi Complejo', max: 40 },
        { label: 'Dirección o barrio', key: 'address' as const, ph: company?.address || 'Pasto, Nariño', max: 50 },
        { label: 'Título del póster', key: 'title' as const, ph: 'Horarios Disponibles', max: 32 },
        { label: 'Etiqueta superior', key: 'tag' as const, ph: '¡Últimos cupos!', max: 28 },
        { label: 'Llamado a la acción (botón)', key: 'cta' as const, ph: 'Reserva ahora', max: 24 },
        { label: 'Teléfono / WhatsApp', key: 'phone' as const, ph: '3001234567', max: 20 },
      ].map(f => (
        <div key={f.key}>
          <label className="text-xs font-bold text-zinc-300 block mb-1">{f.label}</label>
          <input className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white outline-none focus:border-emerald-500"
            value={cfg[f.key]} maxLength={f.max}
            onChange={e => set(f.key, e.target.value)} placeholder={f.ph} />
        </div>
      ))}
      <div>
        <label className="text-xs font-bold text-zinc-300 block mb-1">Mensaje destacado</label>
        <textarea value={cfg.message} maxLength={80} rows={2}
          onChange={e => set('message', e.target.value)}
          placeholder="¡Reserva ya y asegura tu partido!"
          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white outline-none focus:border-emerald-500 resize-none" />
        <p className="text-[10px] text-zinc-500 text-right mt-0.5">{cfg.message.length}/80</p>
      </div>
      <div>
        <label className="text-xs font-bold text-zinc-300 block mb-1">Alineación de Título</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: 'left' as const, label: <><AlignLeft size={13} /> Izq</> },
            { v: 'center' as const, label: <><AlignCenter size={13} /> Cen</> },
            { v: 'right' as const, label: <><AlignRight size={13} /> Der</> },
          ].map(o => (
            <button key={o.v} onClick={() => set('align', o.v)}
              className={`py-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1 ${cfg.align === o.v ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                }`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const DesignSection = (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-300">Estilo del Logo</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: 'badge' as const, label: 'Medallón' },
            { v: 'tint' as const, label: 'Con acento' },
            { v: 'original' as const, label: 'Original' },
          ].map(o => (
            <button key={o.v} onClick={() => set('logoStyle', o.v)}
              className={`py-2 rounded-xl text-xs font-bold border transition-all ${cfg.logoStyle === o.v ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                }`}>
              {o.label}
            </button>
          ))}
        </div>

        <label className="cursor-pointer w-full py-2.5 rounded-xl text-xs font-bold border border-dashed border-emerald-500/50 bg-emerald-950/20 text-emerald-400 flex items-center justify-center gap-1.5 mt-2">
          <Upload size={13} /> Subir mi propio logo
          <input type="file" accept="image/*" className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (!f) return;
              const r = new FileReader();
              r.onload = () => setCustomLogo(String(r.result));
              r.readAsDataURL(f);
            }} />
        </label>
        {/* {customLogo && (
          <button onClick={() => setCustomLogo(null)}
            className="w-full py-1.5 text-xs font-bold text-zinc-400 hover:text-white border border-zinc-800 rounded-xl">
            Usar logo predeterminado
          </button>
        )} */}
      </div>

      <div className="space-y-3">
        <label className="block space-y-1">
          <div className="flex justify-between text-xs font-semibold text-zinc-300">
            <span>Zoom del logo</span><span>{cfg.logoSize}px</span>
          </div>
          <input type="range" min={80} max={260} value={cfg.logoSize} onChange={e => set('logoSize', Number(e.target.value))}
            className="w-full accent-emerald-500" />
        </label>
        <label className="block space-y-1">
          <div className="flex justify-between text-xs font-semibold text-zinc-300">
            <span>Tamaño del nombre</span><span>{cfg.nameSize}px</span>
          </div>
          <input type="range" min={36} max={96} value={cfg.nameSize} onChange={e => set('nameSize', Number(e.target.value))}
            className="w-full accent-emerald-500" />
        </label>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-300">Estilo de Tarjetas de Horas</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: 'round' as const, label: 'Redondas' },
            { v: 'pill' as const, label: 'Cápsulas' },
            { v: 'solid' as const, label: 'Rellenas' },
          ].map(o => (
            <button key={o.v} onClick={() => set('cardStyle', o.v)}
              className={`py-2 rounded-xl text-xs font-bold border ${cfg.cardStyle === o.v ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                }`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const FormatSection = (
    <div className="space-y-3">
      <label className="text-xs font-bold text-zinc-300">Formato del Póster</label>
      <div className="space-y-2">
        {(Object.keys(FMT) as FormatId[]).map(fid => (
          <button key={fid} onClick={() => set('format', fid)}
            className={`w-full py-3 px-4 rounded-xl text-xs font-bold border text-left flex items-center justify-between transition-all ${cfg.format === fid
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
              : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
              }`}>
            <span>{FMT[fid].label}</span>
            <span className="text-[11px] opacity-75">{FMT[fid].w}×{FMT[fid].h}px</span>
          </button>
        ))}
      </div>
    </div>
  );

  /* Título del Drawer en móvil */
  const SHEET_TITLES: Record<MenuSheet, string> = {
    none: '',
    pitches: '⚽ Canchas & Fecha',
    hours: '⏰ Horas Disponibles',
    colors: '🎨 Colores & Fondo',
    texts: '✏️ Textos & WhatsApp',
    design: '🔤 Logo & Estilo',
    format: '📐 Formato del Póster',
  };

  return (
    <>
      {HiddenPoster}

      {/* ════════════════════════════════════════════════════════════
          VISTA MÓVIL ESTILO SNAPCHAT / INSTAGRAM STORIES (FULLSCREEN)
      ════════════════════════════════════════════════════════════ */}
      <div className="lg:hidden fixed inset-0 z-40 bg-zinc-950 flex flex-col overflow-hidden select-none">

        {/* ── Barra Superior Flotante Translúcida ── */}
        <div className="absolute top-0 left-0 right-0 z-30 px-4 pt-3 pb-2 flex items-center justify-between pointer-events-auto bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          <Link href="/dashboard"
            className="h-9 w-9 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white active:scale-95 transition-all">
            <X size={18} />
          </Link>

          {/* Badge central del Complejo & Cancha */}
          <button onClick={() => setActiveSheet('pitches')}
            className="px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg active:scale-95 transition-all truncate max-w-[200px]">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="truncate">{selPitchName || cfg.name || 'Mi Complejo'}</span>
            <ChevronRight size={13} className="text-zinc-400 shrink-0" />
          </button>

          <button onClick={() => { setCfg(DEFAULTS); setHours([]); setNotice(null); }}
            title="Restablecer"
            className="h-9 w-9 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white active:scale-95 transition-all">
            <RotateCcw size={16} />
          </button>
        </div>

        {/* ── Lienzo Principal: Póster a pantalla completa centrado ── */}
        <div ref={mobilePvRef}
          onClick={() => { if (activeSheet !== 'none') setActiveSheet('none'); }}
          className="flex-1 w-full h-full flex items-center justify-center p-2 relative overflow-hidden bg-zinc-950">
          <div className="shadow-2xl rounded-2xl overflow-hidden border border-white/10 transition-all duration-300"
            style={{
              width: dims.w * pvScale,
              height: dims.h * pvScale,
            }}>
            <div style={{
              width: dims.w,
              height: dims.h,
              transform: `scale(${pvScale})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
            }}>
              <Poster cfg={cfg} hours={sortedH} dayLabel={dayLabel} dateStr={dateStr} logoSrc={logoSrc} pitchName={selPitchName} />
            </div>
          </div>
        </div>

        {/* ── BARRA LATERAL DERECHA FLOTANTE ESTILO SNAPCHAT ── */}
        <div className="absolute right-3.5 top-16 z-30 flex flex-col items-center gap-3.5 pointer-events-auto">
          {/* Canchas */}
          <button onClick={() => setActiveSheet(activeSheet === 'pitches' ? 'none' : 'pitches')}
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
            <div className={`h-11 w-11 rounded-full flex items-center justify-center border shadow-xl backdrop-blur-md transition-all ${activeSheet === 'pitches'
              ? 'bg-emerald-600 text-white border-emerald-400 ring-2 ring-emerald-400'
              : 'bg-black/60 text-white border-white/20 hover:bg-black/80'
              }`}>
              <span className="text-lg">⚽</span>
            </div>
            <span className="text-[10px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">Canchas</span>
          </button>

          {/* Horas */}
          <button onClick={() => setActiveSheet(activeSheet === 'hours' ? 'none' : 'hours')}
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform relative">
            <div className={`h-11 w-11 rounded-full flex items-center justify-center border shadow-xl backdrop-blur-md transition-all ${activeSheet === 'hours'
              ? 'bg-emerald-600 text-white border-emerald-400 ring-2 ring-emerald-400'
              : 'bg-black/60 text-white border-white/20 hover:bg-black/80'
              }`}>
              <Clock size={19} />
            </div>
            {hours.length > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center border border-black shadow">
                {hours.length}
              </span>
            )}
            <span className="text-[10px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">Horas</span>
          </button>

          {/* Colores */}
          <button onClick={() => setActiveSheet(activeSheet === 'colors' ? 'none' : 'colors')}
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
            <div className={`h-11 w-11 rounded-full flex items-center justify-center border shadow-xl backdrop-blur-md transition-all ${activeSheet === 'colors'
              ? 'bg-emerald-600 text-white border-emerald-400 ring-2 ring-emerald-400'
              : 'bg-black/60 text-white border-white/20 hover:bg-black/80'
              }`}>
              <Palette size={19} style={{ color: cfg.pal.accent }} />
            </div>
            <span className="text-[10px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">Color</span>
          </button>

          {/* Textos */}
          <button onClick={() => setActiveSheet(activeSheet === 'texts' ? 'none' : 'texts')}
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
            <div className={`h-11 w-11 rounded-full flex items-center justify-center border shadow-xl backdrop-blur-md transition-all ${activeSheet === 'texts'
              ? 'bg-emerald-600 text-white border-emerald-400 ring-2 ring-emerald-400'
              : 'bg-black/60 text-white border-white/20 hover:bg-black/80'
              }`}>
              <Type size={19} />
            </div>
            <span className="text-[10px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">Texto</span>
          </button>

          {/* Diseño / Logo */}
          <button onClick={() => setActiveSheet(activeSheet === 'design' ? 'none' : 'design')}
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
            <div className={`h-11 w-11 rounded-full flex items-center justify-center border shadow-xl backdrop-blur-md transition-all ${activeSheet === 'design'
              ? 'bg-emerald-600 text-white border-emerald-400 ring-2 ring-emerald-400'
              : 'bg-black/60 text-white border-white/20 hover:bg-black/80'
              }`}>
              <LayoutTemplate size={19} />
            </div>
            <span className="text-[10px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">Diseño</span>
          </button>

          {/* Formato */}
          <button onClick={() => setActiveSheet(activeSheet === 'format' ? 'none' : 'format')}
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
            <div className={`h-11 w-11 rounded-full flex items-center justify-center border shadow-xl backdrop-blur-md transition-all ${activeSheet === 'format'
              ? 'bg-emerald-600 text-white border-emerald-400 ring-2 ring-emerald-400'
              : 'bg-black/60 text-white border-white/20 hover:bg-black/80'
              }`}>
              <Crop size={18} />
            </div>
            <span className="text-[10px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">Formato</span>
          </button>

          {/* Sorpréndeme */}
          <button onClick={surprise}
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
            <div className="h-11 w-11 rounded-full bg-violet-600/80 backdrop-blur-md border border-violet-400/50 flex items-center justify-center text-white shadow-xl">
              <Shuffle size={17} />
            </div>
            <span className="text-[10px] font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">Mix</span>
          </button>
        </div>

        {/* ── PANEL / DRAWER FLOTANTE LATERAL DERECHO ── */}
        {activeSheet !== 'none' && (
          <div className="absolute right-0 top-0 bottom-0 w-[84vw] max-w-sm z-40 bg-zinc-950/95 backdrop-blur-2xl border-l border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* Header del drawer */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                {SHEET_TITLES[activeSheet]}
              </h2>
              <button onClick={() => setActiveSheet('none')}
                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold flex items-center gap-1">
                Listo ✓
              </button>
            </div>

            {/* Contenido scrolleable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {NoticeBanner}
              {activeSheet === 'pitches' && PitchesSection}
              {activeSheet === 'hours' && HoursSection}
              {activeSheet === 'colors' && ColorsSection}
              {activeSheet === 'texts' && TextsSection}
              {activeSheet === 'design' && DesignSection}
              {activeSheet === 'format' && FormatSection}
            </div>
          </div>
        )}

        {/* ── Barra Inferior Flotante de Acciones (Descargar / Compartir) ── */}
        <div className="absolute bottom-0 left-0 right-0 z-30 p-4 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-auto flex gap-2.5">
          <button onClick={handleDownload} disabled={!!busy}
            className="flex-1 py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 bg-zinc-800/90 backdrop-blur-md border border-white/10 hover:bg-zinc-700 text-white shadow-xl active:scale-95 transition-all">
            {busy === 'dl' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Descargar Póster
          </button>

          <button onClick={handleShare} disabled={!!busy}
            className="flex-1 py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20ba59] text-white shadow-xl active:scale-95 transition-all font-black">
            {busy === 'share' ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />}
            WhatsApp
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          VISTA DESKTOP (PC) PROFESIONAL EN 2 COLUMNAS
      ════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:grid lg:grid-cols-[1fr_390px] lg:gap-8 max-w-6xl mx-auto p-6 items-start">
        {/* Columna Izquierda: Editor Organizado */}
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-border">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-600">Marketing & Estados WhatsApp</p>
              <h1 className="text-2xl font-black text-foreground mt-0.5 flex items-center gap-2">
                <span>🎨</span> Creador de Publicaciones & Estados
              </h1>
            </div>
            <button onClick={() => { setCfg(DEFAULTS); setHours([]); setNotice(null); }}
              className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border">
              <RotateCcw size={13} /> Restablecer
            </button>
          </div>

          {NoticeBanner}

          {/* Bloque 1: Canchas y Fecha */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-sm">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <span className="text-base"></span> Canchas & Fecha de Disponibilidad
            </h2>
            {PitchesSection}
          </div>

          {/* Bloque 2: Franjas Horarias */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-sm">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Clock size={16} className="text-emerald-600" /> Horas a Publicar
            </h2>
            {HoursSection}
          </div>

          {/* Bloque 3: Colores y Apariencia */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-sm">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Palette size={16} className="text-emerald-600" /> Paleta de Colores & Textura
            </h2>
            {ColorsSection}
          </div>

          {/* Bloque 4: Textos y Datos de Contacto */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-sm">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Type size={16} className="text-emerald-600" /> Textos & Mensajes
            </h2>
            {TextsSection}
          </div>

          {/* Bloque 5: Logo y Diseño */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-sm">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <LayoutTemplate size={16} className="text-emerald-600" /> Logo & Formato
            </h2>
            {DesignSection}
            <div className="pt-3 border-t border-border">
              {FormatSection}
            </div>
          </div>
        </div>

        {/* Columna Derecha: Sticky Preview */}
        <div className="sticky top-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <span>👁️</span> Vista Previa en Vivo
            </p>
            <span className="text-[11px] font-mono text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md font-bold">
              {dims.w}×{dims.h}px
            </span>
          </div>

          <div ref={desktopPvRef} className="w-full">
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-border w-full bg-zinc-950 flex items-center justify-center p-2"
              style={{ aspectRatio: dims.ar }}>
              <div style={{
                width: dims.w,
                height: dims.h,
                transform: `scale(${deskW / dims.w})`,
                transformOrigin: 'top left',
                pointerEvents: 'none',
              }}>
                <Poster cfg={cfg} hours={sortedH} dayLabel={dayLabel} dateStr={dateStr} logoSrc={logoSrc} pitchName={selPitchName} />
              </div>
            </div>
          </div>

          {/* Botones de acción principales */}
          <div className="flex gap-2.5 pt-2">
            <button onClick={handleDownload} disabled={!!busy}
              className="flex-1 py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white transition-all shadow-md">
              {busy === 'dl' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Descargar
            </button>
            <button onClick={handleShare} disabled={!!busy}
              className="flex-1 py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20ba59] disabled:opacity-60 text-white transition-all shadow-md font-black">
              {busy === 'share' ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
              WhatsApp
            </button>
          </div>
        </div>
      </div>
    </>
  );
}