'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { X, CalendarDays, Clock3, Loader2, Check, Upload, ImageIcon, XCircle } from 'lucide-react';
import { Pitch } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { useToday } from '@/lib/use-today';

const TIME_CATEGORIES = [
  { key: 'manana', icon: '', label: 'Mañana', slots: ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00'] },
  { key: 'tarde', icon: '', label: 'Tarde', slots: ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00'] },
  { key: 'noche', icon: '', label: 'Noche', slots: ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00'] },
] as const;

function TimeLeft({ expiresAt }: { expiresAt: string }) {
  const [secs, setSecs] = useState(() => {
    const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  useEffect(() => {
    if (secs <= 0) return;
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  if (secs <= 0) return <span>Liberando...</span>;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return <span className="font-mono font-bold">{m}:{s.toString().padStart(2, '0')}</span>;
}

export function ManualBookingModal({ pitches, onClose, onSuccess }: { pitches: Pitch[], onClose: () => void, onSuccess: () => void }) {
  const today = useToday();
  const [selectedPitch, setSelectedPitch] = useState<Pitch | null>(pitches[0] || null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<'manana' | 'tarde' | 'noche'>('noche');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const [takenSlots, setTakenSlots] = useState<Map<string, { status: string, expires_at: string | null }>>(new Map());
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    if (today && !selectedDate) setSelectedDate(today);
  }, [today]);

  useEffect(() => {
    if (!selectedDate || !selectedPitch) return;
    setLoadingSlots(true);
    setSelectedTimes([]);

    const fetchTaken = async () => {
      const { data } = await supabase
        .from('bookings')
        .select('start_time, status, expires_at')
        .eq('pitch_id', selectedPitch.id)
        .gte('start_time', `${selectedDate}T00:00:00-05:00`)
        .lte('start_time', `${selectedDate}T23:59:59-05:00`)
        .neq('status', 'cancelled');

      const taken = new Map<string, { status: string, expires_at: string | null }>();
      (data || []).forEach((b: any) => {
        if (b.status === 'draft' && b.expires_at && new Date(b.expires_at) < new Date()) return;
        try {
          const h = new Date(b.start_time).toLocaleTimeString('es-CO', {
            hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Bogota'
          });
          taken.set(h, { status: b.status, expires_at: b.expires_at });
        } catch (e) {
          taken.set(b.start_time.substring(11, 16), { status: b.status, expires_at: b.expires_at });
        }
      });
      setTakenSlots(taken);
      setLoadingSlots(false);
    };
    fetchTaken();
  }, [selectedDate, selectedPitch]);

  const toggleTime = (slot: string) => {
    setSelectedTimes(prev => prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot]);
  };

  const handleCreate = async () => {
    if (!selectedPitch) return setError('Selecciona una cancha');
    if (selectedTimes.length === 0) return setError('Selecciona al menos una hora');
    if (!customerName.trim()) return setError('Ingresa el nombre del cliente');

    setLoading(true);
    setError('');

    try {
      // 1. Crear las reservas (como confirmadas si lo hace el admin, o pendientes)
      // Modificamos el endpoint para soportar reserva manual + comprobante opcional.
      const payload: any = {
        pitch_id: selectedPitch.id,
        date: selectedDate,
        selected_times: selectedTimes,
        customer_name: customerName,
        customer_phone: customerPhone
      };

      const res = await fetch('/api/admin-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_manual_booking', payload }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error al crear reserva');

      // 2. Si hay comprobante, subirlo para esas reservas. (Esto es extra, lo manejaremos sencillo).
      if (file && data.booking_ids && data.booking_ids.length > 0) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_manual.${fileExt}`;
        const filePath = `${selectedPitch.id}/${fileName}`;
        const { error: uploadError } = await supabase.storage.from('payment_proofs').upload(filePath, file);
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage.from('payment_proofs').getPublicUrl(filePath);
          await supabase.from('bookings').update({ payment_proof_url: publicUrl }).in('id', data.booking_ids);
        }
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const nextDays = useMemo(() => {
    if (!today) return [];
    const days = [];
    const base = new Date(today + 'T12:00:00');
    for (let i = 0; i < 14; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = i === 0 ? 'Hoy' : d.toLocaleDateString('es-CO', { weekday: 'short' });
      days.push({ dateStr, dayName, dayNumber: d.getDate(), monthName: d.toLocaleDateString('es-CO', { month: 'short' }), isToday: i === 0 });
    }
    return days;
  }, [today]);

  const currentCatSlots = TIME_CATEGORIES.find(c => c.key === activeCategory)?.slots || [];
  const customPricing = (selectedPitch as any)?.custom_pricing || {};
  const pricePerHour = selectedPitch?.price_per_hour || 80000;
  const totalPrice = selectedTimes.reduce((total, time) => total + (customPricing[time] || pricePerHour), 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm sm:items-center sm:justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="bg-background w-full sm:max-w-xl h-[95vh] sm:h-auto sm:max-h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95">

        <div className="flex items-center justify-between p-4 border-b border-border bg-card">
          <h2 className="font-bold text-lg">Nueva Reserva Manual</h2>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-full text-muted-foreground"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Canchas */}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block">Seleccionar Cancha</label>
            <div className="grid grid-cols-2 gap-2">
              {pitches.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPitch(p)}
                  className={`p-3 rounded-xl border text-left text-sm font-semibold transition-all ${selectedPitch?.id === p.id ? 'bg-primary/10 border-primary text-primary shadow-sm' : 'bg-card border-border hover:border-primary/40 text-muted-foreground'
                    }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Fecha */}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 mb-2"><CalendarDays size={12} /> Fecha del partido</label>
            <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide snap-x">
              {nextDays.map(d => {
                const isSel = selectedDate === d.dateStr;
                return (
                  <button
                    key={d.dateStr}
                    onClick={() => { setSelectedDate(d.dateStr); setSelectedTimes([]); }}
                    className={`flex-shrink-0 snap-start min-w-[65px] p-2.5 rounded-xl border text-center transition-all ${isSel
                        ? 'bg-primary text-white border-primary shadow-md ring-2 ring-primary/30'
                        : d.isToday
                          ? 'bg-primary/10 border-primary/40 text-primary hover:bg-primary/20'
                          : 'bg-card hover:bg-primary/10 border-border text-foreground hover:border-primary/40'
                      }`}
                  >
                    <span className="text-[10px] uppercase font-bold tracking-wide block">{d.dayName}</span>
                    <span className="text-base font-extrabold block leading-tight">{d.dayNumber}</span>
                    <span className="text-[9px] capitalize block opacity-70">{d.monthName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Horas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5"><Clock3 size={12} /> Hora(s) Disponibles</label>
              <button
                type="button"
                onClick={() => {
                  const allAvailable = TIME_CATEGORIES
                    .flatMap(cat => cat.slots as unknown as string[])
                    .filter(slot => {
                      const slotData = takenSlots.get(slot);
                      if (!slotData) return true;
                      if (slotData.status === 'draft' && slotData.expires_at && new Date(slotData.expires_at) < new Date()) return true;
                      return false;
                    });
                  setSelectedTimes(allAvailable);
                }}
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
              >
                ¿Reservar todo el día?
              </button>
            </div>

            <div className="flex bg-secondary/50 p-1 rounded-xl border border-border gap-1 mb-3">
              {TIME_CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${activeCategory === cat.key ? 'bg-card text-primary shadow-sm border border-border/60' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <span>{cat.icon}</span> <span>{cat.label}</span>
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-card p-3 shadow-inner min-h-[140px]">
              {loadingSlots ? (
                <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-primary" /></div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {currentCatSlots.map(slot => {
                    const slotData = takenSlots.get(slot);
                    const isTaken = !!slotData;
                    const isDraft = slotData?.status === 'draft';
                    const isSel = selectedTimes.includes(slot);
                    const hNum = parseInt(slot.split(':')[0]);
                    const ampm = hNum < 12 ? 'am' : 'pm';
                    const h12 = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum;
                    const hasCustomPrice = !!customPricing[slot];

                    return (
                      <button
                        key={slot}
                        disabled={isTaken}
                        onClick={() => toggleTime(slot)}
                        className={`p-2 rounded-xl border text-center transition-all select-none font-bold relative ${isTaken
                            ? isDraft ? 'bg-orange-50 text-orange-400 border-orange-200 cursor-not-allowed overflow-hidden' : 'bg-red-50 text-red-300 border-red-200 cursor-not-allowed overflow-hidden'
                            : isSel
                              ? 'bg-primary text-white border-primary shadow-md ring-2 ring-primary/30 scale-105'
                              : 'bg-card hover:bg-primary/10 border-border text-foreground hover:border-primary/40'
                          }`}
                      >
                        {isTaken ? (
                          <div className="flex flex-col items-center justify-center">
                            {isDraft ? (
                              <>
                                <Clock3 size={14} className="mx-auto opacity-70 mb-0.5" />
                                <span className="text-[7px] leading-tight absolute bottom-1 w-full text-center">
                                  <TimeLeft expiresAt={slotData.expires_at || ''} />
                                </span>
                              </>
                            ) : (
                              <XCircle size={16} className="mx-auto opacity-40" />
                            )}
                          </div>
                        ) : (
                          <>
                            <span className="text-sm block leading-tight">{h12}:00</span>
                            <span className="text-[9px] uppercase opacity-70">{ampm}</span>
                            {hasCustomPrice && !isSel && (
                              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-orange-400 rounded-full" title="Precio especial"></span>
                            )}
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase">Nombre del Cliente *</label>
                <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full p-2.5 bg-card border border-border rounded-xl outline-none focus:border-primary text-sm" placeholder="Ej: Juan Pérez" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground uppercase">Teléfono (Opcional)</label>
                <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full p-2.5 bg-card border border-border rounded-xl outline-none focus:border-primary text-sm" placeholder="Ej: 300 123 4567" />
              </div>
            </div>

            {/* Comprobante Opcional */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">Subir Comprobante (Opcional)</label>
              <div
                className={`upload-zone p-4 rounded-xl border-2 border-dashed flex items-center justify-center gap-3 cursor-pointer transition-colors ${file ? 'bg-primary/5 border-primary/40' : 'bg-card border-border hover:bg-secondary'
                  }`}
                onClick={() => fileInputRef.current?.click()}
              >
                {file ? (
                  <>
                    <ImageIcon className="text-primary" size={20} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-primary truncate">{file.name}</p>
                      <p className="text-[10px] text-muted-foreground">Clic para cambiar</p>
                    </div>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null); }} className="p-1 hover:bg-black/5 rounded">
                      <X size={16} className="text-muted-foreground" />
                    </button>
                  </>
                ) : (
                  <>
                    <Upload className="text-muted-foreground" size={20} />
                    <div className="text-sm">
                      <p className="font-semibold">Subir imagen o PDF</p>
                      <p className="text-xs text-muted-foreground">Si el cliente ya pagó</p>
                    </div>
                  </>
                )}
              </div>
              <input ref={fileInputRef} type="file" className="hidden" accept="image/*,application/pdf" onChange={e => e.target.files && setFile(e.target.files[0])} />
            </div>
          </div>

          {error && <p className="text-red-500 text-xs font-bold bg-red-50 p-2 rounded flex items-center gap-2"><XCircle size={14} /> {error}</p>}
        </div>

        <div className="p-4 border-t border-border bg-card flex items-center justify-between">
          <div>
            <span className="block text-xs text-muted-foreground font-bold uppercase">Total ({selectedTimes.length}h)</span>
            <strong className="text-lg text-primary">${totalPrice.toLocaleString()}</strong>
          </div>
          <button onClick={handleCreate} disabled={loading} className="btn-primary py-2.5 px-6">
            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar Reserva'}
          </button>
        </div>
      </div>
    </div>
  );
}
