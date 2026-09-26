'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Heart, ChevronRight, ChevronLeft, Check, Star, CreditCard, Sparkles, X, Layers, Navigation } from 'lucide-react';
import { Pitch } from '@/lib/types';
import { useFavorites } from '@/lib/favorites-context';

export interface ComplexData {
  id: string;
  name: string;
  address?: string | null;
  zone?: string | null;
  city?: string | null;
  department?: string | null;
  lat?: number;
  lng?: number;
  rating?: number;
  reviewCount?: number;
  image: string;
  mediaUrls: string[];
  minPrice: number;
  maxPrice: number;
  pitchesCount: number;
  pitches: Pitch[];
  formats: string[];
  surfaces: string[];
  amenities: string[];
  featuredPitch: Pitch;
  distanceKm?: number;
  formattedDistance?: string;
  totalBookings?: number;
}

interface ComplexCardProps {
  complex: ComplexData;
  onOpen: (pitch: Pitch) => void;
  onBook?: (pitch: Pitch) => void;
  buttonText?: string;
}

export function ComplexCard({ complex, onOpen, onBook, buttonText = "Reservar" }: ComplexCardProps) {
  const { isFavoriteComplex, toggleFavoriteComplex } = useFavorites();
  const isFavorite = isFavoriteComplex(complex.id);

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
      await toggleFavoriteComplex(complex.id);
    } finally {
      setLoadingFavorite(false);
    }
  };

  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedPitchIdx, setSelectedPitchIdx] = useState(0);
  const [activeMediaIdx, setActiveMediaIdx] = useState(0);

  const sortedPitches = [...complex.pitches].sort((a, b) => {
    const da = (a as any).created_at || '';
    const db = (b as any).created_at || '';
    return da < db ? -1 : da > db ? 1 : 0;
  });

  useEffect(() => {
    setSelectedPitchIdx(0);
    setActiveMediaIdx(0);
  }, [complex.id]);

  const currentPitch = sortedPitches[selectedPitchIdx] || complex.featuredPitch || sortedPitches[0];
  const currentPitchMedia = Array.isArray((currentPitch as any)?.media_urls) && (currentPitch as any).media_urls.length > 0
    ? (currentPitch as any).media_urls
    : ((currentPitch as any)?.image_url ? [(currentPitch as any).image_url] : complex.mediaUrls);

  const handleCardClick = () => {
    setShowPreviewModal(true);
  };

  return (
    <>
      {/* TARJETA PRINCIPAL (ESTILO AIRBNB LIMPIO) */}
      <div
        onClick={handleCardClick}
        className="group relative bg-card rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between cursor-pointer h-full select-none border border-border/40 hover:border-border shadow-xs hover:shadow-xl"
      >
        {/* Botón de favoritos con color VERDE activo y animación de vuelo */}
        <button
          ref={heartBtnRef}
          type="button"
          onClick={toggleFavorite}
          disabled={loadingFavorite}
          className={`absolute top-3.5 right-3.5 z-30 p-2 rounded-full backdrop-blur-md transition-all hover:scale-110 active:scale-95 cursor-pointer shadow-md ${isFavorite
            ? 'bg-emerald-500 text-white'
            : 'bg-black/40 hover:bg-black/60 text-white border border-white/20'
            }`}
          title="Guardar complejo en favoritos"
        >
          <Heart size={18} className={isFavorite ? 'fill-current text-white' : 'text-white'} />
        </button>

        {/* Animación del Corazón Volador Verde */}
        {showFlyAnim && (
          <div className="absolute top-3.5 right-3.5 z-50 pointer-events-none origin-center animate-fly-heart">
            <Heart size={26} className="text-emerald-500 fill-emerald-500 drop-shadow-xl" />
          </div>
        )}

        <div className="flex-1 flex flex-col">
          {/* Imagen Limpia */}
          <div className="relative aspect-[4/3] w-full bg-secondary overflow-hidden shrink-0">
            <img
              src={complex.image}
              alt={complex.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
            />
            <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
          </div>

          {/* Cuerpo de la Tarjeta */}
          <div className="p-4 space-y-2 flex-1 flex flex-col justify-between bg-card">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                {/* Ubicación: Ciudad y Departamento con letra más pequeña */}
                <p className="text-[11px] text-muted-foreground font-medium tracking-tight capitalize flex items-center gap-1 truncate">
                  <MapPin size={11} className="text-emerald-500 shrink-0" />
                  {complex.city || 'Pasto'}, {complex.department}
                </p>

                <div className="flex items-center gap-1 text-foreground font-medium shrink-0">
                  <Star size={13} className="fill-amber-400 text-amber-400" />
                  <span>{complex.rating || '4.9'}</span>
                </div>
              </div>

              <h3 className="text-sm font-bold tracking-tight text-foreground line-clamp-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                {complex.name}
              </h3>
            </div>

            <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-medium text-foreground bg-secondary px-2 py-0.5 rounded-md text-[11px]">
                  {complex.pitchesCount} {complex.pitchesCount === 1 ? 'Cancha' : 'Canchas'}
                </span>
                {complex.formats.length > 0 && (
                  <span className="truncate text-[11px] text-muted-foreground capitalize">
                    ({complex.formats.join(', ')})
                  </span>
                )}
              </div>

              {complex.formattedDistance && (
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                  {complex.formattedDistance}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 pb-4 pt-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onBook) onBook(currentPitch);
              else onOpen(currentPitch);
            }}
            className="w-full py-2 px-3 bg-secondary hover:bg-emerald-600 text-foreground hover:text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer group/btn"
          >
            <span>{buttonText}</span>
            <ChevronRight size={14} className="transition-transform group-hover/btn:translate-x-0.5" />
          </button>
        </div>
      </div>

      {/* ── MODAL DE VISTA PREVIA REDISEÑADO (PC Y MÓVIL) ── */}
      {showPreviewModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            e.stopPropagation();
            setShowPreviewModal(false);
          }}
        >
          <div
            className="bg-card border border-border w-full max-w-3xl h-[90vh] sm:h-auto sm:max-h-[92vh] rounded-t-[28px] sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera Fija del Modal */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-secondary/60 shrink-0">
              <div className="space-y-0.5 pr-4 min-w-0">
                <h2 className="text-lg sm:text-xl font-black uppercase text-foreground truncate leading-tight">
                  {complex.name}
                </h2>
                <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                  <MapPin size={12} className="text-emerald-500 shrink-0" />
                  <span className="truncate">
                    {`${complex.city || 'Pasto'}, ${complex.department || 'Nariño'}`}
                  </span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="p-2 rounded-full bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Selector de Canchas / Espacios (Si hay múltiples) */}
            {sortedPitches.length > 1 && (
              <div className="px-5 py-2.5 bg-secondary/20 border-b border-border flex items-center gap-2 overflow-x-auto scrollbar-hide shrink-0">
                <span className="text-[10px] font-extrabold text-muted-foreground uppercase shrink-0 flex items-center gap-1">
                  Canchas:
                </span>
                {sortedPitches.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPitchIdx(idx);
                      setActiveMediaIdx(0);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${idx === selectedPitchIdx
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'
                      }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            {/* Cuerpo Desplazable del Modal */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
              {/* Carrusel de Imágenes de la Cancha Activa */}
              {currentPitchMedia.length > 0 && (
                <div className="relative rounded-2xl overflow-hidden bg-black aspect-[16/9] border border-border shadow-md">
                  <img
                    src={currentPitchMedia[activeMediaIdx] || complex.image}
                    alt="Vista previa cancha"
                    className="w-full h-full object-cover"
                  />
                  {currentPitchMedia.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setActiveMediaIdx(i => Math.max(0, i - 1))}
                        disabled={activeMediaIdx === 0}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 p-2 bg-black/60 text-white rounded-full disabled:opacity-30 hover:bg-black/80 transition-all cursor-pointer"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveMediaIdx(i => Math.min(currentPitchMedia.length - 1, i + 1))}
                        disabled={activeMediaIdx === currentPitchMedia.length - 1}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 bg-black/60 text-white rounded-full disabled:opacity-30 hover:bg-black/80 transition-all cursor-pointer"
                      >
                        <ChevronRight size={16} />
                      </button>
                      <div className="absolute bottom-2.5 inset-x-0 flex justify-center gap-1.5">
                        {currentPitchMedia.map((_: any, idx: number) => (
                          <span
                            key={idx}
                            className={`h-1.5 rounded-full transition-all ${idx === activeMediaIdx ? 'bg-white w-5' : 'bg-white/50 w-1.5'
                              }`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Grid de Características Clave */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 bg-secondary/40 rounded-2xl border border-border/60">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-0.5">Modalidad Activa</span>
                  <span className="text-sm font-extrabold text-foreground">
                    {(currentPitch as any).supported_types?.join(', ') || currentPitch.type || 'Fútbol 5'}
                  </span>
                </div>
                <div className="p-3.5 bg-secondary/40 rounded-2xl border border-border/60">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-0.5">Superficie</span>
                  <span className="text-sm font-extrabold text-foreground">
                    {currentPitch.surface || 'Sintética'}
                  </span>
                </div>
              </div>

              {/* Descripción de la cancha si existe */}
              {(currentPitch as any).description && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Acerca de este espacio</h4>
                  <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed bg-secondary/30 p-4 rounded-2xl border border-border/60">
                    {(currentPitch as any).description}
                  </p>
                </div>
              )}

              {/* Amenidades y Servicios (Basados en la Cancha Actual) */}
              {(() => {
                const pitchAmenities = Array.isArray((currentPitch as any).amenities) && (currentPitch as any).amenities.length > 0
                  ? (currentPitch as any).amenities
                  : complex.amenities;

                return pitchAmenities && pitchAmenities.length > 0 ? (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Servicios de la Cancha</h4>
                    <div className="flex flex-wrap gap-2">
                      {pitchAmenities.map((item: string, idx: number) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-3 py-1.5 rounded-xl"
                        >
                          <Check size={12} /> {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Métodos de Pago Disponibles */}
              {Array.isArray((currentPitch as any).payment_methods) && (currentPitch as any).payment_methods.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <CreditCard size={13} className="text-primary" /> Métodos de Pago
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {(currentPitch as any).payment_methods.map((pm: any, idx: number) => (
                      <span key={idx} className="text-xs font-bold px-3 py-1.5 bg-card border border-border rounded-xl text-foreground shadow-2xs">
                        {pm.label || pm.type}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Ubicación Geográfica en Mapa integrado */}
              {(currentPitch as any).lat && (currentPitch as any).lng && (
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Navigation size={13} className="text-primary" /> Ubicación en el mapa
                  </h4>
                  <div className="w-full h-40 rounded-2xl overflow-hidden border border-border shadow-xs">
                    <iframe
                      title="map-preview"
                      width="100%"
                      height="100%"
                      loading="lazy"
                      src={`https://maps.google.com/maps?q=${(currentPitch as any).lat},${(currentPitch as any).lng}&z=15&output=embed`}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer Fijo del Modal con Botón de Acción Claro */}
            <div className="p-4 sm:p-5 border-t border-border bg-secondary/60 shrink-0 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => {
                  setShowPreviewModal(false);
                  if (onBook) onBook(currentPitch);
                  else onOpen(currentPitch);
                }}
                className="w-full sm:w-full py-3 px-8 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm uppercase tracking-wider rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <span>Reservar en {currentPitch.name}</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portal de Corazones Voladores */}
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
            <Heart size={26} className="fill-emerald-500 text-emerald-500 drop-shadow-[0_0_15px_rgba(16,185,129,0.9)]" />
          </div>
        </div>,
        document.body
      ))}
    </>
  );
}