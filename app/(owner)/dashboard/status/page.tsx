'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  Download, Share2, Loader2, Sparkles, Clock, CalendarDays,
  CheckCircle2, XCircle, Palette, LayoutTemplate, ChevronDown,
  ChevronUp, ImagePlay, RotateCcw, Shuffle, AlignLeft, AlignCenter,
  AlignRight, Eye, EyeOff, ArrowUp, ArrowDown, Upload, Plus, Type,
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
  format: FormatId; pal: Pal; pattern: Pattern; cardStyle: CardStyle;
  logoStyle: LogoStyle; logoSize: number; nameSize: number; align: Align; padding: number;
  order: SectionId[]; hidden: SectionId[];
  name: string; address: string; title: string; tag: string;
  message: string; phone: string; cta: string; website: string;
}

/* ══════════════════════════════════════════════════════════
   CONSTANTES
══════════════════════════════════════════════════════════ */
const FMT: Record<FormatId, { w: number; h: number; ar: string }> = {
  story:  { w: 1080, h: 1920, ar: '9/16' },
  post:   { w: 1080, h: 1350, ar: '4/5'  },
  square: { w: 1080, h: 1080, ar: '1/1'  },
};

const PRESETS: { id: string; label: string; p: Pal }[] = [
  { id:'emerald',  label:'Esmeralda', p:{ bg1:'#064e3b', bg2:'#047857', accent:'#34d399', text:'#fff',    angle:135 } },
  { id:'night',    label:'Noche',     p:{ bg1:'#0f0c29', bg2:'#302b63', accent:'#818cf8', text:'#fff',    angle:135 } },
  { id:'sunset',   label:'Atardecer', p:{ bg1:'#7f1d1d', bg2:'#b45309', accent:'#fbbf24', text:'#fff',    angle:135 } },
  { id:'ocean',    label:'Océano',    p:{ bg1:'#0c4a6e', bg2:'#0369a1', accent:'#38bdf8', text:'#fff',    angle:135 } },
  { id:'neon',     label:'Neón',      p:{ bg1:'#09090b', bg2:'#18181b', accent:'#a3e635', text:'#fafafa', angle:160 } },
  { id:'gold',     label:'Oro',       p:{ bg1:'#1c1917', bg2:'#44403c', accent:'#facc15', text:'#fafaf9', angle:145 } },
  { id:'passion',  label:'Pasión',    p:{ bg1:'#450a0a', bg2:'#dc2626', accent:'#fde047', text:'#fff',    angle:150 } },
  { id:'violet',   label:'Violeta',   p:{ bg1:'#2e1065', bg2:'#6d28d9', accent:'#f0abfc', text:'#fff',    angle:135 } },
  { id:'clean',    label:'Claro',     p:{ bg1:'#f0fdf4', bg2:'#dcfce7', accent:'#16a34a', text:'#0f172a', angle:135 } },
];

const QUICK_ACCENT = [
  '#34d399','#a3e635','#facc15','#fb923c','#f87171','#f472b6',
  '#c084fc','#818cf8','#38bdf8','#22d3ee','#ffffff','#111827',
];

const ALL_HOURS = [
  '6:00 AM','7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM',
  '12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM',
  '6:00 PM','7:00 PM','8:00 PM','9:00 PM','10:00 PM',
];

const SEC_LABEL: Record<SectionId, string> = {
  header:'Nombre y logo', title:'Título y fecha',
  hours:'Horas disponibles', message:'Mensaje', footer:'Footer',
};

const MAX_H  = 12;
const TZ     = 'America/Bogota';
const LOGO   = '/cancheros.png';
const STORE  = 'cancheros-status-v4';

const DEFAULTS: Cfg = {
  format:'story', pattern:'pitch', cardStyle:'round', logoStyle:'badge',
  logoSize:140, nameSize:64, align:'left', padding:70,
  order:['header','title','hours','message','footer'], hidden:[],
  name:'', address:'', title:'⚡ Canchas Disponibles',
  tag:'', message:'', phone:'', cta:'Reserva ahora', website:'cancheros.site',
  pal: PRESETS[0].p,
};

/* ══════════════════════════════════════════════════════════
   COLOR UTILS
══════════════════════════════════════════════════════════ */
const hexRgb = (h: string): [number,number,number] => {
  let s=h.replace('#',''); if(s.length===3)s=s.split('').map(c=>c+c).join('');
  const n=parseInt(s,16)||0; return [(n>>16)&255,(n>>8)&255,n&255];
};
const rgba = (h:string,a:number)=>{ const[r,g,b]=hexRgb(h); return `rgba(${r},${g},${b},${a})`; };
const lum  = (h:string)=>{ const[r,g,b]=hexRgb(h).map(v=>{const c=v/255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4);}); return .2126*r+.7152*g+.0722*b; };
const onC  = (h:string)=>lum(h)>.4?'#0b0b0b':'#ffffff';
const hslH = (h:number,s:number,l:number)=>{s/=100;l/=100;const k=(n:number)=>(n+h/30)%12,a=s*Math.min(l,1-l),f=(n:number)=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1))),t=(x:number)=>Math.round(x*255).toString(16).padStart(2,'0');return `#${t(f(0))}${t(f(8))}${t(f(4))}`;};

