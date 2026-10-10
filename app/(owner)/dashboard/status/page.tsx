'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  Download, Share2, Loader2, Sparkles, Clock, CalendarDays,
  CheckCircle2, XCircle, Palette, LayoutTemplate, ChevronDown,
  ChevronUp, ImagePlay, RotateCcw, Shuffle, AlignLeft, AlignCenter,
  AlignRight, Eye, EyeOff, ArrowUp, ArrowDown, Upload, Plus,
} from 'lucide-react';

/* ══════════════════════════════════════════════════════════
   TIPOS
══════════════════════════════════════════════════════════ */
type FormatId  = 'story' | 'post' | 'square';
type Pattern   = 'none' | 'dots' | 'diagonal' | 'pitch';
type CardStyle = 'round' | 'pill' | 'solid';
type LogoStyle = 'badge' | 'tint' | 'original';
type Align     = 'left' | 'center' | 'right';
type SectionId = 'header' | 'title' | 'hours' | 'message' | 'footer';

interface Pal { bg1: string; bg2: string; accent: string; text: string; angle: number }

interface Cfg {
  format: FormatId;
  pal: Pal;
  pattern: Pattern;
  cardStyle: CardStyle;
  logoStyle: LogoStyle;
  logoSize: number;
  nameSize: number;
  align: Align;
  padding: number;
  order: SectionId[];
  hidden: SectionId[];
  name: string;
  address: string;
  title: string;
  tag: string;
  message: string;
  phone: string;
  cta: string;
  website: string;
}

/* ══════════════════════════════════════════════════════════
   CONSTANTES
══════════════════════════════════════════════════════════ */
const FMT: Record<FormatId, { w: number; h: number; ratio: string }> = {
  story:  { w: 1080, h: 1920, ratio: '9/16' },
  post:   { w: 1080, h: 1350, ratio: '4/5'  },
  square: { w: 1080, h: 1080, ratio: '1/1'  },
};

const PRESETS: { id: string; label: string; p: Pal }[] = [
  { id: 'emerald', label: 'Esmeralda', p: { bg1: '#064e3b', bg2: '#047857', accent: '#34d399', text: '#fff', angle: 135 } },
  { id: 'night',   label: 'Noche',     p: { bg1: '#0f0c29', bg2: '#302b63', accent: '#818cf8', text: '#fff', angle: 135 } },
  { id: 'sunset',  label: 'Atardecer', p: { bg1: '#7f1d1d', bg2: '#b45309', accent: '#fbbf24', text: '#fff', angle: 135 } },
  { id: 'ocean',   label: 'Océano',    p: { bg1: '#0c4a6e', bg2: '#0369a1', accent: '#38bdf8', text: '#fff', angle: 135 } },
  { id: 'neon',    label: 'Neón',      p: { bg1: '#09090b', bg2: '#18181b', accent: '#a3e635', text: '#fafafa', angle: 160 } },
  { id: 'gold',    label: 'Oro',       p: { bg1: '#1c1917', bg2: '#44403c', accent: '#facc15', text: '#fafaf9', angle: 145 } },
  { id: 'passion', label: 'Pasión',    p: { bg1: '#450a0a', bg2: '#dc2626', accent: '#fde047', text: '#fff', angle: 150 } },
  { id: 'violet',  label: 'Violeta',   p: { bg1: '#2e1065', bg2: '#6d28d9', accent: '#f0abfc', text: '#fff', angle: 135 } },
  { id: 'clean',   label: 'Claro',     p: { bg1: '#f0fdf4', bg2: '#dcfce7', accent: '#16a34a', text: '#0f172a', angle: 135 } },
];

const QUICK_ACCENT = [
  '#34d399','#a3e635','#facc15','#fb923c','#f87171','#f472b6',
  '#c084fc','#818cf8','#38bdf8','#22d3ee','#ffffff','#111827',
];

const HOURS_ALL = [
  '6:00 AM','7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM',
  '12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM',
  '6:00 PM','7:00 PM','8:00 PM','9:00 PM','10:00 PM',
];

const SECTION_LABEL: Record<SectionId, string> = {
  header: 'Nombre y logo', title: 'Título y fecha',
  hours: 'Horas disponibles', message: 'Mensaje', footer: 'Footer',
};

const MAX_H = 12;
const TZ    = 'America/Bogota';
const LOGO  = '/cancheros.png';
const STORE = 'cancheros-status-v3';

const DEFAULTS: Cfg = {
  format: 'story', pattern: 'pitch', cardStyle: 'round', logoStyle: 'badge',
  logoSize: 130, nameSize: 64, align: 'left', padding: 70,
  order: ['header','title','hours','message','footer'], hidden: [],
  name: '', address: '', title: '⚡ Canchas Disponibles',
  tag: '', message: '', phone: '', cta: 'Reserva ahora', website: 'cancheros.site',
  pal: PRESETS[0].p,
};

/* ══════════════════════════════════════════════════════════
   UTILIDADES COLOR
══════════════════════════════════════════════════════════ */
const hexRgb = (h: string): [number,number,number] => {
  let s = h.replace('#',''); if (s.length===3) s=s.split('').map(c=>c+c).join('');
  const n=parseInt(s,16)||0; return [(n>>16)&255,(n>>8)&255,n&255];
};
const rgba = (h: string, a: number) => { const [r,g,b]=hexRgb(h); return `rgba(${r},${g},${b},${a})`; };
const lum  = (h: string) => { const [r,g,b]=hexRgb(h).map(v=>{const c=v/255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4);}); return .2126*r+.7152*g+.0722*b; };
const onC  = (h: string) => lum(h)>.4 ? '#0b0b0b' : '#ffffff';
const hslH = (h:number,s:number,l:number) => {s/=100;l/=100;const k=(n:number)=>(n+h/30)%12,a=s*Math.min(l,1-l),f=(n:number)=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1))),t=(x:number)=>Math.round(x*255).toString(16).padStart(2,'0');return `#${t(f(0))}${t(f(8))}${t(f(4))}`;};

