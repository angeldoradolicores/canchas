'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Share2, CalendarCheck, Target, Download, ChevronLeft, Star, Camera } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import * as htmlToImage from 'html-to-image';
import download from 'downloadjs';

const FOOT_LABELS: Record<string, string> = {
  diestro: '🦶 Diestro',
  zurdo: '🦶 Zurdo',
  ambidiestro: '⚡ Ambidiestro',
};

const LEVEL_COLORS: Record<string, string> = {
  amateur: '#3b82f6',
  intermedio: '#10b981',
  avanzado: '#f59e0b',
};

const LEVEL_LABELS: Record<string, string> = {
  amateur: 'Recreativo',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
};

export default function PublicProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();
  const cardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({ bookings: 0, challenges: 0, reviews: 0 });

  const isOwnProfile = user?.id === id;

  useEffect(() => {
    async function loadData() {
      if (!id) return;
      setLoading(true);

      const { data: profData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();

      setProfile(profData);

      if (profData) {
        const [{ count: bookingsCount }, { count: challengesCount }, { count: reviewsCount }] = await Promise.all([
          supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('user_id', id as string).eq('status', 'confirmed'),
          supabase.from('challenges').select('*', { count: 'exact', head: true }).eq('creator_id', id as string),
          supabase.from('pitch_reviews').select('*', { count: 'exact', head: true }).eq('user_id', id as string),
        ]);

        setStats({
          bookings: bookingsCount || 0,
          challenges: challengesCount || 0,
          reviews: reviewsCount || 0,
        });
      }

      setLoading(false);
    }
    loadData();
  }, [id]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `avatars/${user.id}.${ext}`;

      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
      setProfile((prev: any) => ({ ...prev, avatar_url: publicUrl }));
    } catch (err) {
      console.error('Error subiendo avatar', err);
      alert('No se pudo actualizar la foto de perfil.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await htmlToImage.toPng(cardRef.current, {
        quality: 1,
        pixelRatio: 3,
        backgroundColor: '#0a1a09',
      });
      download(dataUrl, `tarjeta-${profile?.full_name?.replace(/ /g, '-') || 'jugador'}.png`);
    } catch (err) {
      console.error('Error generando la imagen', err);
      alert('Hubo un error al generar la imagen. Intenta de nuevo.');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
        <h1 className="text-2xl font-bold mb-2">Perfil no encontrado</h1>
        <p className="text-muted-foreground mb-6">Este usuario no existe.</p>
        <button onClick={() => router.back()} className="btn-primary px-6 py-2">Volver</button>
      </div>
    );
  }

  const level = stats.bookings >= 20 ? 'Leyenda ⭐' : stats.bookings >= 10 ? 'Profesional' : stats.bookings >= 3 ? 'Amateur' : 'Novato';
  const levelColor = stats.bookings >= 20 ? '#f59e0b' : stats.bookings >= 10 ? '#10b981' : stats.bookings >= 3 ? '#3b82f6' : '#6b7280';
  const positionLabel = profile.position || 'Sin posición';
  const skillLevel = profile.skill_level || '';
  const preferredFoot = profile.preferred_foot || '';

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-md mx-auto p-4 pt-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ChevronLeft size={16} /> Volver
        </button>

        {isOwnProfile && (
          <div className="mb-5 bg-primary/10 border border-primary/20 rounded-2xl p-4 text-center">
            <h2 className="font-bold text-primary mb-1">Tu Tarjeta de Jugador</h2>
            <p className="text-xs text-muted-foreground">Descárgala y compártela en Instagram o WhatsApp para invitar amigos.</p>
          </div>
        )}

        {/* ─── TARJETA (se captura como imagen) ─── */}
        <div
          ref={cardRef}
          style={{
            background: 'linear-gradient(160deg, #0a1a09 0%, #122010 40%, #0d1f0d 100%)',
            borderRadius: 28,
            overflow: 'hidden',
            fontFamily: "'system-ui', -apple-system, sans-serif",
            position: 'relative',
            width: '100%',
          }}
        >
          {/* Glow de fondo */}
          <div style={{ position: 'absolute', top: -80, right: -80, width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,197,94,0.25) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,197,94,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
          {/* Grid líneas de cancha */}
          <div style={{ position: 'absolute', inset: 0, opacity: 0.03, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 30px, #22c55e 30px, #22c55e 31px), repeating-linear-gradient(90deg, transparent, transparent 30px, #22c55e 30px, #22c55e 31px)', pointerEvents: 'none' }} />

          {/* ── Header ── */}
          <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 2 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 900, color: '#22c55e', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 2 }}>⚽ Canchas Pasto</div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Tarjeta de Jugador</div>
            </div>
            <div style={{ background: levelColor, color: '#fff', padding: '4px 10px', borderRadius: 999, fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {level}
            </div>
          </div>

          {/* ── Avatar + Nombre ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 18, position: 'relative', zIndex: 2, padding: '0 24px' }}>
            <div style={{ position: 'relative', width: 100, height: 100, borderRadius: '50%', border: '3px solid #22c55e', boxShadow: '0 0 30px rgba(34,197,94,0.4)', overflow: 'hidden', background: '#1a2e1a' }}>
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.full_name} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, fontWeight: 900, color: '#22c55e', background: 'rgba(34,197,94,0.08)' }}>
                  {profile.full_name?.substring(0, 1).toUpperCase() || '?'}
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <h1 style={{ fontSize: 24, fontWeight: 900, color: '#ffffff', lineHeight: 1.1, margin: 0 }}>{profile.full_name || 'Jugador'}</h1>
              <p style={{ fontSize: 11, color: '#22c55e', marginTop: 6, fontWeight: 700, letterSpacing: '0.05em' }}>
                {positionLabel}{skillLevel && ` · ${LEVEL_LABELS[skillLevel] || skillLevel}`}
              </p>
            </div>
          </div>

          {/* ── Divisor ── */}
          <div style={{ margin: '16px 24px', display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(34,197,94,0.4), transparent)' }} />
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(34,197,94,0.4), transparent)' }} />
          </div>

          {/* ── PARTIDOS DESTACADOS (big number) ── */}
          <div style={{ margin: '0 24px 16px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '20px 16px', textAlign: 'center', position: 'relative', zIndex: 2 }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: 'rgba(34,197,94,0.7)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>⚽ Partidos Jugados</div>
            <div style={{ fontSize: 72, fontWeight: 900, color: '#ffffff', lineHeight: 1, letterSpacing: '-4px' }}>{stats.bookings}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 6, fontWeight: 600 }}>reservas aprobadas</div>
          </div>

          {/* ── Pierna hábil + Datos ── */}
          <div style={{ margin: '0 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, position: 'relative', zIndex: 2 }}>
            {preferredFoot && (
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Pierna Hábil</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#22c55e' }}>{FOOT_LABELS[preferredFoot] || preferredFoot}</div>
              </div>
            )}
            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Retos</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#f59e0b' }}>{stats.challenges}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Reseñas</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#60a5fa' }}>{stats.reviews}</div>
            </div>
            {skillLevel && (
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Nivel</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: LEVEL_COLORS[skillLevel] || '#fff' }}>{LEVEL_LABELS[skillLevel] || skillLevel}</div>
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div style={{ margin: '16px 24px 22px', padding: '10px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>canchas-pasto.app</span>
          </div>
        </div>

        {/* ─── Cambiar foto ─── */}
        {isOwnProfile && (
          <div className="mt-4">
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleAvatarUpload} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-border hover:border-primary/40 text-muted-foreground hover:text-primary transition-all font-semibold text-sm bg-secondary/30"
            >
              {uploadingAvatar ? (
                <><Loader2 size={18} className="animate-spin" /> Subiendo foto...</>
              ) : (
                <><Camera size={18} /> {profile.avatar_url ? 'Cambiar foto de perfil' : 'Agregar foto de perfil'}</>
              )}
            </button>
          </div>
        )}

        {/* ─── Botones Descargar / Compartir ─── */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex flex-col items-center justify-center gap-2 py-5 bg-secondary text-foreground hover:bg-border rounded-2xl transition-all font-bold text-sm border border-border disabled:opacity-50"
          >
            {downloading ? <Loader2 size={24} className="animate-spin" /> : <Download size={24} />}
            Descargar
          </button>

          <button
            onClick={async () => {
              const text = `🏆 Mira mi tarjeta de jugador en Canchas Pasto!\n\n⚽ ${stats.bookings} partidos · 🎯 ${stats.challenges} retos\n\n${window.location.href}`;
              if (navigator.share) {
                try { await navigator.share({ title: `${profile.full_name} - Canchas Pasto`, text, url: window.location.href }); } catch (e) { }
              } else {
                navigator.clipboard.writeText(text);
                alert('¡Texto copiado al portapapeles!');
              }
            }}
            className="flex flex-col items-center justify-center gap-2 py-5 bg-primary text-white hover:bg-primary/90 rounded-2xl transition-all font-bold text-sm shadow-md shadow-primary/20"
          >
            <Share2 size={24} />
            Compartir
          </button>
        </div>

        {/* ─── Stats rápidos debajo ─── */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { icon: <CalendarCheck className="text-primary" size={20} />, label: 'Partidos', value: stats.bookings, bg: 'bg-primary/10' },
            { icon: <Target className="text-amber-500" size={20} />, label: 'Retos', value: stats.challenges, bg: 'bg-amber-500/10' },
            { icon: <Star className="text-blue-400" size={20} />, label: 'Reseñas', value: stats.reviews, bg: 'bg-blue-400/10' },
          ].map((s, i) => (
            <div key={i} className={`${s.bg} rounded-2xl p-4 text-center border border-border`}>
              <div className="flex justify-center mb-2">{s.icon}</div>
              <p className="text-2xl font-black text-foreground">{s.value}</p>
              <p className="text-[10px] uppercase font-bold text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
