'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  X,
  FileText,
  Calendar,
  Clock,
  User,
  Phone,
  StickyNote,
  ChevronRight,
  Check,
  Loader2,
  AlertCircle,
  Repeat,
  DollarSign,
} from 'lucide-react';
import { Pitch } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ContractBookingModalProps {
  pitches: Pitch[];
  onClose: () => void;
  onSuccess: () => void;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = [
  { key: 0, label: 'Dom', full: 'Domingo' },
  { key: 1, label: 'Lun', full: 'Lunes' },
  { key: 2, label: 'Mar', full: 'Martes' },
  { key: 3, label: 'Mié', full: 'Miércoles' },
  { key: 4, label: 'Jue', full: 'Jueves' },
  { key: 5, label: 'Vie', full: 'Viernes' },
  { key: 6, label: 'Sáb', full: 'Sábado' },
];

const ALL_SLOTS = [
  '06:00','07:00','08:00','09:00','10:00','11:00',
  '12:00','13:00','14:00','15:00','16:00','17:00',
  '18:00','19:00','20:00','21:00','22:00','23:00',
];

const DURATIONS = [
  { key: '1m', label: '1 Mes', weeks: 4 },
  { key: '3m', label: '3 Meses', weeks: 13 },
  { key: '6m', label: '6 Meses', weeks: 26 },
  { key: '1y', label: '1 Año', weeks: 52 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt12(slot: string) {
  const h = parseInt(slot.split(':')[0]);
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:00 ${ampm}`;
}

function formatCOP(n: number) {
  return `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}

/** Genera todas las fechas para un día de semana específico, desde 'from' durante 'weeks' semanas */
function generateDates(dayOfWeek: number, fromDate: Date, weeks: number): string[] {
  const dates: string[] = [];
  const start = new Date(fromDate);
  // Avanza hasta el próximo día de semana elegido
  const diff = (dayOfWeek - start.getDay() + 7) % 7;
  start.setDate(start.getDate() + diff);

  for (let i = 0; i < weeks; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i * 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${day}`);
  }
  return dates;
}

// ─── Steps ───────────────────────────────────────────────────────────────────

type Step = 'pitch' | 'schedule' | 'customer' | 'confirm';

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: 'pitch', label: 'Cancha', icon: <span className="text-base">⚽</span> },
  { key: 'schedule', label: 'Horario', icon: <Clock size={14} /> },
  { key: 'customer', label: 'Cliente', icon: <User size={14} /> },
  { key: 'confirm', label: 'Confirmar', icon: <Check size={14} /> },
];

// ─── Componente Principal ─────────────────────────────────────────────────────

export function ContractBookingModal({ pitches, onClose, onSuccess }: ContractBookingModalProps) {
  const supabase = createClient();

  // Paso actual
  const [step, setStep] = useState<Step>('pitch');

  // Cancha
  const [selectedPitch, setSelectedPitch] = useState<Pitch | null>(pitches[0] || null);

  // Horario
  const [selectedDays, setSelectedDays] = useState<number[]>([6]); // Sábado por defecto
  const [selectedSlots, setSelectedSlots] = useState<string[]>(['17:00']); // 5pm por defecto
  const [duration, setDuration] = useState<string>('1m');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });

  // Cliente
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNote, setCustomerNote] = useState('');

  // Envío
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const toggleDay = (d: number) => setSelectedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  const toggleSlot = (s: string) => setSelectedSlots(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const durationObj = DURATIONS.find(d => d.key === duration) || DURATIONS[0];

  // Calcula todas las fechas que se generarán
  const allDates = useMemo(() => {
    if (selectedDays.length === 0 || selectedSlots.length === 0) return [];
    const from = new Date(startDate + 'T12:00:00');
    const dates: string[] = [];
    selectedDays.forEach(d => {
      generateDates(d, from, durationObj.weeks).forEach(dt => dates.push(dt));
    });
    return dates.sort();
  }, [selectedDays, selectedSlots, startDate, durationObj.weeks]);

  // Precio por hora de la cancha
  const pricePerHour = useMemo(() => {
    if (!selectedPitch) return 0;
    return selectedPitch.price_per_hour || 0;
  }, [selectedPitch]);

  const totalSessions = allDates.length * selectedSlots.length;
  const totalPrice = totalSessions * pricePerHour;

  const pitchAllowedSlots: string[] | null = useMemo(() => {
    const slots = (selectedPitch as any)?.custom_pricing?.time_slots;
    if (Array.isArray(slots) && slots.length > 0) return slots;
    return null;
  }, [selectedPitch]);

  // ── Enviar ──────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!selectedPitch) return;
    if (selectedDays.length === 0) return setError('Selecciona al menos un día de la semana');
    if (selectedSlots.length === 0) return setError('Selecciona al menos un horario');
    if (!customerName.trim()) return setError('Ingresa el nombre del cliente');
    if (allDates.length === 0) return setError('No se generaron fechas para el contrato');

    setLoading(true);
    setError('');

    try {
      const { data: sessData } = await supabase.auth.getSession();
      const token = sessData?.session?.access_token;
      if (!token) throw new Error('No autorizado');

      const daysText = DAYS_OF_WEEK.filter(d => selectedDays.includes(d.key)).map(d => d.label).join(', ');
      const slotsText = selectedSlots.map(fmt12).join(', ');
      // Nombre que identifica claramente el contrato en la base de datos y calendario
      const contractCustomerName = `${customerName.trim()} [Contrato: ${daysText} ${slotsText}]`;
      const contractTag = `[CONTRATO FIJO · ${DAYS_OF_WEEK.filter(d => selectedDays.includes(d.key)).map(d => d.full).join(', ')} · ${slotsText}]`;
      const noteWithTag = `${contractTag}${customerNote ? ` · ${customerNote}` : ''}`;

      // Enviar fechas con feedback de progreso interactivo
      const BATCH = 20;
      let totalCreated = 0;
      let totalSkipped = 0;

      for (let dIdx = 0; dIdx < allDates.length; dIdx++) {
        const date = allDates[dIdx];
        setSuccessMsg(`Guardando reservas (${dIdx + 1}/${allDates.length} fechas)...`);

        for (let i = 0; i < selectedSlots.length; i += BATCH) {
          const slotsBatch = selectedSlots.slice(i, i + BATCH);
          const res = await fetch('/api/admin-actions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              action: 'create_manual_booking',
              payload: {
                pitch_id: selectedPitch.id,
                date,
                selected_times: slotsBatch,
                customer_name: contractCustomerName,
                customer_phone: customerPhone,
                note: noteWithTag,
                is_contract: true,
              },
            }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            totalCreated += (data.booking_ids?.length || 0);
            if (data.skipped_conflicts?.length) {
              totalSkipped += data.skipped_conflicts.length;
            }
          } else {
            console.warn('[ContractBooking] Slot warning en fecha:', date, slotsBatch, data.error);
          }
        }
      }

      if (totalCreated === 0) {
        throw new Error('No se pudo guardar ninguna reserva. Los horarios seleccionados podrían estar ya ocupados.');
      }

      const finishMsg = totalSkipped > 0
        ? `✅ Contrato guardado: ${totalCreated} reservas confirmadas (${totalSkipped} omitidas por cruce de horario).`
        : `✅ Contrato guardado: ${totalCreated} reservas registradas con éxito para ${customerName}`;

      setSuccessMsg(finishMsg);
      setTimeout(() => {
        onSuccess();
      }, 1800);
    } catch (err: any) {
      setError(err.message || 'Error al crear el contrato');
    } finally {
      setLoading(false);
    }
  }, [selectedPitch, selectedDays, selectedSlots, customerName, customerPhone, customerNote, allDates, supabase, onSuccess]);

  // ── Navegación entre pasos ──────────────────────────────────────────────────

  const canGoNext: Record<Step, boolean> = {
    pitch: !!selectedPitch,
    schedule: selectedDays.length > 0 && selectedSlots.length > 0,
    customer: customerName.trim().length >= 2,
    confirm: true,
  };

  const nextStep: Record<Step, Step | null> = {
    pitch: 'schedule',
    schedule: 'customer',
    customer: 'confirm',
    confirm: null,
  };

  const prevStep: Record<Step, Step | null> = {
    pitch: null,
    schedule: 'pitch',
    customer: 'schedule',
    confirm: 'customer',
  };

  const stepIdx = STEPS.findIndex(s => s.key === step);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-background border border-border rounded-3xl shadow-2xl w-full max-w-2xl max-h-[94vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0 bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/15 rounded-xl">
              <Repeat size={20} className="text-violet-500" />
            </div>
            <div>
              <h2 className="text-base font-black text-foreground">Turno Fijo / Contrato</h2>
              <p className="text-xs text-muted-foreground">Reservas recurrentes automáticas</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="px-5 pt-4 pb-3 shrink-0 border-b border-border bg-secondary/20">
          <div className="flex items-center gap-0">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center gap-0 flex-1 last:flex-initial">
                <button
                  onClick={() => i <= stepIdx && setStep(s.key)}
                  className={`flex items-center gap-1.5 text-xs font-bold transition-colors py-1 px-2 rounded-lg ${step === s.key
                    ? 'text-violet-500'
                    : i < stepIdx
                      ? 'text-[#008744] cursor-pointer'
                      : 'text-muted-foreground/50 cursor-not-allowed'
                    }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] shrink-0 border ${step === s.key
                    ? 'bg-violet-500 border-violet-500 text-white'
                    : i < stepIdx
                      ? 'bg-[#008744] border-[#008744] text-white'
                      : 'border-border bg-card text-muted-foreground'
                    }`}>
                    {i < stepIdx ? <Check size={9} /> : i + 1}
                  </span>
                  <span className="hidden sm:block">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <ChevronRight size={12} className="text-border mx-0.5 flex-1" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">

          {successMsg && (
            <div className="mb-4 p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-emerald-700 dark:text-emerald-300 text-sm font-bold text-center">
              {successMsg}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {/* ── STEP 1: Cancha ── */}
          {step === 'pitch' && (
            <div className="space-y-3">
              <h3 className="text-sm font-black text-foreground mb-3">Selecciona la cancha</h3>
              {pitches.map(p => {
                const img = (p as any).media_urls?.[0] || (p as any).image_url;
                const isSel = selectedPitch?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPitch(p)}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-all ${isSel
                      ? 'border-violet-500 bg-violet-500/10 shadow-md'
                      : 'border-border bg-card hover:border-violet-400/40'
                      }`}
                  >
                    <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-secondary border border-border">
                      {img
                        ? <img src={img} alt={p.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-xl">⚽</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm uppercase">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{(p as any).type || 'Fútbol'} · {(p as any).surface || ''}</p>
                      {p.price_per_hour ? (
                        <p className="text-xs font-bold text-[#008744] mt-0.5">{formatCOP(p.price_per_hour)}/hora</p>
                      ) : null}
                    </div>
                    {isSel && (
                      <div className="w-5 h-5 rounded-full bg-violet-500 text-white flex items-center justify-center shrink-0">
                        <Check size={11} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── STEP 2: Horario ── */}
          {step === 'schedule' && (
            <div className="space-y-5">
              {/* Días */}
              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">Días de la semana</label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS_OF_WEEK.map(d => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => toggleDay(d.key)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${selectedDays.includes(d.key)
                        ? 'bg-violet-500 text-white border-violet-500 shadow-md'
                        : 'bg-card border-border text-muted-foreground hover:border-violet-400/40'
                        }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Horarios */}
              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">Hora(s) del turno</label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {ALL_SLOTS.filter(s => !pitchAllowedSlots || pitchAllowedSlots.includes(s)).map(slot => {
                    const isSel = selectedSlots.includes(slot);
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => toggleSlot(slot)}
                        className={`py-2 rounded-xl text-xs font-bold border transition-all ${isSel
                          ? 'bg-violet-500 text-white border-violet-500 shadow'
                          : 'bg-card border-border text-muted-foreground hover:border-violet-400/40'
                          }`}
                      >
                        {fmt12(slot)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Duración */}
              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">Duración del contrato</label>
                <div className="grid grid-cols-4 gap-2">
                  {DURATIONS.map(d => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => setDuration(d.key)}
                      className={`py-2.5 rounded-xl text-xs font-bold border transition-all text-center ${duration === d.key
                        ? 'bg-violet-500 text-white border-violet-500'
                        : 'bg-card border-border text-muted-foreground hover:border-violet-400/40'
                        }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fecha de inicio */}
              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">Fecha de inicio</label>
                <input
                  type="date"
                  value={startDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setStartDate(e.target.value)}
                  className="border border-border bg-card rounded-xl px-3 py-2 text-sm font-medium"
                />
              </div>

              {/* Preview */}
              {allDates.length > 0 && (
                <div className="bg-violet-500/10 border border-violet-500/30 rounded-2xl p-3">
                  <p className="text-xs font-black text-violet-600 dark:text-violet-400 mb-1">
                    📋 Resumen: {allDates.length} fechas × {selectedSlots.length} hora{selectedSlots.length !== 1 ? 's' : ''} = <strong>{totalSessions} reservas</strong>
                  </p>
                  <p className="text-xs text-violet-500/80">
                    Primera fecha: {allDates[0]} · Última: {allDates[allDates.length - 1]}
                  </p>
                  {totalPrice > 0 && (
                    <p className="text-xs font-black text-violet-600 dark:text-violet-400 mt-1">
                      💰 Valor total estimado: {formatCOP(totalPrice)}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Cliente ── */}
          {step === 'customer' && (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-foreground mb-1">Datos del cliente</h3>

              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1.5">
                  <User size={12} /> Nombre completo *
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Nombre del cliente"
                  className="w-full border border-border bg-card rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1.5">
                  <Phone size={12} /> Teléfono / WhatsApp
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="3001234567"
                  className="w-full border border-border bg-card rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-1.5">
                  <StickyNote size={12} /> Notas del contrato
                </label>
                <textarea
                  value={customerNote}
                  onChange={e => setCustomerNote(e.target.value)}
                  placeholder="Ej: Grupo de amigos, pagan el mismo día..."
                  rows={3}
                  className="w-full border border-border bg-card rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500"
                />
              </div>
            </div>
          )}

          {/* ── STEP 4: Confirmar ── */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-foreground mb-3">Confirmar Contrato Fijo</h3>

              {/* Resumen */}
              <div className="bg-violet-500/10 border border-violet-500/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-violet-500/20 rounded-lg shrink-0">
                    <span className="text-lg">⚽</span>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase">Cancha</p>
                    <p className="font-black text-foreground">{selectedPitch?.name}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-violet-500/20 rounded-lg shrink-0">
                    <Calendar size={14} className="text-violet-500" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase">Días</p>
                    <p className="font-black text-foreground">
                      {DAYS_OF_WEEK.filter(d => selectedDays.includes(d.key)).map(d => d.full).join(', ')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {allDates.length} fechas · {durationObj.label}
                      {allDates[0] ? ` (${allDates[0]} al ${allDates[allDates.length - 1]})` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-violet-500/20 rounded-lg shrink-0">
                    <Clock size={14} className="text-violet-500" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase">Horarios</p>
                    <p className="font-black text-foreground">{selectedSlots.map(fmt12).join(', ')}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-violet-500/20 rounded-lg shrink-0">
                    <User size={14} className="text-violet-500" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase">Cliente</p>
                    <p className="font-black text-foreground">{customerName}</p>
                    {customerPhone && <p className="text-xs text-muted-foreground">{customerPhone}</p>}
                    {customerNote && <p className="text-xs italic text-muted-foreground mt-0.5">"{customerNote}"</p>}
                  </div>
                </div>

                {totalPrice > 0 && (
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-violet-500/20 rounded-lg shrink-0">
                      <DollarSign size={14} className="text-violet-500" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-muted-foreground uppercase">Valor estimado</p>
                      <p className="font-black text-violet-600 dark:text-violet-400 text-lg">{formatCOP(totalPrice)}</p>
                      <p className="text-xs text-muted-foreground">{totalSessions} sesiones × {formatCOP(pricePerHour)}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                <p className="text-xs text-amber-700 dark:text-amber-300 font-semibold">
                  ⚠️ Se crearán <strong>{totalSessions} reservas</strong> automáticamente. Los horarios que ya estén ocupados se omitirán sin bloquear el resto.
                </p>
              </div>

              <div className="bg-card border border-border rounded-xl p-3">
                <p className="text-xs text-muted-foreground">
                  🏷️ Cada reserva quedará marcada con la etiqueta <strong className="text-foreground">[CONTRATO FIJO]</strong> y el estado <strong className="text-[#008744]">Confirmado</strong>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="px-5 py-3 border-t border-border bg-card shrink-0 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              const prev = prevStep[step];
              if (prev) setStep(prev);
              else onClose();
            }}
            className="px-4 py-2 border border-border text-muted-foreground hover:text-foreground text-xs font-bold rounded-xl transition-colors"
          >
            {prevStep[step] ? 'Atrás' : 'Cancelar'}
          </button>

          {step !== 'confirm' ? (
            <button
              onClick={() => {
                if (!canGoNext[step]) return;
                const next = nextStep[step];
                if (next) setStep(next);
              }}
              disabled={!canGoNext[step]}
              className="px-5 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition-all flex items-center gap-2"
            >
              Siguiente <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading || !!successMsg}
              className="px-5 py-2 bg-[#008744] hover:bg-[#006633] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition-all flex items-center gap-2"
            >
              {loading ? (
                <><Loader2 size={14} className="animate-spin" /> Creando contrato…</>
              ) : (
                <><FileText size={14} /> Crear Contrato Fijo</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
