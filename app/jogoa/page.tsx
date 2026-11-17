'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Ban, Building2, Check, Loader2, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';
import { AdminMfa } from '@/components/auth/AdminMfa';

type Alert = {
  id: string; code: string; label: string; company_id: string | null; company_name: string; pitch_name: string;
  phone: string | null; customer_name: string | null; user_id: string | null; ip_hash: string | null;
  attempts: number; created_at: string; last_seen_at: string;
};
type Blocked = { company_id: string; company_name: string; phone: string; reason: string | null; created_at: string };

const fmtDate = (iso: string) => new Date(iso).toLocaleString('es-CO', {
  day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota',
});

export default function SuperAdminPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [forbidden, setForbidden] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ company_id: '', phone: '', reason: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/security', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.mfaRequired) setMfaRequired(true);
        else setForbidden(json.error || 'No autorizado');
        return;
      }
      setMfaRequired(false);
      setAlerts(json.alerts || []); setBlocked(json.blocked || []); setCompanies(json.companies || []);
    } catch { setMessage('Sin conexión'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function call(method: string, body: object, key: string, ok: string) {
    setBusy(key); setMessage('');
    try {
      const res = await fetch('/api/admin/security', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(json.error || 'No se pudo completar'); return false; }
      setMessage(json.released ? `${ok} · ${json.released} reserva(s) pendiente(s) liberada(s)` : ok);
      await load();
      return true;
    } catch { setMessage('Sin conexión'); return false; } finally { setBusy(''); }
  }

  const blockFromAlert = (a: Alert) => a.company_id && a.phone &&
    call('POST', { action: 'block', company_id: a.company_id, phone: a.phone, alert_id: a.id, reason: a.label }, a.id, `Celular ${a.phone} bloqueado`);

  if (forbidden) {
    return <main className="max-w-3xl mx-auto px-4 py-10 text-center text-sm text-muted-foreground">{forbidden}</main>;
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 sm:p-8 space-y-6 w-full min-w-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2"><ShieldCheck className="text-primary" /> Super Admin</h1>
          <p className="text-sm text-muted-foreground mt-1">Alertas de reservas masivas y celulares bloqueados en todos los complejos.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/owner-request" className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-secondary">
            <Building2 size={14} /> Solicitudes de dueños
          </Link>
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-secondary cursor-pointer">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
      </div>

      {mfaRequired && <AdminMfa onVerified={() => void load()} />}
      {message && <p className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold">{message}</p>}

      {!mfaRequired && (
        <>
          <section className="space-y-3">
            <h2 className="font-black text-lg flex items-center gap-2"><AlertTriangle size={18} className="text-amber-600" /> Alertas abiertas ({alerts.length})</h2>
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-2xl border border-border bg-card p-6 text-center">
                {loading ? 'Cargando…' : 'Sin alertas. Nadie está intentando acaparar horas.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {alerts.map(a => (
                  <li key={a.id} className="rounded-2xl border border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800/50 p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm">{a.label}{a.attempts > 1 && <span className="ml-1.5 text-xs font-black text-amber-700 dark:text-amber-300">×{a.attempts}</span>}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 break-words">
                        {[a.company_name, a.pitch_name].filter(Boolean).join(' · ') || 'Complejo desconocido'}
                        {a.phone && <> · cel. <strong className="text-foreground">{a.phone}</strong></>}
                        {a.customer_name && <> · {a.customer_name}</>}
                        {!a.phone && a.ip_hash && <> · red {a.ip_hash.slice(0, 8)}</>}
                        {a.user_id ? ' · con cuenta' : ' · invitado'}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Último intento: {fmtDate(a.last_seen_at)}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {a.company_id && a.phone && (
                        <button type="button" disabled={!!busy} onClick={() => void blockFromAlert(a)}
                          className="inline-flex items-center gap-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 text-xs font-bold cursor-pointer disabled:opacity-60">
                          {busy === a.id ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />} Bloquear celular
                        </button>
                      )}
                      <button type="button" disabled={!!busy} onClick={() => void call('POST', { action: 'resolve', alert_id: a.id }, a.id + 'r', 'Alerta marcada como revisada')}
                        className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold hover:bg-secondary cursor-pointer disabled:opacity-60">
                        <Check size={13} /> Revisada
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-black text-lg flex items-center gap-2"><Ban size={18} className="text-rose-600" /> Celulares bloqueados ({blocked.length})</h2>
            <p className="text-xs text-muted-foreground">No pueden enviar reservas en línea al complejo indicado. El dueño sí puede registrarles reservas manuales y turnos fijos.</p>

            <form
              className="rounded-2xl border border-border bg-card p-3.5 grid grid-cols-1 sm:grid-cols-[1fr_10rem_1fr_auto] gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await call('POST', { action: 'block', ...form, reason: form.reason || null }, 'form', `Celular ${form.phone} bloqueado`)) {
                  setForm(f => ({ ...f, phone: '', reason: '' }));
                }
              }}
            >
              <select required value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm min-w-0">
                <option value="">Complejo…</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input required inputMode="tel" maxLength={20} placeholder="Celular" value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm min-w-0" />
              <input maxLength={200} placeholder="Motivo (opcional)" value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm min-w-0" />
              <button type="submit" disabled={!!busy} className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 text-sm font-bold cursor-pointer disabled:opacity-60">
                Bloquear
              </button>
            </form>

            {blocked.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No hay celulares bloqueados.</p>
            ) : (
              <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
                {blocked.map(b => (
                  <li key={b.company_id + b.phone} className="px-3.5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-sm">{b.phone}</p>
                      <p className="text-[11px] text-muted-foreground break-words">
                        {b.company_name ? `${b.company_name} · ` : ''}desde {fmtDate(b.created_at)}{b.reason ? ` · ${b.reason}` : ''}
                      </p>
                    </div>
                    <button type="button" disabled={!!busy}
                      onClick={() => void call('DELETE', { company_id: b.company_id, phone: b.phone }, b.company_id + b.phone, `Celular ${b.phone} desbloqueado`)}
                      className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs font-bold hover:bg-secondary cursor-pointer disabled:opacity-60">
                      <ShieldOff size={13} /> Desbloquear
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
