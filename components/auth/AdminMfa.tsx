'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, Smartphone, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Segundo factor (TOTP) del superadministrador. Sin él, el servidor no muestra
 * ni permite resolver solicitudes de dueño (exige sesión aal2).
 */
export function AdminMfa({ onVerified }: { onVerified: () => void }) {
  const [db] = useState(() => createClient());
  const [state, setState] = useState<'loading' | 'verified' | 'enroll' | 'challenge' | 'idle'>('loading');
  const [factor, setFactor] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    db.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }: { data: { currentLevel: string | null } | null }) => {
      setState(data?.currentLevel === 'aal2' ? 'verified' : 'idle');
    }).catch(() => setState('idle'));
  }, [db]);

  async function start() {
    setBusy(true); setMessage('');
    try {
      const { data, error } = await db.auth.mfa.listFactors();
      if (error) throw error;
      const existing = data.totp.find((f: { id: string; status: string }) => f.status === 'verified');
      if (existing) { setFactor(existing.id); setState('challenge'); return; }
      // Borrar intentos de configuración anteriores que no se terminaron.
      for (const f of data.all.filter((f: { status: string }) => f.status === 'unverified')) {
        await db.auth.mfa.unenroll({ factorId: f.id });
      }
      const result = await db.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Cancheros superadmin' });
      if (result.error) throw result.error;
      setFactor(result.data.id); setQr(result.data.totp.qr_code); setSecret(result.data.totp.secret);
      setState('enroll');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo iniciar la verificación');
    } finally { setBusy(false); }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMessage('');
    const { error } = await db.auth.mfa.challengeAndVerify({ factorId: factor, code });
    setBusy(false);
    if (error) { setMessage('Código inválido o vencido. Escribe el código que se ve ahora en la aplicación.'); return; }
    setState('verified'); setCode('');
    onVerified();
  }

  if (state === 'loading') return null;
  if (state === 'verified') {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
        <ShieldCheck size={18} /> Segundo factor verificado en esta sesión.
      </p>
    );
  }

  return (
    <section className="rounded-3xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0"><Smartphone size={20} /></span>
        <div>
          <h2 className="font-bold">Verificación en dos pasos</h2>
          <p className="text-sm text-muted-foreground">
            Por seguridad, para ver y aprobar solicitudes necesitas un código de una aplicación autenticadora
            (Google Authenticator, Microsoft Authenticator o Authy) instalada en tu celular.
          </p>
        </div>
      </div>

      {state === 'idle' && (
        <button onClick={start} disabled={busy} className="btn-primary w-full sm:w-auto">
          {busy ? <Loader2 size={16} className="animate-spin inline" /> : 'Continuar'}
        </button>
      )}

      {state === 'enroll' && (
        <ol className="space-y-3 text-sm list-decimal pl-5">
          <li>Abre tu aplicación autenticadora y toca <strong>Agregar cuenta → Escanear código QR</strong>.</li>
          <li>
            Escanea este código:
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Código QR para la aplicación autenticadora" className="mt-2 w-44 h-44 bg-white p-2 rounded-xl border" />
            <span className="block text-xs text-muted-foreground mt-1 break-all">¿No puedes escanear? Escribe esta clave: <code>{secret}</code></span>
          </li>
          <li>Escribe abajo el código de 6 dígitos que aparece en la aplicación.</li>
        </ol>
      )}
      {state === 'challenge' && (
        <p className="text-sm">Abre tu aplicación autenticadora y escribe el código de 6 dígitos de <strong>Cancheros</strong>.</p>
      )}

      {(state === 'enroll' || state === 'challenge') && (
        <form onSubmit={verify} className="flex flex-col sm:flex-row gap-2">
          <input aria-label="Código de 6 dígitos" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric" autoComplete="one-time-code" placeholder="123456"
            className="rounded-xl border border-border p-3 bg-background text-lg tracking-[0.4em] font-bold w-full sm:w-48" />
          <button disabled={busy || code.length !== 6} className="btn-primary">{busy ? 'Verificando…' : 'Verificar'}</button>
        </form>
      )}
      {message && <p role="status" className="text-sm text-red-600">{message}</p>}
    </section>
  );
}
