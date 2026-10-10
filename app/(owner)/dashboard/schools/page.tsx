'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  GraduationCap, Plus, Pencil, Trash2, Loader2,
  X, Save, MapPin, Phone, Globe, Users, Upload, ImagePlus
} from 'lucide-react';
import { CustomAlertModal, AlertModalState } from '@/components/ui/CustomAlertModal';
import { AuthModal } from '@/components/auth/AuthModal';
import { compressImageFile } from '@/lib/image-compression';

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
  created_by_owner: boolean;
  pitches?: { id: string; name: string } | null;
}

const emptyForm = {
  name: '',
  logo_url: '',
  images: [] as string[],
  contact_phone: '',
  instagram_url: '',
  facebook_url: '',
  tiktok_url: '',
  description: '',
  categories: '',
  pitch_id: '',
};

export default function OwnerSchoolsPage() {
  const { user, profile } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [pitches, setPitches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [alertState, setAlertState] = useState<AlertModalState>({
    isOpen: false,
    type: 'login_required',
    title: '',
    message: ''
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // Obtener canchas del dueño
      const { data: companiesData } = await supabase
        .from('companies')
        .select('id')
        .eq('owner_id', user.id);

      if (!companiesData?.length) { setLoading(false); return; }
      const companyIds = companiesData.map(c => c.id);

      const { data: pitchesData } = await supabase
        .from('pitches')
        .select('id, name')
        .in('company_id', companyIds);

      const myPitches = pitchesData || [];
      setPitches(myPitches);

      // Obtener escuelas vinculadas a esas canchas
      if (myPitches.length > 0) {
        const pitchIds = myPitches.map(p => p.id);
        const { data: schoolsData } = await supabase
          .from('schools')
          .select('*, pitches(id, name)')
          .in('pitch_id', pitchIds)
          .order('created_at', { ascending: false });
        setSchools(schoolsData || []);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  function openCreate() {
    if (!user) {
      setAlertState({
        isOpen: true,
        type: 'login_required',
        title: 'Inicia sesión requerido',
        message: 'Debes iniciar sesión para poder registrar una escuela deportiva.',
        showCancel: true,
        confirmText: 'Iniciar Sesión',
        cancelText: 'Cerrar',
        onConfirm: () => {
          setShowAuth(true);
        },
      });
      return;
    }
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  }

  function openEdit(school: School) {
    setEditingId(school.id);
    // Resolver imágenes guardadas: puede ser array, logo_url con ||| o un solo url
    let savedImages: string[] = [];
    if (Array.isArray(school.images) && school.images.length > 0) {
      savedImages = school.images;
    } else if (school.logo_url) {
      if (school.logo_url.includes('|||')) {
        savedImages = school.logo_url.split('|||').filter(Boolean);
      } else if (school.logo_url.startsWith('[')) {
        try { savedImages = JSON.parse(school.logo_url); } catch { savedImages = [school.logo_url]; }
      } else {
        savedImages = [school.logo_url];
      }
    }
    setForm({
      name: school.name,
      logo_url: school.logo_url || '',
      images: savedImages,
      contact_phone: school.contact_phone || '',
      instagram_url: school.instagram_url || '',
      facebook_url: school.facebook_url || '',
      tiktok_url: (school as any).tiktok_url || '',
      description: school.description || '',
      categories: school.categories || '',
      pitch_id: school.pitch_id || '',
    });
    setError('');
    setShowModal(true);
  }

  // ── Subida de imágenes (igual que torneos, comprimida a baja resolución) ──
  async function handleImageUpload(files: FileList) {
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      const { data: sessData } = await supabase.auth.getSession();
      const token = sessData?.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const uploadedUrls: string[] = [];
      for (const file of Array.from(files)) {
        // Compresión agresiva: 800px máx, calidad 0.75 para evitar imágenes pesadas
        const optimized = await compressImageFile(file, { maxWidth: 800, maxHeight: 800, quality: 0.75 });
        const fd = new FormData();
        fd.append('file', optimized);
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
      setError('Error al subir imagen: ' + err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function removeImage(idx: number) {
    setForm(f => {
      const newImages = f.images.filter((_, i) => i !== idx);
      return {
        ...f,
        images: newImages,
        logo_url: newImages[0] || '',
      };
    });
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('El nombre de la escuela es obligatorio.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        pitch_id: form.pitch_id || null,
        logo_url: form.images[0] || form.logo_url || null,
        images: form.images.length > 0 ? form.images : undefined,
        contact_phone: form.contact_phone || null,
        instagram_url: form.instagram_url || null,
        facebook_url: form.facebook_url || null,
        tiktok_url: form.tiktok_url || null,
        description: form.description || null,
        categories: form.categories || null,
      };

      const { data: sessData } = await supabase.auth.getSession();
      const token = sessData?.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      if (editingId) {
        const res = await fetch('/api/schools', {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ id: editingId, ...payload }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
      } else {
        const res = await fetch('/api/schools', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
      }
      setShowModal(false);
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setAlertState({
      isOpen: true,
      type: 'warning',
      title: '¿Eliminar escuela?',
      message: '¿Estás seguro de que deseas eliminar esta escuela de fútbol? Esta acción no se puede deshacer.',
      showCancel: true,
      confirmText: 'Sí, eliminar',
      confirmButtonClassName: 'bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2.5 rounded-xl flex-1 shadow-sm transition-colors text-center text-sm cursor-pointer',
      cancelText: 'Cancelar',
      cancelButtonClassName: 'btn-primary bg-secondary hover:bg-secondary/80 text-foreground flex-1',
      onConfirm: async () => {
        setDeleting(id);
        try {
          const { data: sessData } = await supabase.auth.getSession();
          const token = sessData?.session?.access_token;
          const headers: Record<string, string> = {};
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const res = await fetch(`/api/schools?id=${id}`, {
            method: 'DELETE',
            headers,
          });
          const data = await res.json();
          if (!data.success) throw new Error(data.error);
          await loadData();
        } catch (e: any) {
          setAlertState({
            isOpen: true,
            type: 'error',
            title: 'Error',
            message: 'Error al eliminar: ' + (e.message || 'No se pudo eliminar'),
            confirmText: 'Aceptar',
          });
        } finally {
          setDeleting(null);
        }
      }
    });
  }

  function field(key: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <GraduationCap size={24} className="text-primary" />
            Mis Escuelas de Formación
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestiona las escuelas deportivas vinculadas a tus canchas.
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 py-2.5 px-5">
          <Plus size={17} />
          Registrar Escuela
        </button>
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : schools.length === 0 ? (
        <div className="border border-dashed border-border rounded-3xl p-14 text-center">
          <div className="w-16 h-16 mx-auto bg-secondary rounded-full flex items-center justify-center mb-4">
            <GraduationCap size={28} className="text-muted-foreground" />
          </div>
          <h3 className="font-bold text-foreground text-lg mb-1">No hay escuelas aún</h3>
          <p className="text-sm text-muted-foreground mb-5">
            Crea tu primera escuela y aparecerá destacada en la sección pública.
          </p>
          <button onClick={openCreate} className="btn-primary inline-flex items-center gap-2">
            <Plus size={16} /> Crear primera escuela
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {schools.map(school => {
            // Resolver imágenes para la tarjeta
            let cardImages: string[] = [];
            if (Array.isArray(school.images) && school.images.length > 0) {
              cardImages = school.images;
            } else if (school.logo_url) {
              if (school.logo_url.includes('|||')) {
                cardImages = school.logo_url.split('|||').filter(Boolean);
              } else {
                cardImages = [school.logo_url];
              }
            }
            const coverImage = cardImages[0] || null;

            return (
              <div
                key={school.id}
                className="bg-card border border-primary/30 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all"
              >
                {/* Cabecera con imagen */}
                <div className="relative h-32 bg-secondary">
                  {coverImage ? (
                    <img src={coverImage} alt={school.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Users size={36} className="text-muted-foreground/40" />
                    </div>
                  )}
                  {/* Miniaturas extra */}
                  {cardImages.length > 1 && (
                    <div className="absolute bottom-2 right-2 flex gap-1">
                      {cardImages.slice(1, 4).map((img, i) => (
                        <div key={i} className="w-8 h-8 rounded-lg overflow-hidden border-2 border-white/60 shadow">
                          <img src={img} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {cardImages.length > 4 && (
                        <div className="w-8 h-8 rounded-lg bg-black/60 border-2 border-white/60 flex items-center justify-center text-white text-[9px] font-bold">
                          +{cardImages.length - 4}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4">
                    <p className="text-white font-black text-base leading-tight truncate">{school.name}</p>
                    {school.categories && (
                      <span className="text-[10px] text-white/80 font-semibold">{school.categories}</span>
                    )}
                  </div>
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    <button
                      onClick={() => openEdit(school)}
                      className="w-8 h-8 bg-card/90 hover:bg-card border border-border/50 rounded-lg flex items-center justify-center text-foreground transition shadow-sm"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(school.id)}
                      disabled={deleting === school.id}
                      className="w-8 h-8 bg-card/90 hover:bg-red-500/10 border border-border/50 rounded-lg flex items-center justify-center text-red-500 transition shadow-sm"
                    >
                      {deleting === school.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>

                {/* Cuerpo */}
                <div className="p-4 space-y-2">
                  {school.pitches && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin size={12} className="text-primary shrink-0" />
                      <span className="truncate font-medium">{school.pitches.name}</span>
                    </div>
                  )}
                  {school.contact_phone && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone size={12} className="text-primary shrink-0" />
                      <span>{school.contact_phone}</span>
                    </div>
                  )}
                  {school.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{school.description}</p>
                  )}
                  <div className="flex gap-2 mt-1">
                    {school.instagram_url && (
                      <a href={school.instagram_url} target="_blank" rel="noreferrer"
                        className="text-[10px] font-bold text-pink-600 dark:text-pink-400 bg-pink-500/10 hover:bg-pink-500/20 px-2 py-0.5 rounded-md transition">
                        Instagram
                      </a>
                    )}
                    {school.facebook_url && (
                      <a href={school.facebook_url} target="_blank" rel="noreferrer"
                        className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-0.5 rounded-md transition">
                        Facebook
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Crear / Editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-3xl w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col">
            {/* Header fijo */}
            <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
              <h2 className="text-lg font-black">
                {editingId ? 'Editar Escuela' : 'Nueva Escuela'}
              </h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary transition">
                <X size={18} />
              </button>
            </div>

            {/* Contenido scrollable */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 text-sm px-4 py-3 rounded-xl border border-red-200 dark:border-red-800">
                  {error}
                </div>
              )}

              {/* ── IMÁGENES ── */}
              <div>
                <label className="block text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
                  <ImagePlus size={13} className="text-primary" />
                  Fotos de la escuela
                  <span className="text-muted-foreground font-normal">(se comprimen automáticamente)</span>
                </label>

                {/* Input oculto */}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => e.target.files && handleImageUpload(e.target.files)}
                />

                {/* Grid de imágenes + botón agregar */}
                <div className="flex flex-wrap gap-2">
                  {form.images.map((url, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border group shadow-sm">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      {/* Overlay eliminar */}
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                      >
                        <X size={20} className="text-white" />
                      </button>
                      {/* Badge "portada" */}
                      {i === 0 && (
                        <span className="absolute bottom-0 left-0 right-0 text-center text-[8px] font-black text-white bg-primary/90 py-0.5">
                          PORTADA
                        </span>
                      )}
                    </div>
                  ))}

                  {/* Botón agregar */}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="w-20 h-20 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1 hover:border-primary hover:bg-primary/5 transition-all text-muted-foreground disabled:opacity-60"
                  >
                    {uploading ? <Loader2 size={20} className="animate-spin text-primary" /> : <Upload size={20} />}
                    <span className="text-[10px]">{uploading ? 'Subiendo...' : 'Agregar'}</span>
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  La primera imagen será la portada. Puedes agregar hasta 10 fotos.
                </p>
              </div>

              {/* Nombre */}
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">Nombre de la escuela *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => field('name', e.target.value)}
                  placeholder="Ej: Academia FC San Juan"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Cancha */}
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  <MapPin size={12} className="inline mr-1" />Cancha de entrenamiento
                </label>
                <select
                  value={form.pitch_id}
                  onChange={e => field('pitch_id', e.target.value)}
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Sin cancha asignada</option>
                  {pitches.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">Si asignas una cancha, la escuela aparecerá como «Oficial» vinculada al perfil de la cancha.</p>
              </div>

              {/* Categorías */}
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">Categorías / Edades</label>
                <input
                  type="text"
                  value={form.categories}
                  onChange={e => field('categories', e.target.value)}
                  placeholder="Ej: De 4 a 16 años"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">Descripción</label>
                <textarea
                  value={form.description}
                  onChange={e => field('description', e.target.value)}
                  placeholder="Describe el enfoque pedagógico, los valores y metodología de la escuela..."
                  rows={3}
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>

              {/* Contacto e Instagram */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1.5">
                    <Phone size={12} className="inline mr-1" />WhatsApp / Teléfono
                  </label>
                  <input
                    type="tel"
                    value={form.contact_phone}
                    onChange={e => field('contact_phone', e.target.value)}
                    placeholder="3001234567"
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1.5">
                    <Globe size={12} className="inline mr-1" />Instagram URL
                  </label>
                  <input
                    type="text"
                    value={form.instagram_url}
                    onChange={e => field('instagram_url', e.target.value)}
                    placeholder="https://instagram.com/... o @usuario"
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              {/* Facebook y TikTok */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1.5">
                    <Globe size={12} className="inline mr-1" />Facebook URL
                  </label>
                  <input
                    type="text"
                    value={form.facebook_url}
                    onChange={e => field('facebook_url', e.target.value)}
                    placeholder="https://facebook.com/... o @usuario"
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1.5">
                    <Globe size={12} className="inline mr-1" />TikTok URL
                  </label>
                  <input
                    type="text"
                    value={form.tiktok_url}
                    onChange={e => field('tiktok_url', e.target.value)}
                    placeholder="https://tiktok.com/@... o @usuario"
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>
            </div>

            {/* Footer fijo */}
            <div className="px-6 pb-6 pt-4 border-t border-border flex gap-3 shrink-0">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || uploading}
                className="flex-1 btn-primary flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Guardando...' : uploading ? 'Subiendo imagen...' : editingId ? 'Actualizar' : 'Crear Escuela'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alerta personalizada y Modal de Autenticación */}
      <CustomAlertModal alertState={alertState} onClose={() => setAlertState(s => ({ ...s, isOpen: false }))} />
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}
