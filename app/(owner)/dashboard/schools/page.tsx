'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  GraduationCap, Plus, Pencil, Trash2, Loader2,
  X, Save, MapPin, Phone, Globe, Users
} from 'lucide-react';

interface School {
  id: string;
  name: string;
  logo_url: string | null;
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
  contact_phone: '',
  instagram_url: '',
  facebook_url: '',
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
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

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
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  }

  function openEdit(school: School) {
    setEditingId(school.id);
    setForm({
      name: school.name,
      logo_url: school.logo_url || '',
      contact_phone: school.contact_phone || '',
      instagram_url: school.instagram_url || '',
      facebook_url: school.facebook_url || '',
      description: school.description || '',
      categories: school.categories || '',
      pitch_id: school.pitch_id || '',
    });
    setError('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('El nombre de la escuela es obligatorio.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        pitch_id: form.pitch_id || null,
        logo_url: form.logo_url || null,
        contact_phone: form.contact_phone || null,
        instagram_url: form.instagram_url || null,
        facebook_url: form.facebook_url || null,
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
    if (!confirm('¿Seguro que quieres eliminar esta escuela?')) return;
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
      alert('Error al eliminar: ' + e.message);
    } finally {
      setDeleting(null);
    }
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
          Nueva Escuela
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
          {schools.map(school => (
            <div
              key={school.id}
              className="bg-card border border-primary/30 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all"
            >
              {/* Cabecera con imagen */}
              <div className="relative h-32 bg-secondary">
                {school.logo_url ? (
                  <img src={school.logo_url} alt={school.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Users size={36} className="text-muted-foreground/40" />
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
                    className="w-8 h-8 bg-white/90 hover:bg-white rounded-lg flex items-center justify-center text-foreground transition"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(school.id)}
                    disabled={deleting === school.id}
                    className="w-8 h-8 bg-white/90 hover:bg-red-50 rounded-lg flex items-center justify-center text-red-500 transition"
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
                      className="text-[10px] font-bold text-pink-600 bg-pink-50 px-2 py-0.5 rounded-md hover:bg-pink-100 transition">
                      Instagram
                    </a>
                  )}
                  {school.facebook_url && (
                    <a href={school.facebook_url} target="_blank" rel="noreferrer"
                      className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md hover:bg-blue-100 transition">
                      Facebook
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-3xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card z-10">
              <h2 className="text-lg font-black">
                {editingId ? 'Editar Escuela' : 'Nueva Escuela'}
              </h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-secondary transition">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200">
                  {error}
                </div>
              )}

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
                <p className="text-[10px] text-muted-foreground mt-1">Si asignas una cancha, la escuela aparecerá como "Oficial" y estará vinculada al perfil de la cancha.</p>
              </div>

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

              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">URL de logo / foto principal</label>
                <input
                  type="url"
                  value={form.logo_url}
                  onChange={e => field('logo_url', e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

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
                    type="url"
                    value={form.instagram_url}
                    onChange={e => field('instagram_url', e.target.value)}
                    placeholder="https://instagram.com/..."
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  <Globe size={12} className="inline mr-1" />Facebook URL
                </label>
                <input
                  type="url"
                  value={form.facebook_url}
                  onChange={e => field('facebook_url', e.target.value)}
                  placeholder="https://facebook.com/..."
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-secondary transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 btn-primary flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear Escuela'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
