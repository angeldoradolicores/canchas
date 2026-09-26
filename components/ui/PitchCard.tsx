'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  MapPin, Star, Layers, ShieldCheck, CreditCard,
  ChevronLeft, ChevronRight, Edit3, Eye, Sparkles, X, Share2, DollarSign, Heart, Trash2, AlertTriangle, Loader2, Copy
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import { useFavorites } from '@/lib/favorites-context';
import { useRouter } from 'next/navigation';

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
  company?: { id?: string; name: string; address?: string | null; zone?: string | null };
  companies?: { id?: string; name: string; address?: string | null; zone?: string | null };
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const router = useRouter();
  const { session } = useAuth();
  const { isFavorite: checkFav, toggleFavorite: doToggleFav } = useFavorites();
  const isFavorite = checkFav(pitch.id);
  const complexName = (pitch as any)?.companies?.name || (pitch as any)?.company?.name;

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

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch('/api/admin-actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ action: 'delete_pitch', payload: { pitch_id: pitch.id } }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error al eliminar la cancha');
      // Recargar página para reflejar el cambio
      router.refresh();
      window.location.reload();
    } catch (err: any) {
      setDeleteError(err.message || 'Error al eliminar');
      setDeleting(false);
    }
  };

  // Redes sociales de la cancha
  const pitchAny = pitch as any;
  const fbUrl = pitchAny.facebook_url || pitchAny.custom_pricing?.facebook_url || pitchAny.custom_pricing?.social_links?.facebook || null;
  const igUrl = pitchAny.instagram_url || pitchAny.custom_pricing?.instagram_url || pitchAny.custom_pricing?.social_links?.instagram || null;
  const ttUrl = pitchAny.tiktok_url || pitchAny.custom_pricing?.tiktok_url || pitchAny.custom_pricing?.social_links?.tiktok || null;
  const formatSocialUrl = (url: string | null, platform: 'instagram' | 'tiktok' | 'facebook'): string => {
    if (!url) return '#';
    const trimmed = url.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    const cleanHandle = trimmed.replace(/^@/, '');
    if (platform === 'instagram') return `https://instagram.com/${cleanHandle}`;
    if (platform === 'tiktok') return `https://tiktok.com/@${cleanHandle}`;
    if (platform === 'facebook') return `https://facebook.com/${cleanHandle}`;
    return `https://${trimmed}`;
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

        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            if (onOpen) onOpen(pitch);
            else setShowDetailModal(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (onOpen) onOpen(pitch);
              else setShowDetailModal(true);
            }
          }}
          className="group relative flex flex-col h-full w-full bg-card border border-border/60 hover:border-border rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer select-none"
        >
          {/* BANNER / FOTO DESTACADA */}
          <div className="relative aspect-[16/10] sm:aspect-[4/3] w-full bg-secondary overflow-hidden shrink-0">
            <img
              src={mainImage}
              alt={pitch.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />

            {/* Badges de encabezado sobre la imagen */}
            <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 z-10">
              <div className="flex flex-wrap gap-1.5 items-center max-w-[80%]">
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
                  className="p-2 bg-white/90 dark:bg-zinc-900/90 text-foreground rounded-full hover:bg-primary hover:text-white transition-colors shadow-md backdrop-blur-sm active:scale-95"
                  title="Editar Cancha"
                >
                  <Edit3 size={14} />
                </Link>
              )}
            </div>

            {/* Nombre sobre la parte inferior del Banner */}
            <div className="absolute bottom-3 left-3.5 right-3.5 z-10 flex flex-col justify-end">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-base sm:text-lg font-black tracking-tight uppercase text-white leading-tight drop-shadow-md group-hover:text-emerald-300 transition-colors duration-300">
                  {complexName}
                </h3>
                <span className="text-[11px] sm:text-xs font-bold tracking-wide uppercase text-white/80 drop-shadow">
                  {pitch.name}
                </span>
              </div>

              {pitch.grass_color && (
                <p className="text-[10px] sm:text-[11px] text-emerald-200/90 font-medium flex items-center gap-1 mt-1">
                  <Layers size={11} className="shrink-0" /> Grama: {pitch.grass_color}
                </p>
              )}
            </div>
          </div>

          {/* CUERPO DE LA TARJETA (Ocupa todo el espacio disponible) */}
          <div className="flex flex-col flex-1 p-3.5 sm:p-4 space-y-3">

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
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Otras:</span>
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
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block">
                  Servicios Incluidos
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {amenityList.slice(0, 4).map((item, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold bg-secondary/80 text-foreground px-2.5 py-1 rounded-lg border border-border/50"
                    >
                      {item}
                    </span>
                  ))}
                  {amenityList.length > 4 && (
                    <span className="text-[10px] text-muted-foreground font-bold px-1.5 py-1 flex items-center">
                      +{amenityList.length - 4} más
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Métodos de Pago */}
            {paymentMethods.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-border/50">
                <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <CreditCard size={11} className="text-primary shrink-0" /> Métodos de Pago
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

            {/* REDES SOCIALES DE LA CANCHA */}
            {(igUrl || ttUrl || fbUrl) && (
              <div
                className="pt-1 mt-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-3 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/15 dark:border-emerald-500/20 rounded-2xl">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[10px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">
                      Redes Sociales
                    </h4>
                  </div>

                  <div className="flex items-center justify-start gap-2.5">
                    {igUrl && (
                      <a
                        href={formatSocialUrl(igUrl, 'instagram')}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Instagram"
                        className="w-10 h-10 rounded-xl border border-pink-500/20 bg-gradient-to-r from-pink-500/10 via-rose-500/5 to-amber-500/10 hover:border-pink-500/40 hover:shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center group shrink-0"
                      >
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
                          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" /></svg>
                        </div>
                      </a>
                    )}

                    {ttUrl && (
                      <a
                        href={formatSocialUrl(ttUrl, 'tiktok')}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="TikTok"
                        className="w-10 h-10 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-100/90 dark:bg-neutral-900/90 hover:border-black dark:hover:border-white hover:shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center group shrink-0"
                      >
                        <div className="w-7 h-7 rounded-lg bg-black flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform border border-neutral-800">
                          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" /></svg>
                        </div>
                      </a>
                    )}

                    {fbUrl && (
                      <a
                        href={formatSocialUrl(fbUrl, 'facebook')}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Facebook"
                        className="w-10 h-10 rounded-xl border border-blue-500/20 bg-blue-500/10 hover:border-[#1877F2]/50 hover:shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center group shrink-0"
                      >
                        <div className="w-7 h-7 rounded-lg bg-[#1877F2] flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
                          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                        </div>
                      </a>
                    )}
                  </div>
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
          {isAdmin && editUrl && (
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              <Link
                href={editUrl}
                className="flex-1 py-2.5 text-xs font-bold bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Edit3 size={13} /> Editar
              </Link>
              <Link
                href={`/dashboard/pitches/new?duplicate=${pitch.id}`}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-xl transition-all shadow-sm"
                title="Duplicar esta cancha"
              >
                <Copy size={13} /> Duplicar
              </Link>
            </div>
          )}
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
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setShowDetailModal(false)}
        >
          <div
            className="bg-card border border-border w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Encabezado Fijo del Modal */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-secondary/40 shrink-0">
              <div className="space-y-0.5 pr-3 min-w-0">
                {complexName && (
                  <h2 className="text-lg sm:text-2xl font-black tracking-tight uppercase text-emerald-600 dark:text-emerald-400 truncate">
                    {complexName}
                  </h2>
                )}
                <p className="text-xs sm:text-sm font-bold tracking-wide uppercase text-muted-foreground truncate">
                  {pitch.name}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="p-2.5 rounded-full bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-all shrink-0 active:scale-95"
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Contenido Desplazable del Modal */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">

              {/* Carrusel / Visor Multimedia */}
              {allMedia.length > 0 && (
                <div className="relative rounded-2xl overflow-hidden bg-black aspect-[16/9] border border-border shadow-inner shrink-0 group">
                  <img
                    src={allMedia[activeMediaIndex]}
                    alt={`Imagen ${activeMediaIndex + 1} de la cancha`}
                    className="w-full h-full object-cover transition-all duration-300"
                  />

                  {allMedia.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setActiveMediaIndex((i) => Math.max(0, i - 1))}
                        disabled={activeMediaIndex === 0}
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-black/60 text-white rounded-full disabled:opacity-20 hover:bg-black/90 transition-all active:scale-95"
                        aria-label="Imagen anterior"
                      >
                        <ChevronLeft size={18} />
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveMediaIndex((i) => Math.min(allMedia.length - 1, i + 1))}
                        disabled={activeMediaIndex === allMedia.length - 1}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-black/60 text-white rounded-full disabled:opacity-20 hover:bg-black/90 transition-all active:scale-95"
                        aria-label="Imagen siguiente"
                      >
                        <ChevronRight size={18} />
                      </button>

                      {/* Indicadores flotantes interactivos */}
                      <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5 px-4">
                        {allMedia.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setActiveMediaIndex(idx)}
                            className={`h-1.5 rounded-full transition-all duration-300 ${idx === activeMediaIndex ? 'bg-white w-5' : 'bg-white/40 w-1.5 hover:bg-white/70'
                              }`}
                            aria-label={`Ir a imagen ${idx + 1}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Modalidades y Superficie */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-secondary/40 rounded-2xl border border-border/80 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                    Modalidad Principal
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold text-foreground">
                    {modalities.join(', ')}
                  </span>
                </div>

                <div className="p-3.5 bg-secondary/40 rounded-2xl border border-border/80 flex flex-col justify-center">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                    Superficie & Grama
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold text-foreground">
                    {pitch.surface || 'No especificada'} {pitch.grass_color ? `(${pitch.grass_color})` : ''}
                  </span>
                </div>
              </div>

              {/* Descripción */}
              {pitch.description ? (
                <div className="space-y-1.5">
                  <h4 className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider">
                    Descripción
                  </h4>
                  <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed bg-secondary/20 p-3.5 sm:p-4 rounded-2xl border border-border/70">
                    {pitch.description}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/60 italic">Sin descripción registrada.</p>
              )}

              {/* Servicios / Amenidades completas */}
              {amenityList.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider">
                    Servicios y Amenidades
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {amenityList.map((item, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 text-xs font-bold rounded-xl flex items-center gap-1.5"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Detalles de Métodos de Pago */}
              {paymentMethods.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider">
                    Métodos de Pago Aceptados
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {paymentMethods.map((pm, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-secondary/30 rounded-xl border border-border/70 text-xs flex justify-between items-center gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-extrabold text-foreground truncate">{pm.label}</p>
                          {pm.number && (
                            <p className="font-mono text-muted-foreground text-[11px] truncate mt-0.5">
                              {pm.number}
                            </p>
                          )}
                        </div>
                        {pm.name && (
                          <span className="text-[10px] font-semibold bg-background px-2 py-1 rounded-md border border-border text-muted-foreground shrink-0">
                            {pm.name}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* REDES SOCIALES EN EL MODAL */}
              {(igUrl || ttUrl || fbUrl) && (
                <div className="p-3.5 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/15 dark:border-emerald-500/20 rounded-2xl space-y-2.5">
                  <h4 className="text-[10px] sm:text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">
                    Redes Sociales
                  </h4>

                  <div className="flex items-center gap-3">
                    {/* Instagram */}
                    {igUrl && (
                      <a
                        href={formatSocialUrl(igUrl, 'instagram')}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Instagram"
                        className="w-11 h-11 rounded-2xl border border-pink-500/20 bg-gradient-to-r from-pink-500/10 via-rose-500/5 to-amber-500/10 hover:border-pink-500/40 hover:shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center group shrink-0"
                      >
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
                          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" /></svg>
                        </div>
                      </a>
                    )}

                    {/* TikTok */}
                    {ttUrl && (
                      <a
                        href={formatSocialUrl(ttUrl, 'tiktok')}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="TikTok"
                        className="w-11 h-11 rounded-2xl border border-neutral-300 dark:border-neutral-700 bg-neutral-100/90 dark:bg-neutral-900/90 hover:border-black dark:hover:border-white hover:shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center group shrink-0"
                      >
                        <div className="w-8 h-8 rounded-xl bg-black flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform border border-neutral-800">
                          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" /></svg>
                        </div>
                      </a>
                    )}

                    {/* Facebook */}
                    {fbUrl && (
                      <a
                        href={formatSocialUrl(fbUrl, 'facebook')}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Facebook"
                        className="w-11 h-11 rounded-2xl border border-blue-500/20 bg-blue-500/10 hover:border-[#1877F2]/50 hover:shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center group shrink-0"
                      >
                        <div className="w-8 h-8 rounded-xl bg-[#1877F2] flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
                          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                        </div>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Mapa si hay coordenadas */}
              {pitch.lat && pitch.lng && (
                <div className="space-y-2">
                  <h4 className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin size={14} className="text-primary" /> Ubicación en Mapa
                  </h4>
                  <div className="w-full h-44 sm:h-52 rounded-2xl overflow-hidden border border-border shadow-xs">
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

            {/* Pie Fijo del Modal */}
            <div className="p-4 border-t border-border bg-secondary/40 flex items-center justify-between gap-3 shrink-0">
              <button
                onClick={() => router.push(`/cancha/${pitch.id}`)}
                className="px-4 sm:px-5 py-2.5 bg-primary text-white font-bold text-xs sm:text-sm rounded-xl hover:bg-primary/90 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                Ver Cancha
              </button>

              <div className="flex items-center gap-2">
                {isAdmin && editUrl && (
                  <Link
                    href={editUrl}
                    className="px-4 py-2.5 bg-emerald-600 text-white font-bold text-xs sm:text-sm rounded-xl hover:bg-emerald-700 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <Edit3 size={14} /> <span className="hidden sm:inline">Editar</span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Eliminación */}
      {showDeleteConfirm && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-black text-base text-foreground">¿Eliminar cancha?</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{pitch.name}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Esta acción es <strong className="text-foreground">permanente e irreversible</strong>. Se eliminarán la cancha y <strong className="text-red-600">todas sus reservas asociadas</strong>.
            </p>
            {deleteError && (
              <p className="text-xs text-red-600 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-3 mb-4">{deleteError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteError(''); }}
                disabled={deleting}
                className="flex-1 py-2.5 text-sm font-bold border border-border rounded-xl hover:bg-secondary transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? <><Loader2 size={14} className="animate-spin" /> Eliminando...</> : <><Trash2 size={14} /> Sí, eliminar</>}
              </button>
            </div>
          </div>
        </div>,
        document.body
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