/* ══════════════════════════════════════════════════════════
   UTILIDADES HORAS (Colombia)
══════════════════════════════════════════════════════════ */
const bogotaNow = () => {
  const p = new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());
  const g = (t:string)=>p.find(x=>x.type===t)?.value??'0';
  return { ymd:`${g('year')}-${g('month')}-${g('day')}`, min:(+g('hour')%24)*60+(+g('minute')) };
};
const addDays = (ymd:string,n:number)=>{const[y,m,d]=ymd.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10);};
const fmtDate = (ymd:string)=>{const s=new Date(`${ymd}T12:00:00-05:00`).toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',timeZone:TZ});return s[0].toUpperCase()+s.slice(1);};
const h2min   = (l:string)=>{const m=l.match(/(\d+):(\d+)\s*(AM|PM)/i);if(!m)return 0;let h=+m[1]%12;if(m[3].toUpperCase()==='PM')h+=12;return h*60+(+m[2]);};
const sortH   = (arr:string[])=>[...new Set(arr)].sort((a,b)=>h2min(a)-h2min(b));

/* ══════════════════════════════════════════════════════════
   TINT LOGO (canvas)
══════════════════════════════════════════════════════════ */
function tintLogo(src:string,color:string):Promise<string>{
  return new Promise(res=>{
    const img=new Image(); img.crossOrigin='anonymous';
    img.onload=()=>{try{const c=document.createElement('canvas');c.width=img.naturalWidth||512;c.height=img.naturalHeight||512;const ctx=c.getContext('2d');if(!ctx)return res(src);ctx.drawImage(img,0,0);ctx.globalCompositeOperation='source-in';ctx.fillStyle=color;ctx.fillRect(0,0,c.width,c.height);res(c.toDataURL('image/png'));}catch{res(src);}};
    img.onerror=()=>res(src); img.src=src;
  });
}

/* ══════════════════════════════════════════════════════════
   POSTER COMPONENT (renderizado al tamaño real)
══════════════════════════════════════════════════════════ */
interface PosterProps {
  innerRef?: React.Ref<HTMLDivElement>;
  cfg: Cfg; hours: string[]; dayLabel: string; dateStr: string; logoSrc: string;
}

function Poster({ innerRef, cfg, hours, dayLabel, dateStr, logoSrc }: PosterProps) {
  const dims = FMT[cfg.format];
  const { bg1, bg2, accent, text, angle } = cfg.pal;
  const sub       = rgba(text, .75);
  const cardBg    = rgba(text, .1);
  const cardBdr   = rgba(accent, .45);
  const onAccent  = onC(accent);
  const compact   = cfg.format !== 'story';
  const gap       = compact ? 40 : 60;
  const jc        = cfg.align === 'left' ? 'flex-start' : cfg.align === 'center' ? 'center' : 'flex-end';
  const L         = cfg.logoSize;
  const visible   = cfg.order.filter(id => !cfg.hidden.includes(id));

  /* — Logo — */
  const logoEl = cfg.logoStyle !== 'original' && logoSrc ? (
    <div style={{
      width: L, height: L, borderRadius: '50%', flexShrink: 0,
      background: '#ffffff', border: `8px solid ${accent}`,
      boxShadow: `0 16px 48px ${rgba(accent,.4)}, 0 0 0 4px ${rgba(accent,.2)}`,
      boxSizing: 'border-box', padding: L*.1,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      // Zoom suave con transform — se verá en la preview en tiempo real
      transform: 'scale(1)',
      transition: 'transform .3s ease',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    </div>
  ) : logoSrc ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoSrc} alt="" style={{ width: L, height: L, objectFit: 'contain', flexShrink: 0,
      filter: 'drop-shadow(0 8px 24px rgba(0,0,0,.5))' }} />
  ) : null;

  /* — Tarjetas de hora — */
  const n    = hours.length;
  const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const fsBig = (cols===2 ? 58 : cols===3 ? 46 : 36);
  const radius = cfg.cardStyle === 'pill' ? 999 : cfg.cardStyle === 'solid' ? 16 : 30;
  const solid  = cfg.cardStyle === 'solid';

  /* — Secciones — */
  const secs: Partial<Record<SectionId, React.ReactNode>> = {
    header: (
      <div style={{ display:'flex', alignItems:'center', gap: 36, flexDirection: 'row',
        justifyContent: jc === 'flex-end' ? 'flex-end' : 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: cfg.nameSize, fontWeight: 900, letterSpacing: '-1px',
            textTransform: 'uppercase', color: text, lineHeight: 1.02, wordBreak: 'break-word' }}>
            {cfg.name || '🏟️ Mi Complejo'}
          </div>
          <div style={{ width: 160, height: 8, borderRadius: 999, background: accent, marginTop: 18 }} />
          {cfg.address && <div style={{ fontSize: 26, color: sub, marginTop: 14, fontWeight: 500 }}>📍 {cfg.address}</div>}
        </div>
        {logoEl}
      </div>
    ),

    title: (
      <div style={{ textAlign: cfg.align }}>
        {cfg.tag && (
          <div style={{ display:'inline-block', border:`3px solid ${accent}`, color: accent,
            borderRadius: 999, padding:'8px 28px', fontSize: 26, fontWeight: 800, marginBottom: 20 }}>
            {cfg.tag}
          </div>
        )}
        <div style={{ fontSize: compact?58:68, fontWeight: 900, lineHeight: 1.05, color: text }}>{cfg.title}</div>
        <div style={{ display:'inline-block', marginTop: 22, background: accent, color: onAccent,
          borderRadius: 999, padding:'14px 36px', fontSize: 34, fontWeight: 800, textTransform:'capitalize' }}>
          {dayLabel} · {dateStr}
        </div>
      </div>
    ),

    hours: (
      <div style={{ flex:1, minHeight: 0, display:'flex', flexDirection:'column', justifyContent:'center' }}>
        {hours.length > 0 ? (
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${cols},1fr)`, gap: 22 }}>
            {hours.map(h => {
              const [t,ap]=h.split(' ');
              return (
                <div key={h} style={{
                  background: solid ? accent : cardBg,
                  border: solid ? 'none' : `2px solid ${cardBdr}`,
                  borderRadius: radius, padding:`${compact?24:32}px 14px`,
                  textAlign:'center', color: solid ? onAccent : accent,
                }}>
                  <div style={{ fontSize: fsBig, fontWeight: 900, lineHeight: 1 }}>
                    {t}<span style={{ fontSize: fsBig*.5, fontWeight: 800, marginLeft: 6 }}>{ap}</span>
                  </div>
                  <div style={{ fontSize: 20, marginTop: 8, fontWeight: 600,
                    color: solid ? rgba(onAccent,.8) : sub }}>● Disponible</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign:'center', opacity:.35, fontSize: 36 }}>
            <div style={{ fontSize: 90, marginBottom: 16 }}>⏰</div>
            Selecciona las horas disponibles
          </div>
        )}
      </div>
    ),

    message: cfg.message ? (
      <div style={{ background: cardBg, border:`2px solid ${cardBdr}`, borderRadius: 30,
        padding:'36px 44px', textAlign:'center', fontSize: 36, fontWeight: 700,
        fontStyle:'italic', color: text }}>
        "{cfg.message}"
      </div>
    ) : undefined,

    footer: (
      <div style={{ borderTop:`2px solid ${cardBdr}`, paddingTop: 50,
        display:'flex', justifyContent:'space-between', alignItems:'center', gap: 24 }}>
        <div>
          <div style={{ fontSize: 34, fontWeight: 900, color: accent }}>📲 {cfg.cta}</div>
          <div style={{ fontSize: 24, color: sub, marginTop: 8 }}>
            {cfg.phone ? `📞 ${cfg.phone}` : 'Disponibilidad limitada'}
          </div>
        </div>
        {cfg.website && (
          <div style={{ background: accent, color: onAccent, fontWeight: 900, fontSize: 24,
            borderRadius: 999, padding:'18px 36px', whiteSpace:'nowrap' }}>
            {cfg.website}
          </div>
        )}
      </div>
    ),
  };

  /* — Patrón — */
  const patEl = cfg.pattern === 'dots' ? (
    <div style={{ position:'absolute', inset:0,
      backgroundImage:`radial-gradient(${rgba(text,.12)} 3px, transparent 3.5px)`,
      backgroundSize:'46px 46px', pointerEvents:'none' }} />
  ) : cfg.pattern === 'diagonal' ? (
    <div style={{ position:'absolute', inset:0, pointerEvents:'none',
      backgroundImage:`repeating-linear-gradient(45deg,${rgba(text,.06)} 0 3px,transparent 3px 34px)` }} />
  ) : cfg.pattern === 'pitch' ? (
    <svg width={dims.w} height={dims.h} viewBox={`0 0 ${dims.w} ${dims.h}`}
      style={{ position:'absolute', inset:0, pointerEvents:'none' }}>
      <rect x="50" y="50" width={dims.w-100} height={dims.h-100} rx="28"
        fill="none" stroke={rgba(text,.1)} strokeWidth="7" />
      <line x1="50" y1={dims.h/2} x2={dims.w-50} y2={dims.h/2}
        stroke={rgba(text,.1)} strokeWidth="7" />
      <circle cx={dims.w/2} cy={dims.h/2} r="180"
        fill="none" stroke={rgba(text,.1)} strokeWidth="7" />
      <circle cx={dims.w/2} cy={dims.h/2} r="14" fill={rgba(text,.1)} />
    </svg>
  ) : null;

  return (
    <div ref={innerRef} style={{
      width: dims.w, height: dims.h, position:'relative', overflow:'hidden',
      boxSizing:'border-box', padding: compact ? Math.min(cfg.padding, 55) : cfg.padding,
      background:`linear-gradient(${angle}deg,${bg1} 0%,${bg2} 100%)`,
      fontFamily:"'Inter','Segoe UI',Arial,sans-serif", color: text,
      display:'flex', flexDirection:'column',
    }}>
      {patEl}
      {/* glows */}
      <div style={{ position:'absolute', top:-180, right:-180, width:640, height:640, borderRadius:'50%',
        background:`radial-gradient(circle,${rgba(accent,.22)} 0%,transparent 70%)`, pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:80, left:-120, width:480, height:480, borderRadius:'50%',
        background:`radial-gradient(circle,${rgba(accent,.13)} 0%,transparent 70%)`, pointerEvents:'none' }} />

      <div style={{ position:'relative', flex:1, minHeight:0, display:'flex', flexDirection:'column', gap }}>
        {visible.map((id, i) => {
          const node = secs[id];
          if (!node) return null;
          return (
            <div key={id} style={
              id==='hours' ? { flex:1, minHeight:0, display:'flex', flexDirection:'column' }
              : id==='footer' && i===visible.length-1 ? { marginTop:'auto' }
              : {}
            }>{node}</div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   CONTROLES REUTILIZABLES
══════════════════════════════════════════════════════════ */
const inp = 'w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm font-medium outline-none focus:border-emerald-600 transition-colors';

function Chip<T extends string | number>({ value, opts, onChange }: {
  value: T; opts: { v: T; label: React.ReactNode }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {opts.map(o => (
        <button key={String(o.v)} type="button" onClick={() => onChange(o.v)}
          className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1 ${
            value===o.v ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
              : 'bg-secondary text-foreground border-border hover:bg-muted'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ label, value, min, max, step=1, unit='', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="flex justify-between text-xs font-semibold text-muted-foreground">
        <span>{label}</span><span className="font-mono">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 accent-emerald-600 cursor-pointer" />
    </label>
  );
}

function Section({ title, icon, open, onToggle, children }: {
  title: string; icon: React.ReactNode; open: boolean; onToggle(): void; children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 px-4 py-3.5 text-left hover:bg-secondary/50 transition-colors">
        <span className="flex items-center gap-2 text-sm font-bold text-foreground">{icon}{title}</span>
        {open ? <ChevronUp size={16} className="text-muted-foreground shrink-0" />
               : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">{children}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
══════════════════════════════════════════════════════════ */
export default function CreateStatusPage() {
  const { user, profile, session } = useAuth();

  /* — Estado global — */
  const [company, setCompany]       = useState<any>(null);
  const [pitches, setPitches]       = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadingH, setLoadingH]     = useState(false);
  const [busy, setBusy]             = useState<null|'dl'|'share'|'cloud'>(null);
  const [notice, setNotice]         = useState<{k:'ok'|'warn'|'err';t:string}|null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string|null>(null);
  const [copied, setCopied]         = useState(false);

  /* — Configuración del póster — */
  const [cfg, setCfg]               = useState<Cfg>(DEFAULTS);
  const [hydrated, setHydrated]     = useState(false);

  /* — Horas — */
  const [forTomorrow, setForTomorrow] = useState(false);
  const [selectedPitch, setSelectedPitch] = useState<string>('all');
  const [hours, setHours]           = useState<string[]>([]);
  const [freeHours, setFreeHours]   = useState<Set<string>>(new Set());
  const [customTime, setCustomTime] = useState('');

  /* — Logo — */
  const [customLogoB64, setCustomLogoB64] = useState<string|null>(null);
  const [logoSrc, setLogoSrc]       = useState(LOGO);

  /* — Preview — */
  const exportRef   = useRef<HTMLDivElement>(null);
  const previewBox  = useRef<HTMLDivElement>(null);
  const [pvW, setPvW] = useState(300);

  /* — Acordeones — */
  const [open, setOpen] = useState<Record<string, boolean>>({
    hours: true, style: false, colors: false, layout: false, texts: false,
  });
  const toggle = (k: string) => setOpen(p => ({ ...p, [k]: !p[k] }));

  /* ── Helpers setter ── */
  const set = useCallback(<K extends keyof Cfg>(k: K, v: Cfg[K]) =>
    setCfg(p => ({ ...p, [k]: v })), []);
  const setPal = (patch: Partial<Pal>) =>
    setCfg(p => ({ ...p, pal: { ...p.pal, ...patch } }));

  /* ── Persistencia local ── */
  useEffect(() => {
    try { const r=localStorage.getItem(STORE); if(r){const s=JSON.parse(r);setCfg({...DEFAULTS,...s,pal:{...DEFAULTS.pal,...(s.pal||{})}});} }
    catch{} setHydrated(true);
  }, []);
  useEffect(() => { if(!hydrated)return; try{localStorage.setItem(STORE,JSON.stringify(cfg));}catch{} }, [cfg, hydrated]);

  /* ── Cargar empresa ── */
  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    (async () => {
      try {
        const token = session?.access_token;
        const res = await fetch('/api/admin-actions', {
          method: 'POST', headers: { 'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{}) },
          body: JSON.stringify({ action:'ensure_company', payload:{
            owner_id: user.id,
            company_name: profile?.full_name ? `Complejo ${profile.full_name}` : 'Mi Complejo Deportivo',
          }}),
        });
        const json = await res.json();
        if (json.success && json.data) {
          setCompany(json.data);
          if (!cfg.name) set('name', json.data.name || '');
          if (!cfg.address) set('address', json.data.address || '');
        }
      } finally { setLoading(false); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, session]);

  /* ── Logo adaptado a paleta ── */
  useEffect(() => {
    let cancelled = false;
    const base = customLogoB64 || LOGO;
    (async () => {
      let out = base;
      if (cfg.logoStyle === 'tint') out = await tintLogo(base, cfg.pal.accent);
      if (!cancelled) setLogoSrc(out);
    })();
    return () => { cancelled = true; };
  }, [cfg.logoStyle, cfg.pal.accent, customLogoB64]);

  /* ── Tamaño preview responsivo ── */
  useEffect(() => {
    const el = previewBox.current;
    if (!el) return;
    const update = () => setPvW(Math.max(180, Math.min(el.clientWidth - 2, 380)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  /* ── Datos derivados ── */
  const dims    = FMT[cfg.format];
  const scale   = pvW / dims.w;
  const pvH     = dims.h * scale;
  const todayInfo = bogotaNow();
  const targetYmd = forTomorrow ? addDays(todayInfo.ymd, 1) : todayInfo.ymd;
  const dayLabel  = forTomorrow ? 'Mañana' : 'Hoy';
  const dateStr   = fmtDate(targetYmd);
  const sortedH   = useMemo(() => sortH(hours), [hours]);
  const fileName  = `poster-${(cfg.name||'cancha').toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${targetYmd}.png`;

  /* ══ Cargar horas disponibles ══════════════════════════════════════════ */
  const handleAutoLoad = async () => {
    if (!company?.id) {
      setNotice({ k:'warn', t:'Cargando tu complejo, espera un momento...' }); return;
    }
    setLoadingH(true); setNotice(null);
    try {
      const res = await fetch('/api/generate-status', {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ companyId: company.id, pitchId: selectedPitch, forTomorrow, date: targetYmd }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) throw new Error(json?.error || 'Error consultando disponibilidad');

      // Guardar canchas disponibles para el selector
      if (json.data?.pitches?.length > 0) setPitches(json.data.pitches);

      const rawH: string[] = json.data?.availableHours ?? [];

      // Filtrar horas pasadas si es hoy
      let available = rawH;
      if (!forTomorrow) {
        available = rawH.filter(h => h2min(h) > todayInfo.min);
      }

      const freeSet = new Set(available);
      setFreeHours(freeSet);

      if (available.length === 0) {
        setHours([]);
        setNotice({ k:'warn', t:selectedPitch==='all'
          ? `No hay ninguna hora libre ${forTomorrow?'mañana':'hoy'}. Elige las horas manualmente.`
          : `Esta cancha no tiene horas libres ${forTomorrow?'mañana':'hoy'}. Prueba con "Todas las canchas".` });
        return;
      }

      const toSelect = available.slice(0, MAX_H);
      setHours(toSelect);
      setNotice({ k:'ok', t:`${toSelect.length} horas libres cargadas${available.length>MAX_H?` (mostrando ${MAX_H} de ${available.length})`:''}.` });
    } catch (e: any) {
      setNotice({ k:'err', t: e?.message || 'Error al consultar disponibilidad.' });
    } finally { setLoadingH(false); }
  };

  /* ══ Horas manuales ════════════════════════════════════════════════════ */
  const toggleHour = (h: string) =>
    setHours(p => p.includes(h) ? p.filter(x=>x!==h)
      : p.length >= MAX_H ? p : [...p, h]);

  const addCustomTime = () => {
    if (!customTime) return;
    const [hStr, mStr] = customTime.split(':');
    let hh = +hStr; const mm = mStr||'00';
    const suffix = hh>=12?'PM':'AM';
    const h12 = hh%12===0?12:hh%12;
    const label = `${h12}:${mm} ${suffix}`;
    if (hours.includes(label) || hours.length>=MAX_H) return;
    setHours(p => [...p, label]);
    setCustomTime('');
  };

  /* ══ Cargar canchas para selector (sin trigger full load) ══════════════ */
  useEffect(() => {
    if (!company?.id || pitches.length > 0) return;
    (async () => {
      try {
        const { createClient: cc } = await import('@supabase/supabase-js');
        // Usamos el endpoint para obtener solo la lista de canchas
        const res = await fetch('/api/generate-status', {
          method: 'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ companyId: company.id, forTomorrow: false }),
        });
        const json = await res.json();
        if (json.success && json.data?.pitches?.length > 0) setPitches(json.data.pitches);
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  /* ══ Export ════════════════════════════════════════════════════════════ */
  const renderBlob = async (): Promise<Blob> => {
    if (!exportRef.current) throw new Error('Póster no disponible');
    const { toBlob } = await import('html-to-image');
    if ((document as any).fonts?.ready) await (document as any).fonts.ready;
    const opts = { width:dims.w, height:dims.h, canvasWidth:dims.w, canvasHeight:dims.h,
      pixelRatio:1, cacheBust:true, style:{ transform:'none', margin:'0' } };
    await toBlob(exportRef.current, opts); // precarga
    const blob = await toBlob(exportRef.current, opts);
    if (!blob) throw new Error('No se pudo generar');
    return blob;
  };

  const saveBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
  };

  const needHours = () => {
    if (hours.length > 0) return true;
    setNotice({ k:'warn', t:'Selecciona al menos una hora antes de generar el póster.' }); return false;
  };

  const handleDownload = async () => {
    if (!needHours()) return;
    setBusy('dl'); setNotice(null);
    try { saveBlob(await renderBlob()); setNotice({k:'ok',t:'¡Descargado! Búscalo en tu galería o en Descargas.'}); }
    catch(e:any) { setNotice({k:'err',t:e?.message||'Error generando imagen'}); }
    finally { setBusy(null); }
  };

  const handleShare = async () => {
    if (!needHours()) return;
    setBusy('share'); setNotice(null);
    try {
      const blob = await renderBlob();
      const file = new File([blob], fileName, {type:'image/png'});
      const text = `⚡ ${cfg.title} - ${dayLabel} · ${dateStr}${cfg.phone?` · ${cfg.phone}`:''}`;
      const nav = navigator as any;
      if (nav.canShare?.({files:[file]})) {
        await nav.share({files:[file], title: cfg.name, text});
      } else {
        saveBlob(blob);
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        setNotice({k:'ok',t:'Imagen descargada. Adjúntala en tu estado de WhatsApp.'});
      }
    } catch(e:any) {
      if (e?.name!=='AbortError') setNotice({k:'err',t:e?.message||'No se pudo compartir'});
    } finally { setBusy(null); }
  };

  const handleCloud = async () => {
    if (!needHours()) return;
    setBusy('cloud'); setNotice(null);
    try {
      const blob = await renderBlob();
      const form = new FormData();
      form.append('file', new File([blob], fileName, {type:'image/png'}));
      form.append('folder', 'status-posts');
      const res = await fetch('/api/upload', {method:'POST', body:form});
      const json = await res.json();
      if (!json.url) throw new Error('No se pudo subir');
      setUploadedUrl(json.url);
      await navigator.clipboard.writeText(json.url);
      setCopied(true); setTimeout(()=>setCopied(false), 2500);
      setNotice({k:'ok',t:'Imagen subida y enlace copiado al portapapeles.'});
    } catch(e:any) { setNotice({k:'err',t:e?.message||'Error subiendo imagen'}); }
    finally { setBusy(null); }
  };

  /* ══ Shuffle palette ════════════════════════════════════════════════════ */
  const surprise = () => {
    const h = Math.floor(Math.random()*360);
    const light = Math.random()<.15;
    setPal(light
      ? {bg1:hslH(h,60,96),bg2:hslH(h,70,88),accent:hslH((h+180)%360,70,38),text:'#0f172a',angle:135}
      : {bg1:hslH(h,70,12),bg2:hslH((h+25)%360,65,30),accent:hslH((h+150)%360,85,62),text:'#ffffff',
         angle:[120,135,150,160][Math.floor(Math.random()*4)]});
  };

  /* ══ Order secciones ════════════════════════════════════════════════════ */
  const moveSection = (id: SectionId, dir: -1|1) =>
    setCfg(p => {
      const order=[...p.order]; const i=order.indexOf(id); const j=i+dir;
      if(j<0||j>=order.length)return p;
      [order[i],order[j]]=[order[j],order[i]]; return {...p,order};
    });
  const toggleSection = (id: SectionId) =>
    setCfg(p => ({...p, hidden: p.hidden.includes(id)?p.hidden.filter(x=>x!==id):[...p.hidden,id]}));

  /* ══ Render ════════════════════════════════════════════════════════════ */
  if (loading) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
      <Loader2 size={32} className="animate-spin text-emerald-600" />
      <span className="text-sm text-muted-foreground font-semibold">Cargando...</span>
    </div>
  );

  /* Póster oculto a tamaño real (para exportar) */
  const HiddenPoster = (
    <div style={{ position:'fixed', left:'-9999px', top:0, width: dims.w, height: dims.h, pointerEvents:'none' }}>
      <Poster innerRef={exportRef} cfg={cfg} hours={sortedH} dayLabel={dayLabel} dateStr={dateStr} logoSrc={logoSrc} />
    </div>
  );

  /* Notice banner */
  const Notice = notice && (
    <div className={`rounded-xl px-3 py-2.5 text-xs font-semibold flex items-start gap-2 ${
      notice.k==='ok' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
      : notice.k==='warn' ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
      : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'}`}>
      <span className="mt-0.5 shrink-0">{notice.k==='ok'?'✅':notice.k==='warn'?'⚠️':'❌'}</span>
      <span>{notice.t}</span>
      <button className="ml-auto shrink-0 opacity-60 hover:opacity-100" onClick={()=>setNotice(null)}>×</button>
    </div>
  );

  return (
    <>
      {HiddenPoster}

      {/* ════ LAYOUT MÓVIL: editor encima, preview pegada abajo ════════════ */}
      <div className="max-w-2xl mx-auto px-3 pb-[280px] lg:pb-8 space-y-4 pt-2">

        {/* Encabezado */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600">Marketing · WhatsApp</p>
            <h1 className="text-xl font-bold flex items-center gap-2 text-foreground mt-0.5">
              <ImagePlay className="text-emerald-600" size={20} /> Crear publicación
            </h1>
          </div>
          <button onClick={() => { setCfg(DEFAULTS); setHours([]); setNotice(null); }}
            className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0">
            <RotateCcw size={12} /> Reset
          </button>
        </div>

        {Notice}

        {/* ══ Sección: Horas disponibles ══════════════════════════════════ */}
        <Section title={`Horas disponibles (${hours.length}/${MAX_H})`}
          icon={<Clock size={15} className="text-emerald-600"/>} open={open.hours} onToggle={() => toggle('hours')}>

          {/* Día */}
          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2">¿Para cuándo?</p>
            <div className="grid grid-cols-2 gap-2">
              {([false, true] as const).map(v => (
                <button key={String(v)} onClick={() => { setForTomorrow(v); setFreeHours(new Set()); }}
                  className={`py-3 rounded-xl text-sm font-bold border transition-all ${
                    forTomorrow===v ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-secondary text-foreground border-border hover:bg-muted'}`}>
                  {v ? '📅 Mañana' : '⚡ Hoy'}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2 font-medium">{dateStr}</p>
          </div>

          {/* Selector de cancha */}
          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2">¿De qué cancha?</p>
            <select value={selectedPitch} onChange={e => setSelectedPitch(e.target.value)}
              className={`${inp} cursor-pointer`}>
              <option value="all">🏟️ Todas las canchas (hora libre en alguna)</option>
              {pitches.map(p => (
                <option key={p.id} value={p.id}>⚽ {p.name}</option>
              ))}
            </select>
            {pitches.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Las canchas aparecen después de hacer "Cargar automático" la primera vez.
              </p>
            )}
          </div>

          {/* Botón cargar automático */}
          <button onClick={handleAutoLoad} disabled={loadingH}
            className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white transition-all shadow-md">
            {loadingH ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loadingH ? 'Calculando horas libres...' : 'Cargar horas disponibles automáticamente'}
          </button>

          {/* Grid de horas */}
          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2">O elige manualmente:</p>
            <div className="grid grid-cols-3 gap-2">
              {HOURS_ALL.map(h => {
                const sel = hours.includes(h);
                const free = freeHours.has(h);
                return (
                  <button key={h} onClick={() => toggleHour(h)}
                    disabled={!sel && hours.length >= MAX_H}
                    className={`relative py-2.5 rounded-xl text-xs font-bold border transition-all disabled:opacity-40 ${
                      sel ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : free ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
                        : 'bg-secondary text-foreground border-border hover:bg-muted'}`}>
                    {sel && <CheckCircle2 size={10} className="inline mr-1" />}
                    {h}
                    {free && !sel && <span className="absolute top-1 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                  </button>
                );
              })}
            </div>
            {freeHours.size > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1" />
                Verde = libre según tus reservas
              </p>
            )}
          </div>

          {/* Hora personalizada */}
          <div className="flex gap-2">
            <input type="time" value={customTime} onChange={e => setCustomTime(e.target.value)}
              className={`${inp} flex-1`} />
            <button onClick={addCustomTime} disabled={!customTime || hours.length >= MAX_H}
              className="shrink-0 py-2.5 px-4 rounded-xl text-xs font-bold border border-border bg-secondary hover:bg-muted disabled:opacity-50 flex items-center gap-1">
              <Plus size={12} /> Agregar
            </button>
          </div>

          {hours.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{hours.length}/{MAX_H} horas seleccionadas</p>
              <button onClick={() => { setHours([]); setFreeHours(new Set()); }}
                className="text-xs font-bold text-red-500 hover:text-red-600 flex items-center gap-1">
                <XCircle size={12} /> Limpiar
              </button>
            </div>
          )}
        </Section>

        {/* ══ Sección: Estilo visual ══════════════════════════════════════ */}
        <Section title="Estilo visual" icon={<Palette size={15} className="text-violet-500"/>}
          open={open.style} onToggle={() => toggle('style')}>

          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2">Paleta de colores</p>
            <div className="grid grid-cols-5 gap-2 mb-2">
              {PRESETS.map(p => {
                const active = cfg.pal.bg1===p.p.bg1 && cfg.pal.accent===p.p.accent;
                return (
                  <button key={p.id} onClick={() => setCfg(prev=>({...prev,pal:p.p}))} title={p.label}
                    className={`relative h-11 rounded-xl border-2 transition-all overflow-hidden ${
                      active ? 'border-emerald-500 scale-[.93] shadow-lg' : 'border-transparent opacity-75 hover:opacity-100'}`}
                    style={{ background:`linear-gradient(${p.p.angle}deg,${p.p.bg1},${p.p.bg2})` }}>
                    <span className="absolute bottom-1 right-1 h-3 w-3 rounded-full ring-2 ring-white/30"
                      style={{background:p.p.accent}} />
                  </button>
                );
              })}
            </div>
            <button onClick={surprise}
              className="w-full py-2 rounded-xl text-xs font-bold border border-border bg-secondary hover:bg-muted flex items-center justify-center gap-1.5">
              <Shuffle size={12} className="text-violet-500" /> Sorpréndeme con un color aleatorio
            </button>
          </div>

          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2">Acento rápido</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_ACCENT.map(c => (
                <button key={c} onClick={() => setPal({accent:c})} aria-label={c}
                  className={`h-8 w-8 rounded-full border-2 transition-all ${
                    cfg.pal.accent.toLowerCase()===c?'border-emerald-500 scale-110 shadow-md':'border-border'}`}
                  style={{background:c}} />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2">Textura de fondo</p>
            <Chip value={cfg.pattern} onChange={v=>set('pattern',v)} opts={[
              {v:'pitch',label:'⚽ Cancha'},{v:'dots',label:'Puntos'},
              {v:'diagonal',label:'Líneas'},{v:'none',label:'Liso'},
            ]} />
          </div>

          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2">Tarjetas de horas</p>
            <Chip value={cfg.cardStyle} onChange={v=>set('cardStyle',v)} opts={[
              {v:'round',label:'Redondas'},{v:'pill',label:'Cápsulas'},{v:'solid',label:'Rellenas'},
            ]} />
          </div>

          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2">Alineación</p>
            <Chip value={cfg.align} onChange={v=>set('align',v)} opts={[
              {v:'left',label:<><AlignLeft size={14}/>Izquierda</>},
              {v:'center',label:<><AlignCenter size={14}/>Centro</>},
              {v:'right',label:<><AlignRight size={14}/>Derecha</>},
            ]} />
          </div>
        </Section>

        {/* ══ Sección: Textos ═════════════════════════════════════════════ */}
        <Section title="Textos del póster" icon={<span className="text-blue-500 text-base font-black">T</span>}
          open={open.texts} onToggle={() => toggle('texts')}>

          <div className="space-y-2.5">
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">Nombre del complejo</label>
              <input className={inp} value={cfg.name} maxLength={40}
                onChange={e=>set('name',e.target.value)} placeholder={company?.name||'Mi Complejo'} />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">Dirección / barrio</label>
              <input className={inp} value={cfg.address} maxLength={50}
                onChange={e=>set('address',e.target.value)} placeholder={company?.address||'Pasto, Nariño'} />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">Título principal</label>
              <input className={inp} value={cfg.title} maxLength={32}
                onChange={e=>set('title',e.target.value)} placeholder="⚡ Canchas Disponibles" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">Etiqueta / badge (opcional)</label>
              <input className={inp} value={cfg.tag} maxLength={28}
                onChange={e=>set('tag',e.target.value)} placeholder="¡Últimos cupos!" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">Mensaje adicional (opcional)</label>
              <textarea value={cfg.message} maxLength={80} rows={2}
                onChange={e=>set('message',e.target.value)}
                placeholder="¡Reserva ya y asegura tu cancha!"
                className={`${inp} resize-none`} />
              <p className="text-[10px] text-muted-foreground text-right mt-1">{cfg.message.length}/80</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-xs font-bold text-muted-foreground block mb-1">Botón</label>
                <input className={inp} value={cfg.cta} maxLength={24}
                  onChange={e=>set('cta',e.target.value)} placeholder="Reserva ahora" />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground block mb-1">WhatsApp</label>
                <input className={inp} value={cfg.phone} maxLength={20}
                  onChange={e=>set('phone',e.target.value)} placeholder="3001234567" inputMode="tel" />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">Sitio web</label>
              <input className={inp} value={cfg.website} maxLength={30}
                onChange={e=>set('website',e.target.value)} placeholder="cancheros.site" />
            </div>
          </div>
        </Section>

        {/* ══ Sección: Formato y logo ═════════════════════════════════════ */}
        <Section title="Formato y logo" icon={<LayoutTemplate size={15} className="text-orange-500"/>}
          open={open.layout} onToggle={() => toggle('layout')}>

          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2">Formato de imagen</p>
            <Chip value={cfg.format} onChange={v=>set('format',v)} opts={[
              {v:'story',label:'Estado 9:16'},{v:'post',label:'Post 4:5'},{v:'square',label:'Cuadrado 1:1'},
            ]} />
            <p className="text-[10px] text-muted-foreground mt-1">{dims.w}×{dims.h} px</p>
          </div>

          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2">Logo</p>
            <Chip value={cfg.logoStyle} onChange={v=>set('logoStyle',v)} opts={[
              {v:'badge',label:'Medallón'},{v:'tint',label:'Color acento'},{v:'original',label:'Original'},
            ]} />
          </div>

          <Slider label="Tamaño del logo" value={cfg.logoSize} min={80} max={280} onChange={v=>set('logoSize',v)} unit="px" />
          <Slider label="Tamaño del nombre" value={cfg.nameSize} min={36} max={110} onChange={v=>set('nameSize',v)} unit="px" />
          <Slider label="Márgenes internos" value={cfg.padding} min={30} max={120} onChange={v=>set('padding',v)} unit="px" />

          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2">Subir mi propio logo (PNG transparente)</p>
            <div className="flex gap-2">
              <label className="flex-1 cursor-pointer py-3 rounded-xl text-xs font-bold border border-dashed border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-1.5">
                <Upload size={14} /> Elegir imagen
                <input type="file" accept="image/*" className="hidden"
                  onChange={e => { const f=e.target.files?.[0]; if(!f)return; const r=new FileReader();r.onload=()=>setCustomLogoB64(String(r.result));r.readAsDataURL(f); }} />
              </label>
              {customLogoB64 && (
                <button onClick={()=>setCustomLogoB64(null)}
                  className="py-3 px-4 rounded-xl text-xs font-bold border border-border bg-secondary hover:bg-muted">
                  Usar Cancheros
                </button>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2">Orden de los bloques</p>
            <div className="space-y-1.5">
              {cfg.order.map((id, i) => {
                const hidden = cfg.hidden.includes(id);
                return (
                  <div key={id} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-secondary ${hidden?'opacity-40':''}`}>
                    <span className="flex-1 text-xs font-bold">{SECTION_LABEL[id]}</span>
                    <button onClick={()=>moveSection(id,-1)} disabled={i===0}
                      className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30"><ArrowUp size={13}/></button>
                    <button onClick={()=>moveSection(id,1)} disabled={i===cfg.order.length-1}
                      className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30"><ArrowDown size={13}/></button>
                    <button onClick={()=>toggleSection(id)} className="p-1.5 rounded-lg hover:bg-muted">
                      {hidden?<EyeOff size={13}/>:<Eye size={13}/>}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </Section>
      </div>

      {/* ════ PREVIEW FIJA EN LA PARTE INFERIOR (móvil) / lateral (desktop) ════ */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-t border-border shadow-2xl lg:static lg:border-0 lg:shadow-none lg:bg-transparent">

        {/* —— Desktop: preview lateral en sticky (la usamos abajo del form) —— */}
        {/* —— Móvil: barra compacta con preview pequeña + botones —— */}
        <div className="max-w-2xl mx-auto lg:max-w-none">

          {/* Preview miniatura + botones de acción */}
          <div className="flex items-end gap-3 p-3 lg:hidden">
            {/* Thumbnail del póster */}
            <div ref={previewBox}
              className="shrink-0 rounded-xl overflow-hidden border-2 border-emerald-500/40 shadow-lg"
              style={{ width: 72, height: 72*dims.h/dims.w }}>
              <div style={{ width: dims.w, height: dims.h, transform:`scale(${72/dims.w})`,
                transformOrigin:'top left', pointerEvents:'none' }}>
                <Poster cfg={cfg} hours={sortedH} dayLabel={dayLabel} dateStr={dateStr} logoSrc={logoSrc} />
              </div>
            </div>

            {/* Acciones */}
            <div className="flex-1 flex flex-col gap-2 min-w-0">
              <div className="flex gap-2">
                <button onClick={handleDownload} disabled={!!busy}
                  className="flex-1 py-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white flex items-center justify-center gap-1.5 transition-all">
                  {busy==='dl'?<Loader2 size={14} className="animate-spin"/>:<Download size={14}/>}
                  Descargar
                </button>
                <button onClick={handleShare} disabled={!!busy}
                  className="flex-1 py-3 rounded-xl text-xs font-bold bg-[#25D366] hover:bg-[#1fb957] disabled:opacity-60 text-white flex items-center justify-center gap-1.5 transition-all">
                  {busy==='share'?<Loader2 size={14} className="animate-spin"/>:<Share2 size={14}/>}
                  Compartir
                </button>
              </div>
              <button onClick={handleCloud} disabled={!!busy}
                className="w-full py-2.5 rounded-xl text-xs font-bold border border-border bg-secondary hover:bg-muted disabled:opacity-60 flex items-center justify-center gap-1.5">
                {busy==='cloud'?<Loader2 size={13} className="animate-spin"/>:<span>☁️</span>}
                {copied?'✅ Enlace copiado':'Subir a la nube y copiar enlace'}
              </button>
            </div>
          </div>

          {/* —— DESKTOP: preview grande bajo el form —— */}
          <div className="hidden lg:block p-6">
            <div className="grid grid-cols-[1fr_320px] gap-6">
              <div /> {/* espacio del form */}
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Vista previa</p>
                <div ref={previewBox}
                  className="rounded-2xl overflow-hidden border border-border shadow-xl"
                  style={{ width:'100%', aspectRatio: FMT[cfg.format].ratio }}>
                  <div style={{ width:dims.w, height:dims.h,
                    transform:`scale(${pvW/dims.w})`, transformOrigin:'top left', pointerEvents:'none' }}>
                    <Poster cfg={cfg} hours={sortedH} dayLabel={dayLabel} dateStr={dateStr} logoSrc={logoSrc} />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button onClick={handleDownload} disabled={!!busy}
                      className="flex-1 py-3.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white flex items-center justify-center gap-2 shadow-lg transition-all">
                      {busy==='dl'?<Loader2 size={16} className="animate-spin"/>:<Download size={16}/>} Descargar
                    </button>
                    <button onClick={handleShare} disabled={!!busy}
                      className="flex-1 py-3.5 rounded-xl text-sm font-bold bg-[#25D366] hover:bg-[#1fb957] disabled:opacity-60 text-white flex items-center justify-center gap-2 shadow-lg transition-all">
                      {busy==='share'?<Loader2 size={16} className="animate-spin"/>:<Share2 size={16}/>} Compartir
                    </button>
                  </div>
                  <button onClick={handleCloud} disabled={!!busy}
                    className="w-full py-3 rounded-xl text-sm font-bold border border-border bg-secondary hover:bg-muted disabled:opacity-60 flex items-center justify-center gap-2">
                    {busy==='cloud'?<Loader2 size={15} className="animate-spin"/>:<span>☁️</span>}
                    {copied?'✅ Enlace copiado':'Subir y copiar enlace'}
                  </button>
                  {uploadedUrl && (
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold break-all text-center">{uploadedUrl}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}