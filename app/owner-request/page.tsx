'use client';
import { AdminMfa } from '@/components/auth/AdminMfa';
import { useEffect, useState } from 'react';
import { Building2, Check, X } from 'lucide-react';

const FIELDS: [string, string, number][] = [
  ['full_name', 'Nombre completo', 100],
  ['company_name', 'Nombre del complejo', 150],
  ['phone', 'Celular con indicativo (ej. 573001234567)', 16],
  ['address', 'Dirección del complejo', 300],
];

const STATUS: Record<string, string> = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' };

export default function OwnerRequestPage() {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<any[]>([]);
  const [admin, setAdmin] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [prefill, setPrefill] = useState<Record<string, string>>({});

  async function refresh() {
    const res = await fetch('/api/owner-requests?page=' + page);
    const json = await res.json();
    setLoaded(true);
    if (!res.ok) { setMessage(json.error); return; }
    setData(json.data || []); setAdmin(json.admin); setMfaRequired(Boolean(json.mfaRequired)); setPrefill(json.prefill || {});
  }
  useEffect(() => { void refresh(); }, [page]);

  async function send(body: object, method = 'POST') {
    setBusy(true); setMessage('');
    try {
      const res = await fetch('/api/owner-requests', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      setMessage(res.ok ? 'Solicitud procesada' : json.error);
      await refresh();
    } catch { setMessage('Error de conexión'); } finally { setBusy(false); }
  }

  const inputCls = 'block w-full rounded-xl border border-border p-3 bg-background text-sm mt-1 outline-none focus:border-primary';

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 sm:p-8 space-y-5 w-full min-w-0">
      <h1 className="text-2xl font-black flex items-center gap-2"><Building2 className="text-emerald-600" />{admin ? 'Solicitudes de complejos' : 'Solicitar administración de un complejo'}</h1>

      {admin ? (
        <p className="text-sm text-muted-foreground">
          Aquí llegan las personas que se registraron como dueños. Verifica sus datos (llama al celular, revisa la evidencia)
          y pulsa <strong>Aprobar</strong>: su cuenta pasa a dueño y se crea su complejo. Si rechazas, sigue como jugador y puede volver a enviar la solicitud.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Tu cuenta seguirá siendo de jugador hasta que un superadministrador verifique y apruebe tu solicitud.
          La evidencia debe permitir comprobar tu relación con el complejo.
        </p>
      )}

      {admin && <AdminMfa onVerified={() => void refresh()} />}
      {message && <p role="status" className="text-sm font-semibold">{message}</p>}

      {!admin && data[0]?.status === 'pending' && (
        <div className="rounded-3xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm space-y-1">
          <p className="font-bold">⏳ Tu solicitud está en revisión</p>
          <p className="text-muted-foreground">Te avisaremos con una notificación cuando la aprobemos. Mientras tanto puedes usar la app como jugador.</p>
        </div>
      )}
      {!admin && data[0]?.status === 'approved' && (
        <a href="/dashboard" className="block rounded-3xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-sm font-bold">🎉 Tu solicitud fue aprobada. Ir a mi panel de dueño →</a>
      )}
      {!admin && loaded && (data.length === 0 || data[0]?.status === 'rejected') && (
        <form className="rounded-3xl border border-border bg-card p-5 space-y-4" onSubmit={e => { e.preventDefault(); void send(Object.fromEntries(new FormData(e.currentTarget))); }}>
          {FIELDS.map(([name, label, max]) => (
            <label className="block text-sm" key={name}>{label}
              <input className={inputCls} name={name} required maxLength={max} defaultValue={prefill[name] || ''} />
            </label>
          ))}
          <label className="block text-sm">Evidencia: enlace oficial (redes, Google Maps) y explicación de tu relación con el complejo
            <textarea className={inputCls} name="evidence" required minLength={10} maxLength={2000} rows={4} />
          </label>
          <button disabled={busy} className="btn-primary w-full sm:w-auto">Enviar solicitud</button>
        </form>
      )}

      {admin && !mfaRequired && loaded && data.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No hay solicitudes pendientes.</p>
      )}

      <div className="space-y-3">
        {data.map(r => (
          <article className="rounded-3xl border border-border bg-card p-5 space-y-2 min-w-0" key={r.user_id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-lg break-words">{r.company_name}</h2>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${r.status === 'pending' ? 'bg-amber-500/15 text-amber-700' : r.status === 'approved' ? 'bg-emerald-500/15 text-emerald-700' : 'bg-red-500/15 text-red-700'}`}>
                {STATUS[r.status] || r.status}
              </span>
            </div>
            <p className="text-sm"><strong>{r.full_name}</strong> · <a className="underline" href={`tel:+${String(r.phone).replace(/\D/g, '')}`}>{r.phone}</a></p>
            <p className="text-sm text-muted-foreground break-words">{r.address}</p>
            <p className="text-sm whitespace-pre-wrap break-words rounded-xl bg-secondary/40 p-3">{r.evidence}</p>
            {r.created_at && <p className="text-xs text-muted-foreground">Enviada el {new Date(r.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</p>}
            {admin && r.status === 'pending' && (
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button disabled={busy} onClick={() => { if (confirm(`¿Aprobar a ${r.full_name} como dueño de ${r.company_name}?`)) void send({ user_id: r.user_id, approve: true }, 'PATCH'); }}
                  className="btn-primary flex items-center justify-center gap-1"><Check size={16} /> Aprobar dueño</button>
                <button disabled={busy} onClick={() => { if (confirm('¿Rechazar esta solicitud?')) void send({ user_id: r.user_id, approve: false }, 'PATCH'); }}
                  className="rounded-xl border border-red-500/40 text-red-600 px-4 py-2 text-sm font-bold flex items-center justify-center gap-1 cursor-pointer"><X size={16} /> Rechazar</button>
              </div>
            )}
          </article>
        ))}
      </div>

      {admin && !mfaRequired && (page > 0 || data.length >= 50) && (
        <div className="flex gap-3">
          <button className="underline disabled:opacity-40" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button>
          <button className="underline disabled:opacity-40" disabled={data.length < 50} onClick={() => setPage(page + 1)}>Siguiente</button>
        </div>
      )}
      <a href="/" className="inline-block text-sm underline">Volver al inicio</a>
    </main>
  );
}