/* ══════════════════════════════════════════════════════════
   HOUR / DATE UTILS (Colombia)
══════════════════════════════════════════════════════════ */
const bogotaNow=()=>{
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());
  const g=(t:string)=>p.find(x=>x.type===t)?.value??'0';
  return{ymd:`${g('year')}-${g('month')}-${g('day')}`,min:(+g('hour')%24)*60+(+g('minute'))};
};
const addDays=(ymd:string,n:number)=>{const[y,m,d]=ymd.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10);};
const fmtDate=(ymd:string)=>{const s=new Date(`${ymd}T12:00:00-05:00`).toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',timeZone:TZ});return s[0].toUpperCase()+s.slice(1);};
const h2min=(l:string)=>{const m=l.match(/(\d+):(\d+)\s*(AM|PM)/i);if(!m)return 0;let h=+m[1]%12;if(m[3].toUpperCase()==='PM')h+=12;return h*60+(+m[2]);};
const sortH=(arr:string[])=>[...new Set(arr)].sort((a,b)=>h2min(a)-h2min(b));

/* ══════════════════════════════════════════════════════════
   TINT LOGO
══════════════════════════════════════════════════════════ */
function tintLogo(src:string,color:string):Promise<string>{
  return new Promise(res=>{
    const img=new Image();img.crossOrigin='anonymous';
    img.onload=()=>{try{const c=document.createElement('canvas');c.width=img.naturalWidth||512;c.height=img.naturalHeight||512;const ctx=c.getContext('2d');if(!ctx)return res(src);ctx.drawImage(img,0,0);ctx.globalCompositeOperation='source-in';ctx.fillStyle=color;ctx.fillRect(0,0,c.width,c.height);res(c.toDataURL('image/png'));}catch{res(src);}};
    img.onerror=()=>res(src);img.src=src;
  });
}

/* ══════════════════════════════════════════════════════════
   POSTER COMPONENT
══════════════════════════════════════════════════════════ */
interface PosterProps {
  innerRef?: React.Ref<HTMLDivElement>;
  cfg: Cfg; hours: string[]; dayLabel: string; dateStr: string; logoSrc: string;
}

function Poster({ innerRef, cfg, hours, dayLabel, dateStr, logoSrc }: PosterProps) {
  const dims   = FMT[cfg.format];
  const { bg1, bg2, accent, text, angle } = cfg.pal;
  const sub      = rgba(text,.75);
  const cardBg   = rgba(text,.1);
  const cardBdr  = rgba(accent,.45);
  const onAccent = onC(accent);
  const compact  = cfg.format !== 'story';
  const gap      = compact ? 40 : 58;
  const L        = cfg.logoSize;
  const visible  = cfg.order.filter(id => !cfg.hidden.includes(id));

  const n    = hours.length;
  const cols = n<=4 ? 2 : n<=9 ? 3 : 4;
  const fsBig= (cols===2 ? 58 : cols===3 ? 46 : 36);
  const radius = cfg.cardStyle==='pill' ? 999 : cfg.cardStyle==='solid' ? 16 : 30;
  const solid  = cfg.cardStyle==='solid';

  /* — Logo con efecto medallón + glow grande — */
  const logoEl = logoSrc ? (
    cfg.logoStyle === 'original' ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoSrc} alt="" style={{ width:L, height:L, objectFit:'contain', flexShrink:0,
        filter:`drop-shadow(0 12px 32px ${rgba(accent,.5)})` }} />
    ) : (
      <div style={{
        width:L, height:L, borderRadius:'50%', flexShrink:0,
        background:'#ffffff', border:`10px solid ${accent}`,
        boxShadow:`0 0 0 6px ${rgba(accent,.25)}, 0 20px 60px ${rgba(accent,.5)}, 0 8px 24px rgba(0,0,0,.4)`,
        boxSizing:'border-box', padding: L * .1,
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
      </div>
    )
  ) : null;

  const secs: Partial<Record<SectionId, React.ReactNode>> = {
    header: (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:32 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:cfg.nameSize, fontWeight:900, letterSpacing:'-1px',
            textTransform:'uppercase', color:text, lineHeight:1.02, wordBreak:'break-word',
            textShadow:'0 4px 20px rgba(0,0,0,.3)' }}>
            {cfg.name || '🏟️ Mi Complejo'}
          </div>
          <div style={{ width:160, height:8, borderRadius:999, background:accent, marginTop:18 }} />
          {cfg.address && <div style={{ fontSize:26, color:sub, marginTop:14, fontWeight:500 }}>📍 {cfg.address}</div>}
        </div>
        {logoEl}
      </div>
    ),

    title: (
      <div style={{ textAlign:cfg.align }}>
        {cfg.tag && (
          <div style={{ display:'inline-block', border:`3px solid ${accent}`, color:accent,
            borderRadius:999, padding:'8px 28px', fontSize:26, fontWeight:800, marginBottom:20 }}>
            {cfg.tag}
          </div>
        )}
        <div style={{ fontSize:compact?56:68, fontWeight:900, lineHeight:1.05, color:text }}>{cfg.title}</div>
        <div style={{ display:'inline-block', marginTop:20, background:accent, color:onAccent,
          borderRadius:999, padding:'14px 36px', fontSize:32, fontWeight:800, textTransform:'capitalize' }}>
          {dayLabel} · {dateStr}
        </div>
      </div>
    ),

    hours: (
      <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', justifyContent:'center' }}>
        {hours.length>0 ? (
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${cols},1fr)`, gap:22 }}>
            {hours.map(h => {
              const [t,ap]=h.split(' ');
              return (
                <div key={h} style={{
                  background:solid?accent:cardBg, border:solid?'none':`2px solid ${cardBdr}`,
                  borderRadius:radius, padding:`${compact?24:30}px 14px`,
                  textAlign:'center', color:solid?onAccent:accent,
                }}>
                  <div style={{ fontSize:fsBig, fontWeight:900, lineHeight:1 }}>
                    {t}<span style={{ fontSize:fsBig*.5, fontWeight:800, marginLeft:6 }}>{ap}</span>
                  </div>
                  <div style={{ fontSize:19, marginTop:8, fontWeight:600,
                    color:solid?rgba(onAccent,.8):sub }}>● Disponible</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign:'center', opacity:.35, fontSize:36 }}>
            <div style={{ fontSize:90, marginBottom:16 }}>⏰</div>
            Selecciona las horas disponibles
          </div>
        )}
      </div>
    ),

    message: cfg.message ? (
      <div style={{ background:cardBg, border:`2px solid ${cardBdr}`, borderRadius:30,
        padding:'36px 44px', textAlign:'center', fontSize:34, fontWeight:700,
        fontStyle:'italic', color:text }}>"{cfg.message}"</div>
    ) : undefined,

    footer: (
      <div style={{ borderTop:`2px solid ${cardBdr}`, paddingTop:48,
        display:'flex', justifyContent:'space-between', alignItems:'center', gap:24 }}>
        <div>
          <div style={{ fontSize:32, fontWeight:900, color:accent }}>📲 {cfg.cta}</div>
          <div style={{ fontSize:22, color:sub, marginTop:8 }}>
            {cfg.phone?`📞 ${cfg.phone}`:'Disponibilidad limitada'}
          </div>
        </div>
        {cfg.website && (
          <div style={{ background:accent, color:onAccent, fontWeight:900, fontSize:24,
            borderRadius:999, padding:'18px 34px', whiteSpace:'nowrap' }}>
            {cfg.website}
          </div>
        )}
      </div>
    ),
  };

  const patEl = cfg.pattern==='dots' ? (
    <div style={{ position:'absolute', inset:0, pointerEvents:'none',
      backgroundImage:`radial-gradient(${rgba(text,.12)} 3px,transparent 3.5px)`, backgroundSize:'46px 46px' }} />
  ) : cfg.pattern==='diagonal' ? (
    <div style={{ position:'absolute', inset:0, pointerEvents:'none',
      backgroundImage:`repeating-linear-gradient(45deg,${rgba(text,.06)} 0 3px,transparent 3px 34px)` }} />
  ) : cfg.pattern==='pitch' ? (
    <svg width={dims.w} height={dims.h} viewBox={`0 0 ${dims.w} ${dims.h}`}
      style={{ position:'absolute', inset:0, pointerEvents:'none' }}>
      <rect x="50" y="50" width={dims.w-100} height={dims.h-100} rx="28"
        fill="none" stroke={rgba(text,.1)} strokeWidth="7"/>
      <line x1="50" y1={dims.h/2} x2={dims.w-50} y2={dims.h/2} stroke={rgba(text,.1)} strokeWidth="7"/>
      <circle cx={dims.w/2} cy={dims.h/2} r="180" fill="none" stroke={rgba(text,.1)} strokeWidth="7"/>
      <circle cx={dims.w/2} cy={dims.h/2} r="14" fill={rgba(text,.1)}/>
    </svg>
  ) : null;

  return (
    <div ref={innerRef} style={{
      width:dims.w, height:dims.h, position:'relative', overflow:'hidden',
      boxSizing:'border-box', padding:compact?Math.min(cfg.padding,55):cfg.padding,
      background:`linear-gradient(${angle}deg,${bg1} 0%,${bg2} 100%)`,
      fontFamily:"'Inter','Segoe UI',Arial,sans-serif", color:text,
      display:'flex', flexDirection:'column',
    }}>
      {patEl}
      <div style={{ position:'absolute', top:-180, right:-180, width:640, height:640, borderRadius:'50%',
        background:`radial-gradient(circle,${rgba(accent,.22)} 0%,transparent 70%)`, pointerEvents:'none' }}/>
      <div style={{ position:'absolute', bottom:80, left:-120, width:480, height:480, borderRadius:'50%',
        background:`radial-gradient(circle,${rgba(accent,.13)} 0%,transparent 70%)`, pointerEvents:'none' }}/>
      <div style={{ position:'relative', flex:1, minHeight:0, display:'flex', flexDirection:'column', gap }}>
        {visible.map((id, i) => {
          const node = secs[id];
          if (!node) return null;
          return (
            <div key={id} style={
              id==='hours' ? { flex:1, minHeight:0, display:'flex', flexDirection:'column' }
              : id==='footer' && i===visible.length-1 ? { marginTop:'auto' } : {}
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
const inp = 'w-full px-3 py-3 bg-background border border-border rounded-xl text-sm font-medium outline-none focus:border-emerald-600 transition-colors';

function Chip<T extends string|number>({ value, opts, onChange }: {
  value: T; opts: { v: T; label: React.ReactNode }[]; onChange:(v:T)=>void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {opts.map(o=>(
        <button key={String(o.v)} type="button" onClick={()=>onChange(o.v)}
          className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1 ${
            value===o.v?'bg-emerald-600 text-white border-emerald-600 shadow-sm'
              :'bg-secondary text-foreground border-border hover:bg-muted'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ label, value, min, max, step=1, unit='', onChange }:{
  label:string;value:number;min:number;max:number;step?:number;unit?:string;onChange:(v:number)=>void;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="flex justify-between text-xs font-semibold text-muted-foreground">
        <span>{label}</span><span className="font-mono">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e=>onChange(Number(e.target.value))}
        className="w-full h-2.5 accent-emerald-600 cursor-pointer rounded-full"/>
    </label>
  );
}

function Accordion({ title, icon, open, onToggle, children }:{
  title:string;icon:React.ReactNode;open:boolean;onToggle():void;children:React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-4 text-left hover:bg-secondary/40 transition-colors active:bg-secondary/60">
        <span className="flex items-center gap-2.5 text-sm font-bold text-foreground">{icon}{title}</span>
        {open?<ChevronUp size={16} className="text-muted-foreground shrink-0"/>
             :<ChevronDown size={16} className="text-muted-foreground shrink-0"/>}
      </button>
      {open && <div className="px-4 pb-5 space-y-4 border-t border-border pt-4">{children}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
══════════════════════════════════════════════════════════ */
export default function CreateStatusPage() {
  const { user, profile, session } = useAuth();

  const [company,      setCompany]      = useState<any>(null);
  const [pitches,      setPitches]      = useState<{ id: string; name: string }[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadingH,     setLoadingH]     = useState(false);
  const [busy,         setBusy]         = useState<null|'dl'|'share'>(null);
  const [notice,       setNotice]       = useState<{k:'ok'|'warn'|'err';t:string}|null>(null);

  const [cfg,          setCfg]          = useState<Cfg>(DEFAULTS);
  const [hydrated,     setHydrated]     = useState(false);

  const [forTomorrow,  setForTomorrow]  = useState(false);
  const [selPitch,     setSelPitch]     = useState<string>('all');
  const [hours,        setHours]        = useState<string[]>([]);
  const [freeSet,      setFreeSet]      = useState<Set<string>>(new Set());
  const [bookedSet,    setBookedSet]    = useState<Set<string>>(new Set());
  const [customTime,   setCustomTime]   = useState('');

  const [customLogo,   setCustomLogo]   = useState<string|null>(null);
  const [logoSrc,      setLogoSrc]      = useState(LOGO);

  const exportRef  = useRef<HTMLDivElement>(null);
  const pvRef      = useRef<HTMLDivElement>(null);
  const [pvW,      setPvW]             = useState(300);

  /* — tab del editor — */
  type EdTab = 'hours'|'style'|'texts'|'layout';
  const [tab, setTab] = useState<EdTab>('hours');

  const set    = useCallback(<K extends keyof Cfg>(k:K,v:Cfg[K])=>setCfg(p=>({...p,[k]:v})),[]);
  const setPal = (patch:Partial<Pal>)=>setCfg(p=>({...p,pal:{...p.pal,...patch}}));

  /* — persistencia — */
  useEffect(()=>{ try{const r=localStorage.getItem(STORE);if(r){const s=JSON.parse(r);setCfg({...DEFAULTS,...s,pal:{...DEFAULTS.pal,...(s.pal||{})}});}}catch{} setHydrated(true); },[]);
  useEffect(()=>{ if(!hydrated)return; try{localStorage.setItem(STORE,JSON.stringify(cfg));}catch{} },[cfg,hydrated]);

  /* — cargar empresa y canchas — */
  useEffect(()=>{
    if(!user?.id){setLoading(false);return;}
    (async()=>{
      try{
        const token=session?.access_token;
        const res=await fetch('/api/admin-actions',{
          method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
          body:JSON.stringify({action:'ensure_company',payload:{
            owner_id:user.id,
            company_name:profile?.full_name?`Complejo ${profile.full_name}`:'Mi Complejo Deportivo',
          }}),
        });
        const json=await res.json();
        if(json.success&&json.data){
          const co=json.data;
          setCompany(co);
          if(!cfg.name)set('name',co.name||'');
          if(!cfg.address)set('address',co.address||'');
          // Cargar canchas del complejo inmediatamente
          const hRes=await fetch('/api/generate-status',{
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({companyId:co.id,forTomorrow:false}),
          });
          const hJson=await hRes.json();
          if(hJson.success&&hJson.data?.pitches?.length>0){
            setPitches(hJson.data.pitches);
            setFreeSet(new Set(hJson.data.freeHours??[]));
            setBookedSet(new Set(hJson.data.bookedHours??[]));
          }
        }
      }finally{setLoading(false);}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user,session]);

  /* — logo — */
  useEffect(()=>{
    let c=false; const base=customLogo||LOGO;
    (async()=>{ let o=base; if(cfg.logoStyle==='tint')o=await tintLogo(base,cfg.pal.accent); if(!c)setLogoSrc(o); })();
    return()=>{c=true;};
  },[cfg.logoStyle,cfg.pal.accent,customLogo]);

  /* — tamaño preview — */
  useEffect(()=>{
    const el=pvRef.current; if(!el)return;
    const upd=()=>setPvW(Math.max(180,el.clientWidth-2));
    upd(); const ro=new ResizeObserver(upd); ro.observe(el);
    return()=>ro.disconnect();
  },[loading]);

  /* — datos derivados — */
  const dims     = FMT[cfg.format];
  const scale    = pvW/dims.w;
  const pvH      = dims.h*scale;
  const now      = bogotaNow();
  const tgtYmd   = forTomorrow ? addDays(now.ymd,1) : now.ymd;
  const dayLabel = forTomorrow ? 'Mañana' : 'Hoy';
  const dateStr  = fmtDate(tgtYmd);
  const sortedH  = useMemo(()=>sortH(hours),[hours]);
  const fileName = `poster-${(cfg.name||'cancha').toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${tgtYmd}.png`;

  /* ══ Cargar horas ══ */
  const fetchHours = useCallback(async(pitchId:string,tomorrow:boolean,companyId:string)=>{
    setLoadingH(true); setNotice(null);
    try{
      const ymd=tomorrow?addDays(bogotaNow().ymd,1):bogotaNow().ymd;
      const res=await fetch('/api/generate-status',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({companyId,pitchId,forTomorrow:tomorrow,date:ymd}),
      });
      const json=await res.json();
      if(!res.ok||!json.success)throw new Error(json?.error||'Error');
      if(json.data?.pitches?.length>0)setPitches(json.data.pitches);
      const free:string[]=json.data?.freeHours??[];
      const booked:string[]=json.data?.bookedHours??[];
      setFreeSet(new Set(free));
      setBookedSet(new Set(booked));
      // Filtrar horas pasadas si es hoy
      const minNow=bogotaNow().min;
      const available=tomorrow?free:free.filter(h=>h2min(h)>minNow);
      if(available.length===0){
        setHours([]);
        setNotice({k:'warn',t:tomorrow?'No hay horas libres mañana. Elige manualmente.':'No hay horas libres para hoy. Prueba mañana o elige manualmente.'});
        return;
      }
      setHours(available.slice(0,MAX_H));
      setNotice({k:'ok',t:`${available.length} hora${available.length!==1?'s':''} libre${available.length!==1?'s':''} cargada${available.length!==1?'s':''}.`});
    }catch(e:any){
      setNotice({k:'err',t:e?.message||'Error consultando disponibilidad.'});
    }finally{setLoadingH(false);}
  },[]);

  const handleAutoLoad=()=>{ if(company?.id)fetchHours(selPitch,forTomorrow,company.id); };

  /* — cuando cambia la cancha o el día, recargar horas automáticamente — */
  useEffect(()=>{
    if(company?.id) fetchHours(selPitch,forTomorrow,company.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selPitch,forTomorrow,company?.id]);

  const toggleHour=(h:string)=>setHours(p=>p.includes(h)?p.filter(x=>x!==h):p.length>=MAX_H?p:[...p,h]);

  const addCustomTime=()=>{
    if(!customTime)return;
    const[hS,mS]=customTime.split(':');let hh=+hS;const mm=mS||'00';
    const suf=hh>=12?'PM':'AM';const h12=hh%12===0?12:hh%12;
    const label=`${h12}:${mm} ${suf}`;
    if(hours.includes(label)||hours.length>=MAX_H)return;
    setHours(p=>[...p,label]); setCustomTime('');
  };

  /* ══ Export ══ */
  const renderBlob=async():Promise<Blob>=>{
    if(!exportRef.current)throw new Error('Póster no disponible');
    const{toBlob}=await import('html-to-image');
    if((document as any).fonts?.ready)await(document as any).fonts.ready;
    const opts={width:dims.w,height:dims.h,canvasWidth:dims.w,canvasHeight:dims.h,
      pixelRatio:1,cacheBust:true,style:{transform:'none',margin:'0'}};
    await toBlob(exportRef.current,opts);
    const blob=await toBlob(exportRef.current,opts);
    if(!blob)throw new Error('No se pudo generar');
    return blob;
  };
  const saveBlob=(blob:Blob)=>{
    const url=URL.createObjectURL(blob);const a=document.createElement('a');
    a.href=url;a.download=fileName;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  };
  const needHours=()=>{
    if(hours.length>0)return true;
    setNotice({k:'warn',t:'Selecciona al menos una hora antes de generar el póster.'}); return false;
  };
  const handleDownload=async()=>{
    if(!needHours())return; setBusy('dl'); setNotice(null);
    try{saveBlob(await renderBlob());setNotice({k:'ok',t:'¡Descargado! Búscalo en tu galería.'});}
    catch(e:any){setNotice({k:'err',t:e?.message||'Error generando imagen'});}
    finally{setBusy(null);}
  };
  const handleShare=async()=>{
    if(!needHours())return; setBusy('share'); setNotice(null);
    try{
      const blob=await renderBlob();
      const file=new File([blob],fileName,{type:'image/png'});
      const text=`⚡ ${cfg.title} - ${dayLabel} · ${dateStr}${cfg.phone?` · ${cfg.phone}`:''}`;
      const nav=navigator as any;
      if(nav.canShare?.({files:[file]})){await nav.share({files:[file],title:cfg.name,text});}
      else{saveBlob(blob);window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank');setNotice({k:'ok',t:'Imagen descargada. Adjúntala en tu estado de WhatsApp.'});}
    }catch(e:any){if(e?.name!=='AbortError')setNotice({k:'err',t:e?.message||'No se pudo compartir'});}
    finally{setBusy(null);}
  };

  const surprise=()=>{
    const h=Math.floor(Math.random()*360);const light=Math.random()<.15;
    setPal(light?{bg1:hslH(h,60,96),bg2:hslH(h,70,88),accent:hslH((h+180)%360,70,38),text:'#0f172a',angle:135}
      :{bg1:hslH(h,70,12),bg2:hslH((h+25)%360,65,30),accent:hslH((h+150)%360,85,62),text:'#ffffff',
        angle:[120,135,150,160][Math.floor(Math.random()*4)]});
  };

  const moveSection=(id:SectionId,dir:-1|1)=>setCfg(p=>{
    const order=[...p.order];const i=order.indexOf(id);const j=i+dir;
    if(j<0||j>=order.length)return p;[order[i],order[j]]=[order[j],order[i]];return{...p,order};
  });
  const toggleSection=(id:SectionId)=>setCfg(p=>({...p,hidden:p.hidden.includes(id)?p.hidden.filter(x=>x!==id):[...p.hidden,id]}));

  /* ══ RENDER ══ */
  if(loading)return(
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
      <Loader2 size={32} className="animate-spin text-emerald-600"/>
      <span className="text-sm text-muted-foreground font-semibold">Cargando...</span>
    </div>
  );

  /* Póster invisible tamaño real (para exportar) */
  const HiddenPoster=(
    <div style={{position:'fixed',left:'-9999px',top:0,width:dims.w,height:dims.h,pointerEvents:'none'}}>
      <Poster innerRef={exportRef} cfg={cfg} hours={sortedH} dayLabel={dayLabel} dateStr={dateStr} logoSrc={logoSrc}/>
    </div>
  );

  const NoticeBanner=notice&&(
    <div className={`rounded-xl px-3 py-2.5 text-xs font-semibold flex items-start gap-2 ${
      notice.k==='ok'?'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
      :notice.k==='warn'?'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
      :'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'}`}>
      <span className="mt-0.5 shrink-0">{notice.k==='ok'?'✅':notice.k==='warn'?'⚠️':'❌'}</span>
      <span className="flex-1">{notice.t}</span>
      <button className="shrink-0 opacity-60 hover:opacity-100 ml-1" onClick={()=>setNotice(null)}>×</button>
    </div>
  );

  /* Botones de acción */
  const ActionBtns=(size:'sm'|'lg')=>(
    <div className={`flex gap-2 ${size==='lg'?'':'w-full'}`}>
      <button onClick={handleDownload} disabled={!!busy}
        className={`flex-1 rounded-xl font-bold flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white transition-all shadow-md ${size==='lg'?'py-3.5 text-sm':'py-3 text-xs'}`}>
        {busy==='dl'?<Loader2 size={size==='lg'?16:14} className="animate-spin"/>:<Download size={size==='lg'?16:14}/>}
        Descargar
      </button>
      <button onClick={handleShare} disabled={!!busy}
        className={`flex-1 rounded-xl font-bold flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1fb957] disabled:opacity-60 text-white transition-all shadow-md ${size==='lg'?'py-3.5 text-sm':'py-3 text-xs'}`}>
        {busy==='share'?<Loader2 size={size==='lg'?16:14} className="animate-spin"/>:<Share2 size={size==='lg'?16:14}/>}
        Compartir
      </button>
    </div>
  );

  /* ══════════════════════════════════════════════════════════
     TABS DEL EDITOR
  ══════════════════════════════════════════════════════════ */
  const TABS: { id: EdTab; label: string; icon: React.ReactNode }[] = [
    { id:'hours',  label:'Horas',   icon:<Clock size={13}/> },
    { id:'style',  label:'Estilo',  icon:<Palette size={13}/> },
    { id:'texts',  label:'Textos',  icon:<Type size={13}/> },
    { id:'layout', label:'Diseño',  icon:<LayoutTemplate size={13}/> },
  ];

  const EditorContent = (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="grid grid-cols-4 gap-1 bg-secondary p-1 rounded-2xl">
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`py-2.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-all ${
              tab===t.id?'bg-card text-emerald-600 shadow-sm':'text-muted-foreground hover:text-foreground'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Horas ── */}
      {tab==='hours'&&(
        <div className="space-y-4">
          {NoticeBanner}

          {/* Día */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5"><CalendarDays size={13}/>¿Para cuándo?</p>
            <div className="grid grid-cols-2 gap-2">
              {([false,true] as const).map(v=>(
                <button key={String(v)} onClick={()=>setForTomorrow(v)}
                  className={`py-3 rounded-xl text-sm font-bold border transition-all ${
                    forTomorrow===v?'bg-emerald-600 text-white border-emerald-600':'bg-secondary text-foreground border-border hover:bg-muted'}`}>
                  {v?'📅 Mañana':'⚡ Hoy'}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground font-medium">{dateStr}</p>
          </div>

          {/* Cancha */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5"><span>⚽</span>¿De qué cancha?</p>
            {pitches.length>0 ? (
              <div className="flex flex-col gap-1.5">
                <button onClick={()=>setSelPitch('all')}
                  className={`w-full py-2.5 px-3 rounded-xl text-sm font-bold border text-left transition-all flex items-center gap-2 ${
                    selPitch==='all'?'bg-emerald-600 text-white border-emerald-600':'bg-secondary text-foreground border-border hover:bg-muted'}`}>
                  <span className="text-base">🏟️</span> Todas las canchas
                  {selPitch==='all'&&<CheckCircle2 size={14} className="ml-auto"/>}
                </button>
                {pitches.map(p=>(
                  <button key={p.id} onClick={()=>setSelPitch(p.id)}
                    className={`w-full py-2.5 px-3 rounded-xl text-sm font-bold border text-left transition-all flex items-center gap-2 ${
                      selPitch===p.id?'bg-emerald-600 text-white border-emerald-600':'bg-secondary text-foreground border-border hover:bg-muted'}`}>
                    <span className="text-base">⚽</span> {p.name}
                    {selPitch===p.id&&<CheckCircle2 size={14} className="ml-auto"/>}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-2">Cargando canchas del complejo...</p>
            )}
          </div>

          {/* Botón recargar */}
          <button onClick={handleAutoLoad} disabled={loadingH||!company?.id}
            className="w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white transition-all shadow-md">
            {loadingH?<Loader2 size={16} className="animate-spin"/>:<Sparkles size={16}/>}
            {loadingH?'Calculando horas libres...':'Recargar horas disponibles'}
          </button>

          {/* Grid de horas */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5"><Clock size={13}/>Horas ({hours.length}/{MAX_H})</p>
              {hours.length>0&&(
                <button onClick={()=>setHours([])} className="text-xs font-bold text-red-500 flex items-center gap-1">
                  <XCircle size={11}/> Limpiar
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {ALL_HOURS.map(h=>{
                const sel=hours.includes(h);
                const free=freeSet.has(h);
                const booked=bookedSet.has(h);
                return(
                  <button key={h} onClick={()=>!booked&&toggleHour(h)} disabled={booked&&!sel}
                    className={`relative py-3 rounded-xl text-xs font-bold border transition-all ${
                      sel?'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      :booked?'bg-red-50 dark:bg-red-950/20 text-red-400 dark:text-red-600 border-red-200 dark:border-red-900 opacity-60 cursor-not-allowed line-through'
                      :free?'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
                      :'bg-secondary text-foreground border-border hover:bg-muted'}`}>
                    {sel&&<CheckCircle2 size={9} className="inline mr-1"/>}{h}
                    {booked&&<span className="absolute top-1 right-1.5 text-[8px] font-black">✗</span>}
                    {free&&!sel&&!booked&&<span className="absolute top-1 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500"/>}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3 text-[10px] text-muted-foreground flex-wrap">
              <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1"/>Libre</span>
              <span><span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400 mr-1"/>Reservada</span>
            </div>
            {/* Hora manual */}
            <div className="flex gap-2">
              <input type="time" value={customTime} onChange={e=>setCustomTime(e.target.value)} className={`${inp} flex-1`}/>
              <button onClick={addCustomTime} disabled={!customTime||hours.length>=MAX_H}
                className="shrink-0 py-3 px-4 rounded-xl text-xs font-bold border border-border bg-secondary hover:bg-muted disabled:opacity-50 flex items-center gap-1">
                <Plus size={12}/> Agregar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Estilo ── */}
      {tab==='style'&&(
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
            <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5"><Palette size={13}/>Paleta de colores</p>
            <div className="grid grid-cols-5 gap-2">
              {PRESETS.map(p=>{
                const active=cfg.pal.bg1===p.p.bg1&&cfg.pal.accent===p.p.accent;
                return(
                  <button key={p.id} onClick={()=>setCfg(pr=>({...pr,pal:p.p}))} title={p.label}
                    className={`relative h-12 rounded-xl border-2 transition-all overflow-hidden ${
                      active?'border-emerald-500 scale-[.93] shadow-lg':'border-transparent opacity-75 hover:opacity-100'}`}
                    style={{background:`linear-gradient(${p.p.angle}deg,${p.p.bg1},${p.p.bg2})`}}>
                    <span className="absolute bottom-1 right-1 h-3 w-3 rounded-full ring-2 ring-white/30" style={{background:p.p.accent}}/>
                  </button>
                );
              })}
            </div>
            <button onClick={surprise}
              className="w-full py-2.5 rounded-xl text-xs font-bold border border-border bg-secondary hover:bg-muted flex items-center justify-center gap-1.5">
              <Shuffle size={12} className="text-violet-500"/> Sorpréndeme
            </button>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-muted-foreground">Color acento rápido</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_ACCENT.map(c=>(
                <button key={c} onClick={()=>setPal({accent:c})} aria-label={c}
                  className={`h-9 w-9 rounded-full border-2 transition-all ${cfg.pal.accent.toLowerCase()===c?'border-emerald-500 scale-110 shadow-md':'border-border'}`}
                  style={{background:c}}/>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-muted-foreground">Textura de fondo</p>
            <Chip value={cfg.pattern} onChange={v=>set('pattern',v)} opts={[
              {v:'pitch',label:'⚽ Cancha'},{v:'dots',label:'Puntos'},
              {v:'diagonal',label:'Líneas'},{v:'none',label:'Liso'},
            ]}/>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-muted-foreground">Tarjetas de horas</p>
            <Chip value={cfg.cardStyle} onChange={v=>set('cardStyle',v)} opts={[
              {v:'round',label:'Redondas'},{v:'pill',label:'Cápsulas'},{v:'solid',label:'Rellenas'},
            ]}/>
          </div>
        </div>
      )}

      {/* ── Tab: Textos ── */}
      {tab==='texts'&&(
        <div className="space-y-3 bg-card border border-border rounded-2xl p-4">
          {[
            {label:'Nombre del complejo',key:'name' as const,ph:company?.name||'Mi Complejo',max:40},
            {label:'Dirección / barrio',key:'address' as const,ph:company?.address||'Pasto, Nariño',max:50},
            {label:'Título principal',key:'title' as const,ph:'⚡ Canchas Disponibles',max:32},
            {label:'Etiqueta (opcional)',key:'tag' as const,ph:'¡Últimos cupos!',max:28},
            {label:'Botón',key:'cta' as const,ph:'Reserva ahora',max:24},
            {label:'WhatsApp',key:'phone' as const,ph:'3001234567',max:20},
            {label:'Sitio web',key:'website' as const,ph:'cancheros.site',max:30},
          ].map(f=>(
            <div key={f.key}>
              <label className="text-xs font-bold text-muted-foreground block mb-1">{f.label}</label>
              <input className={inp} value={cfg[f.key]} maxLength={f.max}
                onChange={e=>set(f.key,e.target.value)} placeholder={f.ph}/>
            </div>
          ))}
          <div>
            <label className="text-xs font-bold text-muted-foreground block mb-1">Mensaje adicional</label>
            <textarea value={cfg.message} maxLength={80} rows={2}
              onChange={e=>set('message',e.target.value)}
              placeholder="¡Reserva ya y asegura tu cancha!"
              className={`${inp} resize-none`}/>
            <p className="text-[10px] text-muted-foreground text-right mt-0.5">{cfg.message.length}/80</p>
          </div>
          <p className="text-xs font-bold text-muted-foreground pt-1">Alineación</p>
          <Chip value={cfg.align} onChange={v=>set('align',v)} opts={[
            {v:'left',label:<><AlignLeft size={13}/>Izquierda</>},
            {v:'center',label:<><AlignCenter size={13}/>Centro</>},
            {v:'right',label:<><AlignRight size={13}/>Derecha</>},
          ]}/>
        </div>
      )}

      {/* ── Tab: Diseño ── */}
      {tab==='layout'&&(
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-muted-foreground">Formato</p>
            <Chip value={cfg.format} onChange={v=>set('format',v)} opts={[
              {v:'story',label:'Estado 9:16'},{v:'post',label:'Post 4:5'},{v:'square',label:'1:1'},
            ]}/>
            <p className="text-[10px] text-muted-foreground">{dims.w}×{dims.h} px</p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-muted-foreground">Logo</p>
            <Chip value={cfg.logoStyle} onChange={v=>set('logoStyle',v)} opts={[
              {v:'badge',label:'Medallón'},{v:'tint',label:'Con acento'},{v:'original',label:'Original'},
            ]}/>
            <Slider label="Tamaño del logo" value={cfg.logoSize} min={80} max={280} onChange={v=>set('logoSize',v)} unit="px"/>
            <Slider label="Tamaño del nombre" value={cfg.nameSize} min={36} max={110} onChange={v=>set('nameSize',v)} unit="px"/>
            <Slider label="Márgenes" value={cfg.padding} min={30} max={120} onChange={v=>set('padding',v)} unit="px"/>
            <label className="cursor-pointer w-full py-3 rounded-xl text-xs font-bold border border-dashed border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-1.5">
              <Upload size={13}/> Subir mi logo
              <input type="file" accept="image/*" className="hidden"
                onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>setCustomLogo(String(r.result));r.readAsDataURL(f);}}/>
            </label>
            {customLogo&&<button onClick={()=>setCustomLogo(null)} className="w-full py-2 text-xs font-bold text-muted-foreground hover:text-foreground border border-border rounded-xl">Usar logo de Cancheros</button>}
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <p className="text-xs font-bold text-muted-foreground mb-2">Orden de bloques</p>
            {cfg.order.map((id,i)=>{
              const hidden=cfg.hidden.includes(id);
              return(
                <div key={id} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-secondary ${hidden?'opacity-40':''}`}>
                  <span className="flex-1 text-xs font-bold">{SEC_LABEL[id]}</span>
                  <button onClick={()=>moveSection(id,-1)} disabled={i===0} className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30"><ArrowUp size={13}/></button>
                  <button onClick={()=>moveSection(id,1)} disabled={i===cfg.order.length-1} className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30"><ArrowDown size={13}/></button>
                  <button onClick={()=>toggleSection(id)} className="p-1.5 rounded-lg hover:bg-muted">{hidden?<EyeOff size={13}/>:<Eye size={13}/>}</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  /* ══════════════════════════════════════════════════════════
     LAYOUT FINAL
  ══════════════════════════════════════════════════════════ */
  return (
    <>
      {HiddenPoster}

      {/* ── MOBILE: preview arriba (sticky) + editor abajo ── */}
      <div className="flex flex-col h-full lg:hidden">

        {/* Encabezado mini */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
          <h1 className="text-base font-bold flex items-center gap-2">
            <ImagePlay size={17} className="text-emerald-600"/> Crear publicación
          </h1>
          <button onClick={()=>{setCfg(DEFAULTS);setHours([]);setNotice(null);}}
            className="text-xs font-bold text-muted-foreground flex items-center gap-1">
            <RotateCcw size={11}/> Reset
          </button>
        </div>

        {/* Preview sticky — ocupa ~45% de la pantalla */}
        <div className="bg-zinc-950 flex flex-col items-center justify-center py-3 gap-2 shrink-0"
          style={{ minHeight: 'min(48vw, 260px)' }}>
          <div ref={pvRef} className="w-full px-4 flex justify-center">
            <div className="rounded-xl overflow-hidden shadow-2xl border-2 border-white/10"
              style={{ width: pvW, height: pvH }}>
              <div style={{ width:dims.w, height:dims.h, transform:`scale(${scale})`,
                transformOrigin:'top left', pointerEvents:'none' }}>
                <Poster cfg={cfg} hours={sortedH} dayLabel={dayLabel} dateStr={dateStr} logoSrc={logoSrc}/>
              </div>
            </div>
          </div>
          {/* Botones dentro del bloque oscuro */}
          <div className="flex gap-2 px-4 w-full max-w-sm">
            <button onClick={handleDownload} disabled={!!busy}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white shadow-md">
              {busy==='dl'?<Loader2 size={13} className="animate-spin"/>:<Download size={13}/>} Descargar
            </button>
            <button onClick={handleShare} disabled={!!busy}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#1fb957] disabled:opacity-60 text-white shadow-md">
              {busy==='share'?<Loader2 size={13} className="animate-spin"/>:<Share2 size={13}/>} Compartir
            </button>
          </div>
        </div>

        {/* Editor — scrolleable */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 bg-background pb-8">
          {EditorContent}
        </div>
      </div>

      {/* ── DESKTOP: columna izquierda editor + columna derecha preview ── */}
      <div className="hidden lg:grid lg:grid-cols-[1fr_360px] lg:gap-6 max-w-6xl mx-auto p-6 items-start">

        {/* Editor */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600">Marketing · WhatsApp</p>
              <h1 className="text-xl font-bold flex items-center gap-2 text-foreground mt-0.5">
                <ImagePlay className="text-emerald-600" size={20}/> Crear publicación
              </h1>
            </div>
            <button onClick={()=>{setCfg(DEFAULTS);setHours([]);setNotice(null);}}
              className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1">
              <RotateCcw size={12}/> Restablecer
            </button>
          </div>
          {EditorContent}
        </div>

        {/* Preview sticky lado derecho */}
        <div className="sticky top-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Vista previa</p>
          <div ref={pvRef} className="w-full">
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-border w-full"
              style={{ aspectRatio: FMT[cfg.format].ar }}>
              <div style={{ width:dims.w, height:dims.h, transform:`scale(${pvW/dims.w})`,
                transformOrigin:'top left', pointerEvents:'none' }}>
                <Poster cfg={cfg} hours={sortedH} dayLabel={dayLabel} dateStr={dateStr} logoSrc={logoSrc}/>
              </div>
            </div>
          </div>
          {NoticeBanner}
          {ActionBtns('lg')}
          <p className="text-[10px] text-center text-muted-foreground">{dims.w}×{dims.h} px · Alta resolución</p>
        </div>
      </div>
    </>
  );
}