'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { X, CalendarDays, Clock3, Loader2, Check, Upload, ImageIcon, XCircle, Layers, User, Phone, ChevronLeft, ChevronRight } from 'lucide-react';
import { Pitch } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { useToday } from '@/lib/use-today';
import { isCombinedPitch, getLinkedPitchIds } from '@/lib/combined-pitch-utils';

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

function PitchMiniCard({ pitch, selected, onClick }: { pitch: any; selected: boolean; onClick: () => void }) {
  const img = pitch.media_urls?.[0] || pitch.image_url;
  const isCombined = isCombinedPitch(pitch);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-all cursor-pointer w-full ${selected
        ? 'bg-primary/10 border-primary shadow-md shadow-primary/10'
        : 'bg-card border-border hover:border-primary/40 hover:bg-secondary/50'
        }`}
    >
      {/* Thumbnail */}
      <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-secondary border border-border relative">
        {img ? (
          <img src={img} alt={pitch.name} className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full ${pitch.tone || 'field-emerald'} flex items-center justify-center text-xl`}>
            ⚽
          </div>
        )}
        {/* {isCombined && (
          <div className="absolute top-0 right-0 bg-amber-500 text-white text-[7px] font-black px-1 py-0.5 rounded-bl-lg rounded-tr-xl">
            ⚡
          </div>
        )} */}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1 w-full">
        {/* Fila superior: Tipo de cancha + Badge Combinada */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-[11px] font-medium text-muted-foreground truncate">
            {pitch.type || 'Fútbol 5'}
          </p>

          {isCombined && (
            <span className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/25 whitespace-nowrap">
              COMBINADA
            </span>
          )}
        </div>

        {/* Nombre de la cancha completo sin cortar ni romper palabras por la mitad */}
        <p className={`text-xs font-black uppercase leading-snug break-normal hyphens-none ${selected ? 'text-primary' : 'text-foreground'}`}>
          {pitch.name.toUpperCase()}
        </p>

        {/* Superficie */}
        {pitch.surface && (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5 break-words">
            {pitch.surface}
          </p>
        )}
      </div>

      {/* Check */}
      {selected && (
        <div className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
          <Check size={11} />
        </div>
      )}
    </button>
  );
}

