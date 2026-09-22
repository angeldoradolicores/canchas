'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Phone, MessageCircle, Loader2 } from 'lucide-react';

export function PhoneOnboarding() {
  const { user, profile, refreshProfile } = useAuth();
  const supabase = createClient();
  const [show, setShow] = useState(false);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Solo mostrar para jugadores logueados que no tengan número registrado
    if (user && profile && profile.role === 'player' && (!profile.phone || profile.phone.trim() === '')) {
      const alreadySaved = typeof window !== 'undefined' && localStorage.getItem(`phone_saved_${user.id}`) === 'true';
      if (!alreadySaved) {
        const t = setTimeout(() => setShow(true), 800);
        return () => clearTimeout(t);
      }
    } else {
      setShow(false);
    }
  }, [user, profile]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Solo permitir números (dígitos)
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPhone(digitsOnly);
    if (error) setError('');
  };

  const handleSave = async () => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length !== 10) {
      setError('Ingresa un número de celular válido de 10 dígitos (ej: 3001234567)');
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

      if (typeof window !== 'undefined') {
        localStorage.setItem(`phone_saved_${user!.id}`, 'true');
      }

      if (refreshProfile) {
        await refreshProfile();
      }

      setShow(false);
    } catch (e: any) {
      console.error('Error guardando teléfono:', e);
      setError('Error al guardar el número. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-3xl shadow-2xl p-6 sm:p-7 max-w-sm w-full space-y-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <MessageCircle size={24} className="text-emerald-500" />
          </div>
          <div>
            <h3 className="font-black text-lg text-foreground tracking-tight">Número de WhatsApp</h3>
            <p className="text-xs text-muted-foreground">Paso obligatorio para confirmar reservas</p>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          Para que recibas la confirmación de tus partidos y tus tickets directamente por WhatsApp, ingresa tu número de celular.
        </p>

        <div className="space-y-2">
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
              <span className="text-base">🇨🇴</span>
              <span className="text-xs font-bold text-muted-foreground">+57</span>
              <div className="w-px h-4 bg-border" />
            </div>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="300 123 4567"
              value={phone}
              onChange={handlePhoneChange}
              onKeyDown={e => e.key === 'Enter' && phone.length === 10 && handleSave()}
              className="w-full pl-20 pr-4 py-3 bg-secondary/60 border border-border focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-2xl text-sm font-semibold tracking-wider outline-none transition-all"
              maxLength={10}
              autoFocus
            />
          </div>
          <div className="flex justify-between items-center px-1">
            <span className="text-[11px] text-muted-foreground">
              {phone.length}/10 dígitos
            </span>
            {phone.length === 10 && (
              <span className="text-[11px] text-emerald-500 font-bold">✓ Formato correcto</span>
            )}
          </div>
        </div>

        {error && (
          <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs font-medium">
            ⚠️ {error}
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || phone.length !== 10}
            className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-2xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/25 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin text-black" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Phone size={16} />
                <span>Guardar y Continuar</span>
              </>
            )}
          </button>
        </div>

        <p className="text-[10px] text-muted-foreground text-center opacity-70">
          Solo se utilizará para el envío de notificaciones y confirmaciones de tus reservas.
        </p>
      </div>
    </div>
  );
}
