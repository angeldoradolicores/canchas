'use client';

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Heart, ChevronRight, ChevronLeft, LandPlot, Flame, Eye, X, CreditCard, Check } from 'lucide-react';
import { Pitch } from '@/lib/types';
import { useFavorites } from '@/lib/favorites-context';
import { useEffect } from 'react';
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
}

export function ComplexCard({ complex, onOpen, onBook }: ComplexCardProps) {
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
      // Guardar el complejo completo como favorito (no sólo la cancha principal)
      await toggleFavoriteComplex(complex.id);
    } finally {
      setLoadingFavorite(false);
    }
  };
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedPitchIdx, setSelectedPitchIdx] = useState(0);
  const [activeMediaIdx, setActiveMediaIdx] = useState(0);

  // Pitches ordenadas de la más antigua a la más reciente (primera agregada = índice 0)
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

  const formattedMinPrice = complex.minPrice > 0
    ? `$${complex.minPrice.toLocaleString('es-CO')}`
    : '$60.000';

  const locationLabel = complex.formattedDistance
    ? `${complex.formattedDistance}`
    : [complex.city || 'Pasto', complex.zone].filter(Boolean).join(' · ');

  return (
    <>
      <div
        onClick={handleCardClick}
        className="group relative bg-card border border-border/80 rounded-2xl overflow-hidden shadow-xs hover:shadow-lg transition-all duration-250 hover:-translate-y-0.5 flex flex-col justify-between cursor-pointer h-full select-none"
      >
        {/* Botón corazón favoritos (agrega el complejo) */}
        <button
          ref={heartBtnRef}
          type="button"
          onClick={toggleFavorite}
          disabled={loadingFavorite}
          className={`absolute top-2.5 right-2.5 z-30 p-2 rounded-full shadow-md backdrop-blur-md transition-all hover:scale-110 active:scale-95 cursor-pointer ${isFavorite
            ? 'bg-emerald-500 text-white'
            : 'bg-black/50 hover:bg-black/75 text-white border border-white/20 hover:text-emerald-400'
            }`}
          title="Guardar complejo en favoritos"
        >
          <Heart size={14} className={isFavorite ? 'fill-current' : ''} />
        </button>

        {/* Flying Heart Animation */}
        {showFlyAnim && (
          <div className="absolute top-2.5 right-2.5 z-50 pointer-events-none origin-center animate-fly-heart">
            <Heart size={26} className="text-emerald-500 fill-emerald-500 drop-shadow-xl" />
          </div>
        )}

        <div className="flex-1 flex flex-col">
          {/* BANNER / FOTO DEL COMPLEJO */}
          <div className="relative aspect-[16/10] w-full bg-secondary overflow-hidden shrink-0">
            <img
              src={complex.image}
              alt={complex.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
            />
            {/* Gradientes elegantes */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10" />

            {/* Badges superiores sobre la imagen */}
            <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5 z-10 max-w-[calc(100%-55px)]">
              {/* Badge de Ciudad destacada */}
              {/* <span className="inline-flex items-center gap-1 bg-black/75 backdrop-blur-md text-white font-extrabold text-[10px] px-2.5 py-0.5 rounded-full border border-white/20 uppercase tracking-wider shadow-sm">
                <MapPin size={10} className="text-emerald-400 shrink-0" />
                <span>{complex.city || 'Pasto'}</span>
                {complex.formattedDistance && <span className="opacity-70 font-normal">· {complex.formattedDistance}</span>}
              </span> */}

              {/* Indicador de reservas / popularidad si existe */}
              {complex.totalBookings && complex.totalBookings > 5 ? (
                <span className="inline-flex items-center gap-0.5 bg-amber-500/90 text-white font-extrabold text-[9px] px-1.5 py-0.5 rounded-full shadow-xs">
                  <Flame size={10} className="fill-white shrink-0" />
                  {complex.totalBookings}
                </span>
              ) : null}
            </div>

            {/* Nombre y calificación en la base de la foto */}
            <div className="absolute bottom-2.5 left-3 right-3 z-10">
              <h3 className="text-base sm:text-lg font-black tracking-normal uppercase text-white leading-tight drop-shadow-md group-hover:text-emerald-300 transition-colors duration-200 truncate">
                {complex.name}
              </h3>

              <div className="flex items-center gap-2 mt-0.5">
                {/* <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-400 bg-black/60 backdrop-blur-sm px-1.5 py-0.2 rounded border border-amber-400/20">
                  <span>★</span> {complex.rating || 5.0}
                </span> */}

                {/* {complex.surfaces.length > 0 && (
                  <span className="text-[10px] text-white/80 font-medium truncate">
                    {complex.surfaces[0]}
                  </span>
                )} */}
              </div>
            </div>
          </div>

          {/* CUERPO UNIFORME DE LA TARJETA (ALTURA ESTÁNDAR) */}
          <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
            {/* Fila 1: Formatos soportados (máximo 3 visibles + contador) */}
            <div className="flex flex-wrap items-center gap-1">
              {(complex.formats.length > 0 ? complex.formats.slice(0, 3) : ['Fútbol 5']).map((fmt, idx) => (
                <span
                  key={idx}
                  className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 whitespace-nowrap"
                >
                  {fmt}
                </span>
              ))}
              {complex.formats.length > 3 && (
                <span className="text-[8.5px] font-bold text-muted-foreground bg-secondary px-1 py-0.5 rounded whitespace-nowrap">
                  +{complex.formats.length - 3}
                </span>
              )}
            </div>

            {/* Fila 2: Chips de espacios/canchas (máximo 3 visibles + contador) - orden: primera agregada primero */}
            <div className="flex flex-wrap items-center gap-1">
              {sortedPitches.slice(0, 3).map((p) => (
                <span
                  key={p.id}
                  className="text-[9px] font-semibold bg-secondary/80 text-foreground px-1.5 py-0.5 rounded border border-border/60 whitespace-nowrap"
                >
                  {p.name}
                </span>
              ))}
              {sortedPitches.length > 3 && (
                <span className="text-[8.5px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                  +{sortedPitches.length - 3} más
                </span>
              )}
            </div>

            {/* Fila 3: Dirección / Zona compacta */}
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
              <MapPin size={11} className="text-emerald-500 shrink-0" />
              <span className="truncate font-medium">
                {complex.address
                  ? (complex.address.toLowerCase().includes((complex.city || '').toLowerCase())
                    ? complex.address
                    : `${complex.city ? complex.city + ' · ' : ''}${complex.address}`)
                  : `${complex.city || 'Pasto'}${complex.department ? ', ' + complex.department : ''}`}
              </span>
            </div>
          </div>
        </div>

        {/* PIE DE TARJETA: BOTONES */}
        <div className="p-3 border-t border-border/80 bg-secondary/25 shrink-0 flex gap-2">
          {/* <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowPreviewModal(true);
            }}
            className="flex-1 py-2.5 px-3 bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs uppercase tracking-wide rounded-xl border border-border/70 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
            title="Ver vista previa del complejo"
          >
            <Eye size={13} />
            <span>Ver</span>
          </button> */}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onBook) onBook(currentPitch);
              else onOpen(currentPitch);
            }}
            className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wide rounded-xl transition-all shadow-2xs hover:shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
          >
            <span>Reservar</span>
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* ── MODAL VISTA PREVIA DETALLADA DEL COMPLEJO ── */}
      {showPreviewModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            e.stopPropagation();
            setShowPreviewModal(false);
          }}
        >
          <div
            className="bg-card border border-border w-full max-w-2xl max-h-[92vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal */}

            <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/40">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xl"></span>
                  <h2 className="text-xl sm:text-2xl font-black uppercase text-emerald-600 dark:text-emerald-400 leading-tight">
                    {complex.name}
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <MapPin size={12} className="text-emerald-500 shrink-0" />
                  <span>
                    {complex.address
                      ? (complex.address.toLowerCase().includes((complex.city || '').toLowerCase())
                        ? complex.address
                        : `${complex.city ? complex.city + ' · ' : ''}${complex.address}`)
                      : `${complex.city || 'Pasto'}, ${complex.department || 'Nariño'}`}
                  </span>
                  <span>·</span>
                  <span>{complex.pitchesCount} {complex.pitchesCount === 1 ? 'Cancha' : 'Canchas'}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Pestañas de canchas del complejo - orden: primera agregada primero */}
            {sortedPitches.length > 1 && (
              <div className="flex items-center gap-1.5 px-4 py-2.5 bg-secondary/20 border-b border-border overflow-x-auto scrollbar-hide">
                <span className="text-[10px] font-bold text-muted-foreground uppercase mr-1 shrink-0">Canchas:</span>
                {sortedPitches.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPitchIdx(idx);
                      setActiveMediaIdx(0);
                    }}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${idx === selectedPitchIdx
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'
                      }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}


            {/* Contenido desplazable del modal */}
            <div className="p-5 overflow-y-auto space-y-5">
              {/* Carrusel de fotos de la cancha activa */}
              {/* Carrusel de medios de la cancha activa */}
              {currentPitchMedia.length > 0 && (
                <div className="relative rounded-2xl overflow-hidden bg-black aspect-[16/9] border border-border shadow-md">
                  <img
                    src={currentPitchMedia[activeMediaIdx] || complex.image}
                    alt="Cancha media"
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

              {/* Modalidades y Superficie */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-secondary/50 rounded-2xl border border-border">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase block">Modalidad</span>
                  <span className="text-sm font-extrabold text-foreground">
                    {(currentPitch as any).supported_types?.join(', ') || currentPitch.type || 'Fútbol 5'}
                  </span>
                </div>
                <div className="p-3 bg-secondary/50 rounded-2xl border border-border">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase block">Superficie & Césped</span>
                  <span className="text-sm font-extrabold text-foreground">
                    {currentPitch.surface || 'Sintética'}
                  </span>
                </div>
              </div>

              {/* Descripción */}
              {(currentPitch as any).description && (
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase">Descripción</h4>
                  <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed bg-secondary/30 p-3.5 rounded-2xl border border-border">
                    {(currentPitch as any).description}
                  </p>
                </div>
              )}

              {/* Servicios / Amenidades del complejo */}
              {complex.amenities.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase">Servicios Incluidos</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {complex.amenities.map((item, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-3 py-1 rounded-xl"
                      >
                        <Check size={11} /> {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Métodos de Pago */}
              {Array.isArray((currentPitch as any).payment_methods) && (currentPitch as any).payment_methods.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-border">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                    <CreditCard size={12} className="text-primary" /> Métodos de Pago
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {(currentPitch as any).payment_methods.map((pm: any, idx: number) => (
                      <span key={idx} className="text-xs font-bold px-3 py-1 bg-card border border-border rounded-xl text-foreground">
                        {pm.label || pm.type}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Ubicación en Mapa */}
              {(currentPitch as any).lat && (currentPitch as any).lng && (
                <div className="space-y-2 pt-1 border-t border-border">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
                    <MapPin size={14} className="text-primary" /> Ubicación en Mapa
                  </h4>
                  <div className="w-full h-40 rounded-2xl overflow-hidden border border-border">
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

            {/* Footer del Modal */}
            <div className="p-4 border-t border-border bg-secondary/30 flex items-center justify-between gap-4">
              {/* <div>
                <span className="block text-[10px] font-bold uppercase text-muted-foreground">Tarifa por hora</span>
                <span className="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400">
                  ${((currentPitch as any).price_per_hour || complex.minPrice)?.toLocaleString('es-CO')}
                </span>
              </div> */}

              <button
                type="button"
                onClick={() => {
                  setShowPreviewModal(false);
                  if (onBook) onBook(currentPitch);
                  else onOpen(currentPitch);
                }}
                className="py-3 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <span>Reservar en {currentPitch.name}</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flying hearts portal */}
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
