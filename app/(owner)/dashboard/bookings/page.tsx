'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import {
  Loader2, CheckCircle, XCircle, FileText, CalendarDays,
  LayoutList, Calendar as CalendarIcon, Plus, X, Download, Clock,
  ChevronLeft, ChevronRight, Wrench, Search, AlertTriangle, Bell,
  Receipt, DollarSign, Sparkles, Camera, Phone, BarChart3, Repeat
} from 'lucide-react';
import { useToday } from '@/lib/use-today';
import { ManualBookingModal } from '@/components/booking/ManualBookingModal';
import { BookingReportModal } from '@/components/booking/BookingReportModal';
import { ContractBookingModal } from '@/components/booking/ContractBookingModal';
import { CustomMonthCalendar } from '@/components/explore/CustomMonthCalendar';
import { isCombinedPitch, getConflictingPitchIds } from '@/lib/combined-pitch-utils';
import { RemainingPaymentModal } from '@/components/booking/RemainingPaymentModal';
import {
  getBookingRemainingPayment,
  getBookingOriginalProof,
  formatPaymentMethod,
  calculateRemainingBalance,
} from '@/lib/remaining-payment-utils';
import { SlotDetailModal } from '@/components/booking/SlotDetailModal';
import {
  saveOfflineData,
  getOfflineData,
  formatLastSync,
  precacheRecentProofs,
  getCachedProofUrl,
} from '@/lib/offline-storage';

const TIME_SLOTS = [
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'
];

type CalendarView = 'day' | 'week' | 'biweek' | 'month';

// Convierte cualquier fecha/ISO a "YYYY-MM-DD" respetando la zona horaria de Colombia
function getLocalDateString(dateInput: string | Date): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

// ── Shared AudioContext para evitar fuga de recursos ──────────────────────
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    if (!_audioCtx || _audioCtx.state === 'closed') _audioCtx = new AC();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    return _audioCtx;
  } catch { return null; }
}

