'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  MapPin, Star, Layers, ShieldCheck, CreditCard,
  ChevronLeft, ChevronRight, Edit3, Eye, Sparkles, X, Share2, DollarSign, Heart
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import { useFavorites } from '@/lib/favorites-context';

export interface PaymentMethod {
  type: string;
  label: string;
  number?: string;
  name?: string;
}

export interface PitchData {
  id: string;
  name: string;
  description?: string;
  type?: string;
  supported_types?: string[];
  surface?: string;
  grass_color?: string;
  custom_surface?: string;
  tone?: string;
  price?: number | string;
  price_per_hour?: number | string;
  booking_percentage?: number;
  image_url?: string;
  image?: string;
  media_urls?: string[];
  amenities?: string | string[];
  payment_methods?: PaymentMethod[] | any;
  lat?: number;
  lng?: number;
}

interface PitchCardProps {
  pitch: PitchData;
  editUrl?: string;
  isAdmin?: boolean;
  onOpen?: (pitch: any) => void;
  onBook?: (pitch: any) => void;
}

export function PitchCard({ pitch, editUrl, isAdmin = true, onOpen, onBook }: PitchCardProps) {
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);

  const { isFavorite: checkFav, toggleFavorite: doToggleFav } = useFavorites();
  const isFavorite = checkFav(pitch.id);

  const [loadingFavorite, setLoadingFavorite] = useState(false);
  const [showFlyAnim, setShowFlyAnim] = useState(false);
  const heartBtnRef = useRef<HTMLButtonElement>(null);
  const [flyingHearts, setFlyingHearts] = useState<Array<{ id: number; startX: number; startY: number; targetX: number; targetY: number }>>([]);

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isFavorite) {
      setShowFlyAnim(true);
      setTimeout(() => setShowFlyAnim(false), 800);

      const btn = heartBtnRef.current || (e.currentTarget as HTMLElement);
      if (btn && typeof window !== 'undefined') {
        const startRect = btn.getBoundingClientRect();
        const startX = startRect.left + startRect.width / 2;
        const startY = startRect.top + startRect.height / 2;

        const sidebarEl = document.getElementById('nav-favorites-sidebar');
        const mobileEl = document.getElementById('nav-favorites-mobile');

        let targetEl: HTMLElement | null = null;
        if (sidebarEl && sidebarEl.offsetParent !== null && sidebarEl.getBoundingClientRect().width > 0) {
          targetEl = sidebarEl;
        } else if (mobileEl && mobileEl.offsetParent !== null && mobileEl.getBoundingClientRect().width > 0) {
          targetEl = mobileEl;
        }

        let targetX = startX - 220;
        let targetY = Math.max(60, startY - 250);

        if (targetEl) {
          const tRect = targetEl.getBoundingClientRect();
          targetX = tRect.left + tRect.width / 2;
          targetY = tRect.top + tRect.height / 2;
        }

        const id = Date.now();
        setFlyingHearts(prev => [...prev, { id, startX, startY, targetX, targetY }]);

        setTimeout(() => {
          if (targetEl) {
            targetEl.classList.add('animate-bounce');
            setTimeout(() => {
              targetEl?.classList.remove('animate-bounce');
            }, 600);
          }
        }, 650);

        setTimeout(() => {
          setFlyingHearts(prev => prev.filter(h => h.id !== id));
        }, 900);
      }
    }

    setLoadingFavorite(true);
    try {
      await doToggleFav(pitch.id);
    } finally {
      setLoadingFavorite(false);
    }
  };

  // Normalizar imágenes / media
  const allMedia: string[] = Array.isArray(pitch.media_urls) && pitch.media_urls.length > 0
    ? pitch.media_urls
    : pitch.image_url || pitch.image
      ? [pitch.image_url || pitch.image || '']
      : [];

  const mainImage = allMedia[0] || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&auto=format&fit=crop&q=60';

  // Normalizar amenidades
  const amenityList: string[] = Array.isArray(pitch.amenities)
    ? pitch.amenities
    : typeof pitch.amenities === 'string'
      ? pitch.amenities.split('·').map(a => a.trim()).filter(Boolean)
      : [];

  // Normalizar métodos de pago
  const paymentMethods: PaymentMethod[] = Array.isArray(pitch.payment_methods)
    ? pitch.payment_methods
    : [];

  // Normalizar modalidades
  const modalities: string[] = Array.isArray(pitch.supported_types) && pitch.supported_types.length > 0
    ? pitch.supported_types
    : pitch.type ? [pitch.type] : ['Fútbol 5'];

  const displayPrice = pitch.price || pitch.price_per_hour || 0;

  return (
    <>
      {/* ── TARJETA PRINCIPAL ── */}
      <div
        className="group relative bg-card border border-border/80 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between cursor-pointer"
      >
        {/* Botón corazón flotante — fuera del área clickable */}
        <button
          ref={heartBtnRef}
          type="button"
          onClick={toggleFavorite}
          disabled={loadingFavorite}
          className={`absolute top-3 right-3 z-30 p-2 rounded-full shadow-md backdrop-blur-sm transition-all hover:scale-110 active:scale-95 ${isFavorite
            ? 'bg-green-500 text-white'
            : 'bg-white/90 dark:bg-zinc-900/90 text-foreground hover:bg-white hover:text-green-500'
            }`}
          title="Agregar a favoritos"
        >
          <Heart size={14} className={isFavorite ? 'fill-current' : ''} />
        </button>

        {/* Flying Heart Animation */}
        {showFlyAnim && (
          <div className="absolute top-3 right-3 z-50 pointer-events-none origin-center animate-fly-heart">
            <Heart size={28} className="text-green-500 fill-green-500 drop-shadow-xl" />
          </div>
        )}

        <div onClick={() => { if (onOpen) onOpen(pitch); else setShowDetailModal(true); }}>
          {/* BANNER / FOTO DESTACADA */}
          <div className="relative aspect-[4/3] w-full bg-secondary overflow-hidden">
            <img
              src={mainImage}
              alt={pitch.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

            {/* Badges de encabezado sobre la imagen */}
            <div className="absolute top-3 left-3 right-16 flex items-center gap-2 z-10">
              <div className="flex flex-wrap gap-1.5">
                <span className="bg-emerald-600/90 backdrop-blur-md text-white font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm">
                  {modalities[0]}
                </span>
                {pitch.surface && (
                  <span className="bg-black/60 backdrop-blur-md text-white font-semibold text-[10px] px-2.5 py-1 rounded-full border border-white/20">
                    {pitch.surface}
                  </span>
                )}
              </div>

              {/* Botón rápido de editar (Administrador) */}
              {isAdmin && editUrl && (
                <Link
                  href={editUrl}
                  onClick={(e) => e.stopPropagation()}
                  className="ml-auto p-2 bg-white/90 dark:bg-zinc-900/90 text-foreground rounded-full hover:bg-primary hover:text-white transition-colors shadow-md backdrop-blur-sm"
                  title="Editar Cancha"
                >
                  <Edit3 size={14} />
                </Link>
              )}
            </div>

            {/* Nombre sobre la parte inferior del Banner */}
            <div className="absolute bottom-3 left-4 right-4 z-10">
              <h3 className="text-l font-black tracking-tighter uppercase text-white leading-none drop-shadow-md group-hover:text-green-300 transition-all duration-300 mb-2">
                {pitch.name}
              </h3>

              {pitch.grass_color && (
                <p className="text-[11px] text-emerald-200/90 font-medium flex items-center gap-1 mt-0.5">
                  <Layers size={11} /> Grama: {pitch.grass_color}
                </p>
              )}
            </div>
          </div>

          {/* CUERPO DE LA TARJETA */}
          <div className="p-4 space-y-3.5">
            {/* Descripción corta */}
            {pitch.description ? (
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {pitch.description}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground/60 italic">Sin descripción registrada.</p>
            )}

            {/* Modalidades adicionales */}
            {modalities.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground font-bold uppercase">Otras modalidades:</span>
                {modalities.slice(1).map((m, idx) => (
                  <span key={idx} className="text-[10px] bg-secondary px-2 py-0.5 rounded-md font-semibold text-foreground">
                    {m}
                  </span>
                ))}
              </div>
            )}

            {/* Superficie personalizada */}
            {pitch.custom_surface && (
              <div className="text-[11px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 p-2 rounded-xl">
                <strong>Detalle de superficie:</strong> {pitch.custom_surface}
              </div>
            )}

            {/* Amenidades / Servicios */}
            {amenityList.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block">
                  Servicios Incluidos
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {amenityList.slice(0, 4).map((item, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold bg-secondary/80 text-foreground px-2.5 py-1 rounded-lg border border-border/50"
                    >
                      <Sparkles size={9} className="text-emerald-500" />
                      {item}
                    </span>
                  ))}
                  {amenityList.length > 4 && (
                    <span className="text-[10px] text-muted-foreground font-bold px-1.5 py-1">
                      +{amenityList.length - 4} más
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Métodos de Pago */}
            {paymentMethods.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-border/50">
                <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <CreditCard size={11} className="text-primary" /> Métodos de Pago
                </span>
                <div className="flex flex-wrap gap-1">
                  {paymentMethods.map((pm, idx) => (
                    <span
                      key={idx}
                      className="text-[9px] font-bold px-2 py-0.5 bg-card border border-border rounded-md text-foreground shadow-2xs"
                    >
                      {pm.label}
                    </span>
                  ))}
                </div>

              </div>
            )}
          </div>
        </div>

        {/* PIE DE TARJETA: ACCIONES (SIN PRECIO) */}
        <div
          className="p-4 border-t border-border/80 bg-secondary/20"
          onClick={() => { if (onOpen) onOpen(pitch); else setShowDetailModal(true); }}
        >
          {onBook && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onBook(pitch);
              }}
              className="w-full py-3 px-4 bg-[#008744] hover:bg-[#054D27] text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              Reservar
            </button>
          )}
        </div>
      </div>

      {/* ── MODAL VISTA PREVIA DETALLADA DE LA CANCHA ── */}
      {showDetailModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="bg-card border border-border w-full max-w-2xl max-h-[90vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Encabezado del Modal */}
            <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/40">
              <div>
                <h2 className="text-3xl font-black tracking-tighter uppercase text-foreground mb-4 font-sans drop-shadow-sm">
                  {pitch.name}
                </h2>

              </div>
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Contenido Desplazable del Modal */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Carrusel / Visor Multimedia */}
              {allMedia.length > 0 && (
                <div className="relative rounded-2xl overflow-hidden bg-black aspect-[16/9] border border-border">
                  <img
                    src={allMedia[activeMediaIndex]}
                    alt="Cancha media"
                    className="w-full h-full object-cover"
                  />
                  {allMedia.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setActiveMediaIndex(i => Math.max(0, i - 1))}
                        disabled={activeMediaIndex === 0}
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/60 text-white rounded-full disabled:opacity-30 hover:bg-black/90 transition-all"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveMediaIndex(i => Math.min(allMedia.length - 1, i + 1))}
                        disabled={activeMediaIndex === allMedia.length - 1}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/60 text-white rounded-full disabled:opacity-30 hover:bg-black/90 transition-all"
                      >
                        <ChevronRight size={16} />
                      </button>
                      <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1.5">
                        {allMedia.map((_, idx) => (
                          <span
                            key={idx}
                            className={`w-2 h-2 rounded-full transition-all ${idx === activeMediaIndex ? 'bg-white w-4' : 'bg-white/50'
                              }`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Modalidades y Superficie */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-secondary/50 rounded-2xl border border-border">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase block">Modalidad Principal</span>
                  <span className="text-sm font-extrabold text-foreground">{modalities.join(', ')}</span>
                </div>
                <div className="p-3 bg-secondary/50 rounded-2xl border border-border">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase block">Superficie & Grama</span>
                  <span className="text-sm font-extrabold text-foreground">
                    {pitch.surface} {pitch.grass_color ? `(${pitch.grass_color})` : ''}
                  </span>
                </div>
              </div>

              {/* Descripción */}
              {pitch.description && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase">Descripción</h4>
                  <p className="text-sm text-foreground/90 leading-relaxed bg-secondary/20 p-4 rounded-2xl border border-border">
                    {pitch.description}
                  </p>
                </div>
              )}

              {/* Servicios / Amenidades completas */}
              {amenityList.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase">Servicios y Amenidades</h4>
                  <div className="flex flex-wrap gap-2">
                    {amenityList.map((item, idx) => (
                      <span key={idx} className="px-3 py-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 text-xs font-semibold rounded-xl flex items-center gap-1.5">
                        <Sparkles size={12} /> {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Detalles de Métodos de Pago */}
              {paymentMethods.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase">Métodos de Pago Aceptados</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {paymentMethods.map((pm, idx) => (
                      <div key={idx} className="p-3 bg-secondary/40 rounded-xl border border-border text-xs flex justify-between items-center">
                        <div>
                          <p className="font-extrabold text-foreground">{pm.label}</p>
                          {pm.number && <p className="font-mono text-muted-foreground text-[11px]">{pm.number}</p>}
                        </div>
                        {pm.name && <span className="text-[10px] bg-background px-2 py-1 rounded-md border text-muted-foreground">{pm.name}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mapa si hay coordenadas */}
              {pitch.lat && pitch.lng && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
                    <MapPin size={14} className="text-primary" /> Ubicación en Mapa
                  </h4>
                  <div className="w-full h-40 rounded-2xl overflow-hidden border border-border">
                    <iframe
                      title="map-preview"
                      width="100%"
                      height="100%"
                      loading="lazy"
                      src={`https://maps.google.com/maps?q=${pitch.lat},${pitch.lng}&z=15&output=embed`}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Pie del Modal */}
            <div className="p-4 border-t border-border bg-secondary/40 flex items-center justify-between">
              {/* <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase block">Precio por hora</span>
                <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                  ${Number(displayPrice).toLocaleString('es-CO')} COP
                </span>
              </div> */}



              <div className="flex items-center gap-2">
                {isAdmin && editUrl && (
                  <Link
                    href={editUrl}
                    className="px-5 py-2.5 bg-primary text-white font-bold text-xs rounded-xl hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-sm"
                  >
                    <Edit3 size={14} /> Editar esta Cancha
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {typeof document !== 'undefined' && flyingHearts.map(h => createPortal(
        <div
          key={h.id}
          className="fixed pointer-events-none z-[99999]"
          style={{
            left: `${h.startX}px`,
            top: `${h.startY}px`,
            transform: 'translate(-50%, -50%)',
            ['--dx' as any]: `${h.targetX - h.startX}px`,
            ['--dy' as any]: `${h.targetY - h.startY}px`,
          }}
        >
          <div className="fly-to-nav-heart text-emerald-500">
            <Heart size={28} className="fill-emerald-500 text-emerald-500 drop-shadow-[0_0_15px_rgba(16,185,129,0.9)]" />
          </div>
        </div>,
        document.body
      ))}
    </>
  );
}
