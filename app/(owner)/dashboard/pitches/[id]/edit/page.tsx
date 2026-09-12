'use client';

import { useState, useRef, useCallback, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  ArrowLeft, Loader2, Plus, ShieldAlert, Eye, X, MapPin,
  Video, Image as ImageIcon, Trash2, Check, DollarSign,
  ChevronLeft, ChevronRight, CreditCard, ArrowUp, ArrowDown, Copy, CheckCheck, GripVertical, Layers, Palette, Upload, Star,
  ChevronDown, Clock
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';

const LocationPicker = dynamic(() => import('@/components/maps/LocationPicker'), {
  ssr: false,
  loading: () => <div className="h-48 bg-secondary rounded-xl border border-border flex items-center justify-center"><Loader2 size={20} className="animate-spin text-primary" /></div>,
});

const MODALITIES = ['Fútbol 5', 'Fútbol 6', 'Fútbol 7', 'Fútbol 8', 'Fútbol 11'];
const SURFACES = ['Sintética', 'Grama Natural', 'Cemento'];
const DEFAULT_TIME_SLOTS = [
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'
];
const TONES = [
  { value: 'field-emerald', label: 'Esmeralda', color: '#16a34a' },
  { value: 'field-blue', label: 'Azul', color: '#2563eb' },
  { value: 'field-mint', label: 'Menta', color: '#0d9488' },
  { value: 'field-amber', label: 'Ámbar', color: '#d97706' },
];

const DEFAULT_PAYMENT_OPTIONS = [
  { key: 'nequi', label: 'Nequi', icon: '🟣' },
  { key: 'daviplata', label: 'Daviplata', icon: '🔴' },
  { key: 'bancolombia', label: 'Bancolombia', icon: '🔵' },

];

interface PaymentMethod {
  type: string;
  label: string;
  number: string;
  name: string;
}

interface MediaItem {
  type: 'photo' | 'video' | 'link';
  url: string;
  isMain?: boolean;
}

const getYoutubeId = (url: string) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};
// Preview card with image slider
function PreviewCard({ data }: { data: any }) {
  const [imgIdx, setImgIdx] = useState(0);
  const images = (data?.mediaUrls || []).filter((u: string) => !u.includes('youtube') && !u.includes('youtu.be') && !u.includes('vimeo')); const firstImage = images[imgIdx] || null;

  return (
    <div className="pitch-card max-w-sm mx-auto">
      <div
        className={`pitch-image ${data.tone} relative`}
        style={firstImage ? { backgroundImage: `linear-gradient(180deg, transparent 28%, rgba(6,18,17,.8)), url(${firstImage})` } : undefined}
      >
        <span className="pitch-tag">{data.types[0] || 'Fútbol 5'}</span>
        <div className="pitch-lines" />
        {images.length > 1 && (
          <div className="absolute bottom-2 right-2 flex gap-1 z-10">
            <button type="button" onClick={() => setImgIdx(i => Math.max(0, i - 1))} className="w-6 h-6 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/70">
              <ChevronLeft size={12} />
            </button>
            <button type="button" onClick={() => setImgIdx(i => Math.min(images.length - 1, i + 1))} className="w-6 h-6 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/70">
              <ChevronRight size={12} />
            </button>
          </div>
        )}
        {images.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
            {images.map((_: string, i: number) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === imgIdx ? 'bg-white' : 'bg-white/40'}`} />
            ))}
          </div>
        )}
      </div>
      <div className="pitch-body">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3>{data.name || 'Nombre de la cancha'}</h3>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin size={13} /> {data.address || 'Pasto, Nariño'}
            </p>
          </div>
          <div className="rating"><span>★</span> 5.0 <small>(nuevo)</small></div>
        </div>
        <div className="pitch-meta">
          <span>{data.surface}</span>
          {data.types.length > 1 && <span>+{data.types.length - 1} modal.</span>}
        </div>
        {data.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{data.description}</p>
        )}
        <p className="pitch-amenity text-xs truncate mt-1">{data.amenityChips.slice(0, 3).join(' · ') || 'Amenidades...'}</p>
        {data.paymentMethods.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {data.paymentMethods.map((pm: PaymentMethod) => (
              <span key={pm.type} className="text-[9px] font-bold px-1.5 py-0.5 bg-secondary rounded-full text-muted-foreground">{pm.label}</span>
            ))}
          </div>
        )}
        <div className="pitch-footer">
          <p><strong>${Number(data.price || 0).toLocaleString()}</strong> <small>/ hora</small></p>
          <div className="pitch-actions">
            <button className="detail-link">Ver cancha</button>
            <button className="btn-primary text-xs py-1 px-3">Reservar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EditPitchPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();
  const unwrappedParams = use(params);
  const pitchId = unwrappedParams.id;
  const [initialLoading, setInitialLoading] = useState(true);

  // Basic fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [types, setTypes] = useState<string[]>(['Fútbol 5']);
  const [surface, setSurface] = useState('Sintética');
  const [tone, setTone] = useState('field-emerald');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [grassColor, setGrassColor] = useState('');
  const [customSurface, setCustomSurface] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  // Pricing
  const [price, setPrice] = useState('80000');
  const [bookingType, setBookingType] = useState<'percentage' | 'fixed'>('percentage');
  const [bookingPct, setBookingPct] = useState(50);
  const [bookingFixedAmount, setBookingFixedAmount] = useState('40000');
  const [customPricing, setCustomPricing] = useState<Record<string, number>>({});

  // Time slots
  const [timeSlots, setTimeSlots] = useState<string[]>(DEFAULT_TIME_SLOTS);
  const [newTimeInput, setNewTimeInput] = useState('');

  // Payment methods
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [customPmLabel, setCustomPmLabel] = useState('');
  const [addingPayment, setAddingPayment] = useState<string | null>(null);
  const [pmNumber, setPmNumber] = useState('');
  const [pmName, setPmName] = useState('');

  // Amenities as chips
  const [amenityInput, setAmenityInput] = useState('');
  const [amenityChips, setAmenityChips] = useState<string[]>(['Iluminación LED', 'Parqueadero']);

  // Media (Fotos y Videos locales o enlaces)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaLinkInput, setMediaLinkInput] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [activeSection, setActiveSection] = useState<'basic' | 'pricing' | 'media' | 'location'>('basic');

  useEffect(() => {
    if (!user) return;
    const fetchPitch = async () => {
      const { data, error } = await supabase.from('pitches').select('*').eq('id', pitchId).single();
      if (data) {
        setName(data.name || '');
        setDescription(data.description || '');
        setTypes(data.supported_types || [data.type]);
        setSurface(data.surface || 'Sintética');
        setTone(data.tone || 'field-emerald');
        setPrice(data.price_per_hour?.toString() || '80000');
        setBookingPct(data.booking_percentage || 50);
        setCustomPricing(data.custom_pricing || {});
        if (data.custom_pricing) {
          if (data.custom_pricing.booking_type) setBookingType(data.custom_pricing.booking_type);
          if (data.custom_pricing.booking_fixed) setBookingFixedAmount(data.custom_pricing.booking_fixed.toString());
          if (data.custom_pricing.time_slots) setTimeSlots(data.custom_pricing.time_slots);
        }
        setPaymentMethods(data.payment_methods || []);
        setAmenityChips(data.amenities ? data.amenities.split(' · ') : []);
        setLat(data.lat);
        setLng(data.lng);
        setGrassColor(data.grass_color || '');
        setCustomSurface(data.custom_surface || '');
        setContactPhone(data.contact_phone || '');

        const mUrls = data.media_urls || (data.image_url ? [data.image_url] : []);
        setMediaItems(mUrls.map((u: string, i: number) => ({ type: u.includes('video') ? 'video' : 'photo', url: u, isMain: i === 0 })));
      }
      setInitialLoading(false);
    };
    fetchPitch();
  }, [user, pitchId, supabase]);

  const [showCustomType, setShowCustomType] = useState(false);
  const [customTypeInput, setCustomTypeInput] = useState('');

  const [showCustomSurface, setShowCustomSurface] = useState(false);
  const [customSurfaceInput, setCustomSurfaceInput] = useState('');

  const toggleType = (t: string) => {
    setTypes(prev => prev.includes(t) ? (prev.length > 1 ? prev.filter(x => x !== t) : prev) : [...prev, t]);
  };

  const addCustomType = () => {
    const val = customTypeInput.trim();
    if (val && !types.includes(val)) {
      setTypes(prev => [...prev, val]);
    }
    setCustomTypeInput('');
    setShowCustomType(false);
  };

  const addCustomSurface = () => {
    const val = customSurfaceInput.trim();
    if (val) {
      setSurface(val);
    }
    setCustomSurfaceInput('');
    setShowCustomSurface(false);
  };

  const handleAmenityKey = (e: React.KeyboardEvent) => {
    if ((e.key === ',' || e.key === 'Enter') && amenityInput.trim()) {
      e.preventDefault();
      const val = amenityInput.trim().replace(/,$/, '');
      if (val && !amenityChips.includes(val)) setAmenityChips(prev => [...prev, val]);
      setAmenityInput('');
    }
    if (e.key === 'Backspace' && !amenityInput && amenityChips.length > 0) {
      setAmenityChips(prev => prev.slice(0, -1));
    }
  };

  const handleCustomPriceChange = (slot: string, val: string) => {
    setCustomPricing(prev => {
      const updated = { ...prev };
      if (!val || isNaN(Number(val))) delete updated[slot];
      else updated[slot] = Number(val);
      return updated;
    });
  };

  const addTimeSlot = () => {
    if (!newTimeInput) return;
    const format = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!format.test(newTimeInput)) return alert('Formato inválido. Usa HH:MM (Ej. 14:30)');

    if (!timeSlots.includes(newTimeInput)) {
      const updated = [...timeSlots, newTimeInput].sort();
      setTimeSlots(updated);
    }
    setNewTimeInput('');
  };

  const removeTimeSlot = (slot: string) => {
    setTimeSlots(prev => prev.filter(s => s !== slot));
    setCustomPricing(prev => {
      const updated = { ...prev };
      delete updated[slot];
      return updated;
    });
  };

  // Subida de archivos Multimedia a Supabase Storage
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingMedia(true);
    try {
      const newItems: MediaItem[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isVideo = file.type.startsWith('video/');
        const ext = file.name.split('.').pop();
        const path = `pitch-images/${user?.id || 'anon'}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

        const { error } = await supabase.storage.from('pitch-images').upload(path, file);

        if (error) {
          // Si el bucket no existe en supabase, cae en fallback local temporal
          const objectUrl = URL.createObjectURL(file);
          newItems.push({ type: isVideo ? 'video' : 'photo', url: objectUrl });
        } else {
          const { data: publicData } = supabase.storage.from('pitch-images').getPublicUrl(path);
          newItems.push({ type: isVideo ? 'video' : 'photo', url: publicData.publicUrl });
        }
      }

      setMediaItems(prev => [...prev, ...newItems]);
    } catch (err: any) {
      alert('Error al procesar archivo: ' + err.message);
    } finally {
      setUploadingMedia(false);
    }

  };
  //combo box seleccion hora
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Lista de horas desde las 4:00 AM hasta las 12:00 AM (00:00)
  const allHours = [
    '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00',
    '22:00', '23:00'
  ];

  // Filtrar únicamente las horas que no han sido agregadas a la grilla
  const availableHours = allHours.filter((timeStr) => !timeSlots.includes(timeStr));

  // Cerrar el menú al hacer clic fuera de él
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatHourLabel = (timeStr: string) => {
    const hNum = parseInt(timeStr.split(':')[0], 10);
    const h12 = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum;
    const ampm = timeStr === '00:00' ? 'AM (Medianoche)' : hNum < 12 ? 'AM' : 'PM';
    return `${h12}:00 ${ampm}`;
  };

  // Reordenar Métodos de Pago
  const movePaymentMethod = (index: number, direction: 'up' | 'down') => {
    const newMethods = [...paymentMethods];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newMethods.length) return;

    const temp = newMethods[index];
    newMethods[index] = newMethods[targetIndex];
    newMethods[targetIndex] = temp;
    setPaymentMethods(newMethods);

  };

  const addPaymentMethod = () => {
    if (!pmNumber.trim()) return;
    let label = customPmLabel;

    if (addingPayment && addingPayment !== 'custom') {
      const opt = DEFAULT_PAYMENT_OPTIONS.find(o => o.key === addingPayment);
      if (opt) label = opt.label;
    }

    if (!label.trim()) return;

    setPaymentMethods(prev => [
      ...prev,
      { type: addingPayment || 'custom', label: label.trim(), number: pmNumber.trim(), name: pmName.trim() }
    ]);

    setAddingPayment(null);
    setCustomPmLabel('');
    setPmNumber('');
    setPmName('');

  };

  const handleLocationChange = (newLat: number, newLng: number, geocodedAddress?: string) => {
    setLat(newLat);
    setLng(newLng);
    if (geocodedAddress && !address) setAddress(geocodedAddress);
  };
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLat(pos.coords.latitude);
          setLng(pos.coords.longitude);
        },
        () => alert('No se pudo obtener la ubicación automáticamente.')
      );
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) return setErrorMsg('El nombre de la cancha es obligatorio.');
    if (!contactPhone.trim() || contactPhone.trim().length < 10) return setErrorMsg('El teléfono de la cancha es obligatorio y debe tener al menos 10 dígitos.');
    if (!user?.id) return setErrorMsg('Sesión no detectada. Recarga la página.');
    if (paymentMethods.length === 0) return setErrorMsg('Debes agregar al menos un método de pago.');
    if (!lat || !lng) return setErrorMsg('Debes agregar la ubicación de la cancha.');
    if (mediaItems.length === 0) return setErrorMsg('Debes agregar al menos una imagen o video.');

    setLoading(true);
    setErrorMsg('');

    try {
      // Ordenar items para que el principal quede de primero
      const mainItem = mediaItems.find(m => m.isMain) || mediaItems[0];
      const otherItems = mediaItems.filter(m => m !== mainItem);
      const orderedMediaItems = mainItem ? [mainItem, ...otherItems] : [];
      const mediaUrls = orderedMediaItems.map(m => m.url);

      const res = await fetch('/api/admin-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_pitch',
          payload: {
            pitch_id: pitchId,
            owner_id: user.id,
            name,
            description,
            type: types[0],
            supported_types: types,
            surface,
            grass_color: grassColor,
            custom_surface: customSurface,
            tone,
            price,
            booking_percentage: bookingType === 'percentage' ? bookingPct : 0,
            custom_pricing: { ...customPricing, booking_type: bookingType, booking_fixed: Number(bookingFixedAmount), time_slots: timeSlots },
            amenities: amenityChips.join(' · '),
            contact_phone: contactPhone,
            payment_methods: paymentMethods,
            image_url: mediaUrls[0] || null,
            media_urls: mediaUrls,
            lat,
            lng,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo crear la cancha.');
      router.push('/dashboard/pitches');
      router.refresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de conexión.');
    } finally {
      setLoading(false);
    }

  };

  const previewData = {
    name, description, types, surface, tone,
    price, bookingPct, amenityChips, mediaItems, customSurface, grassColor, lat, lng, paymentMethods
  };
  const sections = [
    { key: 'basic', label: 'Información' },
    { key: 'pricing', label: 'Precios' },
    { key: 'media', label: 'Fotos' },
    { key: 'location', label: 'Ubicación' },
  ] as const;
  const setMainMedia = (indexToSet: number) => {
    setMediaItems(prevItems =>
      prevItems.map((item, index) => ({
        ...item,
        isMain: index === indexToSet,
      }))
    );
  };

  if (initialLoading) return <div className="p-20 flex justify-center"><Loader2 size={32} className="animate-spin text-primary" /></div>;

  return (
    <div className="max-w-3xl mx-auto pb-24 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        {/* Botón Volver + Título */}
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/pitches"
            className="p-2.5 rounded-2xl border border-border bg-card hover:bg-secondary text-foreground transition-all shadow-xs shrink-0"
            title="Volver a canchas"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <p className="eyebrow accent-label">EDITAR CANCHA</p>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Actualiza tu cancha</h1>
            <p className="lead text-xs sm:text-sm">Actualiza la información de tu cancha.</p>
          </div>
        </div>

        {/* Botón Vista Previa con texto visible */}
        <button
          onClick={() => setShowPreview(true)}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer active:scale-95 self-start sm:self-auto"
        >
          <Eye size={15} />
          <span>Vista Previa</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2 mb-5">
          <ShieldAlert size={16} /><span>{errorMsg}</span>
        </div>
      )}

      {/* Navigation tabs */}
      <div className="bg-secondary/40 p-1 rounded-2xl border border-border mb-6">
        <div className="flex items-center w-full">
          {sections.map((s) => {
            const isActive = activeSection === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                className={`flex-1 py-2 px-1 sm:px-3 rounded-xl text-[11px] sm:text-xs font-bold transition-all text-center leading-tight ${isActive
                  ? 'bg-card text-emerald-600 shadow-xs border border-border/80 font-black'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card/30'
                  }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── SECCIÓN 1: INFORMACIÓN BÁSICA ─── */}
      {activeSection === 'basic' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
            <h2 className="font-bold text-base border-b border-border pb-3">Información General</h2>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase">Nombre de la Cancha *</label>
              <input
                type="text"
                placeholder="Ej: Cancha Sintética"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-3 text-sm border border-border rounded-xl bg-background outline-none focus:border-primary transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase">Descripción (opcional)</label>
              <textarea
                placeholder="Describe tu cancha: características únicas, normas, servicios adicionales..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 text-sm border border-border rounded-xl bg-background outline-none focus:border-primary transition-colors resize-none"
              />
            </div>

            {/* Modalidades */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase flex items-center justify-between">
                <span>Teléfono de la cancha</span>
                <span className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                  Obligatorio *
                </span>
              </label>
              <input
                type="tel"
                required
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Ej: 3001234567"
                value={contactPhone}
                onChange={e => setContactPhone(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-3 text-sm border border-border rounded-xl bg-background outline-none focus:border-emerald-600 transition-colors font-medium"
              />
              <p className="text-[11px] text-muted-foreground">
                Número de contacto directo (solo números) para atender las reservas de esta cancha.
              </p>
            </div>

            <div className="space-y-2 mt-6">
              <label className="text-xs font-bold text-muted-foreground uppercase">Modalidades disponibles</label>
              <p className="text-[11px] text-muted-foreground">Selecciona todas las que apliquen.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {Array.from(new Set([...MODALITIES, ...types])).map(m => {
                  const active = types.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleType(m)}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all relative ${active
                        ? 'bg-primary text-white border-primary shadow-md'
                        : 'bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'}`}
                    >
                      <span className="truncate block w-full px-2">{m}</span>
                    </button>
                  );
                })}
                {!showCustomType ? (
                  <button type="button" onClick={() => setShowCustomType(true)} className="p-2.5 rounded-xl border border-dashed border-border text-xs font-bold text-center text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all flex items-center justify-center gap-1">
                    <Plus size={14} /> Otra
                  </button>
                ) : (
                  <div className="col-span-2 flex gap-1">
                    <input type="text" value={customTypeInput} onChange={e => setCustomTypeInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomType()} placeholder="Agrega otra modalidad" className="flex-1 px-3 text-xs border border-border rounded-xl bg-background outline-none focus:border-primary" autoFocus />
                    <button type="button" onClick={addCustomType} className="bg-primary text-white px-2 rounded-xl"><Check size={14} /></button>
                    <button type="button" onClick={() => setShowCustomType(false)} className="bg-secondary text-muted-foreground px-2 rounded-xl"><X size={14} /></button>
                  </div>
                )}
              </div>
            </div>

            {/* Superficie */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase">Superficie</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Array.from(new Set([...SURFACES, surface])).map(s => (
                  <button key={s} type="button" onClick={() => setSurface(s)}
                    className={`p-3 rounded-xl border text-xs font-bold text-center transition-all truncate ${surface === s ? 'bg-primary text-white border-primary shadow-md' : 'bg-card border-border text-muted-foreground hover:border-primary/30'}`}>
                    {s}
                  </button>
                ))}
                {!showCustomSurface ? (
                  <button type="button" onClick={() => setShowCustomSurface(true)} className="p-3 rounded-xl border border-dashed border-border text-xs font-bold text-center text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all flex items-center justify-center gap-1">
                    <Plus size={14} /> Otra
                  </button>
                ) : (
                  <div className="col-span-2 flex gap-1">
                    <input type="text" value={customSurfaceInput} onChange={e => setCustomSurfaceInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomSurface()} placeholder="Ej: Arena" className="flex-1 px-3 text-xs border border-border rounded-xl bg-background outline-none focus:border-primary" autoFocus />
                    <button type="button" onClick={addCustomSurface} className="bg-primary text-white px-2 rounded-xl"><Check size={14} /></button>
                    <button type="button" onClick={() => setShowCustomSurface(false)} className="bg-secondary text-muted-foreground px-2 rounded-xl"><X size={14} /></button>
                  </div>
                )}
              </div>
            </div>



            {/* Amenities */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase">Servicios / Amenidades</label>
              <p className="text-[11px] text-muted-foreground">Escribe y presiona coma o Enter para agregar.</p>
              <div className="flex flex-wrap gap-2 p-3 border border-border rounded-xl bg-background min-h-[48px] cursor-text" onClick={() => document.getElementById('amenity-input')?.focus()}>
                {amenityChips.map(chip => (
                  <span key={chip} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-semibold px-2.5 py-1 rounded-full">
                    {chip}
                    <button type="button" onClick={() => setAmenityChips(prev => prev.filter(c => c !== chip))} className="opacity-60 hover:opacity-100 ml-0.5">✕</button>
                  </span>
                ))}
                <input id="amenity-input" type="text" value={amenityInput}
                  onChange={e => setAmenityInput(e.target.value)}
                  onKeyDown={handleAmenityKey}
                  onBlur={() => { if (amenityInput.trim()) { setAmenityChips(prev => [...prev, amenityInput.trim()]); setAmenityInput(''); } }}
                  placeholder={amenityChips.length === 0 ? 'Luces LED, Parqueadero, Camerinos...' : ''}
                  className="flex-1 min-w-[120px] outline-none bg-transparent text-xs" />
              </div>
            </div>

            {/* ── MÉTODOS DE PAGO ── */}
            {/* ── MÉTODOS DE PAGO CON REORDENAMIENTO ── */}
            <div className="space-y-3 border-t border-border pt-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                  <CreditCard size={12} /> Métodos de Pago y Orden
                </label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Agrega métodos de pago y usa las flechas para definir el orden en que se mostrarán.
                </p>
              </div>

              {paymentMethods.length > 0 && (
                <div className="space-y-2">
                  {paymentMethods.map((pm, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 bg-secondary/50 border border-border rounded-xl text-xs font-semibold">
                      <div className="flex items-center gap-2">
                        <GripVertical size={14} className="text-muted-foreground" />
                        <span>
                          <strong>{pm.label}</strong>: {pm.number} {pm.name && `(${pm.name})`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => movePaymentMethod(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1 bg-background border border-border rounded hover:bg-secondary disabled:opacity-30"
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => movePaymentMethod(idx, 'down')}
                          disabled={idx === paymentMethods.length - 1}
                          className="p-1 bg-background border border-border rounded hover:bg-secondary disabled:opacity-30"
                        >
                          <ArrowDown size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentMethods(prev => prev.filter((_, i) => i !== idx))}
                          className="p-1 text-red-500 hover:text-red-700 ml-1"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Formulario Agregar Método de Pago */}
              {addingPayment ? (
                <div className="p-4 bg-secondary/30 rounded-xl border border-border space-y-3">
                  {addingPayment === 'custom' ? (
                    <input
                      type="text"
                      placeholder="Nombre del Método (Ej. Davivienda / Bre-B)"
                      value={customPmLabel}
                      onChange={e => setCustomPmLabel(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-border rounded-xl bg-background outline-none"
                    />
                  ) : (
                    <p className="text-xs font-bold">Configurar {DEFAULT_PAYMENT_OPTIONS.find(o => o.key === addingPayment)?.label}</p>
                  )}

                  <input
                    type="text"
                    placeholder="Número de Cuenta / Teléfono"
                    value={pmNumber}
                    onChange={e => setPmNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-border rounded-xl bg-background outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Titular (Opcional)"
                    value={pmName}
                    onChange={e => setPmName(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-border rounded-xl bg-background outline-none"
                  />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAddingPayment(null)}
                      className="flex-1 py-1.5 text-xs font-bold border border-border rounded-xl hover:bg-secondary"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={addPaymentMethod}
                      disabled={!pmNumber.trim()}
                      className="flex-1 py-1.5 text-xs font-bold bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-50"
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_PAYMENT_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setAddingPayment(opt.key)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-bold bg-card border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                    >
                      <span>{opt.icon}</span> {opt.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAddingPayment('custom')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-dashed text-xs font-bold bg-card border-primary/50 text-primary hover:bg-primary/5"
                  >
                    <Plus size={12} /> Otro Método
                  </button>
                </div>
              )}
            </div>
          </div>

          <button onClick={() => setActiveSection('pricing')} className="w-full btn-primary py-3">
            Continuar → Precios
          </button>
        </div>
      )}

      {/* ─── SECCIÓN 2: PRECIOS ─── */}
      {activeSection === 'pricing' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
            <h2 className="font-bold text-base border-b border-border pb-3">Configuración de Precios</h2>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase">Precio Base por Hora (COP)</label>
              <div className="relative">
                <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="text" placeholder="80.000"
                  value={price ? new Intl.NumberFormat('es-CO').format(Number(price)) : ''}
                  onChange={e => setPrice(e.target.value.replace(/\D/g, ''))}
                  className="w-full pl-9 pr-4 py-3 text-sm border border-border rounded-xl bg-background outline-none focus:border-primary" />
              </div>
            </div>

            <div className="space-y-4 border-b border-border pb-4">
              <label className="text-xs font-bold text-muted-foreground uppercase">Tipo de Abono</label>

              <div className="flex bg-secondary/50 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setBookingType('percentage')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${bookingType === 'percentage' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'}`}
                >
                  Porcentaje
                </button>
                <button
                  type="button"
                  onClick={() => setBookingType('fixed')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${bookingType === 'fixed' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'}`}
                >
                  Valor Fijo
                </button>
              </div>

              {bookingType === 'percentage' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-muted-foreground">Porcentaje (%)</label>
                    <span className="text-lg font-extrabold text-primary">{bookingPct}%</span>
                  </div>
                  <input type="range" min={10} max={100} step={5} value={bookingPct} onChange={e => setBookingPct(Number(e.target.value))} className="w-full accent-primary" />
                  <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3">
                    💡 Abono: <strong className="text-primary">${Math.round(Number(price || 0) * bookingPct / 100).toLocaleString()}</strong> por hora.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="text-xs font-bold text-muted-foreground">Valor Fijo (COP)</label>
                  <div className="relative">
                    <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input type="text" placeholder="40.000"
                      value={bookingFixedAmount ? new Intl.NumberFormat('es-CO').format(Number(bookingFixedAmount)) : ''}
                      onChange={e => setBookingFixedAmount(e.target.value.replace(/\D/g, ''))}
                      className="w-full pl-9 pr-4 py-3 text-sm border border-border rounded-xl bg-background outline-none focus:border-primary" />
                  </div>
                  <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3">
                    💡 Abono: <strong className="text-primary">${Number(bookingFixedAmount || 0).toLocaleString()}</strong> fijos por hora.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {/* Encabezado y Selector Filtrado */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Horarios y Precios Especiales
                  </label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Agrega horas específicas o asigna tarifas personalizadas.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Desplegable Propio / Custom UI */}
                  <div className="relative min-w-[200px]" ref={dropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsOpen(!isOpen)}
                      className="w-full px-3.5 py-2 text-xs font-bold border border-border rounded-xl bg-card hover:bg-secondary/50 text-foreground flex items-center justify-between gap-2 transition-all shadow-xs cursor-pointer focus:border-emerald-600 active:scale-98"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Clock size={14} className="text-emerald-600 shrink-0" />
                        <span className={newTimeInput ? 'text-foreground font-black' : 'text-muted-foreground font-medium'}>
                          {newTimeInput ? formatHourLabel(newTimeInput) : 'Seleccionar hora'}
                        </span>
                      </div>
                      <ChevronDown size={15} className={`text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Menú Flotante con scroll suave y estilos del sistema */}
                    {isOpen && (
                      <div className="absolute right-0 top-full mt-1.5 w-full bg-card border border-border rounded-xl shadow-lg z-50 max-h-52 overflow-y-auto p-1.5 space-y-1 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
                        {availableHours.length === 0 ? (
                          <div className="px-3 py-2 text-center text-[11px] text-muted-foreground font-medium">
                            Todas las horas han sido agregadas.
                          </div>
                        ) : (
                          availableHours.map((timeStr) => {
                            const isSelected = newTimeInput === timeStr;
                            return (
                              <button
                                key={timeStr}
                                type="button"
                                onClick={() => {
                                  setNewTimeInput(timeStr);
                                  setIsOpen(false);
                                }}
                                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between transition-colors ${isSelected
                                  ? 'bg-emerald-600 text-white font-black'
                                  : 'hover:bg-emerald-500/10 hover:text-emerald-600 text-foreground'
                                  }`}
                              >
                                <span>{formatHourLabel(timeStr)}</span>
                                <span className={`text-[10px] font-semibold opacity-60 ${isSelected ? 'text-white' : 'text-muted-foreground'}`}>
                                  {timeStr}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* Botón Agregar */}
                  <button
                    type="button"
                    onClick={() => {
                      if (newTimeInput) {
                        addTimeSlot();
                        setNewTimeInput('');
                      }
                    }}
                    disabled={!newTimeInput}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-xs active:scale-95"
                  >
                    <Plus size={16} />
                    <span>Agregar</span>
                  </button>
                </div>
              </div>

              {/* Grilla de Horarios Agregados */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {timeSlots.map((slot) => {
                  const val = customPricing[slot] || '';
                  const isCustom = !!customPricing[slot];
                  const hNum = parseInt(slot.split(':')[0], 10);
                  const h12 = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum;
                  const ampm = hNum < 12 ? 'am' : 'pm';

                  return (
                    <div
                      key={slot}
                      className={`p-2 rounded-xl border transition-all ${isCustom
                        ? 'bg-amber-500/10 border-amber-500/30 dark:bg-amber-950/20'
                        : 'bg-secondary/40 border-border hover:border-border/80'
                        }`}
                    >
                      {/* Cabecera del ítem de hora */}
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="flex items-end gap-0.5">
                          {isCustom && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mb-1 mr-0.5" />}
                          <span
                            className={`font-black text-xs ${isCustom ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
                              }`}
                          >
                            {h12}:00
                          </span>
                          <span className="text-[9px] uppercase font-bold opacity-60 mb-0.5">{ampm}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeTimeSlot(slot)}
                          className="text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors p-1 rounded-lg"
                          title="Eliminar hora"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {/* Campo de precio especial */}
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-bold">
                          $
                        </span>
                        <input
                          type="text"
                          placeholder={price ? new Intl.NumberFormat('es-CO').format(Number(price)) : 'Precio'}
                          value={val ? new Intl.NumberFormat('es-CO').format(Number(val)) : ''}
                          onChange={(e) => handleCustomPriceChange(slot, e.target.value.replace(/\D/g, ''))}
                          className={`w-full pl-4 pr-1.5 py-1 text-[11px] font-bold border rounded-lg outline-none transition-colors ${isCustom
                            ? 'border-amber-500/40 bg-card text-amber-600 dark:text-amber-400 focus:border-amber-500'
                            : 'border-border/60 bg-background focus:border-emerald-600'
                            }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setActiveSection('basic')} className="flex-1 btn-primary bg-secondary text-foreground hover:bg-border py-3">← Atrás</button>
            <button onClick={() => setActiveSection('media')} className="flex-1 btn-primary py-3">Continuar → Fotos</button>
          </div>
        </div>
      )}

      {/* ─── SECCIÓN 3: MULTIMEDIA Y SELECCIÓN DE PORTADA ─── */}
      {activeSection === 'media' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
            <h2 className="font-bold text-base border-b border-border pb-3">Galería Multimedia</h2>

            <div className="flex flex-wrap gap-2">
              <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleFileUpload} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl flex items-center gap-2"
              >
                <Upload size={14} /> Subir desde Dispositivo
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://... (enlace de imagen o video de YouTube)"
                value={mediaLinkInput}
                onChange={e => setMediaLinkInput(e.target.value)}
                className="flex-1 px-3 py-2 text-xs border border-border rounded-xl bg-background outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (mediaLinkInput.trim()) {
                    setMediaItems(prev => [...prev, { type: 'link', url: mediaLinkInput.trim() }]);
                    setMediaLinkInput('');
                  }
                }}
                className="btn-primary px-3 py-2 text-xs font-bold"
              >
                Agregar Link
              </button>
            </div>

            {uploadingMedia && (
              <p className="text-xs text-primary font-bold flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Procesando archivos...
              </p>
            )}

            {/* Grid de imágenes con selector de Foto Principal */}
            {mediaItems.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {mediaItems.map((item, i) => (
                  <div key={i} className={`relative rounded-xl overflow-hidden border aspect-video bg-black group ${item.isMain ? 'ring-2 ring-primary border-primary' : 'border-border'}`}>
                    {item.type === 'video' ? (
                      <video src={item.url} className="w-full h-full object-cover" />
                    ) : item.type === 'link' && getYoutubeId(item.url) ? (
                      <iframe src={`https://www.youtube.com/embed/${getYoutubeId(item.url)}`} className="w-full h-full object-cover pointer-events-none" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                    ) : (
                      <img src={item.url} alt={`Media ${i}`} className="w-full h-full object-cover" />
                    )}

                    {/* Botón para marcar Foto Principal */}
                    <button
                      type="button"
                      onClick={() => setMainMedia(i)}
                      className={`absolute top-2 left-2 p-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all ${item.isMain ? 'bg-primary text-white' : 'bg-black/60 text-white/80 hover:bg-black'
                        }`}
                    >
                      <Star size={10} fill={item.isMain ? 'white' : 'none'} />
                      {item.isMain ? 'PORTADA' : 'Hacer Portada'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setMediaItems(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-2 border-dashed border-border rounded-xl p-8 text-center text-muted-foreground">
                <ImageIcon size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-xs font-semibold">No has agregado fotos ni videos aún.</p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setActiveSection('pricing')} className="flex-1 btn-primary bg-secondary text-foreground hover:bg-border py-3">← Atrás</button>
            <button onClick={() => setActiveSection('location')} className="flex-1 btn-primary py-3">Continuar → Ubicación Mapa</button>
          </div>
        </div>
      )}

      {/* ─── SECCIÓN 4: UBICACIÓN ─── */}
      {/* ─── SECCIÓN 4: UBICACIÓN Y MAPA ─── */}
      {activeSection === 'location' && (
        <div className="space-y-4 sm:space-y-6 animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-xs">
            {/* Cabecera de Ubicación */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-border pb-3">
              <h2 className="font-bold text-base text-foreground">Ubicación en el Mapa</h2>
              <button
                type="button"
                onClick={getCurrentLocation}
                className="self-start sm:self-auto text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 rounded-xl border border-emerald-500/20 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <MapPin size={14} className="shrink-0" />
                <span>Usar mi GPS Actual</span>
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Haz clic o arrastra el marcador en el mapa para fijar la ubicación exacta de tu cancha.
            </p>

            {/* Contenedor del Mapa Adaptable */}
            <div className="h-56 sm:h-72 w-full rounded-xl overflow-hidden border border-border shadow-inner relative z-0">
              <LocationPicker
                lat={lat || 1.2136}
                lng={lng || -77.2811}
                onChange={handleLocationChange}
              />
            </div>

            {/* Badge de Coordenadas */}
            {lat && lng && (
              <div className="p-3 bg-secondary/50 border border-border/80 rounded-xl text-xs space-y-1">
                <p className="font-bold text-foreground">Coordenadas Seleccionadas:</p>
                <p className="text-muted-foreground font-mono text-[11px] sm:text-xs">
                  Lat: <span className="text-foreground font-semibold">{lat.toFixed(6)}</span>, Lng:{' '}
                  <span className="text-foreground font-semibold">{lng.toFixed(6)}</span>
                </p>
              </div>
            )}
          </div>

          {/* Botones de Navegación de Paso */}
          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setActiveSection('media')}
              className="flex-1 py-3 px-4 border border-border rounded-xl text-xs sm:text-sm font-bold bg-card hover:bg-secondary text-foreground transition-all shadow-xs active:scale-98"
            >
              ← Atrás
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="flex-[2] py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
            >
              {loading && <Loader2 size={16} className="animate-spin shrink-0" />}
              <span>{loading ? 'Publicando...' : 'Publicar Cancha'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── MODAL DE VISTA PREVIA ─── */}
      {/* MODAL DE VISTA PREVIA */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-background border border-border rounded-2xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base">Vista Previa de la Tarjeta</h2>
              <button onClick={() => setShowPreview(false)} className="p-1 rounded-lg hover:bg-secondary">
                <X size={18} />
              </button>
            </div>

            <PreviewCard data={previewData} />

            <button
              onClick={() => setShowPreview(false)}
              className="w-full py-2.5 bg-secondary text-xs font-bold rounded-xl hover:bg-secondary/80"
            >
              Cerrar Vista Previa
            </button>
          </div>
        </div>
      )}
    </div>
  );
}