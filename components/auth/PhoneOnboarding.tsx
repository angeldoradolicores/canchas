'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Phone, X, MessageCircle, Loader2 } from 'lucide-react';

export function PhoneOnboarding() {
  const { user, profile } = useAuth();
  const supabase = createClient();
  const [show, setShow] = useState(false);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (user && profile && !profile.phone && !dismissed) {
      const t = setTimeout(() => setShow(true), 1500);
      return () => clearTimeout(t);
    }
  }, [user, profile, dismissed]);

  const handleSave = async () => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 7) {
      setError('Ingresa un número válido (mínimo 7 dígitos)');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ phone: clean })
        .eq('id', user!.id);
      if (dbErr) throw dbErr;
      setShow(false);
    } catch (e: any) {
      setError('Error al guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
              <MessageCircle size={22} className="text-green-500" />
            </div>
            <div>
              <h3 className="font-black text-base text-foreground">¡Un último paso!</h3>
              <p className="text-xs text-muted-foreground">Para recibir confirmaciones por WhatsApp</p>
            </div>
          </div>
          <button onClick={handleDismiss} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          Agrega tu número de WhatsApp para recibir notificaciones cuando el estado de tus reservas cambie.
        </p>
        <div className="relative mb-3">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
            <span className="text-sm">🇨🇴</span>
            <span className="text-xs font-bold text-muted-foreground">+57</span>
            <div className="w-px h-4 bg-border" />
          </div>
          <input
            type="tel"
            placeholder="300 000 0000"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            className="w-full pl-20 pr-4 py-3 bg-secondary border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
            maxLength={15}
            autoFocus
          />
        </div>
        {error && <p className="text-xs text-red-500 mb-3">⚠️ {error}</p>}
        <div className="flex gap-2">
          <button onClick={handleDismiss} className="flex-1 py-2.5 text-xs font-bold border border-border rounded-xl hover:bg-secondary transition-colors text-muted-foreground">
            Omitir
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !phone.trim()}
            className="flex-1 py-2.5 text-xs font-bold bg-green-500 hover:bg-green-600 text-white rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <><Loader2 size={13} className="animate-spin" /> Guardando...</> : <><Phone size={13} /> Guardar</>}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-3 opacity-60">Solo se usa para notificaciones de tus reservas</p>
      </div>
    </div>
  );
}
