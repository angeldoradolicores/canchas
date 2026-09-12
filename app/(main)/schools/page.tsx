'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  MapPin, Phone, ArrowLeft, Loader2, Users, Plus, X,
  ImageIcon, ChevronLeft, ChevronRight, Maximize2, Edit3,
  ExternalLink, Globe, Sparkles
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';

// ────────── Tipos ──────────
interface School {
  id: string;
  name: string;
  logo_url: string | null;
  images?: string[] | null;
  contact_phone: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  description: string | null;
  categories: string | null;
  pitch_id: string | null;
  custom_location?: string | null;
  created_by_owner: boolean;
  user_id?: string;
  pitches?: { id: string; name: string; image_url: string | null } | null;
}

const emptyForm = {
  id: '',
  name: '',
  logo_url: '',
  images: [] as string[],
  contact_phone: '',
  instagram_url: '',
  facebook_url: '',
  description: '',
  categories: '',
  pitch_id: '',
  custom_location: '',
};

// ────────── Carrusel con Opción Fullscreen y Contador ──────────
function ImageCarousel({
  images,
  title,
  onImageClick
}: {
  images: string[];
  title: string;
  onImageClick?: (url: string) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, clientWidth } = scrollRef.current;
    if (clientWidth > 0) setActiveIdx(Math.round(scrollLeft / clientWidth));
  };

  const scrollTo = (index: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({
      left: index * scrollRef.current.clientWidth,
      behavior: 'smooth',
    });
  };

  if (!images || images.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#cde4d5] text-[#1b5e39] gap-2 rounded-2xl">
        <ImageIcon size={36} className="opacity-40" />
        <span className="text-xs font-bold uppercase">Sin imágenes</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full group/carousel overflow-hidden rounded-2xl bg-black/10">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="w-full h-full flex overflow-x-auto snap-x snap-mandatory no-scrollbar scroll-smooth"
      >
        {images.map((img, idx) => (
          <div
            key={idx}
            className="w-full h-full shrink-0 snap-start relative cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onImageClick && onImageClick(img);
            }}
          >
            <img
              src={img}
              alt={`${title} ${idx + 1}`}
              className="w-full h-full object-cover transition-transform duration-300 group-hover/carousel:scale-105"
            />
            <div className="absolute top-2.5 right-2.5 bg-black/60 hover:bg-black text-white p-1.5 rounded-xl backdrop-blur-md transition shadow-md">
              <Maximize2 size={14} />
            </div>
          </div>
        ))}
      </div>

      {/* Badge Contador de fotos */}
      {images.length > 1 && (
        <div className="absolute top-2.5 left-2.5 bg-black/60 text-white text-[10px] font-black px-2.5 py-1 rounded-xl backdrop-blur-md flex items-center gap-1 shadow-md">
          <ImageIcon size={12} />
          <span>{activeIdx + 1} / {images.length}</span>
        </div>
      )}

      {/* Botones de Navegación */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              scrollTo(Math.max(0, activeIdx - 1));
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center z-10 cursor-pointer shadow-md transition"
            title="Imagen anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              scrollTo(Math.min(images.length - 1, activeIdx + 1));
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center z-10 cursor-pointer shadow-md transition"
            title="Siguiente imagen"
          >
            <ChevronRight size={18} />
          </button>

          {/* Indicadores de Puntos */}
          <div className="absolute bottom-2.5 left-0 right-0 flex justify-center items-center gap-1.5 z-10 pointer-events-none">
            {images.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === activeIdx ? 'w-5 bg-white shadow-sm' : 'w-1.5 bg-white/60'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ────────── Componente Principal ──────────
export default function SchoolsPage() {
  const { user, session } = useAuth();
  const supabase = createClient();

  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<School | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  const [pitches, setPitches] = useState<{ id: string; name: string }[]>([]);
  const [pitchQuery, setPitchQuery] = useState('');
  const [showPitchDropdown, setShowPitchDropdown] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSchools = () => {
    setLoading(true);
    fetch('/api/schools')
      .then(r => r.json())
      .then(d => {
        if (d.success) setSchools(d.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSchools();
  }, []);

  useEffect(() => {
    supabase
      .from('pitches')
      .select('id, name')
      .then(({ data }) => {
        if (data) setPitches(data);
      });
  }, []);

  const filteredPitches = pitches.filter(p =>
    p.name.toLowerCase().includes(pitchQuery.toLowerCase())
  );

  const handleOpenCreate = () => {
    setForm(emptyForm);
    setPitchQuery('');
    setIsEditing(false);
    setFormError('');
    setShowPitchDropdown(false);
    setShowFormModal(true);
  };

  const handleOpenEdit = (school: School, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsEditing(true);
    setFormError('');
    setShowPitchDropdown(false);

    const allImgs = Array.isArray(school.images) && school.images.length > 0
      ? school.images
      : (school.logo_url ? [school.logo_url] : []);

    const effectiveLocation = school.pitches?.name || school.custom_location || '';

    setForm({
      id: school.id,
      name: school.name || '',
      logo_url: school.logo_url || '',
      images: allImgs,
      contact_phone: school.contact_phone || '',
      instagram_url: school.instagram_url || '',
      facebook_url: school.facebook_url || '',
      description: school.description || '',
      categories: school.categories || '',
      pitch_id: school.pitch_id || '',
      custom_location: school.custom_location || '',
    });
    setPitchQuery(effectiveLocation);
    setShowFormModal(true);
  };

  async function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    setFormError('');
    try {
      // Obtener token de sesión actual para autorizar la subida
      const { data: sessData } = await supabase.auth.getSession();
      const token = sessData?.session?.access_token || session?.access_token;
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const uploadedUrls: string[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/upload-school-image', {
          method: 'POST',
          headers,
          body: fd,
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Error al subir imagen');
        uploadedUrls.push(data.url);
      }

      setForm(f => ({
        ...f,
        images: [...f.images, ...uploadedUrls],
        logo_url: f.logo_url || uploadedUrls[0] || '',
      }));
    } catch (err: any) {
      setFormError('Error al subir imagen: ' + err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const removeImage = (idxToRemove: number) => {
    setForm(f => {
      const updated = f.images.filter((_, idx) => idx !== idxToRemove);
      return { ...f, images: updated, logo_url: updated[0] || '' };
    });
  };

  async function handleSave() {
    if (!form.name.trim()) {
      setFormError('El nombre de la escuela es obligatorio.');
      return;
    }

    if (form.contact_phone && !/^\d+$/.test(form.contact_phone.trim())) {
      setFormError('El número de celular debe contener únicamente números.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const trimmedQuery = pitchQuery.trim();

      // Auto-detectar si el texto coincide con una cancha registrada en el sistema
      const matchingPitch = pitches.find(p => p.name.toLowerCase().trim() === trimmedQuery.toLowerCase());
      const effectivePitchId = form.pitch_id || matchingPitch?.id || null;
      const effectiveCustomLocation = effectivePitchId ? null : (trimmedQuery || form.custom_location || null);

      const payload = {
        ...(isEditing && form.id ? { id: form.id } : {}),
        name: form.name.trim(),
        pitch_id: effectivePitchId,
        custom_location: effectiveCustomLocation,
        contact_phone: form.contact_phone ? form.contact_phone.trim() : null,
        instagram_url: form.instagram_url ? form.instagram_url.trim() : null,
        facebook_url: form.facebook_url ? form.facebook_url.trim() : null,
        description: form.description ? form.description.trim() : null,
        categories: form.categories ? form.categories.trim() : null,
        logo_url: form.images[0] || form.logo_url || null,
        images: form.images,
      };

      const { data: sessData } = await supabase.auth.getSession();
      const token = sessData?.session?.access_token || session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const method = isEditing ? 'PUT' : 'POST';
      const res = await fetch('/api/schools', {
        method,
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Error al guardar la escuela');

      setShowFormModal(false);
      if (selected && isEditing) setSelected(null);
      setForm(emptyForm);
      setPitchQuery('');
      loadSchools();
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-28 pt-4 px-3 sm:px-6 max-w-7xl mx-auto min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <Link href="/" className="inline-flex items-center text-xs font-bold text-muted-foreground hover:text-primary mb-2">
            <ArrowLeft size={14} className="mr-1" /> Volver al explorador
          </Link>
          <h1 className="text-2xl sm:text-4xl font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            Escuelas de Fútbol <Sparkles size={22} className="text-[#007a3e]" />
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground font-medium mt-1">
            Conoce los mejores centros de formación y entrenamiento deportivo en Pasto
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="bg-[#007a3e] hover:bg-[#006332] text-white font-black py-3 px-5 rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md uppercase tracking-wider cursor-pointer transition active:scale-95"
        >
          <Plus size={16} /> Registrar Escuela
        </button>
      </div>

      {/* Listado de Tarjetas */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 size={34} className="animate-spin text-[#007a3e]" />
          <p className="text-xs font-bold text-[#1b5e39] uppercase tracking-wider">Cargando escuelas...</p>
        </div>
      ) : schools.length === 0 ? (
        <div className="bg-[#dcefe3] border border-dashed border-[#a4d4b4] rounded-3xl p-8 sm:p-14 text-center flex flex-col items-center gap-3">
          <div className="w-16 h-16 bg-[#cde4d5] rounded-full flex items-center justify-center">
            <Users size={28} className="text-[#1b5e39]" />
          </div>
          <h3 className="font-extrabold text-[#0f3822] text-lg uppercase">Sin escuelas registradas</h3>
          <p className="text-xs sm:text-sm text-[#1b5e39] max-w-sm">
            Sé el primero en registrar una academia o escuela deportiva para que miles de deportistas puedan inscribirse.
          </p>
          <button
            onClick={handleOpenCreate}
            className="mt-3 bg-[#007a3e] hover:bg-[#006332] text-white font-black px-5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 uppercase tracking-wider cursor-pointer shadow-sm transition"
          >
            <Plus size={14} /> Registrar Escuela
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {schools.map(school => {
            const allImgs = Array.isArray(school.images) && school.images.length > 0
              ? school.images
              : (school.logo_url ? [school.logo_url] : []);
            
            const registeredPitchId = school.pitch_id || school.pitches?.id;
            const locationText = school.pitches?.name || school.custom_location;
            const isOwner = user?.id && school.user_id === user.id;

            return (
              <div
                key={school.id}
                onClick={() => setSelected(school)}
                className="bg-[#dcefe3] border border-[#c5e2d0] rounded-3xl overflow-hidden p-4 flex flex-col justify-between cursor-pointer hover:shadow-xl hover:border-[#a4d4b4] transition-all relative group"
              >
                <div>
                  {/* Carrusel de Imágenes */}
                  <div className="h-48 w-full mb-3.5 relative">
                    <ImageCarousel
                      images={allImgs}
                      title={school.name}
                      onImageClick={(url) => setFullscreenImage(url)}
                    />
                  </div>

                  {/* Título de la escuela */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xl font-black text-[#0f3822] uppercase tracking-tight leading-tight">
                      {school.name}
                    </h3>
                    {school.created_by_owner && (
                      <span className="shrink-0 bg-amber-500/20 text-amber-900 border border-amber-500/30 text-[10px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider">
                        ⭐ Oficial
                      </span>
                    )}
                  </div>

                  {/* Cancha / Sede / Ubicación - LINK A PERFIL SI ESTÁ REGISTRADA */}
                  {locationText && (
                    registeredPitchId ? (
                      <Link
                        href={`/cancha/${registeredPitchId}`}
                        onClick={e => e.stopPropagation()}
                        className="bg-[#cde4d5] hover:bg-[#bce0ca] border border-[#a4d4b4] text-[#0f3822] rounded-2xl p-2.5 mt-2.5 flex items-start gap-2 transition group/link shadow-xs"
                        title="Ver perfil de la cancha"
                      >
                        <MapPin size={16} className="text-[#007a3e] shrink-0 mt-0.5 group-hover/link:scale-110 transition" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-black uppercase text-[#1b5e39] tracking-wider flex items-center justify-between">
                            <span>Sede Oficial:</span>
                            <span className="text-[9px] bg-[#007a3e]/20 text-[#007a3e] px-1.5 py-0.5 rounded font-black flex items-center gap-0.5">
                              Ver Cancha ↗
                            </span>
                          </span>
                          <span className="text-xs font-black uppercase text-[#0f3822] break-words leading-snug block underline decoration-[#007a3e]/40 group-hover/link:text-[#007a3e]">
                            {locationText}
                          </span>
                        </div>
                      </Link>
                    ) : (
                      <div className="bg-[#cde4d5] border border-[#a4d4b4] text-[#0f3822] rounded-2xl p-2.5 mt-2.5 flex items-start gap-2">
                        <MapPin size={16} className="text-[#007a3e] shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-black uppercase text-[#1b5e39] tracking-wider block">
                            Sede / Cancha:
                          </span>
                          <span className="text-xs font-black uppercase text-[#0f3822] break-words leading-snug block">
                            {locationText}
                          </span>
                        </div>
                      </div>
                    )
                  )}

                  {/* Categorías / Edades */}
                  {school.categories && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
                      <span className="bg-[#007a3e]/15 text-[#007a3e] border border-[#007a3e]/20 font-black text-[11px] px-2.5 py-1 rounded-xl uppercase tracking-wider">
                        ⚽ {school.categories}
                      </span>
                    </div>
                  )}

                  {/* Descripción Preview */}
                  {school.description && (
                    <p className="text-xs text-[#1b5e39] font-medium mt-2 line-clamp-2 leading-relaxed break-words">
                      {school.description}
                    </p>
                  )}

                  {/* Contacto WhatsApp y Redes Sociales */}
                  {(school.contact_phone || school.instagram_url || school.facebook_url) && (
                    <div className="mt-3 pt-2.5 border-t border-[#c5e2d0]/60 flex items-center justify-between gap-2">
                      {school.contact_phone ? (
                        <a
                          href={`https://wa.me/57${school.contact_phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 bg-[#25D366]/20 hover:bg-[#25D366]/35 text-[#128C7E] font-black text-xs px-3 py-1.5 rounded-xl transition cursor-pointer"
                        >
                          <Phone size={13} /> {school.contact_phone}
                        </a>
                      ) : <span />}

                      <div className="flex items-center gap-1.5">
                        {school.instagram_url && (
                          <a
                            href={school.instagram_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="bg-[#cde4d5] hover:bg-[#bce0ca] text-[#007a3e] p-1.5 rounded-lg transition text-xs font-bold flex items-center gap-1"
                            title="Instagram"
                          >
                            <Globe size={13} />
                            <span className="text-[10px] font-black">IG</span>
                          </a>
                        )}
                        {school.facebook_url && (
                          <a
                            href={school.facebook_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="bg-[#cde4d5] hover:bg-[#bce0ca] text-[#007a3e] p-1.5 rounded-lg transition text-xs font-bold flex items-center gap-1"
                            title="Facebook"
                          >
                            <Globe size={13} />
                            <span className="text-[10px] font-black">FB</span>
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Acciones de la Tarjeta */}
                <div className="mt-4 flex items-center gap-2 pt-2 border-t border-[#c5e2d0]/80">
                  <button className="flex-1 bg-[#007a3e] hover:bg-[#006332] text-white font-extrabold py-2.5 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer text-center">
                    Ver Ficha Completa
                  </button>
                  {isOwner && (
                    <button
                      onClick={(e) => handleOpenEdit(school, e)}
                      className="bg-[#007a3e]/15 hover:bg-[#007a3e]/25 text-[#007a3e] font-black py-2.5 px-3.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition flex items-center gap-1"
                      title="Editar Escuela"
                    >
                      <Edit3 size={13} /> Editar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal Ver Tarjeta Detallada ── */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-[#dcefe3] text-[#0f3822] w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[92dvh] animate-in zoom-in-95 duration-200 border border-[#b8dbc5]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div className="flex items-center justify-between p-6 pb-4 border-b border-[#c2e2cc]/60">
              <div className="pr-2">
                <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight leading-tight text-[#0f3822]">
                  {selected.name}
                </h2>
                {selected.created_by_owner && (
                  <span className="inline-block bg-amber-500/20 text-amber-900 border border-amber-500/30 text-[10px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider mt-1">
                    ⭐ Escuela Oficial Verificada
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(user?.id && selected.user_id === user.id) && (
                  <button
                    onClick={(e) => {
                      const current = selected;
                      setSelected(null);
                      handleOpenEdit(current, e);
                    }}
                    className="bg-[#007a3e]/15 hover:bg-[#007a3e]/25 text-[#007a3e] font-black px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 uppercase transition cursor-pointer"
                  >
                    <Edit3 size={14} /> Editar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-[#0f3822]/70 hover:text-[#0f3822] p-1 rounded-full transition cursor-pointer"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {/* Carrusel Principal */}
              {(() => {
                const allImgs = Array.isArray(selected.images) && selected.images.length > 0
                  ? selected.images
                  : (selected.logo_url ? [selected.logo_url] : []);

                return (
                  <div className="space-y-2">
                    <div className="h-60 sm:h-64 w-full rounded-2xl overflow-hidden border border-[#b8dbc5]/60 shadow-inner">
                      <ImageCarousel
                        images={allImgs}
                        title={selected.name}
                        onImageClick={(url) => setFullscreenImage(url)}
                      />
                    </div>

                    {/* Fila de Miniaturas si hay más de 1 imagen */}
                    {allImgs.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {allImgs.map((img, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setFullscreenImage(img)}
                            className="w-14 h-14 rounded-xl overflow-hidden border-2 border-[#a4d4b4] shrink-0 hover:opacity-80 transition cursor-pointer"
                          >
                            <img src={img} alt="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Grid Categorías + Cancha Completa con Link */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[#cde4d5]/80 p-3.5 rounded-2xl border border-[#b8dbc5]/60">
                  <p className="text-[10px] font-black uppercase text-[#1b5e39] tracking-wider">
                    Categorías / Edades
                  </p>
                  <p className="text-sm font-black text-[#0f3822] mt-0.5 break-words">
                    {selected.categories || 'Formación general'}
                  </p>
                </div>

                <div className="bg-[#cde4d5]/80 p-3.5 rounded-2xl border border-[#b8dbc5]/60">
                  <p className="text-[10px] font-black uppercase text-[#1b5e39] tracking-wider">
                    Cancha / Sede Principal
                  </p>
                  {selected.pitch_id || selected.pitches?.id ? (
                    <Link
                      href={`/cancha/${selected.pitch_id || selected.pitches?.id}`}
                      className="text-sm font-black text-[#007a3e] hover:underline mt-0.5 break-words whitespace-normal leading-snug flex items-center gap-1.5 group"
                      title="Ver perfil de la cancha"
                    >
                      <span className="group-hover:underline">
                        {selected.pitches?.name || selected.custom_location}
                      </span>
                      <ExternalLink size={14} className="shrink-0 text-[#007a3e]" />
                    </Link>
                  ) : (
                    <p className="text-sm font-black text-[#0f3822] mt-0.5 break-words whitespace-normal leading-snug">
                      {selected.pitches?.name || selected.custom_location || 'Sin ubicación registrada'}
                    </p>
                  )}
                </div>
              </div>

              {/* Redes Sociales si existen */}
              {(selected.instagram_url || selected.facebook_url) && (
                <div className="bg-[#cde4d5]/50 p-3 rounded-2xl border border-[#b8dbc5]/60 flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase text-[#1b5e39]">Redes:</span>
                  {selected.instagram_url && (
                    <a
                      href={selected.instagram_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold text-[#007a3e] hover:underline flex items-center gap-1"
                    >
                      <ExternalLink size={12} /> Instagram
                    </a>
                  )}
                  {selected.facebook_url && (
                    <a
                      href={selected.facebook_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold text-[#007a3e] hover:underline flex items-center gap-1"
                    >
                      <ExternalLink size={12} /> Facebook
                    </a>
                  )}
                </div>
              )}

              {/* Descripción Completa */}
              {selected.description && (
                <div>
                  <p className="text-[10px] font-black uppercase text-[#1b5e39] tracking-wider mb-1.5">
                    Descripción del Programa
                  </p>
                  <div className="bg-[#cde4d5]/60 p-4 rounded-2xl border border-[#b8dbc5]/60 text-xs sm:text-sm font-medium leading-relaxed text-[#0f3822] whitespace-pre-wrap break-words">
                    {selected.description}
                  </div>
                </div>
              )}

              {/* Botón WhatsApp de Contacto */}
              {selected.contact_phone && (
                <a
                  href={`https://wa.me/57${selected.contact_phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full bg-[#007a3e] hover:bg-[#006332] text-white font-black py-3.5 rounded-2xl flex items-center justify-center gap-2 text-sm uppercase tracking-wider shadow-md transition cursor-pointer"
                >
                  <Phone size={16} /> Contactar por WhatsApp ({selected.contact_phone})
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Ver Imagen en Pantalla Completa (Lightbox) ── */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-2 sm:p-6 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setFullscreenImage(null)}
        >
          <button
            type="button"
            onClick={() => setFullscreenImage(null)}
            className="absolute top-4 right-4 text-white bg-black/60 hover:bg-black p-2.5 rounded-full cursor-pointer transition shadow-lg z-50"
          >
            <X size={24} />
          </button>
          <img
            src={fullscreenImage}
            alt="Imagen Completa"
            className="max-w-full max-h-[92vh] object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* ── Modal Crear / Editar Escuela ── */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[#dcefe3] text-[#0f3822] w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[94dvh] animate-in zoom-in-95 duration-200 border border-[#b8dbc5]">
            <div className="flex items-center justify-between p-5 border-b border-[#c2e2cc]/60">
              <h2 className="text-xl font-black uppercase tracking-tight text-[#0f3822] flex items-center gap-2">
                {isEditing ? <Edit3 size={18} className="text-[#007a3e]" /> : <Plus size={18} className="text-[#007a3e]" />}
                {isEditing ? 'Editar Escuela' : 'Registrar Nueva Escuela'}
              </h2>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="text-[#0f3822]/70 hover:text-[#0f3822] cursor-pointer p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {formError && (
                <div className="bg-rose-500/10 text-rose-700 text-xs font-bold p-3 rounded-2xl border border-rose-500/20">
                  {formError}
                </div>
              )}

              {/* Subida Múltiple de Fotos */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-black uppercase tracking-wider text-[#1b5e39]">
                    Fotos / Galería de la Escuela
                  </label>
                  <span className="text-[10px] font-bold text-[#1b5e39]/70 uppercase">
                    {form.images.length} seleccionada{form.images.length === 1 ? '' : 's'}
                  </span>
                </div>

                <input
                  type="file"
                  ref={fileRef}
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFilesChange}
                />

                <div className="grid grid-cols-3 gap-2">
                  {form.images.map((imgUrl, idx) => (
                    <div key={idx} className="relative aspect-video rounded-xl overflow-hidden border border-[#b8dbc5] shadow-xs">
                      <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/70 hover:bg-black text-white rounded-full flex items-center justify-center cursor-pointer transition"
                        title="Eliminar foto"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="aspect-video rounded-xl border-2 border-dashed border-[#a4d4b4] bg-[#cde4d5]/50 hover:bg-[#cde4d5] flex flex-col items-center justify-center text-[#1b5e39] font-bold text-xs cursor-pointer transition disabled:opacity-50"
                  >
                    {uploading ? (
                      <Loader2 size={18} className="animate-spin text-[#007a3e]" />
                    ) : (
                      <>
                        <Plus size={18} className="text-[#007a3e]" />
                        <span className="text-[11px] font-black uppercase mt-0.5">+ Foto</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Nombre de la Escuela */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-[#1b5e39] mb-1">
                  Nombre de la Escuela *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Escuela de Fútbol Los Príncipes"
                  className="w-full bg-[#cde4d5]/60 border border-[#a4d4b4] rounded-2xl px-4 py-3 text-sm font-bold text-[#0f3822] placeholder:text-[#1b5e39]/50 focus:outline-none focus:ring-2 focus:ring-[#007a3e]"
                />
              </div>

              {/* Selector o Texto Libre de Cancha */}
              <div className="relative">
                <label className="block text-xs font-black uppercase tracking-wider text-[#1b5e39] mb-1">
                  Cancha / Sede de Entrenamiento
                </label>
                <input
                  type="text"
                  value={pitchQuery}
                  onFocus={() => setShowPitchDropdown(true)}
                  onChange={e => {
                    setPitchQuery(e.target.value);
                    setForm(f => ({ ...f, pitch_id: '', custom_location: e.target.value }));
                    setShowPitchDropdown(true);
                  }}
                  placeholder="Escribe o selecciona la cancha..."
                  className="w-full bg-[#cde4d5]/60 border border-[#007a3e] rounded-2xl px-4 py-3 text-sm font-black text-[#0f3822] placeholder:text-[#1b5e39]/50 focus:outline-none focus:ring-2 focus:ring-[#007a3e]"
                />
                <p className="text-[10px] font-medium text-[#1b5e39] mt-1">
                  💡 Si es una cancha registrada, enlazará al perfil de la cancha. Si escribes una cancha o lugar externo, se guardará el nombre tal cual.
                </p>

                {showPitchDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setShowPitchDropdown(false)}
                    />
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#d0e6d7] border border-[#a4d4b4] rounded-2xl shadow-2xl z-50 overflow-hidden max-h-48 overflow-y-auto">
                      <div className="p-2 text-[10px] font-black uppercase tracking-wider text-[#1b5e39] border-b border-[#b8dbc5]">
                        🏟️ Canchas del sistema (Opcional)
                      </div>
                      {filteredPitches.length > 0 ? (
                        filteredPitches.map(p => (
                          <div
                            key={p.id}
                            onClick={() => {
                              setPitchQuery(p.name);
                              setForm(f => ({ ...f, pitch_id: p.id, custom_location: '' }));
                              setShowPitchDropdown(false);
                            }}
                            className="px-3 py-2.5 hover:bg-[#bce0ca] cursor-pointer flex items-center justify-between border-b border-[#b8dbc5]/40 last:border-0"
                          >
                            <span className="text-xs font-black uppercase text-[#0f3822]">
                              🏟️ {p.name}
                            </span>
                            <span className="text-[10px] font-bold text-[#1b5e39] uppercase">
                              Registrada ↗
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 text-xs text-[#1b5e39] font-medium">
                          Se guardará como: <span className="font-black text-[#0f3822]">"{pitchQuery}"</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Categorías / Edades */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-[#1b5e39] mb-1">
                  Categorías / Edades
                </label>
                <input
                  type="text"
                  value={form.categories}
                  onChange={e => setForm(f => ({ ...f, categories: e.target.value }))}
                  placeholder="Ej: De 4 a 16 años, Sub-15, Femenino"
                  className="w-full bg-[#cde4d5]/60 border border-[#a4d4b4] rounded-2xl px-4 py-3 text-sm font-bold text-[#0f3822] placeholder:text-[#1b5e39]/50 focus:outline-none focus:ring-2 focus:ring-[#007a3e]"
                />
              </div>

              {/* Teléfono WhatsApp */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-[#1b5e39] mb-1">
                  Teléfono / WhatsApp (Solo números)
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={form.contact_phone}
                  onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value.replace(/\D/g, '') }))}
                  placeholder="3001234567"
                  className="w-full bg-[#cde4d5]/60 border border-[#a4d4b4] rounded-2xl px-4 py-3 text-sm font-bold text-[#0f3822] placeholder:text-[#1b5e39]/50 focus:outline-none focus:ring-2 focus:ring-[#007a3e]"
                />
              </div>

              {/* Redes Sociales */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-[#1b5e39] mb-1">
                    Instagram URL
                  </label>
                  <input
                    type="url"
                    value={form.instagram_url}
                    onChange={e => setForm(f => ({ ...f, instagram_url: e.target.value }))}
                    placeholder="https://instagram.com/..."
                    className="w-full bg-[#cde4d5]/60 border border-[#a4d4b4] rounded-xl px-3 py-2.5 text-xs font-bold text-[#0f3822] placeholder:text-[#1b5e39]/50 focus:outline-none focus:ring-2 focus:ring-[#007a3e]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-[#1b5e39] mb-1">
                    Facebook URL
                  </label>
                  <input
                    type="url"
                    value={form.facebook_url}
                    onChange={e => setForm(f => ({ ...f, facebook_url: e.target.value }))}
                    placeholder="https://facebook.com/..."
                    className="w-full bg-[#cde4d5]/60 border border-[#a4d4b4] rounded-xl px-3 py-2.5 text-xs font-bold text-[#0f3822] placeholder:text-[#1b5e39]/50 focus:outline-none focus:ring-2 focus:ring-[#007a3e]"
                  />
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-[#1b5e39] mb-1">
                  Descripción
                </label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Detalles sobre horarios, días de entrenamiento, metodología, mensualidades..."
                  rows={3}
                  className="w-full bg-[#cde4d5]/60 border border-[#a4d4b4] rounded-2xl px-4 py-3 text-sm font-bold text-[#0f3822] placeholder:text-[#1b5e39]/50 focus:outline-none focus:ring-2 focus:ring-[#007a3e] resize-none"
                />
              </div>
            </div>

            {/* Acciones Modal */}
            <div className="p-4 bg-[#d0e6d7]/60 border-t border-[#b8dbc5] flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="bg-[#007a3e]/15 hover:bg-[#007a3e]/25 text-[#007a3e] font-black py-3 px-6 rounded-2xl text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || uploading}
                className="bg-[#007a3e] hover:bg-[#006332] text-white font-black py-3 px-6 rounded-2xl text-xs uppercase tracking-wider shadow-md transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {isEditing ? 'Guardar Cambios' : 'Registrar Escuela'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}