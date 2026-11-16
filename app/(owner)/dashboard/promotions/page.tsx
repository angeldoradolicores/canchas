'use client';
import { useEffect, useMemo, useState } from 'react';
import { Gift, ImagePlus, Loader2, Trash2, CalendarRange, CalendarDays, Sparkles } from 'lucide-react';
import { dayNames, PromotionCard, type Promotion } from '@/components/booking/ComplexPromotions';

type Period = 'week' | 'month' | 'campaign';

const TEMPLATES: { key: string; label: string; hint: string; icon: any; values: { title: string; period: Period; required: number; hours: number; weekdays: number[]; untilPeriodEnd: boolean; days: number } }[] = [
  {
    key: 'week', label: 'Semanal', hint: '2 reservas en la semana → 1 hora gratis sábado o domingo', icon: CalendarDays,
    values: { title: 'Fin de semana gratis', period: 'week', required: 2, hours: 1, weekdays: [6, 0], untilPeriodEnd: true, days: 7 },
  },
  {
    key: 'month', label: 'Mensual', hint: '20 reservas en el mes → 1 hora gratis', icon: CalendarRange,
    values: { title: 'Cliente fiel del mes', period: 'month', required: 20, hours: 1, weekdays: [0, 1, 2, 3, 4, 5, 6], untilPeriodEnd: false, days: 30 },
  },
  {
    key: 'custom', label: 'Personalizada', hint: 'Por cada X reservas durante la campaña', icon: Sparkles,
    values: { title: 'Premio por tus reservas', period: 'campaign', required: 10, hours: 1, weekdays: [0, 1, 2, 3, 4, 5, 6], untilPeriodEnd: false, days: 30 },
  },
];

const ORDERED_DAYS = [1, 2, 3, 4, 5, 6, 0]; // lunes primero
const inputCls = 'block w-full rounded-xl border border-border p-3 bg-background text-sm outline-none focus:border-primary mt-1';
const onlyDigits = (v: string, max = 4) => v.replace(/\D/g, '').slice(0, max);

function defaultEndDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