export function ManualBookingModal({ pitches, onClose, onSuccess }: { pitches: Pitch[], onClose: () => void, onSuccess: () => void }) {
  const today = useToday();
  const [selectedPitch, setSelectedPitch] = useState<Pitch | null>(pitches[0] || null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<'manana' | 'tarde' | 'noche'>('noche');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);

  const [takenSlots, setTakenSlots] = useState<Map<string, { status: string, expires_at: string | null }>>(new Map());
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    if (today && !selectedDate) setSelectedDate(today);
  }, [today]);

  // Fetch taken slots – including linked pitches for combined canchas
  useEffect(() => {
    if (!selectedDate || !selectedPitch) return;
    setLoadingSlots(true);
    setSelectedTimes([]);

    const pitchIdList = [
      selectedPitch.id,
      ...getLinkedPitchIds(selectedPitch),
    ];

    const fetchTaken = async () => {
      const { data } = await supabase
        .from('bookings')
        .select('start_time, status, expires_at, pitch_id')
        .in('pitch_id', pitchIdList)
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
          if (!taken.has(h)) {
            taken.set(h, { status: b.status, expires_at: b.expires_at });
          }
        } catch (e) {
          taken.set(b.start_time.substring(11, 16), { status: b.status, expires_at: b.expires_at });
        }
      });
      setTakenSlots(taken);
      setLoadingSlots(false);
    };

    fetchTaken();
    const pollInterval = setInterval(fetchTaken, 2000);
    const channel = supabase
      .channel(`manual-modal:${selectedPitch.id}:${selectedDate}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `pitch_id=eq.${selectedPitch.id}` }, fetchTaken)
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [selectedDate, selectedPitch]);

  const toggleTime = (slot: string) => {
    if (allowedSlots && !allowedSlots.includes(slot)) return;
    setSelectedTimes(prev => prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onloadend = () => setImgPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const handleCreate = async () => {
    if (!selectedPitch) return setError('Selecciona una cancha');
    if (selectedTimes.length === 0) return setError('Selecciona al menos una hora');
    if (!customerName.trim()) return setError('Ingresa el nombre del cliente');

    setLoading(true);
    setError('');

    try {
      const payload: any = {
        pitch_id: selectedPitch.id,
        date: selectedDate,
        selected_times: selectedTimes,
        customer_name: customerName,
        customer_phone: customerPhone,
        note: customerNote,
      };

      const { data: sessData } = await supabase.auth.getSession();
      const token = sessData?.session?.access_token;

      const res = await fetch('/api/admin-actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'create_manual_booking', payload }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error al crear reserva');

      // Subir comprobante si aplica
      if (file && data.booking_ids?.length > 0) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_manual.${fileExt}`;
        const filePath = `${selectedPitch.id}/${fileName}`;
        const { error: uploadError } = await supabase.storage.from('payment-proofs').upload(filePath, file);
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage.from('payment-proofs').getPublicUrl(filePath);
          await supabase.from('bookings').update({ payment_proof_url: publicUrl, payment_status: 'submitted' }).in('id', data.booking_ids);
        }
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Días disponibles para seleccionar
  const nextDays = useMemo(() => {
    if (!today) return [];
    const days = [];
    const base = new Date(today + 'T12:00:00');
    for (let i = 0; i < 21; i++) {
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

  const allowedSlots = useMemo(() => {
    const ts = (selectedPitch as any)?.custom_pricing?.time_slots;
    if (Array.isArray(ts) && ts.length > 0) return ts as string[];
    return null;
  }, [selectedPitch]);

  const isCombined = selectedPitch ? isCombinedPitch(selectedPitch) : false;
  const linkedIds = selectedPitch ? getLinkedPitchIds(selectedPitch) : [];
  const linkedNames = linkedIds.map(id => (pitches as any[]).find(p => p.id === id)?.name).filter(Boolean);

  const formattedDate = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm sm:items-center sm:justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="bg-background w-full sm:max-w-xl h-[95vh] sm:h-auto sm:max-h-[92vh] rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card shrink-0">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">PANEL DEL DUEÑO</p>
            <h2 className="font-black text-base text-foreground">Nueva Reserva Manual</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-full text-muted-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ── Selector de Cancha ── */}
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
              Canchas
            </label>
            <div className="space-y-2">
              {pitches.map(p => (
                <PitchMiniCard
                  key={p.id}
                  pitch={p}
                  selected={selectedPitch?.id === p.id}
                  onClick={() => { setSelectedPitch(p); setSelectedTimes([]); }}
                />
              ))}
            </div>

            {/* Banner cancha combinada */}
            {isCombined && linkedNames.length > 0 && (
              <div className="mt-2.5 flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
                {/* <Layers size={15} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" /> */}
                <div>
                  <p className="text-xs font-black text-amber-800 dark:text-amber-300">Cancha Combinada</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Al reservar esta cancha, también se bloquearán: <strong>{linkedNames.join(' y ')}</strong>. Las horas ya ocupadas en esas canchas aparecerán aquí como no disponibles.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── Fecha ── */}
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <CalendarDays size={12} /> Fecha
            </label>
            <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide snap-x">
              {nextDays.map(d => {
                const isSel = selectedDate === d.dateStr;
                return (
                  <button
                    key={d.dateStr}
                    onClick={() => { setSelectedDate(d.dateStr); setSelectedTimes([]); }}
                    className={`flex-shrink-0 snap-start min-w-[62px] p-2.5 rounded-xl border text-center transition-all ${isSel
                      ? 'bg-primary text-white border-primary shadow-md ring-2 ring-primary/30'
                      : d.isToday
                        ? 'bg-primary/10 border-primary/40 text-primary hover:bg-primary/20'
                        : 'bg-card hover:bg-primary/10 border-border text-foreground hover:border-primary/40'
                      }`}
                  >
                    <span className="text-[9px] uppercase font-bold tracking-wide block">{d.dayName}</span>
                    <span className="text-sm font-extrabold block leading-tight">{d.dayNumber}</span>
                    <span className="text-[9px] capitalize block opacity-70">{d.monthName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Selector de Horas ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Clock3 size={12} /> Hora(s)
              </label>
              <button
                type="button"
                onClick={() => {
                  const allAvailable = TIME_CATEGORIES
                    .flatMap(cat => cat.slots as unknown as string[])
                    .filter(slot => {
                      if (allowedSlots && !allowedSlots.includes(slot)) return false;
                      const slotData = takenSlots.get(slot);
                      if (!slotData) return true;
                      if (slotData.status === 'draft' && slotData.expires_at && new Date(slotData.expires_at) < new Date()) return true;
                      return false;
                    });
                  setSelectedTimes(allAvailable);
                }}
                className="text-[11px] font-bold text-primary hover:underline"
              >
                Reservar todo el día
              </button>
            </div>

            {/* Tabs */}
            <div className="flex bg-secondary/50 p-1 rounded-xl border border-border gap-1 mb-3">
              {TIME_CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setActiveCategory(cat.key)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${activeCategory === cat.key
                    ? 'bg-card text-primary shadow-sm border border-border/60'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  <span>{cat.icon}</span> <span>{cat.label}</span>
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-card p-3 shadow-inner min-h-[130px]">
              {loadingSlots ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-primary" />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {currentCatSlots.map(slot => {
                    const slotData = takenSlots.get(slot);
                    const isTaken = !!slotData;
                    const isDraft = slotData?.status === 'draft';
                    const isOperating = !allowedSlots || allowedSlots.includes(slot);
                    const isClosed = !isOperating;
                    const isDisabled = isTaken || isClosed;
                    const isSel = selectedTimes.includes(slot);
                    const hNum = parseInt(slot.split(':')[0]);
                    const ampm = hNum < 12 ? 'am' : 'pm';
                    const h12 = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum;
                    const hasCustomPrice = !!(customPricing[slot]);

                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => toggleTime(slot)}
                        className={`p-2 rounded-xl border flex flex-col items-center justify-center transition-all select-none font-bold relative min-h-[54px] ${isDisabled
                          ? isDraft
                            ? 'bg-orange-50 text-orange-400 border-orange-200 cursor-not-allowed dark:bg-orange-950/20 dark:border-orange-900/30'
                            : isClosed
                              ? 'bg-secondary/50 text-muted-foreground/50 border-border/40 cursor-not-allowed'
                              : 'bg-red-50 text-red-300 border-red-200 cursor-not-allowed dark:bg-red-950/20 dark:border-red-900/30'
                          : isSel
                            ? 'bg-primary text-white border-primary shadow-md ring-2 ring-primary/30 scale-[1.02]'
                            : 'bg-card hover:bg-primary/10 border-border text-foreground hover:border-primary/40'
                          }`}
                      >
                        {isDisabled ? (
                          <div className="flex flex-col items-center justify-center">
                            {isDraft ? (
                              <>
                                <Clock3 size={14} className="mx-auto opacity-70 mb-0.5 text-orange-500" />
                                <span className="text-[7px] leading-tight absolute bottom-1 w-full text-center text-orange-500">
                                  <TimeLeft expiresAt={slotData?.expires_at || ''} />
                                </span>
                              </>
                            ) : isClosed ? (
                              <>
                                <span className="text-[11px] font-bold opacity-40 line-through leading-none">{h12}:00 {ampm}</span>
                                <span className="text-[8px] font-extrabold uppercase tracking-tight text-muted-foreground mt-1">Cerrado</span>
                              </>
                            ) : (
                              <>
                                <span className="text-[11px] font-bold opacity-50 line-through leading-none">{h12}:00 {ampm}</span>
                                <span className="text-[8px] font-extrabold uppercase tracking-tight absolute bottom-1 w-full text-center text-red-500">Ocupado</span>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-baseline gap-1 whitespace-nowrap">
                            <span className="text-sm font-extrabold leading-none">{h12}:00</span>
                            <span className="text-[10px] uppercase opacity-75 font-semibold">{ampm}</span>
                            {/* {hasCustomPrice && !isSel && (
                              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-orange-400 rounded-full" title="Precio especial" />
                            )} */}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Horas seleccionadas */}
            {selectedTimes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedTimes.sort().map(t => {
                  const hN = parseInt(t.split(':')[0]);
                  const lbl = `${hN > 12 ? hN - 12 : hN === 0 ? 12 : hN}:00 ${hN < 12 ? 'am' : 'pm'}`;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTime(t)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/25 text-[11px] font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                    >
                      {lbl} <X size={9} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Datos del Cliente ── */}
          <div className="space-y-3 pt-4 border-t border-border">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
              Datos del Cliente
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full pl-8 pr-3 py-2.5 bg-card border border-border rounded-xl outline-none focus:border-primary text-sm"
                  placeholder="Nombre del cliente *"
                />
              </div>
              <div className="relative">
                <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="tel"
                  inputMode="numeric"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value.replace(/[^\d]/g, ''))}
                  className="w-full pl-8 pr-3 py-2.5 bg-card border border-border rounded-xl outline-none focus:border-primary text-sm"
                  placeholder="Teléfono (opcional)"
                />
              </div>
            </div>
            <textarea
              value={customerNote}
              onChange={e => setCustomerNote(e.target.value)}
              rows={2}
              className="w-full p-3 bg-card border border-border rounded-xl outline-none focus:border-primary text-sm resize-none"
              placeholder="Nota interna (opcional): ej. ya pagó, código de descuento..."
            />
          </div>

          {/* ── Comprobante de Pago ── */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
              Comprobante de Pago (Opcional)
            </label>
            <div
              className={`relative rounded-xl border-2 border-dashed flex items-center gap-3 cursor-pointer transition-colors overflow-hidden ${file ? 'bg-primary/5 border-primary/40' : 'bg-card border-border hover:bg-secondary/50'}`}
              onClick={() => fileInputRef.current?.click()}
            >
              {imgPreview ? (
                <div className="flex items-center gap-3 p-3 w-full">
                  <img src={imgPreview} alt="preview" className="w-16 h-16 object-cover rounded-lg border border-border shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{file?.name}</p>
                    <p className="text-[11px] text-muted-foreground">Toca para cambiar</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setFile(null); setImgPreview(null); }}
                    className="p-1.5 hover:bg-secondary rounded-lg"
                  >
                    <X size={14} className="text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 w-full">
                  <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                    <Upload size={18} className="text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Subir imagen o PDF</p>
                    <p className="text-[11px] text-muted-foreground">Si el cliente ya pagó antes de llegar</p>
                  </div>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFileChange} />
          </div>

          {error && (
            <p className="text-red-500 text-xs font-bold bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 p-3 rounded-xl flex items-center gap-2">
              <XCircle size={14} /> {error}
            </p>
          )}
        </div>

        {/* ── Footer con Resumen tipo Ticket ── */}
        <div className="shrink-0 border-t border-border bg-card p-4">
          {selectedTimes.length > 0 && selectedDate && (
            <div className="mb-3 p-3 rounded-xl bg-secondary/60 border border-border text-[11px] space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground font-medium">Cancha</span>
                <span className="font-black text-foreground  max-w-[60%] text-right">{selectedPitch?.name.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-medium">Fecha</span>
                <span className="font-bold text-foreground capitalize">{formattedDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-medium">Horas ({selectedTimes.length})</span>
                <span className="font-bold text-foreground">
                  {selectedTimes.sort().map(t => {
                    const hN = parseInt(t.split(':')[0]);
                    return `${hN > 12 ? hN - 12 : hN === 0 ? 12 : hN}:00 ${hN < 12 ? 'am' : 'pm'}`;
                  }).join(', ')}
                </span>
              </div>
              {isCombined && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground font-medium">Bloquea también</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400">{linkedNames.join(', ').toUpperCase()}</span>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <span className="block text-[11px] text-muted-foreground font-bold uppercase">Total estimado</span>
              <strong className="text-xl text-primary">${totalPrice.toLocaleString('es-CO')}</strong>
            </div>
            <button
              onClick={() => {
                if (!selectedPitch) return setError('Selecciona una cancha');
                if (selectedTimes.length === 0) return setError('Selecciona al menos una hora');
                if (!customerName.trim()) return setError('Ingresa el nombre del cliente');
                setError('');
                setShowConfirm(true);
              }}
              disabled={loading || selectedTimes.length === 0 || !customerName.trim()}
              className="btn-primary py-2.5 px-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : 'Registrar Reserva'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal de Confirmación de Reserva Manual ── */}
      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card w-full max-w-md rounded-3xl shadow-2xl border border-border p-6 animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
                <Check size={24} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="font-black text-lg text-foreground tracking-tight">¿Confirmar reserva manual?</h3>
                <p className="text-xs text-muted-foreground">Revisa los datos antes de guardarla</p>
              </div>
            </div>

            <div className="bg-secondary/50 rounded-2xl p-4 border border-border/60 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-semibold">Cancha:</span>
                <span className="font-black text-foreground uppercase">{selectedPitch?.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-semibold">Cliente:</span>
                <span className="font-bold text-foreground capitalize">{customerName} {customerPhone ? `(${customerPhone})` : ''}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-semibold">Fecha:</span>
                <span className="font-bold text-foreground capitalize">{formattedDate}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-semibold">Horario:</span>
                <span className="font-bold text-primary">
                  {selectedTimes.sort().map(t => {
                    const hN = parseInt(t.split(':')[0]);
                    return `${hN > 12 ? hN - 12 : hN === 0 ? 12 : hN}:00 ${hN < 12 ? 'am' : 'pm'}`;
                  }).join(', ')}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border/50">
                <span className="text-muted-foreground font-semibold">Total a cobrar:</span>
                <span className="font-black text-sm text-emerald-600 dark:text-emerald-400">${totalPrice.toLocaleString('es-CO')}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-1 w-full">
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false);
                  handleCreate();
                }}
                disabled={loading}
                className="flex-1 py-3 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-[11px] sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {loading ? <Loader2 size={15} className="animate-spin shrink-0" /> : <Check size={15} className="shrink-0" />}
                <span className="truncate">{loading ? 'Guardando...' : 'Sí, confirmar'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={loading}
                className="flex-1 py-3 px-2 rounded-xl border border-border bg-secondary/80 hover:bg-secondary active:scale-98 text-foreground text-[11px] sm:text-sm font-bold transition-all text-center truncate"
              >
                Volver a revisar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