function playNotificationSound() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    gain1.gain.setValueAtTime(0.12, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.35);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
    gain2.gain.setValueAtTime(0.18, ctx.currentTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.55);
  } catch (err) {
    console.warn('[AudioContext sound error]', err);
  }
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [pitches, setPitches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const supabase = createClient();
  const today = useToday();

  const [viewMode, setViewMode] = useState<'list' | 'schedule'>('list');
  const [calView, setCalView] = useState<CalendarView>('day');
  const [showReportModal, setShowReportModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [showManualBooking, setShowManualBooking] = useState(false);

  // Modal de visualización de comprobante enriquecido (Anticipo y Saldo)
  const [proofModalData, setProofModalData] = useState<{ url: string; title: string } | null>(null);

  // Estados de conectividad y caché local offline
  const [isOffline, setIsOffline] = useState(false);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<number | null>(null);

  // Helper para abrir comprobante resolviendo desde caché local si no hay internet
  const openProofModal = useCallback(async (url: string, title: string = 'Comprobante de Pago') => {
    if (!url) return;
    const resolvedUrl = await getCachedProofUrl(url);
    setProofModalData({ url: resolvedUrl, title });
  }, []);

  // Modal para registrar el pago restante en el local físico
  const [selectedBookingForRemainingPayment, setSelectedBookingForRemainingPayment] = useState<any | null>(null);

  // Sistema de Notificaciones en Vivo y Resaltado de Nuevas Reservas
  const [newlyArrivedIds, setNewlyArrivedIds] = useState<Set<string>>(new Set());
  const [liveNotification, setLiveNotification] = useState<{
    id: string;
    name: string;
    time: string;
    date: string;
    turns?: string[];
  } | null>(null);
  const notifiedPendingIdsRef = useRef<Set<string>>(new Set());

  // Estados de Animación de Transición de Estados
  const [animatingCard, setAnimatingCard] = useState<{
    bookingIds: string[];
    targetTab: 'pending_payment' | 'paid' | 'cancelled';
    targetLabel: string;
    color: 'sky' | 'emerald' | 'rose';
    text: string;
  } | null>(null);
  const [bumpTab, setBumpTab] = useState<string | null>(null);

  // Modal / Pestaña flotante para horarios interactivos
  const [selectedSlotDetail, setSelectedSlotDetail] = useState<{
    pitch: any;
    slot: string;
    dateStr: string;
    booking: any | null;
    isOperating: boolean;
  } | null>(null);
  const [manualBookingPrefill, setManualBookingPrefill] = useState<{
    pitchId?: string;
    date?: string;
    time?: string;
  } | null>(null);

  // Descartar notificación y resaltado al tocar o interactuar con la reserva
  const dismissNewArrival = (group: any) => {
    if (!group) return;
    if (liveNotification && group.bookings?.some((b: any) => b.id === liveNotification.id)) {
      setLiveNotification(null);
    }
    setNewlyArrivedIds(prev => {
      const hasAny = group.bookings?.some((b: any) => prev.has(b.id));
      if (!hasAny) return prev;
      const next = new Set(prev);
      group.bookings?.forEach((b: any) => next.delete(b.id));
      return next;
    });
  };

  // Estados de Filtros
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [listDateFilter, setListDateFilter] = useState<'all' | 'selected'>('selected');

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  // ── 0. Carga Inmediata Offline-First y Detección de Conexión ──
  useEffect(() => {
    // 1. Hidratar estado inmediatamente desde almacenamiento local si existe
    const cached = getOfflineData();
    if (cached) {
      if (cached.pitches?.length > 0) setPitches(cached.pitches);
      if (cached.bookings?.length > 0) setBookings(cached.bookings);
      if (cached.timestamp) setLastSyncTimestamp(cached.timestamp);
      // Con datos locales en memoria, no bloquear la vista con spinner
      setLoading(false);
    }

    // 2. Monitorear cambios de red online / offline
    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine);
      const handleOnline = () => {
        setIsOffline(false);
        fetchBookingsRef.current(true);
      };
      const handleOffline = () => {
        setIsOffline(true);
      };
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  useEffect(() => {
    if (today && !selectedDate) setSelectedDate(today);
  }, [today]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('search');
      const st = params.get('status');
      if (q) {
        setSearchQuery(q);
        setListDateFilter('all');
        setViewMode('list');
      }
      if (st) {
        setFilterStatus(st);
        setListDateFilter('all');
        setViewMode('list');
      }
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setIsCalendarOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchBookingsAndPitches = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      if (!user?.id) {
        if (!isSilent) setLoading(false);
        return;
      }
      const { data: company, error: companyErr } = await supabase
        .from('companies')
        .select('id, name')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (company?.name && !companyName) setCompanyName(company.name);

      if (companyErr) {
        console.warn('[fetchBookings error fetching company]:', companyErr);
      }

      if (company) {
        const { data: pitchesData } = await supabase
          .from('pitches')
          .select('*')
          .eq('company_id', company.id);
        if (pitchesData) setPitches(pitchesData);

        const { data: bookingsData } = await supabase
          .from('bookings')
          .select(`*, pitches!inner (name, company_id, price_per_hour, custom_pricing, booking_percentage)`)
          .eq('pitches.company_id', company.id)
          .neq('status', 'draft')
          .order('created_at', { ascending: false });

        if (bookingsData) {
          setBookings(bookingsData);
          saveOfflineData(company, pitchesData || [], bookingsData);
          precacheRecentProofs(bookingsData);
          setLastSyncTimestamp(Date.now());
        }
      }
    } catch (err) {
      console.warn('[fetchBookings error or offline]:', err);
      // Fallback offline: hidratar desde almacenamiento local si falló la red
      const cached = getOfflineData();
      if (cached) {
        if (cached.pitches?.length > 0) setPitches(cached.pitches);
        if (cached.bookings?.length > 0) setBookings(cached.bookings);
        if (cached.timestamp) setLastSyncTimestamp(cached.timestamp);
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [user?.id]);

  const fetchBookingsRef = useRef(fetchBookingsAndPitches);
  useEffect(() => {
    fetchBookingsRef.current = fetchBookingsAndPitches;
  }, [fetchBookingsAndPitches]);

  // Sincronización en Tiempo Real con Supabase (Realtime WebSockets) + Polling de Respaldo
  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    fetchBookingsRef.current(false);

    let channel: any = null;
    let pollTimer: any = null;
    let isCancelled = false;

    const setupLiveSync = async () => {
      try {
        const { data: company } = await supabase
          .from('companies')
          .select('id')
          .eq('owner_id', user.id)
          .maybeSingle();

        if (!company || isCancelled) return;

        // Limpiar canal previo si existía en esta instancia
        if (channel) {
          supabase.removeChannel(channel);
          channel = null;
        }

        // Canal único por montaje para evitar colisión de callbacks post-subscribe en Supabase Realtime
        const channelName = `owner-bookings-live-${company.id}-${Math.random().toString(36).slice(2, 8)}`;
        const newChannel = supabase.channel(channelName);

        newChannel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookings',
          },
          (payload: any) => {
            console.log('[Realtime Event on Bookings]', payload.eventType, payload.new?.id);

            const newStatus = payload.new?.status;
            const hasProof = Boolean(payload.new?.payment_proof_url);
            // El usuario pidió expresamente:
            // "la notificacion de nueva reserva recibida debe ser unicamente cuando el cliente sube la foto del comprobante y presiona el boton reservar de lo contrario no salga"
            const isSubmittedPending = newStatus === 'pending' && hasProof;
            const isFreshArrival =
              (payload.eventType === 'INSERT' && isSubmittedPending) ||
              (payload.eventType === 'UPDATE' && isSubmittedPending && payload.old?.status !== 'pending');

            if (isFreshArrival && payload.new?.id && !notifiedPendingIdsRef.current.has(payload.new.id)) {
              notifiedPendingIdsRef.current.add(payload.new.id);
              // Resaltar la nueva reserva y sonar la alerta auditiva
              setNewlyArrivedIds(prev => new Set(prev).add(payload.new.id));
              playNotificationSound();

              const cName = payload.new?.customer_name || 'Nuevo cliente';
              const sDate = payload.new?.start_time
                ? new Date(payload.new.start_time).toLocaleDateString('es-CO', {
                  day: 'numeric',
                  month: 'short',
                  weekday: 'short',
                  timeZone: 'America/Bogota',
                })
                : '';

              const singleTurn = payload.new?.start_time && payload.new?.end_time
                ? `${new Date(payload.new.start_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })} – ${new Date(payload.new.end_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })}`
                : (payload.new?.start_time ? new Date(payload.new.start_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }) : '');

              setLiveNotification({
                id: payload.new.id,
                name: cName,
                time: singleTurn,
                date: sDate,
                turns: singleTurn ? [singleTurn] : [],
              });

              // Si tiene comprobante o usuario, buscar de inmediato reservas hermanas para listar todos los turnos uno por uno en la notificación
              (async () => {
                try {
                  let siblings: any[] = [];
                  if (payload.new.payment_proof_url) {
                    const { data } = await supabase
                      .from('bookings')
                      .select('id, start_time, end_time')
                      .eq('payment_proof_url', payload.new.payment_proof_url)
                      .order('start_time', { ascending: true });
                    if (data && data.length > 0) siblings = data;
                  } else if (payload.new.user_id && payload.new.created_at) {
                    const bTime = new Date(payload.new.created_at).getTime();
                    const { data } = await supabase
                      .from('bookings')
                      .select('id, start_time, end_time')
                      .eq('user_id', payload.new.user_id)
                      .gte('created_at', new Date(bTime - 60000).toISOString())
                      .lte('created_at', new Date(bTime + 60000).toISOString())
                      .order('start_time', { ascending: true });
                    if (data && data.length > 0) siblings = data;
                  }

                  if (siblings.length > 0) {
                    siblings.forEach(s => {
                      notifiedPendingIdsRef.current.add(s.id);
                      setNewlyArrivedIds(prev => new Set(prev).add(s.id));
                    });

                    const allTurns = siblings.map(s => {
                      const st = new Date(s.start_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
                      const et = new Date(s.end_time).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
                      return `${st} – ${et}`;
                    });

                    setLiveNotification({
                      id: payload.new.id,
                      name: cName,
                      time: allTurns.join(', '),
                      date: sDate,
                      turns: allTurns,
                    });
                  }
                } catch (e) {
                  console.error('[Live notification sibling fetch error]:', e);
                }
              })();
            }

            // Recargar silenciosamente las reservas para actualizar la vista sin recargar la página
            fetchBookingsRef.current(true);
          }
        );

        if (isCancelled) {
          supabase.removeChannel(newChannel);
          return;
        }

        channel = newChannel;
        newChannel.subscribe();

        // 2. Polling de respaldo cada 25 segundos (asegura actualización garantizada)
        pollTimer = setInterval(() => {
          if (typeof navigator !== 'undefined' && navigator.onLine) {
            fetchBookingsRef.current(true);
          }
        }, 25000);
      } catch (err) {
        console.error('[setupLiveSync error]:', err);
      }
    };

    setupLiveSync();

    return () => {
      isCancelled = true;
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [user?.id]);

  const [cancelConfirm, setCancelConfirm] = useState<{ id: string; name: string; time: string; total_price?: number; deposit_amount?: number } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [approveConfirm, setApproveConfirm] = useState<{ id: string; name: string; time: string } | null>(null);
  const [approving, setApproving] = useState(false);
  const [batchApproveConfirm, setBatchApproveConfirm] = useState<{
    ids: string[];
    name: string;
    bookings: any[];
    hours: string[];
    pitchName: string;
    totalPrice: number;
    depositAmount: number;
    dateStr: string;
  } | null>(null);
  const [batchApproving, setBatchApproving] = useState(false);
  const [batchCancelling, setBatchCancelling] = useState(false);
  const [batchCancelConfirm, setBatchCancelConfirm] = useState<{ ids: string[]; label: string } | null>(null);

  const triggerStatusAnimation = (
    ids: string[],
    targetTab: 'pending_payment' | 'paid' | 'cancelled',
    targetLabel: string,
    color: 'sky' | 'emerald' | 'rose',
    text: string,
    customerName?: string
  ) => {
    setAnimatingCard({
      bookingIds: ids,
      targetTab,
      targetLabel,
      color,
      text,
    });
    setBumpTab(targetTab);
    setTimeout(() => {
      setAnimatingCard(null);
    }, 700);
    setTimeout(() => {
      setBumpTab(null);
    }, 2200);
  };

  const updateStatus = async (id: string, newStatus: 'confirmed' | 'cancelled') => {
    try {
      const bTarget = bookings.find(b => b.id === id);
      if (newStatus === 'confirmed') {
        const tPrice = Number(bTarget?.total_price || bTarget?.pitches?.price_per_hour || 0);
        const dAmount = Number(bTarget?.deposit_amount || 0);
        const remPaid = Number(bTarget?.remaining_amount_paid || 0);
        const bal = calculateRemainingBalance(tPrice, dAmount, remPaid);
        const targetTab = bal > 0 ? 'pending_payment' : 'paid';
        const targetLabel = bal > 0 ? 'Por Cobrar' : 'Cobradas';
        triggerStatusAnimation(
          [id],
          targetTab,
          targetLabel,
          bal > 0 ? 'sky' : 'emerald',
          bal > 0 ? '¡Aprobada! Trasladando a Por Cobrar ➔' : '¡Aprobada y Pagada! Trasladando a Cobradas ➔',
          bTarget?.customer_name
        );
      } else if (newStatus === 'cancelled') {
        triggerStatusAnimation(
          [id],
          'cancelled',
          'Canceladas',
          'rose',
          '¡Cancelada! Trasladando a Canceladas ➔',
          bTarget?.customer_name
        );
      }

      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/bookings/batch-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ids: [id], action: newStatus === 'confirmed' ? 'confirm' : 'cancel' }),
      });
      const json = await res.json();
      if (res.ok) {
        setBookings(prev => prev.map(b => b.id === id
          ? { ...b, status: newStatus, payment_status: newStatus === 'confirmed' ? 'verified' : 'rejected', reviewed_at: new Date().toISOString() }
          : b
        ));
      } else {
        console.error('[updateStatus] error:', json?.error);
      }
    } catch (err) {
      console.error('[updateStatus] unexpected error:', err);
    }
  };

  const handleCancelRequest = (booking: any) => {
    const startTime = new Date(booking.start_time);
    const timeStr = startTime.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
    const dateStr = startTime.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
    const tPrice = booking.total_price || booking.pitches?.price_per_hour || 80000;
    let dAmount = booking.deposit_amount || 0;

    if (dAmount === 0 && booking.pitches) {
      const customPricing = booking.pitches.custom_pricing || {};
      const isFixed = customPricing.booking_type === 'fixed';
      const pct = customPricing.booking_percentage || booking.pitches.booking_percentage || 50;

      // Calculate how many hours this booking is (assuming 1 hour for now since most are 1 slot)
      // Since booking.start_time and booking.end_time define the length:
      const start = new Date(booking.start_time);
      const end = booking.end_time ? new Date(booking.end_time) : new Date(start.getTime() + 60 * 60 * 1000);
      const hoursCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60)));

      if (isFixed) {
        dAmount = Number(customPricing.booking_fixed || 0) * hoursCount;
      } else {
        dAmount = (tPrice * Number(pct)) / 100;
      }
    }

    setCancelConfirm({
      id: booking.id,
      name: booking.customer_name || 'Anónimo',
      time: `${dateStr} · ${timeStr}`,
      total_price: tPrice,
      deposit_amount: dAmount
    });
  };

  const confirmCancel = async () => {
    if (!cancelConfirm) return;
    setCancelling(true);
    await updateStatus(cancelConfirm.id, 'cancelled');
    setCancelling(false);
    setCancelConfirm(null);
  };

  const handleApproveRequest = (booking: any) => {
    const startTime = new Date(booking.start_time);
    const timeStr = startTime.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
    const dateStr = startTime.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
    setApproveConfirm({
      id: booking.id,
      name: booking.customer_name || 'Anónimo',
      time: `${dateStr} · ${timeStr}`,
    });
  };

  const confirmApprove = async () => {
    if (!approveConfirm) return;
    setApproving(true);
    await updateStatus(approveConfirm.id, 'confirmed');
    setApproving(false);
    setApproveConfirm(null);
  };

  // Aprobar todas las reservas pendientes de un grupo en batch
  const handleBatchApproveRequest = (bookingsList: any[], customerName: string, pitchName: string, totalPrice: number, depositAmount: number) => {
    const pendingList = bookingsList.filter((b: any) => b.status === 'pending');
    if (pendingList.length === 0) return;

    const ids = pendingList.map((b: any) => b.id);
    const sorted = [...pendingList].sort(
      (a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

    const firstDate = new Date(sorted[0].start_time);
    const dateStr = firstDate.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'America/Bogota',
    });

    const hours = sorted.map((b: any) => {
      const s = new Date(b.start_time).toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Bogota',
      });
      const e = b.end_time
        ? new Date(b.end_time).toLocaleTimeString('es-CO', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'America/Bogota',
        })
        : '';
      return e ? `${s} - ${e}` : s;
    });

    setBatchApproveConfirm({
      ids,
      name: customerName || 'Anónimo',
      bookings: sorted,
      hours,
      pitchName: pitchName || 'Cancha',
      totalPrice,
      depositAmount,
      dateStr,
    });
  };

  const confirmBatchApprove = async () => {
    if (!batchApproveConfirm) return;
    setBatchApproving(true);
    const { ids, totalPrice, depositAmount, name } = batchApproveConfirm;
    try {
      const bal = calculateRemainingBalance(totalPrice, depositAmount, 0);
      const targetTab = bal > 0 ? 'pending_payment' : 'paid';
      const targetLabel = bal > 0 ? 'Por Cobrar' : 'Cobradas';
      triggerStatusAnimation(
        ids,
        targetTab,
        targetLabel,
        bal > 0 ? 'sky' : 'emerald',
        bal > 0 ? `¡${ids.length} horas aprobadas! Moviendo a Por Cobrar ➔` : `¡${ids.length} horas aprobadas! Moviendo a Cobradas ➔`,
        name
      );

      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/bookings/batch-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ids, action: 'confirm' }),
      });
      const json = await res.json();
      if (res.ok) {
        setBookings(prev => prev.map(b => ids.includes(b.id)
          ? { ...b, status: 'confirmed', payment_status: 'verified', reviewed_at: new Date().toISOString() }
          : b
        ));
      } else {
        console.error('[confirmBatchApprove] error:', json?.error);
      }
    } catch (err) {
      console.error('[confirmBatchApprove] unexpected error:', err);
    }
    setBatchApproving(false);
    setBatchApproveConfirm(null);
  };

  // Rechazar todas las reservas de un grupo en batch (una sola query)
  const handleBatchCancelRequest = (bookingsList: any[], label: string) => {
    const ids = bookingsList.map((b: any) => b.id);
    if (ids.length === 0) return;
    setBatchCancelConfirm({ ids, label });
  };

  const confirmBatchCancel = async () => {
    if (!batchCancelConfirm) return;
    setBatchCancelling(true);
    const { ids } = batchCancelConfirm;
    try {
      triggerStatusAnimation(
        ids,
        'cancelled',
        'Canceladas',
        'rose',
        `¡${ids.length} horas canceladas! Moviendo a Canceladas ➔`,
        'Reserva'
      );
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/bookings/batch-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ids, action: 'cancel' }),
      });
      const json = await res.json();
      if (res.ok) {
        setBookings(prev => prev.map(b => ids.includes(b.id)
          ? { ...b, status: 'cancelled', payment_status: 'rejected', reviewed_at: new Date().toISOString() }
          : b
        ));
      } else {
        console.error('[confirmBatchCancel] error:', json?.error);
      }
    } catch (err) {
      console.error('[confirmBatchCancel] unexpected error:', err);
    }
    setBatchCancelling(false);
    setBatchCancelConfirm(null);
  };

  // Manejar actualización exitosa del pago restante en local físico sin caídas
  const handleRemainingPaymentSuccess = (updatedData: any, bookingIds?: string[]) => {
    setSelectedBookingForRemainingPayment(null);
    const targetIds = Array.isArray(bookingIds)
      ? bookingIds
      : Array.isArray(updatedData?.bookingIds)
        ? updatedData.bookingIds
        : [];

    if (targetIds.length > 0) {
      const bObj = bookings.find(b => targetIds.includes(b.id));
      triggerStatusAnimation(
        targetIds,
        'paid',
        'Cobradas',
        'emerald',
        '¡Saldo cobrado con éxito! Moviendo a Cobradas ➔',
        bObj?.customer_name
      );

      setBookings(prev =>
        prev.map(b => {
          if (!targetIds.includes(b.id)) return b;
          return {
            ...b,
            remaining_payment_status: 'completed',
            remaining_amount_paid: updatedData?.amount || b.remaining_amount_paid,
            remaining_payment_method: updatedData?.method || b.remaining_payment_method,
            remaining_payment_proof_url: updatedData?.proofUrl || updatedData?.proof_url || b.remaining_payment_proof_url,
            remaining_paid_at: updatedData?.at || new Date().toISOString(),
          };
        })
      );
    }

    // Recargar datos en segundo plano para sincronizar al 100% con Supabase
    fetchBookingsRef.current(true);
  };

  // Genera el rango de fechas continuas "YYYY-MM-DD" sin errores de zona horaria
  const getDaysRange = useCallback((startDate: string, view: CalendarView): string[] => {
    if (view === 'month') return [];
    const count = view === 'day' ? 1 : view === 'week' ? 7 : 15;
    const result: string[] = [];

    if (view === 'week' || view === 'biweek') {
      // Últimos 7 o 15 días, contando exactamente desde hoy hacia atrás
      const today = new Date();
      for (let i = count - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        result.push(getLocalDateString(d));
      }
      return result;
    }

    if (!startDate) return [];
    const [y, m, d] = startDate.split('-').map(Number);
    const baseDate = new Date(y, m - 1, d);
    for (let i = 0; i < count; i++) {
      const nextDate = new Date(baseDate);
      nextDate.setDate(baseDate.getDate() + i);
      result.push(getLocalDateString(nextDate));
    }
    return result;
  }, []);

  // Filtrado Unificado para la Lista
  const filteredBookings = useMemo(() => {
    const rangeDates = getDaysRange(selectedDate, calView);

    return bookings.filter(b => {
      // 1. Filtro por estado / categoría
      let matchStatus = true;
      if (filterStatus === 'manual') {
        matchStatus = b.source === 'owner_panel';
      } else if (filterStatus === 'pending') {
        matchStatus = b.status === 'pending';
      } else if (filterStatus === 'pending_payment') {
        // Reservas confirmadas con saldo pendiente por cobrar en el local
        const tPrice = Number(b.pitches?.price_per_hour || 0);
        const pct = b.pitches?.booking_percentage ?? 50;
        const dAmount = (tPrice * Number(pct)) / 100;
        const remInfo = getBookingRemainingPayment(b);
        const remPaid = Number(remInfo?.amount || 0);
        const bal = calculateRemainingBalance(tPrice, dAmount, remPaid);
        matchStatus = b.status === 'confirmed' && bal > 0;
      } else if (filterStatus === 'paid') {
        // Reservas confirmadas con saldo 100% cubierto / pagado
        const remInfo = getBookingRemainingPayment(b);
        const remPaid = Number(remInfo?.amount || 0);
        matchStatus = b.status === 'confirmed' && remPaid > 0;
      } else if (filterStatus === 'confirmed') {
        matchStatus = b.status === 'confirmed';
      } else if (filterStatus === 'cancelled') {
        matchStatus = b.status === 'cancelled';
      }

      // 2. Filtro por Fecha con Zona Horaria Exacta
      let matchDate = true;
      if (listDateFilter === 'selected' && selectedDate) {
        const matchDateStr = getLocalDateString(b.start_time);
        const createdDateStr = b.created_at ? getLocalDateString(b.created_at) : '';

        if (calView === 'month') {
          matchDate = matchDateStr.substring(0, 7) === selectedDate.substring(0, 7) ||
            (createdDateStr ? createdDateStr.substring(0, 7) === selectedDate.substring(0, 7) : false);
        } else {
          // Coincide si el partido está programado en este rango O si la reserva fue REALIZADA (creada) en este rango
          matchDate = rangeDates.includes(matchDateStr) || (createdDateStr ? rangeDates.includes(createdDateStr) : false);
        }
      }

      // 3. Búsqueda por Texto
      let matchQuery = true;
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const customerName = (b.customer_name || '').toLowerCase();
        const customerPhone = (b.customer_phone || '').toLowerCase();
        const pitchName = (b.pitches?.name || '').toLowerCase();

        matchQuery = customerName.includes(query) || customerPhone.includes(query) || pitchName.includes(query);
      }

      return matchStatus && matchDate && matchQuery;
    });
  }, [bookings, filterStatus, listDateFilter, selectedDate, calView, searchQuery, getDaysRange]);

  // Todas las pendientes del complejo en total
  const allPendingBookings = useMemo(() => {
    return bookings.filter(b => b.status === 'pending');
  }, [bookings]);

  // Reservas pendientes que son para fechas fuera del filtro actual
  const pendingOutsideCurrentFilter = useMemo(() => {
    if (listDateFilter !== 'selected' || !selectedDate) return [];
    const rangeDates = getDaysRange(selectedDate, calView);

    return allPendingBookings.filter(b => {
      const matchDateStr = getLocalDateString(b.start_time);
      const createdDateStr = b.created_at ? getLocalDateString(b.created_at) : '';
      const inRange = rangeDates.includes(matchDateStr) || (createdDateStr ? rangeDates.includes(createdDateStr) : false);
      return !inRange;
    });
  }, [allPendingBookings, listDateFilter, selectedDate, calView, getDaysRange]);

  const groupedBookings = useMemo(() => {
    const groupsList: any[] = [];

    // Ordenar reservas cronológicamente para agrupar las hechas en el mismo momento
    const sorted = [...filteredBookings].sort(
      (a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

    sorted.forEach((b: any) => {
      const bProof = b.payment_proof_url?.trim() || null;
      const bCreated = new Date(b.created_at || b.start_time).getTime();
      const bDateStr = getLocalDateString(b.start_time);

      // Buscar si ya existe un grupo que pertenezca a la misma reserva/transacción
      const existingGroup = groupsList.find((g: any) => {
        if (g.status !== b.status) return false;

        // 1. Si ambos tienen comprobante de pago: deben ser idénticos para agruparse
        //    (Incluso si son canchas diferentes, si comparten el mismo comprobante pertenecen a la misma compra)
        if (bProof && g.payment_proof_url) {
          return bProof === g.payment_proof_url;
        }

        // Si uno tiene comprobante y el otro no, son reservas distintas
        if (Boolean(bProof) !== Boolean(g.payment_proof_url)) {
          return false;
        }

        // Si son canchas distintas y no hay comprobante, no agrupar
        if (g.pitch_id !== b.pitch_id) return false;

        // 2. Si no tienen comprobante: mismo cliente, misma fecha y creados al mismo tiempo
        const isManual = b.source === 'owner_panel' || g.source === 'owner_panel';
        const sameCustomer = (b.customer_name || '').trim().toLowerCase() === (g.customer_name || '').trim().toLowerCase();
        const gDateStr = getLocalDateString(g.start_time);
        const gCreated = new Date(g.created_at || g.start_time).getTime();
        const diffMs = Math.abs(bCreated - gCreated);

        if (isManual) {
          // En reservas manuales, solo se agrupan las horas añadidas en el mismo formulario (diffMs <= 2.5s)
          return sameCustomer && bDateStr === gDateStr && diffMs <= 2500;
        }

        return sameCustomer && bDateStr === gDateStr && diffMs <= 3 * 60 * 1000;
      });

      const tPrice = b.total_price || b.pitches?.price_per_hour || 80000;
      let dAmount = b.deposit_amount || 0;
      if (dAmount === 0 && b.pitches) {
        const customPricing = b.pitches.custom_pricing || {};
        const isFixed = customPricing.booking_type === 'fixed';
        const pct = customPricing.booking_percentage || b.pitches.booking_percentage || 50;
        const start = new Date(b.start_time);
        const end = b.end_time ? new Date(b.end_time) : new Date(start.getTime() + 60 * 60 * 1000);
        const hoursCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60)));
        if (isFixed) {
          dAmount = Number(customPricing.booking_fixed || 0) * hoursCount;
        } else {
          dAmount = (tPrice * Number(pct)) / 100;
        }
      }

      const remainingInfo = getBookingRemainingPayment(b);
      const bRemainingPaid = Number(remainingInfo?.amount || 0);
      const bRemainingMethod = remainingInfo?.method || null;
      const bRemainingProof = remainingInfo?.proofUrl || null;
      const bRemainingPaidAt = remainingInfo?.at || null;

      if (existingGroup) {
        existingGroup.bookings.push(b);
        existingGroup.total_price += tPrice;
        existingGroup.deposit_amount += dAmount;
        if (!existingGroup.pitch_ids) {
          existingGroup.pitch_ids = [existingGroup.pitch_id];
        }
        if (!existingGroup.pitch_ids.includes(b.pitch_id)) {
          existingGroup.pitch_ids.push(b.pitch_id);
        }
        const bPName = b.pitches?.name;
        if (bPName && !existingGroup.pitch_names?.includes(bPName)) {
          existingGroup.pitch_names = [...(existingGroup.pitch_names || [existingGroup.pitches?.name || 'Cancha']), bPName];
        }
        if (b.payment_proof_url && !existingGroup.payment_proof_url) {
          existingGroup.payment_proof_url = b.payment_proof_url;
        }
        if (bRemainingPaid > 0) {
          existingGroup.remaining_amount_paid = (existingGroup.remaining_amount_paid || 0) + bRemainingPaid;
        }
        if (bRemainingMethod && !existingGroup.remaining_payment_method) {
          existingGroup.remaining_payment_method = bRemainingMethod;
        }
        if (bRemainingProof && !existingGroup.remaining_payment_proof_url) {
          existingGroup.remaining_payment_proof_url = bRemainingProof;
        }
        if (bRemainingPaidAt && !existingGroup.remaining_paid_at) {
          existingGroup.remaining_paid_at = bRemainingPaidAt;
        }
        if (remainingInfo?.splits && !existingGroup.remaining_payment_splits) {
          existingGroup.remaining_payment_splits = remainingInfo.splits;
        }
        if (new Date(b.start_time) < new Date(existingGroup.start_time)) {
          existingGroup.start_time = b.start_time;
        }
        if (b.created_at && (!existingGroup.created_at || new Date(b.created_at).getTime() > new Date(existingGroup.created_at).getTime())) {
          existingGroup.created_at = b.created_at;
        }
      } else {
        const key = `${b.pitch_id}-${b.customer_name || 'Anon'}-${bDateStr}-${b.status}-${bProof || b.id}`;
        groupsList.push({
          key,
          id: b.id,
          pitch_id: b.pitch_id,
          pitch_ids: [b.pitch_id],
          pitch_names: [b.pitches?.name || 'Cancha'],
          status: b.status,
          customer_name: b.customer_name,
          customer_phone: b.customer_phone,
          pitches: b.pitches,
          start_time: b.start_time,
          source: b.source,
          payment_proof_url: b.payment_proof_url,
          remaining_amount_paid: bRemainingPaid,
          remaining_payment_method: bRemainingMethod,
          remaining_payment_proof_url: bRemainingProof,
          remaining_paid_at: bRemainingPaidAt,
          remaining_payment_splits: remainingInfo?.splits || null,
          created_at: b.created_at,
          bookings: [b],
          total_price: tPrice,
          deposit_amount: dAmount,
        });
      }
    });

    // Ordenar reservas dentro de cada grupo por start_time para mostrar las horas consecutivas en orden
    groupsList.forEach(g => {
      g.bookings.sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    });

    // Ordenar los grupos según vayan llegando (created_at más reciente siempre arriba primero)
    return groupsList.sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : new Date(a.start_time).getTime();
      const timeB = b.created_at ? new Date(b.created_at).getTime() : new Date(b.start_time).getTime();
      return timeB - timeA;
    });
  }, [filteredBookings]);

  const formatSelectedDateText = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-4 space-y-4">
      {/* Banner Informativo de Modo Sin Conexión */}
      {isOffline && (
        <div className="px-4 py-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs font-semibold flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span className="truncate">
              <strong>Modo Sin Conexión</strong> · Mostrando canchas, reservas y horarios guardados ({formatLastSync(lastSyncTimestamp || 0)}).
            </span>
          </div>
          <span className="text-[10px] uppercase font-black bg-amber-500 text-white px-2 py-0.5 rounded-lg shrink-0">
            Offline
          </span>
        </div>
      )}

      {/* Header Principal */}
      <div className="card-heading flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Gestión de Reservas</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Administra abonos, estados y disponibilidad de tus canchas.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
          <div className="flex bg-secondary p-1 rounded-xl border border-border flex-1 sm:flex-initial">
            <button
              onClick={() => setViewMode('list')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-card text-primary shadow-sm border border-border/60' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <LayoutList size={15} /> Lista
            </button>
            <button
              onClick={() => setViewMode('schedule')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'schedule' ? 'bg-card text-primary shadow-sm border border-border/60' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <CalendarIcon size={15} /> Horarios
            </button>
          </div>
          <button
            onClick={() => setShowReportModal(true)}
            className="flex items-center gap-2 px-3 py-2 border border-border bg-card hover:bg-secondary text-xs font-bold rounded-xl transition-all w-full sm:w-auto justify-center"
          >
            <BarChart3 size={15} className="text-[#008744]" /> Reporte
          </button>
          <button
            onClick={() => setShowContractModal(true)}
            className="flex items-center gap-2 px-3 py-2 border border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20 text-violet-600 dark:text-violet-400 text-xs font-bold rounded-xl transition-all w-full sm:w-auto justify-center"
          >
            <Repeat size={15} /> Turno Fijo
          </button>
          <button
            onClick={() => setShowManualBooking(true)}
            className="btn-primary py-2 px-4 flex items-center justify-center gap-2 text-xs font-bold rounded-xl w-full sm:w-auto"
          >
            <Plus size={16} /> Nueva Reserva
          </button>
        </div>
      </div>

      {/* Control Superior de Fecha y Filtros de Rango */}
      <div className="bg-card p-3 rounded-2xl border border-border shadow-sm flex flex-wrap items-center justify-between gap-3">
        {/* Selector de Fecha Flotante */}
        <div className="relative" ref={calendarRef}>
          <button
            onClick={() => setIsCalendarOpen(!isCalendarOpen)}
            className="flex items-center gap-2 px-3 py-2 bg-secondary/80 hover:bg-secondary border border-border rounded-xl text-xs font-bold transition-all"
          >
            <CalendarIcon size={16} className="text-primary" />
            <span>
              Fecha:{' '}
              <strong className="text-foreground capitalize">
                {calView === 'week'
                  ? 'Últimos 7 días'
                  : calView === 'biweek'
                    ? 'Últimos 15 días'
                    : calView === 'month'
                      ? 'Mes completo'
                      : selectedDate
                        ? formatSelectedDateText(selectedDate)
                        : 'Seleccionar'}
              </strong>
            </span>
          </button>

          {isCalendarOpen && (
            <div className="absolute top-full left-0 mt-2 z-50 bg-card p-4 rounded-2xl border border-border shadow-2xl min-w-[280px] sm:min-w-[310px] animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-border">
                <span className="text-xs font-bold text-muted-foreground uppercase">Seleccionar Fecha</span>
                <button onClick={() => setIsCalendarOpen(false)} className="p-1 text-muted-foreground hover:text-foreground rounded-lg">
                  <X size={16} />
                </button>
              </div>

              <CustomMonthCalendar
                selectedDate={selectedDate}
                onSelectDate={(date) => {
                  setSelectedDate(date);
                  setListDateFilter('selected');
                  setIsCalendarOpen(false);
                }}
                minDate={undefined}
              />

              {viewMode === 'list' && (
                <div className="pt-3 border-t border-border mt-2 flex gap-2">
                  <button
                    onClick={() => { setListDateFilter('all'); setIsCalendarOpen(false); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all ${listDateFilter === 'all' ? 'bg-primary text-white border-primary' : 'bg-secondary text-muted-foreground'}`}
                  >
                    Ver Todas
                  </button>
                  <button
                    onClick={() => { setListDateFilter('selected'); setIsCalendarOpen(false); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all ${listDateFilter === 'selected' ? 'bg-primary text-white border-primary' : 'bg-secondary text-muted-foreground'}`}
                  >
                    Filtrar por Rango
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Botones de Rango (Día, Semana, 15 Días, Mes) */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          {[
            { key: 'day', label: 'Hoy', icon: '' },
            { key: 'week', label: 'Semana', icon: '' },
            { key: 'biweek', label: 'Quincena', icon: '' },
            { key: 'month', label: 'Mes', icon: '' },
          ].map(v => (
            <button
              key={v.key}
              onClick={() => {
                setCalView(v.key as CalendarView);
                if (listDateFilter === 'all') setListDateFilter('selected');
              }}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${calView === v.key ? 'bg-primary/10 border-primary text-primary shadow-sm' : 'bg-secondary/40 border-transparent text-muted-foreground hover:bg-secondary'}`}
            >
              <span>{v.icon}</span>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 size={30} className="animate-spin text-primary" /></div>
      ) : viewMode === 'list' ? (
        /* Vista de Lista */
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-card p-2 rounded-2xl border border-border shadow-sm">
            {/* Buscador */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
              <input
                type="text"
                placeholder="Buscar cliente, teléfono o cancha..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-secondary/50 border border-border rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            {/* Pills de Estado / Categorías Amigables */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
              {[
                { key: 'all', label: 'Todas' },
                { key: 'pending', label: 'Pendientes', color: 'bg-amber-500' },
                { key: 'pending_payment', label: 'Por Cobrar', color: 'bg-sky-500' },
                { key: 'paid', label: 'Cobradas', color: 'bg-emerald-500' },
                { key: 'cancelled', label: 'Canceladas', color: 'bg-rose-500' },
              ].map((st) => {
                const isActive = filterStatus === st.key;
                const rangeDates = getDaysRange(selectedDate, calView);

                const count = bookings.filter(b => {
                  let matchSt = false;
                  if (st.key === 'all') {
                    matchSt = true;
                  } else if (st.key === 'manual') {
                    matchSt = b.source === 'owner_panel';
                  } else if (st.key === 'pending') {
                    matchSt = b.status === 'pending';
                  } else if (st.key === 'pending_payment') {
                    const tPrice = Number(b.pitches?.price_per_hour || 0);
                    const pct = b.pitches?.booking_percentage ?? 50;
                    const dAmount = (tPrice * Number(pct)) / 100;
                    const remInfo = getBookingRemainingPayment(b);
                    const remPaid = Number(remInfo?.amount || 0);
                    const bal = calculateRemainingBalance(tPrice, dAmount, remPaid);
                    matchSt = b.status === 'confirmed' && bal > 0;
                  } else if (st.key === 'paid') {
                    const remInfo = getBookingRemainingPayment(b);
                    const remPaid = Number(remInfo?.amount || 0);
                    matchSt = b.status === 'confirmed' && remPaid > 0;
                  } else {
                    matchSt = b.status === st.key;
                  }

                  let matchDt = true;
                  if (listDateFilter === 'selected' && selectedDate) {
                    const bDate = getLocalDateString(b.start_time);
                    const bCreated = b.created_at ? getLocalDateString(b.created_at) : '';
                    if (calView === 'month') {
                      matchDt = bDate.substring(0, 7) === selectedDate.substring(0, 7) ||
                        (bCreated ? bCreated.substring(0, 7) === selectedDate.substring(0, 7) : false);
                    } else {
                      matchDt = rangeDates.includes(bDate) || (bCreated ? rangeDates.includes(bCreated) : false);
                    }
                  }
                  return matchSt && matchDt;
                }).length;

                const isBumped = bumpTab === st.key;

                return (
                  <button
                    key={st.key}
                    onClick={() => setFilterStatus(st.key)}
                    className={`relative px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap border cursor-pointer ${isActive
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-secondary/40 border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'
                      } ${isBumped ? 'ring-4 ring-primary scale-110 shadow-lg animate-pulse' : ''}`}
                  >
                    {isBumped && (
                      <span className="absolute -top-3.5 right-1 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-black animate-bounce shadow-md">
                        +1
                      </span>
                    )}
                    {st.color && <span className={`w-2 h-2 rounded-full ${st.color}`} />}
                    {st.label}
                    <span className="opacity-75">({count})</span>
                    {st.key === 'pending' && pendingOutsideCurrentFilter.length > 0 && (
                      <span
                        title={`Tienes ${pendingOutsideCurrentFilter.length} reserva(s) pendiente(s) de otras fechas`}
                        className="inline-flex items-center gap-1 ml-1 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black animate-pulse shadow-xs"
                      >
                        <Bell size={10} className="shrink-0" />
                        +{pendingOutsideCurrentFilter.length} otro día
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Aviso / Banner de reservas pendientes de otros días */}
          {pendingOutsideCurrentFilter.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in">
              <div className="flex items-start sm:items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 animate-bounce">
                  <Bell size={16} />
                </div>
                <div>
                  <p className="font-extrabold text-foreground text-xs sm:text-sm">
                    Tienes {pendingOutsideCurrentFilter.length} {pendingOutsideCurrentFilter.length === 1 ? 'reserva pendiente' : 'reservas pendientes'} de otras fechas
                  </p>
                  <p className="text-muted-foreground text-[11px] mt-0.5">
                    No aparecen en el filtro de fecha actual. Pulsa el botón para gestionarlas todas de una vez.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setFilterStatus('pending');
                  setListDateFilter('all');
                }}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold rounded-xl text-xs shrink-0 transition-all shadow-xs flex items-center justify-center gap-1.5 self-start sm:self-auto cursor-pointer"
              >
                <span>Ver todas las pendientes ({allPendingBookings.length})</span>
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* Cards de Reservas — responsivo sin tabla */}
          {groupedBookings.length === 0 ? (
            (() => {
              // Mensaje contextual según el filtro activo
              const emptyMeta: Record<string, { icon: string; title: string; desc: string; cta?: { label: string; href: string } }> = {
                pending: {
                  icon: '⏳',
                  title: 'Sin reservas pendientes',
                  desc: 'No tienes solicitudes por revisar en este momento. Cuando un cliente envíe su comprobante, aparecerá aquí.',
                },
                confirmed: {
                  icon: '✅',
                  title: 'Sin reservas aprobadas',
                  desc: 'No hay partidos confirmados con los filtros seleccionados.',
                  cta: { label: 'Ver todas las reservas', href: '' },
                },
                cancelled: {
                  icon: '❌',
                  title: 'Sin reservas canceladas',
                  desc: 'No hay reservas canceladas en este período.',
                },
                pending_payment: {
                  icon: '💰',
                  title: 'Sin saldos pendientes',
                  desc: 'Todos los partidos confirmados tienen el saldo al día.',
                },
                paid: {
                  icon: '🎉',
                  title: 'Sin pagos completos registrados',
                  desc: 'Cuando registres un cobro de saldo, aparecerá en esta sección.',
                },
                manual: {
                  icon: '📋',
                  title: 'Sin reservas manuales',
                  desc: 'No has registrado reservas manuales en este período.',
                },
                all: {
                  icon: '⚽',
                  title: 'Tu cancha está esperando jugadores',
                  desc: 'No hay reservas con los filtros actuales. Comparte el enlace de tu cancha para que los clientes puedan reservar directamente.',
                  cta: { label: 'Ir a explorar canchas', href: '/' },
                },
              };
              const key = filterStatus in emptyMeta ? filterStatus : 'all';
              const meta = emptyMeta[key] || emptyMeta['all'];
              return (
                <div className="bg-card rounded-2xl border border-border text-center py-14 px-6 flex flex-col items-center gap-3">
                  <span className="text-4xl leading-none">{meta.icon}</span>
                  <h3 className="font-bold text-base text-foreground">{meta.title}</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">{meta.desc}</p>
                  {meta.cta && (
                    <a
                      href={meta.cta.href || undefined}
                      onClick={!meta.cta.href ? (e) => { e.preventDefault(); } : undefined}
                      className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground font-bold text-xs rounded-xl hover:bg-primary/90 transition-colors cursor-pointer"
                    >
                      {meta.cta.label}
                    </a>
                  )}
                </div>
              );
            })()
          ) : (
            <div className="grid gap-3">
              {groupedBookings.map((group: any) => {
                const startTime = new Date(group.start_time);
                const isManual = group.source === 'owner_panel';
                const statusColors = {
                  confirmed: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
                  pending: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
                  cancelled: 'bg-red-100 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
                };

                const tPrice = group.total_price;
                const dAmount = group.deposit_amount;
                const originalProof =
                  getBookingOriginalProof(group.payment_proof_url) ||
                  getBookingOriginalProof(group.bookings?.find((b: any) => b.payment_proof_url)?.payment_proof_url);
                const remainingPaid = group.remaining_amount_paid || 0;
                const balance = calculateRemainingBalance(tPrice, dAmount, remainingPaid);
                const isFullyPaid = balance <= 0 || remainingPaid > 0;
                const isNewlyArrived = group.bookings.some((b: any) => newlyArrivedIds.has(b.id));

                const isMultiHour = group.bookings.length > 1;
                const lastBooking = group.bookings[group.bookings.length - 1];
                const lastEnd = lastBooking?.end_time
                  ? new Date(lastBooking.end_time)
                  : new Date(new Date(lastBooking?.start_time || group.start_time).getTime() + 60 * 60 * 1000);

                const isAnimating = animatingCard?.bookingIds.some((id: string) =>
                  group.bookings?.some((b: any) => b.id === id)
                );

                return (
                  <div
                    key={group.key}
                    onClick={() => dismissNewArrival(group)}
                    className={`bg-card rounded-2xl border transition-all p-3.5 sm:p-4.5 flex flex-col gap-3.5 relative overflow-hidden ${isNewlyArrived ? 'ring-2 ring-amber-500 shadow-lg shadow-amber-500/10 cursor-pointer' : 'border-border shadow-sm hover:shadow-md'
                      } ${isAnimating && animatingCard
                        ? filterStatus !== 'all'
                          ? animatingCard.color === 'sky'
                            ? '-translate-y-8 scale-[0.96] opacity-0 duration-700 ease-in-out pointer-events-none ring-2 ring-sky-500 border-sky-500 bg-sky-500/10 shadow-2xl shadow-sky-500/30'
                            : animatingCard.color === 'emerald'
                              ? '-translate-y-8 scale-[0.96] opacity-0 duration-700 ease-in-out pointer-events-none ring-2 ring-emerald-500 border-emerald-500 bg-emerald-500/10 shadow-2xl shadow-emerald-500/30'
                              : '-translate-y-8 scale-[0.96] opacity-0 duration-700 ease-in-out pointer-events-none ring-2 ring-rose-500 border-rose-500 bg-rose-500/10 shadow-2xl shadow-rose-500/30'
                          : animatingCard.color === 'sky'
                            ? 'scale-[1.02] ring-2 ring-sky-500 border-sky-500 shadow-xl shadow-sky-500/20 bg-sky-500/5 duration-500'
                            : animatingCard.color === 'emerald'
                              ? 'scale-[1.02] ring-2 ring-emerald-500 border-emerald-500 shadow-xl shadow-emerald-500/20 bg-emerald-500/5 duration-500'
                              : 'scale-[1.02] ring-2 ring-rose-500 border-rose-500 shadow-xl shadow-rose-500/20 bg-rose-500/5 duration-500'
                        : ''
                      }`}
                  >
                    {/* Indicador de estado en el borde izquierdo (cambia en vivo al color de la animación) */}
                    <div
                      className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors ${isAnimating && animatingCard
                        ? animatingCard.color === 'sky'
                          ? 'bg-sky-500'
                          : animatingCard.color === 'emerald'
                            ? 'bg-emerald-500'
                            : 'bg-rose-500'
                        : group.status === 'confirmed'
                          ? isFullyPaid ? 'bg-emerald-500' : 'bg-sky-500'
                          : group.status === 'pending'
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`}
                    />

                    {/* Banner de animación de cambio de estado en vivo con color de destino */}
                    {isAnimating && animatingCard && (
                      <div className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold animate-in fade-in slide-in-from-top-1 duration-200 shadow-sm ${animatingCard.color === 'sky'
                        ? 'bg-sky-500/15 border border-sky-500/40 text-sky-800 dark:text-sky-200 ring-1 ring-sky-500/20'
                        : animatingCard.color === 'emerald'
                          ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-800 dark:text-emerald-200 ring-1 ring-emerald-500/20'
                          : 'bg-rose-500/15 border border-rose-500/40 text-rose-800 dark:text-rose-200 ring-1 ring-rose-500/20'
                        }`}>
                        <span className="flex items-center gap-2 min-w-0">
                          <CheckCircle size={15} className={`shrink-0 animate-pulse ${animatingCard.color === 'sky' ? 'text-sky-500' : animatingCard.color === 'emerald' ? 'text-emerald-500' : 'text-rose-500'
                            }`} />
                          <span className="truncate">{animatingCard.text.replace(' ➔', '')}</span>
                        </span>
                        <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-lg shadow-xs shrink-0 ${animatingCard.color === 'sky'
                          ? 'bg-sky-500 text-white'
                          : animatingCard.color === 'emerald'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-rose-500 text-white'
                          }`}>
                          {animatingCard.targetLabel}
                        </span>
                      </div>
                    )}

                    {/* Alerta de Nueva Reserva Entrante (se descarta al hacer click en cualquier parte de la card) */}
                    {isNewlyArrived && (
                      <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs font-bold animate-pulse">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <Bell size={13} className="text-amber-600 animate-bounce" />
                          <span className="truncate">¡NUEVA RESERVA RECIBIDA!</span>
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            dismissNewArrival(group);
                          }}
                          className="text-[11px] underline hover:no-underline font-semibold text-amber-700 dark:text-amber-300 shrink-0 cursor-pointer"
                        >
                          Marcar vista
                        </button>
                      </div>
                    )}

                    {/* Header: Estado, Categoría, Tipo y Duración */}
                    <div className="flex items-center justify-between gap-2 flex-wrap pl-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {group.status === 'pending' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60">
                            <Clock size={12} className="text-amber-600 dark:text-amber-400" />
                            Pendiente de Aprobación
                          </span>
                        ) : group.status === 'confirmed' ? (
                          isFullyPaid ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60">
                              <CheckCircle size={12} className="text-emerald-600 dark:text-emerald-400" />
                              Aprobada · Pago Completo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-sky-50 text-sky-800 border border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60">
                              <Receipt size={12} className="text-sky-600 dark:text-sky-400" />
                              Aprobada · Saldo Por Cobrar
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200/80 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/60">
                            <XCircle size={12} className="text-red-600 dark:text-red-400" />
                            Cancelada
                          </span>
                        )}

                        {isManual && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800 rounded-lg">
                            <Wrench size={10} /> Manual
                          </span>
                        )}
                      </div>

                      {/* Badge de Horas */}
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-secondary/80 text-muted-foreground border border-border/50">
                        {group.bookings.length} {group.bookings.length === 1 ? 'hora' : 'horas'}
                      </span>
                    </div>

                    {/* Información Principal: Cliente, Cancha, Horario, Cobro (Grid Responsivo) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-secondary/20 p-3 rounded-xl border border-border/40 pl-3">
                      {/* Cliente */}
                      <div className="col-span-2 sm:col-span-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Cliente</p>
                        <p className="font-extrabold text-sm text-foreground capitalize leading-snug break-words">
                          {group.customer_name || 'Anónimo'}
                        </p>
                        {group.customer_phone && (
                          <div className="flex items-center gap-2 mt-1">
                            <a
                              href={`tel:${group.customer_phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                            >
                              <Phone size={11} className="text-muted-foreground" />
                              <span>{group.customer_phone}</span>
                            </a>
                            <a
                              href={`https://wa.me/57${group.customer_phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 rounded border border-emerald-200/50 dark:border-emerald-800/40"
                              title="Escribir por WhatsApp"
                            >
                              WhatsApp
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Cancha */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Cancha</p>
                        <p className="font-bold text-xs sm:text-sm text-foreground break-words leading-snug">
                          {group.pitch_names && group.pitch_names.length > 1
                            ? group.pitch_names.join(' + ').toUpperCase()
                            : group.pitches?.name?.toUpperCase() || '—'}
                        </p>
                        {group.pitch_names && group.pitch_names.length > 1 && (
                          <span className="inline-flex items-center text-[9px] font-extrabold uppercase px-1.5 py-0.5 mt-0.5 rounded bg-primary/15 border border-primary/30 text-primary">
                            Multi-cancha ({group.pitch_names.length})
                          </span>
                        )}
                        {group.pitches?.custom_pricing?.is_combined && (
                          <span className="inline-flex items-center text-[9px] font-extrabold uppercase px-1.5 py-0.2 mt-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300">
                            Combinada
                          </span>
                        )}
                      </div>

                      {/* Fecha y Horario */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Fecha</p>
                        <p className="font-bold text-xs sm:text-sm text-foreground capitalize leading-snug">
                          {startTime.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Bogota' })}
                        </p>
                      </div>

                      {/* Finanzas */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Cobro</p>
                        <p className="font-extrabold text-xs sm:text-sm text-foreground">
                          ${tPrice.toLocaleString('es-CO')}
                        </p>
                        {dAmount > 0 && (
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                            Abono: ${dAmount.toLocaleString('es-CO')}
                          </p>
                        )}
                        {group.status === 'confirmed' && (
                          isFullyPaid ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                              <CheckCircle size={10} /> Saldo pagado
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-0.5 block">
                              Saldo: ${balance.toLocaleString('es-CO')}
                            </span>
                          )
                        )}
                      </div>
                    </div>

                    {/* Desglose de horas - siempre visible (1 hora o más) */}
                    {group.bookings?.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pl-1.5">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mr-0.5">
                          Turnos:
                        </span>
                        {group.bookings.map((b: any, idx: number) => {
                          const bStart = new Date(b.start_time);
                          const bEnd = new Date(b.end_time || new Date(b.start_time).getTime() + 3600000);
                          const bPName = b.pitches?.name;
                          return (
                            <span
                              key={b.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/60 text-foreground font-semibold text-[11px] border border-border/50"
                            >
                              <span className="w-3.5 h-3.5 rounded-full bg-primary/10 text-primary font-bold text-[9px] flex items-center justify-center">
                                {idx + 1}
                              </span>
                              {group.pitch_names && group.pitch_names.length > 1 && bPName && (
                                <span className="font-bold text-primary text-[10px]">[{bPName}]</span>
                              )}
                              <span>
                                {bStart.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })}
                                {' – '}
                                {bEnd.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Barra de Acciones y Comprobantes (Limpia, organizada, sin sobrecarga visual) */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-border/40 pl-1.5">
                      {/* Izquierda: Comprobante de Abono, Comprobante de Saldo, y Botón Cobrar Saldo */}
                      <div className="flex flex-wrap items-center gap-2">
                        {originalProof && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              dismissNewArrival(group);
                              setProofModalData({
                                url: originalProof,
                                title: `Comprobante de Reserva - ${group.customer_name || 'Cliente'}`
                              });
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-primary border border-primary/30 bg-primary/10 hover:bg-primary/20 px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer"
                            title="Ver foto del comprobante de abono"
                          >
                            <FileText size={12} /> Ver Comprobante
                          </button>
                        )}

                        {group.remaining_payment_proof_url && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProofModalData({
                                url: group.remaining_payment_proof_url,
                                title: `Comprobante de Saldo (${formatPaymentMethod(group.remaining_payment_method, group.remaining_payment_splits)}) - ${group.customer_name || 'Cliente'}`
                              });
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer"
                            title="Ver foto del comprobante de saldo restante"
                          >
                            <Receipt size={12} /> Comprobante Saldo
                          </button>
                        )}

                        {/* Botón Cobrar Saldo: ÚNICAMENTE cuando está en la pestaña 'Por Cobrar' (pending_payment) debajo de los comprobantes, color suave */}
                        {filterStatus === 'pending_payment' && !isFullyPaid && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBookingForRemainingPayment(group);
                            }}
                            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-700/60 rounded-xl shadow-2xs transition-all cursor-pointer"
                            title="Registrar cobro de saldo en físico"
                          >
                            <DollarSign size={13} className="text-emerald-600 dark:text-emerald-400" />
                            <span>Cobrar saldo (${balance.toLocaleString('es-CO')})</span>
                          </button>
                        )}

                        {group.status === 'confirmed' && isFullyPaid && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBookingForRemainingPayment(group);
                            }}
                            className="text-[11px] text-muted-foreground hover:text-foreground underline cursor-pointer"
                          >
                            Editar pago
                          </button>
                        )}
                      </div>

                      {/* Derecha: Botones de Decisión (Aprobar / Rechazar / Cancelar) — ÚNICAMENTE un conjunto de botones */}
                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        {group.status === 'pending' && (
                          isMultiHour ? (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  dismissNewArrival(group);
                                  handleBatchApproveRequest(group.bookings, group.customer_name, group.pitches?.name, tPrice, dAmount);
                                }}
                                className="text-xs px-3.5 py-1.5 font-bold bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                              >
                                <CheckCircle size={14} />
                                <span>Aprobar todas ({group.bookings.length}h)</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  dismissNewArrival(group);
                                  handleBatchCancelRequest(group.bookings, `las ${group.bookings.length} horas de ${group.customer_name || 'esta reserva'}`);
                                }}
                                className="text-xs px-3 py-1.5 font-bold text-red-600 dark:text-red-400 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/40 border border-red-200/60 dark:border-red-800/50 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <XCircle size={14} />
                                <span>Rechazar todas</span>
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  dismissNewArrival(group);
                                  handleApproveRequest(group.bookings[0]);
                                }}
                                className="text-xs px-3.5 py-1.5 font-bold bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                              >
                                <CheckCircle size={14} />
                                <span>Aprobar</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  dismissNewArrival(group);
                                  handleCancelRequest(group.bookings[0]);
                                }}
                                className="text-xs px-3 py-1.5 font-bold text-red-600 dark:text-red-400 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/40 border border-red-200/60 dark:border-red-800/50 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <XCircle size={14} />
                                <span>Rechazar</span>
                              </button>
                            </>
                          )
                        )}

                        {group.status === 'confirmed' && (
                          isMultiHour ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleBatchCancelRequest(group.bookings, `las ${group.bookings.length} horas confirmadas de ${group.customer_name || 'esta reserva'}`);
                              }}
                              className="text-xs px-3 py-1.5 font-bold text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <XCircle size={13} />
                              <span>Cancelar todas las horas</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelRequest(group.bookings[0]);
                              }}
                              className="text-xs px-3 py-1.5 font-bold text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <XCircle size={13} />
                              <span>Cancelar reserva</span>
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      ) : (
        /* Vista de Horarios (Día individual o Matriz Vertical de Horas x Columnas de Días) */
        <div className="space-y-4">
          {calView === 'month' ? (
            <div className="bg-card p-4 rounded-2xl border border-border shadow-sm">
              <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><CalendarDays size={16} className="text-primary" /> Resumen Mensual</h3>
              <p className="text-xs text-muted-foreground mb-4">Haz clic sobre cualquier día para inspeccionar el horario de ese día.</p>
              <div className="grid grid-cols-7 gap-1">
                <MonthlyBookingSummary bookings={bookings} selectedDate={selectedDate} onSelectDate={(d) => { setSelectedDate(d); setCalView('day'); }} />
              </div>
            </div>
          ) : (
            <>
              {calView === 'day' && (
                <div className="flex items-center justify-between bg-card p-2 px-3 rounded-2xl border border-border shadow-sm">
                  <button onClick={() => {
                    const [y, m, d] = selectedDate.split('-').map(Number);
                    const dt = new Date(y, m - 1, d - 1);
                    setSelectedDate(getLocalDateString(dt));
                  }} className="p-1.5 rounded-xl border border-border hover:bg-secondary transition-colors">
                    <ChevronLeft size={16} />
                  </button>
                  <p className="text-xs sm:text-sm font-bold capitalize text-foreground">
                    {selectedDate ? formatSelectedDateText(selectedDate) : ''}
                  </p>
                  <button onClick={() => {
                    const [y, m, d] = selectedDate.split('-').map(Number);
                    const dt = new Date(y, m - 1, d + 1);
                    setSelectedDate(getLocalDateString(dt));
                  }} className="p-1.5 rounded-xl border border-border hover:bg-secondary transition-colors">
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}

              {pitches.map(pitch => (
                calView === 'day' ? (
                  <PitchScheduleCard
                    key={pitch.id}
                    pitch={pitch}
                    selectedDate={selectedDate}
                    supabase={supabase}
                    allPitches={pitches}
                    allBookings={bookings}
                    onCancel={updateStatus}
                    onCancelRequest={handleCancelRequest}
                    onViewProof={(url: string) => openProofModal(url, 'Comprobante de Pago')}
                    onSelectSlot={setSelectedSlotDetail}
                  />
                ) : (
                  <PitchGridMatrixCard
                    key={pitch.id}
                    pitch={pitch}
                    dates={getDaysRange(selectedDate, calView)}
                    supabase={supabase}
                    allPitches={pitches}
                    allBookings={bookings}
                    onDayClick={(dateStr: string) => { setSelectedDate(dateStr); setCalView('day'); }}
                    onViewProof={(url: string) => openProofModal(url, 'Comprobante de Pago')}
                    onSelectSlot={setSelectedSlotDetail}
                  />
                )
              ))}
              {pitches.length === 0 && (
                <div className="text-center py-12 text-sm text-muted-foreground bg-card rounded-2xl border border-border">No hay canchas registradas.</div>
              )}
            </>
          )}
        </div>
      )}

      {showManualBooking && (
        <ManualBookingModal
          pitches={pitches}
          onClose={() => {
            setShowManualBooking(false);
            setManualBookingPrefill(null);
          }}
          onSuccess={() => {
            setShowManualBooking(false);
            setManualBookingPrefill(null);
            fetchBookingsAndPitches();
          }}
          initialPitchId={manualBookingPrefill?.pitchId}
          initialDate={manualBookingPrefill?.date}
          initialTime={manualBookingPrefill?.time}
        />
      )}

      {/* ── Modal Flotante de Horario Interactivo (al tocar cada hora) ── */}
      {selectedSlotDetail && (
        <SlotDetailModal
          data={selectedSlotDetail}
          onClose={() => setSelectedSlotDetail(null)}
          onApprove={(b) => {
            handleApproveRequest(b);
          }}
          onBatchApprove={(bookingsList, custName, pName, totPrice, depAmount) => {
            handleBatchApproveRequest(bookingsList, custName, pName, totPrice, depAmount);
          }}
          onCancelRequest={(b) => {
            handleCancelRequest(b);
          }}
          onBatchCancel={(ids, label) => {
            handleBatchCancelRequest(ids, label);
          }}
          onCollectBalance={(b) => {
            setSelectedBookingForRemainingPayment(b);
          }}
          onViewProof={(url) => {
            openProofModal(url, 'Comprobante de Pago');
          }}
          onGoToList={(b) => {
            setViewMode('list');
            setListDateFilter('all');
            if (b.customer_name) {
              setSearchQuery(b.customer_name);
            }
          }}
          onCreateManual={(p, d, s) => {
            setManualBookingPrefill({ pitchId: p.id, date: d, time: s });
            setShowManualBooking(true);
          }}
        />
      )}

      {/* ── Modal de Confirmación de Cancelación ── */}
      {cancelConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card w-full max-w-md rounded-3xl shadow-2xl border border-border p-6 sm:p-7 animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center shrink-0">
                <AlertTriangle size={24} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-black text-lg text-foreground tracking-tight">¿Cancelar reserva?</h3>
                <p className="text-xs text-muted-foreground">El horario se liberará de inmediato</p>
              </div>
            </div>

            <div className="bg-secondary/50 rounded-2xl p-4 border border-border/60 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-semibold">Cliente:</span>
                <span className="font-black text-foreground capitalize text-sm">{cancelConfirm.name}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-semibold">Fecha y Hora:</span>
                <span className="font-bold text-primary">{cancelConfirm.time}</span>
              </div>
              {cancelConfirm.total_price !== undefined && (
                <div className="flex justify-between items-center text-xs pt-1">
                  <span className="text-muted-foreground font-semibold">Precio Total:</span>
                  <span className="font-bold text-foreground">${cancelConfirm.total_price.toLocaleString('es-CO')}</span>
                </div>
              )}
              {cancelConfirm.deposit_amount !== undefined && cancelConfirm.deposit_amount > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-semibold">Abono:</span>
                  <span className="font-bold text-primary">${cancelConfirm.deposit_amount.toLocaleString('es-CO')}</span>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground/90 pt-2 border-t border-border/50 leading-relaxed">
                Esta acción cancelará la reserva en el calendario y permitirá que el espacio vuelva a estar disponible para nuevos partidos o reservas manuales.
              </p>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={confirmCancel}
                disabled={cancelling}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 active:scale-98 text-white text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                {cancelling ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                <span>{cancelling ? 'Cancelando...' : 'Sí, cancelar'}</span>
              </button>
              <button
                type="button"
                onClick={() => setCancelConfirm(null)}
                disabled={cancelling}
                className="flex-1 py-3 rounded-xl border border-border bg-secondary/80 hover:bg-secondary active:scale-98 text-foreground text-xs sm:text-sm font-bold transition-all text-center"
              >
                No, mantener
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Confirmación de Aprobación ── */}
      {approveConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card w-full max-w-md rounded-3xl shadow-2xl border border-border p-6 sm:p-7 animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/25 flex items-center justify-center shrink-0">
                <CheckCircle size={24} className="text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="font-black text-lg text-foreground tracking-tight">¿Aprobar reserva?</h3>
                <p className="text-xs text-muted-foreground">Se notificará al cliente de inmediato</p>
              </div>
            </div>

            <div className="bg-secondary/50 rounded-2xl p-4 border border-border/60 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-semibold">Cliente:</span>
                <span className="font-black text-foreground capitalize text-sm">{approveConfirm.name}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-semibold">Fecha y Hora:</span>
                <span className="font-bold text-primary">{approveConfirm.time}</span>
              </div>
              <p className="text-[11px] text-muted-foreground/90 pt-2 border-t border-border/50 leading-relaxed">
                Al confirmar, el cliente recibirá su ticket de reserva por WhatsApp y el espacio quedará bloqueado para ese horario.
              </p>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={confirmApprove}
                disabled={approving}
                className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 active:scale-98 text-white text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                {approving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                <span>{approving ? 'Confirmando...' : 'Sí, aprobar'}</span>
              </button>
              <button
                type="button"
                onClick={() => setApproveConfirm(null)}
                disabled={approving}
                className="flex-1 py-3 rounded-xl border border-border bg-secondary/80 hover:bg-secondary active:scale-98 text-foreground text-xs sm:text-sm font-bold transition-all text-center"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Confirmación de Aprobación en Lote (Confirmar Todas) ── */}
      {batchApproveConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card w-full max-w-md rounded-3xl shadow-2xl border border-border p-6 sm:p-7 animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/25 flex items-center justify-center shrink-0">
                <CheckCircle size={24} className="text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="font-black text-lg text-foreground tracking-tight">¿Confirmar todas las reservas?</h3>
                <p className="text-xs text-muted-foreground">Se aprobarán {batchApproveConfirm.ids.length} horas simultáneamente</p>
              </div>
            </div>

            <div className="bg-secondary/50 rounded-2xl p-4 border border-border/60 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-semibold">Cliente:</span>
                <span className="font-black text-foreground capitalize text-sm">{batchApproveConfirm.name}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-semibold">Cancha:</span>
                <span className="font-bold text-foreground uppercase">{batchApproveConfirm.pitchName}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-semibold">Fecha:</span>
                <span className="font-bold text-primary capitalize">{batchApproveConfirm.dateStr}</span>
              </div>

              {/* Lista de horas seleccionadas */}
              <div className="pt-2 border-t border-border/50 space-y-1.5">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Horas a confirmar ({batchApproveConfirm.hours.length}):
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                  {batchApproveConfirm.hours.map((h, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-300 font-bold text-xs"
                    >
                      <Clock size={12} /> {h}
                    </span>
                  ))}
                </div>
              </div>

              {batchApproveConfirm.totalPrice > 0 && (
                <div className="pt-2 border-t border-border/50 flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-semibold">Valor total:</span>
                  <div className="text-right">
                    <span className="font-black text-foreground">${batchApproveConfirm.totalPrice.toLocaleString('es-CO')}</span>
                    {batchApproveConfirm.depositAmount > 0 && (
                      <span className="block text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                        Abono: ${batchApproveConfirm.depositAmount.toLocaleString('es-CO')}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground/90 pt-2 border-t border-border/50 leading-relaxed">
                Al confirmar, el cliente recibirá su ticket unificado por WhatsApp con todas estas horas y quedarán bloqueadas en el calendario.
              </p>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={confirmBatchApprove}
                disabled={batchApproving}
                className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 active:scale-98 text-white text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                {batchApproving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                <span>{batchApproving ? 'Confirmando todas...' : `Confirmar todas`}</span>
              </button>
              <button
                type="button"
                onClick={() => setBatchApproveConfirm(null)}
                disabled={batchApproving}
                className="flex-1 py-3 rounded-xl border border-border bg-secondary/80 hover:bg-secondary active:scale-98 text-foreground text-xs sm:text-sm font-bold transition-all text-center"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Confirmación de Rechazo en Lote ── */}
      {batchCancelConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card w-full max-w-md rounded-3xl shadow-2xl border border-border p-6 sm:p-7 animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center shrink-0">
                <AlertTriangle size={24} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-black text-lg text-foreground tracking-tight">¿Rechazar todas?</h3>
                <p className="text-xs text-muted-foreground">Esta acción afectará {batchCancelConfirm.ids.length} reserva{batchCancelConfirm.ids.length > 1 ? 's' : ''}</p>
              </div>
            </div>

            <div className="bg-secondary/50 rounded-2xl p-4 border border-border/60 space-y-2">
              <p className="text-sm font-semibold text-foreground">Vas a cancelar {batchCancelConfirm.label}.</p>
              <p className="text-[11px] text-muted-foreground/90 pt-2 border-t border-border/50 leading-relaxed">
                Todos los horarios se liberarán de inmediato y el cliente recibirá una notificación de cancelación.
              </p>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={confirmBatchCancel}
                disabled={batchCancelling}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 active:scale-98 text-white text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                {batchCancelling ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                <span>{batchCancelling ? 'Cancelando...' : 'Sí, rechazar todas'}</span>
              </button>
              <button
                type="button"
                onClick={() => setBatchCancelConfirm(null)}
                disabled={batchCancelling}
                className="flex-1 py-3 rounded-xl border border-border bg-secondary/80 hover:bg-secondary active:scale-98 text-foreground text-xs sm:text-sm font-bold transition-all text-center"
              >
                No, mantener
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Comprobantes (Anticipo / Saldo Restante) */}
      {proofModalData && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4"
          onClick={() => setProofModalData(null)}
        >
          <div
            className="relative max-w-2xl w-full flex flex-col items-center bg-zinc-900 border border-zinc-800 rounded-3xl p-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-3 border-b border-zinc-800 mb-3">
              <span className="text-sm font-bold text-white flex items-center gap-2 truncate pr-2">
                <FileText size={16} className="text-primary shrink-0" />
                <span className="truncate">{proofModalData.title || 'Comprobante de Pago'}</span>
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={proofModalData.url}
                  download="comprobante"
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                  title="Descargar / Abrir en pestaña nueva"
                >
                  <Download size={18} />
                </a>
                <button
                  onClick={() => setProofModalData(null)}
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                  title="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="w-full flex items-center justify-center max-h-[75vh] overflow-auto rounded-2xl bg-black/50 p-2">
              <img
                src={proofModalData.url}
                alt={proofModalData.title || 'Comprobante'}
                className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal de Registro de Pago Restante en Local Físico */}
      {selectedBookingForRemainingPayment && (
        <RemainingPaymentModal
          isOpen={!!selectedBookingForRemainingPayment}
          onClose={() => setSelectedBookingForRemainingPayment(null)}
          booking={selectedBookingForRemainingPayment}
          onSuccess={handleRemainingPaymentSuccess}
        />
      )}

      {/* Notificación Flotante Toast para Nuevas Reservas Entrantes en Tiempo Real */}
      {liveNotification && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-4 sm:right-6 z-[90] max-w-sm w-[calc(100vw-2rem)] bg-zinc-950/95 dark:bg-zinc-900/95 text-white border-2 border-amber-500 rounded-2xl p-4 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom duration-300"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 text-amber-400">
              <Bell size={20} className="animate-bounce" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-400">
                  ¡Nueva Reserva Recibida!
                </span>
                <button
                  type="button"
                  onClick={() => setLiveNotification(null)}
                  className="text-zinc-400 hover:text-white transition-colors p-0.5 rounded-lg cursor-pointer"
                  title="Cerrar notificación"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-sm font-bold truncate mt-0.5 text-white">{liveNotification.name}</p>
              <p className="text-xs text-zinc-300 mt-0.5 font-medium">
                {liveNotification.date}
              </p>
              {liveNotification.turns && liveNotification.turns.length > 0 ? (
                <div className="mt-1.5 flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-amber-400/90 uppercase tracking-wider">
                    {liveNotification.turns.length > 1 ? 'Turnos reservados:' : 'Horario:'}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {liveNotification.turns.map((turn, tIdx) => (
                      <span
                        key={tIdx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-200 border border-amber-500/30 text-xs font-semibold"
                      >
                        {liveNotification.turns!.length > 1 && (
                          <span className="w-3.5 h-3.5 rounded-full bg-amber-500 text-zinc-950 font-black text-[9px] flex items-center justify-center shrink-0">
                            {tIdx + 1}
                          </span>
                        )}
                        <span>{turn}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-300 mt-0.5">
                  {liveNotification.time}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  setViewMode('list');
                  setFilterStatus('pending');
                  setListDateFilter('all');
                  setLiveNotification(null);
                }}
                className="mt-2 text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 underline"
              >
                <span>Ver en la lista</span>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* ── Modal de Reportes ── */}
      <BookingReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        bookings={bookings}
        pitches={pitches}
        companyName={companyName}
      />

      {/* ── Modal de Contrato Fijo / Turno Recurrente ── */}
      {showContractModal && pitches.length > 0 && (
        <ContractBookingModal
          pitches={pitches}
          onClose={() => setShowContractModal(false)}
          onSuccess={() => {
            setShowContractModal(false);
            fetchBookingsAndPitches();
          }}
        />
      )}
    </div>
  );
}

function MonthlyBookingSummary({ bookings, selectedDate, onSelectDate }: { bookings: any[], selectedDate: string, onSelectDate: (d: string) => void }) {
  if (!selectedDate) return null;
  const [year, month] = selectedDate.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();

  const bookingsByDate: Record<string, number> = {};
  bookings.forEach(b => {
    if (b.status === 'cancelled') return;
    const dateStr = getLocalDateString(b.start_time);
    if (dateStr) bookingsByDate[dateStr] = (bookingsByDate[dateStr] || 0) + 1;
  });

  const WEEKDAYS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  return (
    <>
      {WEEKDAYS.map(w => <div key={w} className="text-center text-[10px] font-bold text-muted-foreground py-1">{w}</div>)}
      {Array(firstWeekday).fill(null).map((_, i) => <div key={`b${i}`} />)}
      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
        const monthStr = month.toString().padStart(2, '0');
        const dayStr = day.toString().padStart(2, '0');
        const dateStr = `${year}-${monthStr}-${dayStr}`;
        const count = bookingsByDate[dateStr] || 0;
        const isSelected = selectedDate === dateStr;
        return (
          <button key={dateStr} onClick={() => onSelectDate(dateStr)}
            className={`relative p-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center border ${isSelected ? 'bg-primary text-white border-primary shadow-sm' : 'border-border/40 hover:bg-secondary text-foreground'}`}>
            {day}
            {count > 0 && <span className={`w-1.5 h-1.5 rounded-full mt-1 ${isSelected ? 'bg-white' : 'bg-primary'}`} />}
          </button>
        );
      })}
    </>
  );
}

// ─── Mini countdown timer para slots en proceso ───────────────────────────
function SlotCountdown({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [secs, setSecs] = useState(() => {
    const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  useEffect(() => {
    if (secs <= 0) { onExpire(); return; }
    const id = setInterval(() => setSecs(s => {
      if (s <= 1) { onExpire(); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(id);
  }, []);

  if (secs <= 0) return <span className="text-[8px] text-orange-500 font-bold">Liberando...</span>;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return (
    <span className="font-mono font-black text-[9px] text-orange-600 dark:text-orange-400">
      {m}:{s.toString().padStart(2, '0')}
    </span>
  );
}

// Helper: Extraer hora local de Bogotá en formato "HH:MM"
function getSlotTimeBogota(dateIso: string): string {
  const bDate = new Date(dateIso);
  const parts = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(bDate);
  let hh = parts.find(p => p.type === 'hour')?.value || '00';
  const mm = parts.find(p => p.type === 'minute')?.value || '00';
  if (hh === '24') hh = '00';
  return `${hh}:${mm}`;
}

// Helper: Detectar todas las reservas del mismo cliente en la misma fecha (múltiples canchas o múltiples horas no seguidas)
function findUserDayBookings(
  target: any,
  allCompanyBookings: any[],
  targetDateStr?: string,
  allPitches?: any[]
) {
  if (!target) {
    return {
      allBookings: [],
      isMultiBooking: false,
      isMultiPitch: false,
      isContiguous: true,
      totalPrice: 0,
      depositAmount: 0,
      balance: 0,
      distinctPitches: [],
      distinctPitchNames: [],
    };
  }

  const dateStr = targetDateStr || getLocalDateString(target.start_time);
  const targetCust = (target.customer_name || '').trim().toLowerCase();
  const targetPhone = (target.customer_phone || '').replace(/\D/g, '');
  const targetProof = target.payment_proof_url ? target.payment_proof_url.split('###')[0].trim() : null;
  const targetUserId = target.user_id;
  const targetCreated = new Date(target.created_at || target.start_time).getTime();

  const sourceList = Array.isArray(allCompanyBookings) ? allCompanyBookings : [];
  const seenIds = new Set<string>();

  const matches = sourceList.filter((b: any) => {
    if (!b || !b.id || seenIds.has(b.id)) return false;
    if (b.status === 'cancelled') return false;

    const bDateStr = getLocalDateString(b.start_time);
    if (bDateStr !== dateStr) return false;

    if (b.id === target.id) {
      seenIds.add(b.id);
      return true;
    }

    const bCust = (b.customer_name || '').trim().toLowerCase();
    const bPhone = (b.customer_phone || '').replace(/\D/g, '');
    const bProof = b.payment_proof_url ? b.payment_proof_url.split('###')[0].trim() : null;
    const bCreated = new Date(b.created_at || b.start_time).getTime();
    const diffMs = Math.abs(bCreated - targetCreated);

    // 1. Si ambos tienen comprobante de pago: deben ser exactamente idénticos (pertenecen a la misma compra)
    if (targetProof && bProof) {
      if (targetProof === bProof) {
        seenIds.add(b.id);
        return true;
      }
      return false; // Comprobantes distintos = compras distintas
    }

    // Si uno tiene comprobante y el otro no, son compras distintas
    if (Boolean(targetProof) !== Boolean(bProof)) {
      return false;
    }

    // 2. Si es una reserva manual del dueño (source === 'owner_panel'):
    // NUNCA comparar user_id porque ambas reservas tienen el user_id del dueño del complejo.
    // Solo deben agruparse si se crearon juntas en la misma acción manual (mismo cliente y diffMs <= 2.5 seg)
    const isManualBooking = target.source === 'owner_panel' || b.source === 'owner_panel';
    if (isManualBooking) {
      const sameCustomerName = Boolean(targetCust && bCust && targetCust === bCust);
      if (sameCustomerName && diffMs <= 2500) {
        seenIds.add(b.id);
        return true;
      }
      return false;
    }

    // 3. Para reservas normales web de clientes sin comprobante:
    // NUNCA agrupar si los nombres existen y son diferentes (ej. "Miguel" vs "Cristian")
    if (targetCust && bCust && targetCust !== bCust) {
      return false;
    }

    const sameCust = Boolean(targetCust && bCust && targetCust.length >= 3 && targetCust === bCust);
    const samePhone = Boolean(targetPhone && bPhone && targetPhone.length >= 7 && targetPhone === bPhone);
    const sameUser = Boolean(targetUserId && b.user_id && targetUserId === b.user_id);

    const isSameCustomer = (sameCust && samePhone) || (sameUser && (sameCust || samePhone));

    if (isSameCustomer && diffMs <= 3 * 60 * 1000) {
      seenIds.add(b.id);
      return true;
    }

    return false;
  });

  if (!matches.some(m => m.id === target.id)) {
    matches.push(target);
  }

  matches.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  if (allPitches && allPitches.length > 0) {
    matches.forEach(b => {
      if (!b.pitches) {
        const foundPitch = allPitches.find(p => p.id === b.pitch_id);
        if (foundPitch) b.pitches = foundPitch;
      }
    });
  }

  const pitchIds = Array.from(new Set(matches.map(b => b.pitch_id).filter(Boolean)));
  const distinctPitches = pitchIds.map(pId => (allPitches || []).find(p => p.id === pId) || { id: pId, name: 'Cancha' });
  const distinctPitchNames = Array.from(new Set(matches.map(b => b.pitches?.name || b.pitch_name || 'Cancha')));
  const isMultiPitch = pitchIds.length > 1;

  let isContiguous = !isMultiPitch && matches.length > 1;
  if (isContiguous) {
    for (let i = 0; i < matches.length - 1; i++) {
      const curr = matches[i];
      const next = matches[i + 1];
      const currEnd = new Date(curr.end_time || new Date(curr.start_time).getTime() + 3600000).getTime();
      const nextStart = new Date(next.start_time).getTime();
      if (Math.abs(nextStart - currEnd) > 2000) {
        isContiguous = false;
        break;
      }
    }
  }

  let totalPrice = 0;
  let depositAmount = 0;
  let remainingPaid = 0;

  matches.forEach(b => {
    const pitchPrice = b.pitches?.price_per_hour || 80000;
    const bPrice = Number(b.total_price || pitchPrice);
    totalPrice += bPrice;

    let d = Number(b.deposit_amount || 0);
    if (d === 0 && b.pitches) {
      const customPricing = b.pitches.custom_pricing || {};
      const isFixed = customPricing.booking_type === 'fixed';
      const pct = customPricing.booking_percentage || b.pitches.booking_percentage || 50;
      if (isFixed) {
        d = Number(customPricing.booking_fixed || 0);
      } else {
        d = (bPrice * Number(pct)) / 100;
      }
    }
    depositAmount += d;

    const remInfo = getBookingRemainingPayment(b);
    remainingPaid += Number(remInfo?.amount || b.remaining_amount_paid || 0);
  });

  const balance = calculateRemainingBalance(totalPrice, depositAmount, remainingPaid);

  return {
    allBookings: matches,
    isMultiBooking: matches.length > 1,
    isMultiPitch,
    isContiguous,
    totalPrice,
    depositAmount,
    balance,
    distinctPitches,
    distinctPitchNames,
  };
}

// Helper retrocompatible si alguna parte aún usa findContiguousBookings
function findContiguousBookings(target: any, allList: any[]): any[] {
  const res = findUserDayBookings(target, allList);
  return res.allBookings;
}

function PitchScheduleCard({ pitch, selectedDate, supabase, allPitches, allBookings, onCancel, onCancelRequest, onViewProof, onSelectSlot }: any) {
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [realtimeOk, setRealtimeOk] = useState(false);

  const conflictingIds = useMemo(() => {
    return getConflictingPitchIds(pitch.id, allPitches || [pitch]);
  }, [pitch.id, allPitches]);

  const fetchSlots = useCallback(async () => {
    if (!selectedDate) return;
    setLoading(true);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('Offline');
      }
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .in('pitch_id', conflictingIds)
        .gte('start_time', `${selectedDate}T00:00:00-05:00`)
        .lte('start_time', `${selectedDate}T23:59:59-05:00`)
        .neq('status', 'cancelled');

      if (error) throw error;
      setSlots(data || []);
      setLastRefresh(new Date());
    } catch {
      // Fallback offline: usar las reservas guardadas localmente para la fecha seleccionada
      if (Array.isArray(allBookings)) {
        const localSlots = allBookings.filter((b: any) => {
          if (!b || b.status === 'cancelled') return false;
          if (!conflictingIds.includes(b.pitch_id)) return false;
          const bDateStr = getLocalDateString(b.start_time);
          return bDateStr === selectedDate;
        });
        setSlots(localSlots);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedDate, conflictingIds, supabase, allBookings]);

  // Carga inicial
  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  // Auto-refresh cada 2 segundos (crítico para evitar doble reserva cuando hay red)
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        fetchSlots();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchSlots]);

  // Supabase Realtime — cambios inmediatos sin esperar el polling
  useEffect(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const channelName = `schedule:${pitch.id}:${selectedDate}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => { fetchSlots(); }
      )
      .subscribe((status: string) => {
        setRealtimeOk(status === 'SUBSCRIBED');
      });
    return () => { supabase.removeChannel(channel); };
  }, [pitch.id, selectedDate, supabase, fetchSlots]);

  // Unir las reservas de la cancha actual con todas las reservas de la empresa para detectar reservas entre canchas
  const combinedDayBookings = useMemo(() => {
    const map = new Map<string, any>();
    (allBookings || []).forEach((b: any) => {
      if (getLocalDateString(b.start_time) === selectedDate) {
        map.set(b.id, b);
      }
    });
    slots.forEach((s: any) => {
      map.set(s.id, { ...(map.get(s.id) || {}), ...s });
    });
    return Array.from(map.values());
  }, [allBookings, slots, selectedDate]);

  return (
    <div className="bg-card p-4 rounded-2xl border border-border shadow-sm">
      <div className="flex items-center justify-between mb-3 border-b border-border pb-2.5">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <div className="w-2 h-4 bg-primary rounded-full" /> {pitch.name.toUpperCase()}
          {isCombinedPitch(pitch) && (
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300">
              Cancha Combinada
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span
              title={realtimeOk ? 'Tiempo real activo' : 'Tiempo real desconectado'}
              className={`w-2 h-2 rounded-full ${realtimeOk ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/40'}`}
            />
            <span className="text-[9px] text-muted-foreground hidden sm:block">
              {lastRefresh.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-2 mb-3 text-[9px] font-bold uppercase tracking-wide">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary/10 border border-primary/40 inline-block" />Reservado</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-50 border border-purple-300 dark:bg-purple-950/40 inline-block" />Manual</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-300 dark:bg-amber-950/30 inline-block" />Pendiente</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-50 border border-orange-300 dark:bg-orange-950/30 inline-block" />En proceso</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-card border border-border/80 inline-block" />Libre</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {TIME_SLOTS.map((slot) => {
          const slotBooking = slots.find(b => getSlotTimeBogota(b.start_time) === slot);

          const hNum = parseInt(slot.split(':')[0]);
          const h12 = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum;
          const ampm = hNum < 12 ? 'am' : 'pm';

          const isDraft = slotBooking?.status === 'draft';
          const draftExpired = isDraft && slotBooking?.expires_at && new Date(slotBooking.expires_at) < new Date();
          const effectiveBooking = isDraft && draftExpired ? null : slotBooking;
          const isManual = effectiveBooking?.source === 'owner_panel';

          const allowedSlots = pitch.custom_pricing?.time_slots || TIME_SLOTS;
          const isOperating = allowedSlots.includes(slot);

          // Detección consolidada de reservas del mismo usuario en la fecha (múltiples canchas o múltiples horas no seguidas)
          const userGroupInfo = effectiveBooking
            ? findUserDayBookings(effectiveBooking, combinedDayBookings, selectedDate, allPitches)
            : null;
          const isMulti = Boolean(userGroupInfo && userGroupInfo.isMultiBooking);
          const multiIdx = isMulti && userGroupInfo
            ? userGroupInfo.allBookings.findIndex((b: any) => b.id === effectiveBooking.id)
            : -1;

          let bgClass = 'bg-card border-border/80';
          if (!isOperating && !effectiveBooking) {
            bgClass = 'bg-red-50/50 border-red-200/50 dark:bg-red-950/20';
          } else if (effectiveBooking) {
            if (effectiveBooking.status === 'draft') bgClass = 'bg-orange-50 border-orange-300 dark:bg-orange-950/30';
            else if (effectiveBooking.status === 'pending') bgClass = 'bg-amber-50 border-amber-300 dark:bg-amber-950/30';
            else if (isManual) bgClass = 'bg-purple-50 border-purple-300 dark:bg-purple-950/30';
            else bgClass = 'bg-primary/10 border-primary/40';
          }

          if (isMulti) {
            bgClass += ' ring-2 ring-primary/80 shadow-md border-primary/60 bg-primary/5';
          }

          return (
            <div
              key={slot}
              onClick={() => {
                onSelectSlot?.({
                  pitch,
                  slot,
                  dateStr: selectedDate,
                  booking: effectiveBooking,
                  relatedBookings: isMulti && userGroupInfo ? userGroupInfo.allBookings : (effectiveBooking ? [effectiveBooking] : []),
                  isOperating,
                });
              }}
              className={`relative p-2 rounded-xl border text-center transition-all flex flex-col justify-center min-h-[72px] cursor-pointer hover:ring-2 hover:ring-primary/60 hover:scale-[1.02] active:scale-95 select-none ${bgClass}`}
              title={
                effectiveBooking
                  ? `Ver detalle: ${effectiveBooking.customer_name || 'Reserva'}${isMulti && userGroupInfo ? ` (${userGroupInfo.allBookings.length} horas: ${userGroupInfo.distinctPitchNames.join(', ')} · Total: $${userGroupInfo.totalPrice.toLocaleString('es-CO')})` : ''}`
                  : !isOperating
                    ? 'Horario no operativo / cerrado'
                    : 'Toca para ver o registrar reserva manual'
              }
            >
              {/* Badge de conexión multi-reserva (multi-cancha, multi-hora no seguidas o continuas) */}
              {isMulti && userGroupInfo && (
                <div className="mb-1 text-[8px] font-black uppercase tracking-tight text-primary bg-primary/20 border border-primary/30 rounded px-1.5 py-0.5 flex flex-col items-center justify-center gap-0.5 shadow-2xs">
                  <div className="flex items-center gap-1">
                    <span>
                      {userGroupInfo.isMultiPitch
                        ? `${userGroupInfo.allBookings.length} Canchas/Horas`
                        : userGroupInfo.isContiguous
                          ? `${userGroupInfo.allBookings.length}h Continuas`
                          : `${userGroupInfo.allBookings.length}h No Seguidas`}
                    </span>
                    {multiIdx >= 0 && (
                      <span className="opacity-80">({multiIdx + 1}/{userGroupInfo.allBookings.length})</span>
                    )}
                  </div>
                  {/* <span className="text-[7.5px] font-extrabold text-foreground/80 lowercase tracking-normal">
                    tot: ${userGroupInfo.totalPrice.toLocaleString('es-CO')} · ab: ${userGroupInfo.depositAmount.toLocaleString('es-CO')}
                  </span> */}
                </div>
              )}

              <span className={`font-bold text-xs block leading-tight ${effectiveBooking ? 'text-foreground' : (!isOperating ? 'text-red-400/50' : 'text-muted-foreground')}`}>{h12}:00</span>
              <span className={`text-[9px] uppercase opacity-60 font-semibold ${!isOperating && !effectiveBooking ? 'text-red-400/50' : ''}`}>{ampm}</span>

              {!isOperating && !effectiveBooking && (
                <div className="mt-1 text-[9px] font-bold text-red-500/60 leading-tight">Cerrado</div>
              )}

              {effectiveBooking?.status === 'draft' && effectiveBooking.expires_at && (
                <div className="mt-1 flex flex-col items-center gap-0.5">
                  <Clock size={10} className="text-orange-500 animate-pulse" />
                  <SlotCountdown
                    expiresAt={effectiveBooking.expires_at}
                    onExpire={fetchSlots}
                  />
                  <span className="text-[8px] text-orange-500/80 font-semibold">En proceso</span>
                </div>
              )}

              {effectiveBooking && effectiveBooking.status !== 'draft' && (
                <div className="mt-1 text-[10px] font-semibold leading-tight space-y-0.5">
                  <div className="truncate text-foreground font-bold text-[9px]" title={effectiveBooking.customer_name}>
                    {effectiveBooking.customer_name || '—'}
                  </div>

                  {isManual ? (
                    <div className="flex items-center gap-0.5 text-purple-600 dark:text-purple-400 justify-center text-[9px]">
                      <Wrench size={8} /> Manual
                    </div>
                  ) : (
                    <div className={`rounded px-1 py-0.5 inline-block text-[9px] font-bold ${effectiveBooking.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-primary/20 text-primary'}`}>
                      {effectiveBooking.status === 'pending' ? 'Pendiente.' : 'Aprobada'}
                    </div>
                  )}

                  {effectiveBooking.payment_proof_url && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewProof?.(effectiveBooking.payment_proof_url);
                      }}
                      className="w-full flex items-center justify-center gap-1 text-[8px] font-bold text-primary border border-primary/20 bg-primary/10 hover:bg-primary/20 rounded py-0.5 transition-colors mt-0.5 cursor-pointer"
                      title="Ver comprobante de pago"
                    >
                      <FileText size={8} /> Comprobante
                    </button>
                  )}

                  {(effectiveBooking.status === 'confirmed' || effectiveBooking.status === 'pending') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onCancelRequest) {
                          onCancelRequest(effectiveBooking);
                        } else {
                          onCancel(effectiveBooking.id, 'cancelled').then(() => fetchSlots());
                        }
                      }}
                      className="w-full text-[8px] bg-red-100 text-red-600 dark:bg-red-950/50 hover:bg-red-200 rounded py-0.5 transition-colors font-bold mt-1 cursor-pointer"
                      title="Cancelar"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


/* Matriz de Horarios en Grilla: Filas = Horas | Columnas = Días */
function PitchGridMatrixCard({ pitch, dates, supabase, allPitches, allBookings, onDayClick, onViewProof, onSelectSlot }: any) {
  const [allSlots, setAllSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!dates.length) return;
    const fetch = async () => {
      setLoading(true);
      const startDate = dates[0];
      const endDate = dates[dates.length - 1];

      const conflictingIds = getConflictingPitchIds(pitch.id, allPitches || [pitch]);

      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          throw new Error('Offline');
        }
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .in('pitch_id', conflictingIds)
          .gte('start_time', `${startDate}T00:00:00-05:00`)
          .lte('start_time', `${endDate}T23:59:59-05:00`)
          .neq('status', 'cancelled');

        if (error) throw error;
        setAllSlots(data || []);
      } catch {
        // Fallback offline con allBookings
        if (Array.isArray(allBookings)) {
          const localSlots = allBookings.filter((b: any) => {
            if (!b || b.status === 'cancelled') return false;
            if (!conflictingIds.includes(b.pitch_id)) return false;
            const bDateStr = getLocalDateString(b.start_time);
            return dates.includes(bDateStr);
          });
          setAllSlots(localSlots);
        }
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [dates, pitch.id, supabase, allPitches, allBookings]);

  // Unir todas las reservas de la empresa con las de esta cancha para detectar multi-reservas
  const combinedAllSlots = useMemo(() => {
    const map = new Map<string, any>();
    (allBookings || []).forEach((b: any) => {
      const dStr = getLocalDateString(b.start_time);
      if (dates.includes(dStr)) {
        map.set(b.id, b);
      }
    });
    allSlots.forEach((s: any) => {
      map.set(s.id, { ...(map.get(s.id) || {}), ...s });
    });
    return Array.from(map.values());
  }, [allBookings, allSlots, dates]);

  return (
    <div className="bg-card p-4 rounded-2xl border border-border shadow-sm">
      <div className="flex items-center justify-between mb-3 border-b border-border pb-2.5">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <div className="w-2 h-4 bg-primary rounded-full" /> {pitch.name}
          {isCombinedPitch(pitch) && (
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300">
              ⚡ Cancha Combinada / Modular
            </span>
          )}
        </h3>
        {loading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Encabezado de Columnas por Días */}
          <div
            className="grid gap-1 pb-2 border-b border-border sticky top-0 bg-card z-10"
            style={{ gridTemplateColumns: `60px repeat(${dates.length}, minmax(90px, 1fr))` }}
          >
            <div className="text-[10px] font-bold text-muted-foreground flex items-center justify-center">HORA</div>
            {dates.map((dateStr: string) => {
              const [y, m, d] = dateStr.split('-').map(Number);
              const dt = new Date(y, m - 1, d);
              const dayName = dt.toLocaleDateString('es-CO', { weekday: 'short' });

              return (
                <button
                  key={dateStr}
                  onClick={() => onDayClick(dateStr)}
                  className="p-1 rounded-xl hover:bg-secondary transition-colors text-center border border-border/40"
                >
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">{dayName}</div>
                  <div className="text-xs font-bold text-primary">{d}/{m}</div>
                </button>
              );
            })}
          </div>

          {/* Filas por Horas de 06:00 a 23:00 */}
          <div className="divide-y divide-border/40 text-xs">
            {TIME_SLOTS.map((slot, sIdx) => {
              const hNum = parseInt(slot.split(':')[0]);
              const h12 = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum;
              const ampm = hNum < 12 ? 'am' : 'pm';

              const prevSlot = sIdx > 0 ? TIME_SLOTS[sIdx - 1] : null;
              const nextSlot = sIdx < TIME_SLOTS.length - 1 ? TIME_SLOTS[sIdx + 1] : null;

              return (
                <div
                  key={slot}
                  className="grid gap-1 py-1 items-center hover:bg-secondary/20 transition-colors"
                  style={{ gridTemplateColumns: `60px repeat(${dates.length}, minmax(90px, 1fr))` }}
                >
                  {/* Etiqueta de la hora a la izquierda */}
                  <div className="text-[10px] font-bold text-muted-foreground text-center">
                    {h12}:00 <span className="text-[8px] uppercase">{ampm}</span>
                  </div>

                  {/* Celdas de cada día para esa hora específica */}
                  {dates.map((dateStr: string) => {
                    const dayBookings = allSlots.filter(b => getLocalDateString(b.start_time) === dateStr);
                    const slotBooking = dayBookings.find(b => getSlotTimeBogota(b.start_time) === slot);

                    const isManual = slotBooking?.source === 'owner_panel';
                    const allowedSlots = pitch.custom_pricing?.time_slots || TIME_SLOTS;
                    const isOperating = allowedSlots.includes(slot);

                    // Detección consolidada de multi-reserva en el día
                    const userGroupInfo = slotBooking
                      ? findUserDayBookings(slotBooking, combinedAllSlots, dateStr, allPitches)
                      : null;
                    const isMultiHour = Boolean(userGroupInfo && userGroupInfo.isMultiBooking);
                    const relatedBookings = isMultiHour && userGroupInfo ? userGroupInfo.allBookings : (slotBooking ? [slotBooking] : []);

                    const hasPrev = isMultiHour && prevSlot
                      ? relatedBookings.some(b => getSlotTimeBogota(b.start_time) === prevSlot && b.pitch_id === pitch.id)
                      : false;
                    const hasNext = isMultiHour && nextSlot
                      ? relatedBookings.some(b => getSlotTimeBogota(b.start_time) === nextSlot && b.pitch_id === pitch.id)
                      : false;

                    let cellClass = 'bg-secondary/10 border-border/30 text-muted-foreground/40';
                    if (!isOperating && !slotBooking) {
                      cellClass = 'bg-red-50/50 border-red-200/50 text-red-500/50 dark:bg-red-950/20';
                    } else if (slotBooking) {
                      cellClass = isManual
                        ? 'bg-purple-100 dark:bg-purple-950/40 border-purple-300 text-purple-900 dark:text-purple-200'
                        : 'bg-primary/10 border-primary/40 text-foreground';
                    }

                    // Fusión visual vertical para bloques continuos de varias horas
                    let mergeClass = 'rounded-lg border';
                    if (isMultiHour) {
                      if (hasNext && !hasPrev) {
                        mergeClass = 'rounded-t-lg rounded-b-none border border-b-0 shadow-xs relative z-1';
                      } else if (hasPrev && hasNext) {
                        mergeClass = 'rounded-none border-x border-y-0 shadow-xs relative z-1';
                      } else if (hasPrev && !hasNext) {
                        mergeClass = 'rounded-b-lg rounded-t-none border border-t-0 shadow-xs relative z-1';
                      }
                    }

                    return (
                      <div
                        key={`${dateStr}-${slot}`}
                        onClick={() => {
                          onSelectSlot?.({
                            pitch,
                            slot,
                            dateStr,
                            booking: slotBooking,
                            relatedBookings: isMultiHour ? relatedBookings : (slotBooking ? [slotBooking] : []),
                            isOperating,
                          });
                        }}
                        className={`min-h-[36px] p-1 flex flex-col justify-center text-center transition-all cursor-pointer hover:ring-2 hover:ring-primary/60 hover:scale-[1.03] active:scale-95 select-none ${cellClass} ${mergeClass}`}
                        title={
                          slotBooking
                            ? `Ver detalle reserva: ${slotBooking.customer_name || 'Reserva'}${isMultiHour && userGroupInfo ? ` (${userGroupInfo.allBookings.length} horas: ${userGroupInfo.distinctPitchNames.join(', ')} · Total: $${userGroupInfo.totalPrice.toLocaleString('es-CO')})` : ''}`
                            : !isOperating
                              ? 'Cerrado'
                              : 'Toca para reservar'
                        }
                      >
                        {slotBooking ? (
                          <div className="flex flex-col items-center">
                            {hasPrev ? (
                              <span className="text-[8px] font-black text-primary/80 uppercase tracking-tighter">
                                ↳ Continuación
                              </span>
                            ) : (
                              <>
                                {isMultiHour && userGroupInfo && (
                                  <div className="flex flex-col items-center mb-0.5">
                                    <span className="text-[7px] font-black uppercase tracking-tight text-primary bg-primary/20 rounded px-1 leading-none">
                                      {userGroupInfo.allBookings.length}h {userGroupInfo.isMultiPitch ? 'Multi-cancha' : (!userGroupInfo.isContiguous ? 'No seguidas' : 'Juntas')}
                                    </span>
                                    {/* <span className="text-[7px] font-bold text-foreground/75 leading-none mt-0.5">
                                      Tot: ${userGroupInfo.totalPrice.toLocaleString('es-CO')} (Ab: ${userGroupInfo.depositAmount.toLocaleString('es-CO')})
                                    </span> */}
                                  </div>
                                )}
                                <div className="text-[10px] font-bold leading-tight truncate w-full" title={slotBooking.customer_name}>
                                  {slotBooking.customer_name || 'Reservado'}
                                </div>
                              </>
                            )}
                            {slotBooking.pitch_id !== pitch.id && (
                              <span className="text-[8px] font-black text-amber-600 dark:text-amber-400 uppercase leading-none mt-0.5">
                                Vinculada
                              </span>
                            )}
                            {slotBooking.payment_proof_url && !hasPrev && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onViewProof?.(slotBooking.payment_proof_url);
                                }}
                                className="mt-0.5 text-[8px] font-bold text-primary hover:underline flex items-center gap-0.5"
                                title="Ver comprobante de pago"
                              >
                                <FileText size={8} /> Comprobante
                              </button>
                            )}
                          </div>
                        ) : !isOperating ? (
                          <span className="text-[9px] font-bold leading-tight">Cerrado</span>
                        ) : (
                          <span className="text-[9px] opacity-20 font-medium">—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}