export default function PromotionsPage() {
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<Promotion[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [template, setTemplate] = useState('week');
  const [companyId, setCompanyId] = useState('');
  const [title, setTitle] = useState(TEMPLATES[0].values.title);
  const [period, setPeriod] = useState<Period>('week');
  const [required, setRequired] = useState('2');
  const [hours, setHours] = useState('1');
  const [weekdays, setWeekdays] = useState<number[]>([6, 0]);
  const [untilPeriodEnd, setUntilPeriodEnd] = useState(true);
  const [days, setDays] = useState('7');
  const [endsAt, setEndsAt] = useState(defaultEndDate());
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  async function refresh() {
    const r = await fetch('/api/promotions');
    const j = await r.json();
    if (!r.ok) { setMessage(j.error); return; }
    setCompanies(j.companies || []);
    setCompanyId(prev => prev || j.companies?.[0]?.id || '');
    setItems(j.promotions || []);
  }
  useEffect(() => { void refresh().catch(() => setMessage('Error de conexión')); }, []);

  function applyTemplate(key: string) {
    const t = TEMPLATES.find(x => x.key === key)!;
    setTemplate(key);
    setTitle(t.values.title); setPeriod(t.values.period); setRequired(String(t.values.required));
    setHours(String(t.values.hours)); setWeekdays(t.values.weekdays);
    setUntilPeriodEnd(t.values.untilPeriodEnd); setDays(String(t.values.days));
  }

  async function uploadImage(file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setMessage('Solo imágenes JPG, PNG o WebP'); return; }
    if (file.size > 5 * 1024 * 1024) { setMessage('La imagen debe pesar máximo 5 MB'); return; }
    setUploading(true); setMessage('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'promotion');
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok || !j.url) throw new Error(j.error || 'No se pudo subir la imagen');
      setImageUrl(j.url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo subir la imagen');
    } finally { setUploading(false); }
  }

  async function send(body: unknown) {
    setBusy(true); setMessage('');
    try {
      const r = await fetch('/api/promotions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      setMessage(r.ok ? 'Cambios guardados' : j.error);
      if (r.ok) await refresh();
      return r.ok;
    } catch { setMessage('Error de conexión'); return false; } finally { setBusy(false); }
  }

  const redeemDays = period === 'campaign' || !untilPeriodEnd ? Math.max(1, Number(days) || 1) : null;
  const preview: Promotion = useMemo(() => ({
    id: 'preview', title: title || 'Tu promoción', period, required_bookings: Math.max(1, Number(required) || 1),
    gift_hours: Math.max(1, Number(hours) || 1), redeem_days: redeemDays, weekdays: weekdays.length ? weekdays : [0],
    ends_at: new Date(endsAt + 'T23:59:59-05:00').toISOString(), image_url: imageUrl,
  }), [title, period, required, hours, redeemDays, weekdays, endsAt, imageUrl]);

  const ownPromos = items.filter(p => companies.some(c => c.id === p.company_id));
  const periodWord = period === 'week' ? 'semana' : 'mes';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!weekdays.length) { setMessage('Elige al menos un día para usar el regalo'); return; }
    const ok = await send({
      company_id: companyId, title: title.trim(), period,
      required_bookings: Number(required), gift_hours: Number(hours), redeem_days: redeemDays,
      weekdays, ends_at: new Date(endsAt + 'T23:59:59-05:00').toISOString(), image_url: imageUrl,
    });
    if (ok) setImageUrl(null);
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 sm:p-8 space-y-6 w-full min-w-0">
      <header>
        <h1 className="text-2xl font-black flex items-center gap-2"><Gift className="text-emerald-600" /> Promociones del complejo</h1>
        <p className="text-sm text-muted-foreground mt-1">Premia a tus jugadores con horas gratis. Los jugadores la ven en el detalle de tus canchas y al momento de pagar.</p>
      </header>

      {ownPromos.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold">Promoción activa</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {ownPromos.map(p => (
              <div key={p.id} className="space-y-2">
                <PromotionCard p={p} />
                <button disabled={busy} onClick={() => { if (confirm('¿Finalizar esta promoción? Los regalos ya ganados se conservan.')) void send({ action: 'stop', id: p.id }); }}
                  className="text-sm font-semibold text-red-600 underline cursor-pointer">Finalizar promoción</button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Solo puede haber una promoción activa por complejo. Finalízala para publicar otra.</p>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] items-start">
        <form onSubmit={submit} className="rounded-3xl border border-border bg-card p-4 sm:p-6 space-y-5 min-w-0">
          <fieldset>
            <legend className="font-bold mb-2 text-sm">1. Elige un tipo</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {TEMPLATES.map(t => (
                <button type="button" key={t.key} onClick={() => applyTemplate(t.key)}
                  className={`text-left rounded-2xl border p-3 transition-colors cursor-pointer ${template === t.key ? 'border-emerald-600 bg-emerald-500/10' : 'border-border hover:border-emerald-500/50'}`}>
                  <t.icon size={18} className="text-emerald-600 mb-1" />
                  <span className="block font-bold text-sm">{t.label}</span>
                  <span className="block text-[11px] text-muted-foreground leading-snug">{t.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            {companies.length > 1 && (
              <label className="text-sm sm:col-span-2">Complejo
                <select required value={companyId} onChange={e => setCompanyId(e.target.value)} className={inputCls}>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            <label className="text-sm sm:col-span-2">Nombre de la promoción
              <input required minLength={3} maxLength={120} value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
            </label>
            <label className="text-sm">Cómo se cuentan las reservas
              <select value={period} onChange={e => { const v = e.target.value as Period; setPeriod(v); if (v === 'campaign') setUntilPeriodEnd(false); }} className={inputCls}>
                <option value="week">Cada semana (lunes a domingo)</option>
                <option value="month">Cada mes</option>
                <option value="campaign">Durante toda la promoción</option>
              </select>
            </label>
            <label className="text-sm">Reservas aprobadas necesarias
              <input required inputMode="numeric" value={required} onChange={e => setRequired(onlyDigits(e.target.value))} className={inputCls} />
            </label>
            <label className="text-sm">Horas gratis que regalas
              <input required inputMode="numeric" value={hours} onChange={e => setHours(onlyDigits(e.target.value, 2))} className={inputCls} />
            </label>
            <label className="text-sm">Promoción vigente hasta
              <input type="date" required value={endsAt} min={new Date().toISOString().slice(0, 10)} onChange={e => setEndsAt(e.target.value)} className={inputCls} />
            </label>
          </div>

          <fieldset>
            <legend className="font-bold mb-2 text-sm">2. Días en que se puede usar el regalo</legend>
            <div className="flex flex-wrap gap-2">
              {ORDERED_DAYS.map(d => {
                const on = weekdays.includes(d);
                return (
                  <button type="button" key={d} aria-pressed={on}
                    onClick={() => setWeekdays(w => on ? w.filter(x => x !== d) : [...w, d])}
                    className={`px-3 py-2 rounded-xl border text-sm font-semibold cursor-pointer ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-border bg-background'}`}>
                    {dayNames[d].slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="font-bold mb-2 text-sm">3. Hasta cuándo puede usarlo</legend>
            {period !== 'campaign' && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={untilPeriodEnd} onChange={() => setUntilPeriodEnd(true)} />
                Hasta el final de esa misma {periodWord}
              </label>
            )}
            <label className="flex flex-wrap items-center gap-2 text-sm cursor-pointer">
              <input type="radio" checked={period === 'campaign' || !untilPeriodEnd} onChange={() => setUntilPeriodEnd(false)} />
              Durante
              <input inputMode="numeric" value={days} onChange={e => { setDays(onlyDigits(e.target.value, 3)); setUntilPeriodEnd(false); }}
                className="w-20 rounded-xl border border-border p-2 bg-background text-sm" />
              días después de ganarlo
            </label>
          </fieldset>

          <fieldset>
            <legend className="font-bold mb-2 text-sm">4. Imagen (opcional)</legend>
            {imageUrl ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="Imagen de la promoción" className="w-28 h-20 object-cover rounded-xl border" />
                <button type="button" onClick={() => setImageUrl(null)} className="text-sm text-red-600 flex items-center gap-1 cursor-pointer"><Trash2 size={14} /> Quitar</button>
              </div>
            ) : (
              <label className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-4 cursor-pointer hover:border-emerald-500/60">
                {uploading ? <Loader2 className="animate-spin" size={20} /> : <ImagePlus size={20} className="text-emerald-600" />}
                <span className="text-sm">{uploading ? 'Subiendo…' : 'Subir imagen JPG, PNG o WebP (máx. 5 MB)'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) void uploadImage(f); e.target.value = ''; }} />
              </label>
            )}
          </fieldset>

          <p className="text-xs text-muted-foreground">
            Cuentan las reservas pagadas y aprobadas desde hoy en cualquiera de tus canchas, también las manuales y los turnos fijos con nombre y celular del cliente.
            Nunca se relacionan personas por nombre. Una vez publicada, las condiciones no se pueden editar; puedes finalizarla y los regalos ya ganados se conservan.
          </p>
          <button disabled={busy || uploading || !companyId || ownPromos.some(p => p.company_id === companyId)} className="btn-primary w-full">
            {busy ? 'Publicando…' : 'Publicar promoción'}
          </button>
          <p role="status" className="text-sm">{message}</p>
        </form>

        <aside className="space-y-2 lg:sticky lg:top-6">
          <p className="text-sm font-bold">Así la verán tus jugadores</p>
          <PromotionCard p={preview} />
        </aside>
      </div>
    </main>
  );
}
