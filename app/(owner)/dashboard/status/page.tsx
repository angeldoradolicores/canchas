'use client';

import { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';

// ── Themes ────────────────────────────────────────────────────────────────────
const THEMES = [
  {
    id: 'emerald',
    label: 'Esmeralda',
    bg: 'linear-gradient(135deg, #064e3b 0%, #065f46 40%, #047857 100%)',
    accent: '#34d399',
    accentDark: '#10b981',
    text: '#ffffff',
    sub: '#a7f3d0',
    cardBg: 'rgba(255,255,255,0.08)',
    cardBorder: 'rgba(52,211,153,0.3)',
  },
  {
    id: 'night',
    label: 'Noche',
    bg: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
    accent: '#818cf8',
    accentDark: '#6366f1',
    text: '#ffffff',
    sub: '#c7d2fe',
    cardBg: 'rgba(255,255,255,0.07)',
    cardBorder: 'rgba(129,140,248,0.3)',
  },
  {
    id: 'sunset',
    label: 'Atardecer',
    bg: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 40%, #b45309 100%)',
    accent: '#fbbf24',
    accentDark: '#f59e0b',
    text: '#ffffff',
    sub: '#fde68a',
    cardBg: 'rgba(255,255,255,0.08)',
    cardBorder: 'rgba(251,191,36,0.3)',
  },
  {
    id: 'ocean',
    label: 'Oceáno',
    bg: 'linear-gradient(135deg, #0c4a6e 0%, #075985 40%, #0369a1 100%)',
    accent: '#38bdf8',
    accentDark: '#0ea5e9',
    text: '#ffffff',
    sub: '#bae6fd',
    cardBg: 'rgba(255,255,255,0.08)',
    cardBorder: 'rgba(56,189,248,0.3)',
  },
] as const;

type ThemeId = (typeof THEMES)[number]['id'];

const HOUR_OPTIONS = [
  '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
  '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
  '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM',
];

export default function CreateStatusPage() {
  const { user, profile, session } = useAuth();

  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [selectedHours, setSelectedHours] = useState<string[]>([]);
  const [forTomorrow, setForTomorrow] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [themeId, setThemeId] = useState<ThemeId>('emerald');

  const posterRef = useRef<HTMLDivElement>(null);

  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];

  // ── Cargar empresa ──────────────────────────────────────────────────────────
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
              company_name: profile?.full_name
                ? `Complejo ${profile.full_name}`
                : 'Mi Complejo Deportivo',
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

  // ── Auto-cargar horas disponibles ───────────────────────────────────────────
  const handleAutoLoad = async () => {
    if (!company?.id) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/generate-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: company.id, forTomorrow }),
      });
      const data = await res.json();
      if (data.success && data.data.availableHours.length > 0) {
        setSelectedHours(data.data.availableHours.slice(0, 8));
      }
    } finally {
      setGenerating(false);
    }
  };

  const toggleHour = (h: string) => {
    setSelectedHours((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h].slice(0, 9)
    );
  };

  // ── Descargar como imagen ───────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!posterRef.current) return;
    setUploading(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(posterRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        style: { borderRadius: '0px' },
      });
      const link = document.createElement('a');
      link.download = `estado-${company?.name || 'cancha'}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      await uploadToR2(dataUrl);
    } catch (err) {
      console.error('Error generando imagen:', err);
    } finally {
      setUploading(false);
    }
  };

  const uploadToR2 = async (dataUrl: string) => {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `estado-${Date.now()}.png`, { type: 'image/png' });
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'status-posts');
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      const uploadJson = await uploadRes.json();
      if (uploadJson.url) setUploadedUrl(uploadJson.url);
    } catch (e) {
      console.error('Error subiendo a R2:', e);
    }
  };

  const handleCopyLink = async () => {
    if (!uploadedUrl) return;
    await navigator.clipboard.writeText(uploadedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const dayLabel = forTomorrow ? 'Mañana' : 'Hoy';
  const todayStr = (() => {
    const d = forTomorrow ? new Date(Date.now() + 86400000) : new Date();
    return d.toLocaleDateString('es-CO', {
      weekday: 'long', day: 'numeric', month: 'long',
      timeZone: 'America/Bogota',
    });
  })();

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <Loader2 size={32} className="animate-spin text-emerald-600" />
        <span className="text-xs font-semibold text-zinc-500">Cargando tu complejo...</span>
      </div>
    );
  }

  // Preview scale factor
  const POSTER_W = 1080;
  const POSTER_H = 1920;
  const PREVIEW_MAX_W = 320;
  const scale = PREVIEW_MAX_W / POSTER_W;
  const previewH = POSTER_H * scale;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16 p-4">
      {/* Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600">
          MARKETING · ESTADOS DE WHATSAPP
        </span>
        <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground mt-1">
          <ImagePlay className="text-emerald-600" size={24} /> Crear Publicación
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Genera un póster profesional con tus horas disponibles para compartir en tu estado de WhatsApp.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ── Panel de configuración ── */}
        <div className="space-y-5">
          {/* Día */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <CalendarDays size={14} /> ¿Para cuándo?
            </h3>
            <div className="flex gap-2">
              {([false, true] as const).map((val) => (
                <button
                  key={String(val)}
                  onClick={() => setForTomorrow(val)}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                    forTomorrow === val
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                      : 'bg-secondary text-foreground border-border hover:bg-muted'
                  }`}
                >
                  {val ? '📅 Mañana' : '⚡ Hoy'}
                </button>
              ))}
            </div>
          </div>

          {/* Horas disponibles */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Clock size={14} /> Horas Disponibles
              </h3>
              <button
                onClick={handleAutoLoad}
                disabled={generating}
                className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 transition-colors"
              >
                {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                Cargar automático
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {HOUR_OPTIONS.map((h) => {
                const selected = selectedHours.includes(h);
                return (
                  <button
                    key={h}
                    onClick={() => toggleHour(h)}
                    className={`py-2 px-1 rounded-xl text-[11px] font-bold border transition-all ${
                      selected
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm scale-[0.97]'
                        : 'bg-secondary text-foreground border-border hover:bg-muted'
                    }`}
                  >
                    {selected && <CheckCircle2 size={10} className="inline mr-1" />}
                    {h}
                  </button>
                );
              })}
            </div>

            {selectedHours.length > 0 && (
              <button
                onClick={() => setSelectedHours([])}
                className="text-[11px] font-bold text-red-500 hover:text-red-600 flex items-center gap-1"
              >
                <XCircle size={12} /> Limpiar selección
              </button>
            )}
          </div>

          {/* Mensaje personalizado */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Mensaje adicional (opcional)
            </h3>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Ej: ¡Reserva ya y asegura tu cancha!"
              maxLength={80}
              rows={2}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-xs font-medium outline-none focus:border-emerald-600 resize-none transition-colors"
            />
            <p className="text-[10px] text-muted-foreground text-right">{customMessage.length}/80</p>
          </div>

          {/* Tema */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Palette size={14} /> Tema de color
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setThemeId(t.id)}
                  title={t.label}
                  className={`h-10 rounded-xl border-2 transition-all ${
                    themeId === t.id ? 'border-emerald-500 scale-[0.92] shadow-md' : 'border-transparent opacity-70'
                  }`}
                  style={{ background: t.bg }}
                />
              ))}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {THEMES.map((t) => (
                <span
                  key={t.id}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full cursor-pointer transition-all ${
                    themeId === t.id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-secondary text-muted-foreground'
                  }`}
                  onClick={() => setThemeId(t.id)}
                >
                  {t.label}
                </span>
              ))}
            </div>
          </div>

          {/* Botones de acción */}
          <button
            onClick={handleDownload}
            disabled={uploading || selectedHours.length === 0}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {uploading ? 'Generando imagen...' : 'Descargar póster'}
          </button>

          {selectedHours.length === 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium text-center">
              Selecciona al menos una hora disponible para generar el póster.
            </p>
          )}

          {uploadedUrl && (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 size={14} /> ¡Imagen guardada en la nube!
              </p>
              <button
                onClick={handleCopyLink}
                className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 underline flex items-center gap-1"
              >
                <Share2 size={11} /> {copied ? '✅ Enlace copiado' : 'Copiar enlace de la imagen'}
              </button>
            </div>
          )}
        </div>

        {/* ── Previsualización del Póster ── */}
        <div className="sticky top-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
            Vista previa (1080×1920 px)
          </p>

          <div className="flex justify-center">
            {/* Wrapper que muestra el poster escalado */}
            <div
              style={{ width: `${PREVIEW_MAX_W}px`, height: `${previewH}px` }}
              className="relative overflow-hidden rounded-2xl shadow-2xl border border-border"
            >
              <div
                ref={posterRef}
                style={{
                  width: `${POSTER_W}px`,
                  height: `${POSTER_H}px`,
                  background: theme.bg,
                  fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
                  color: theme.text,
                  padding: '80px 70px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  transformOrigin: 'top left',
                  transform: `scale(${scale})`,
                }}
              >
                {/* Glows de fondo */}
                <div style={{
                  position: 'absolute', top: '-150px', right: '-150px',
                  width: '600px', height: '600px', borderRadius: '50%',
                  background: `radial-gradient(circle, ${theme.accent}1a 0%, transparent 70%)`,
                  pointerEvents: 'none',
                }} />
                <div style={{
                  position: 'absolute', bottom: '150px', left: '-100px',
                  width: '450px', height: '450px', borderRadius: '50%',
                  background: `radial-gradient(circle, ${theme.accentDark}14 0%, transparent 70%)`,
                  pointerEvents: 'none',
                }} />

                {/* Header */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: '60px',
                }}>
                  <div>
                    <div style={{
                      fontSize: '30px', fontWeight: '900', letterSpacing: '-0.5px',
                      color: theme.sub, textTransform: 'uppercase', marginBottom: '6px',
                    }}>
                      🏟️ {company?.name || 'Mi Complejo'}
                    </div>
                    <div style={{ fontSize: '20px', color: theme.sub, opacity: 0.65, fontWeight: '500' }}>
                      {company?.address || 'Pasto, Nariño'}
                    </div>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/cancheros.png"
                    alt="Cancheros"
                    style={{ width: '120px', height: '120px', objectFit: 'contain', opacity: 0.9 }}
                    crossOrigin="anonymous"
                  />
                </div>

                {/* Accent bar */}
                <div style={{
                  width: '130px', height: '6px', borderRadius: '999px',
                  background: theme.accent, marginBottom: '70px',
                }} />

                {/* Título */}
                <div style={{ marginBottom: '55px' }}>
                  <div style={{ fontSize: '56px', fontWeight: '900', lineHeight: 1.05, marginBottom: '14px' }}>
                    ⚡ Canchas Disponibles
                  </div>
                  <div style={{ fontSize: '38px', fontWeight: '700', color: theme.accent, textTransform: 'capitalize' }}>
                    {dayLabel} · {todayStr}
                  </div>
                </div>

                {/* Grid de horas */}
                {selectedHours.length > 0 ? (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: selectedHours.length > 4 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
                    gap: '24px',
                    marginBottom: '60px',
                    flex: 1,
                    alignContent: 'start',
                  }}>
                    {selectedHours.map((h) => (
                      <div
                        key={h}
                        style={{
                          background: theme.cardBg,
                          border: `2px solid ${theme.cardBorder}`,
                          borderRadius: '28px',
                          padding: '32px 20px',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: '20px', marginBottom: '10px', opacity: 0.65 }}>🕐</div>
                        <div style={{ fontSize: '34px', fontWeight: '800', color: theme.accent }}>
                          {h}
                        </div>
                        <div style={{
                          fontSize: '19px', color: theme.sub, opacity: 0.65,
                          fontWeight: '500', marginTop: '6px',
                        }}>
                          Disponible
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column', gap: '20px', opacity: 0.3,
                  }}>
                    <div style={{ fontSize: '90px' }}>⏰</div>
                    <div style={{ fontSize: '34px', fontWeight: '600' }}>Selecciona las horas disponibles</div>
                  </div>
                )}

                {/* Mensaje personalizado */}
                {customMessage && (
                  <div style={{
                    background: theme.cardBg,
                    border: `2px solid ${theme.cardBorder}`,
                    borderRadius: '28px',
                    padding: '38px 44px',
                    marginBottom: '55px',
                    textAlign: 'center',
                    fontSize: '36px',
                    fontWeight: '700',
                    fontStyle: 'italic',
                    color: theme.sub,
                  }}>
                    "{customMessage}"
                  </div>
                )}

                {/* Footer */}
                <div style={{
                  borderTop: `1px solid ${theme.cardBorder}`,
                  paddingTop: '54px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{
                      fontSize: '30px', fontWeight: '800', color: theme.accent, marginBottom: '8px',
                    }}>
                      📲 Reserva Ahora
                    </div>
                    <div style={{ fontSize: '22px', color: theme.sub, opacity: 0.65 }}>
                      Disponibilidad limitada
                    </div>
                  </div>
                  <div style={{
                    background: theme.accent,
                    color: '#000',
                    fontWeight: '900',
                    fontSize: '24px',
                    borderRadius: '50px',
                    padding: '20px 40px',
                  }}>
                    cancheros.site
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-center text-muted-foreground">
            Alta resolución (1080×1920 px) — ideal para estados de WhatsApp
          </p>
        </div>
      </div>
    </div>
  );
}
