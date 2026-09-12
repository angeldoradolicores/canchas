
'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2, Share2, CalendarCheck, Target, Download, ChevronLeft, Star, Camera } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import * as htmlToImage from 'html-to-image';
import download from 'downloadjs';

const FOOT_LABELS: Record<string, string> = {
  diestro: ' Diestro',
  zurdo: ' Zurdo',
  ambidiestro: ' Ambidiestro',
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
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
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

  const convertToDataUrl = async (imgUrl: string): Promise<string | null> => {
    if (!imgUrl) return null;
    if (imgUrl.startsWith('data:')) return imgUrl;

    const loadViaCanvas = (src: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const size = 256;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              const minDim = Math.min(img.width, img.height);
              const sx = (img.width - minDim) / 2;
              const sy = (img.height - minDim) / 2;
              ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
              resolve(canvas.toDataURL('image/jpeg', 0.92));
              return;
            }
          } catch (e) {
            reject(e);
            return;
          }
          reject(new Error('Canvas context null'));
        };
        img.onerror = reject;
        img.src = src;
      });
    };

    try {
      // 1. Intento directo via canvas con crop
      return await loadViaCanvas(imgUrl);
    } catch {
      try {
        // 2. Intento via proxy
        const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(imgUrl)}`;
        return await loadViaCanvas(proxyUrl);
      } catch {
        try {
          // 3. Fallback FileReader directo desde proxy
          const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(imgUrl)}`;
          const res = await fetch(proxyUrl);
          const blob = await res.blob();
          return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.warn('[Avatar conversion failed]', e);
          return null;
        }
      }
    }
  };

  // Convertir avatar a base64 Data URL para que html-to-image nunca pierda la foto por CORS
  useEffect(() => {
    if (!profile?.avatar_url) {
      setAvatarDataUrl(null);
      return;
    }

    let isMounted = true;
    convertToDataUrl(profile.avatar_url).then((uri) => {
      if (isMounted && uri) setAvatarDataUrl(uri);
    });

    return () => { isMounted = false; };
  }, [profile?.avatar_url]);

  const ensureAvatarLoaded = async () => {
    if (avatarDataUrl) return avatarDataUrl;
    if (profile?.avatar_url) {
      const uri = await convertToDataUrl(profile.avatar_url);
      if (uri) {
        setAvatarDataUrl(uri);
        // Esperar 120ms para que React actualice el DOM
        await new Promise((r) => setTimeout(r, 120));
        return uri;
      }
    }
    return null;
  };

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
      await ensureAvatarLoaded();
      const dataUrl = await htmlToImage.toPng(cardRef.current, {
        quality: 1,
        pixelRatio: 3,
        backgroundColor: '#0a1a09',
        cacheBust: true,
      });
      download(dataUrl, `tarjeta-${profile?.full_name?.replace(/\s+/g, '-') || 'jugador'}.png`);
    } catch (err) {
      console.error('Error generando la imagen', err);
      alert('Hubo un error al generar la imagen. Intenta de nuevo.');
    } finally {
      setDownloading(false);
    }
  };

  const handleShareWhatsApp = async () => {
    if (!cardRef.current) return;
    setSharingWhatsApp(true);
    try {
      await ensureAvatarLoaded();
      const dataUrl = await htmlToImage.toPng(cardRef.current, {
        quality: 1,
        pixelRatio: 3,
        backgroundColor: '#0a1a09',
        cacheBust: true,
      });
      const blob = await (await fetch(dataUrl)).blob();
      const fileName = `tarjeta-${profile?.full_name?.replace(/\s+/g, '-') || 'jugador'}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      // Compartir nativamente con archivo en móviles compatibles (Android/iOS)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Tarjeta de Jugador - ${profile?.full_name || 'Jugador'}`,
          });
          return;
        } catch (shareErr: any) {
          if (shareErr.name === 'AbortError') return;
        }
      }

      // En escritorio o navegadores sin soporte directo de archivo:
      try {
        if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
        }
      } catch (clipErr) {
        console.warn('Clipboard image write skipped', clipErr);
      }

      // Fallback: descargar imagen y abrir WhatsApp
      download(dataUrl, fileName);
      const text = `🏆 ¡Mira mi tarjeta de jugador en Canchas Pasto!\n\n⚽ ${stats.bookings} partidos jugados · 🎯 ${stats.challenges} retos\n⭐ Rango: ${rank.title}\n\nConoce mi perfil: ${window.location.href}`;
      const waText = encodeURIComponent(`${text}\n\n(Tu tarjeta con foto se descargó y se copió al portapapeles. ¡Pégala aquí con Ctrl+V o adjúntala!)`);
      const waUrl = `https://api.whatsapp.com/send?text=${waText}`;
      window.open(waUrl, '_blank');
    } catch (err) {
      console.error('Error compartiendo en WhatsApp', err);
      alert('Hubo un error al generar la tarjeta para WhatsApp. Puedes usar el botón Descargar.');
    } finally {
      setSharingWhatsApp(false);
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

  const preferredFoot = profile.preferred_foot || '';
  const matchesCount = stats?.bookings || 0;

  // 🎨 LÓGICA DINÁMICA DE NIVELES Y COLORES DE LA TARJETA
  const rank = (() => {
    if (matchesCount >= 100) {
      return {
        title: 'DIAMANTE',
        bg: 'linear-gradient(155deg, #090919 0%, #151638 45%, #050b1e 100%)',
        accent: '#38bdf8', // Neón Diamante / Azul Neón
        border: 'rgba(56, 189, 248, 0.5)',
        glow: 'rgba(56, 189, 248, 0.4)',
        badgeBg: 'linear-gradient(90deg, #38bdf8, #818cf8)',
        cardBorder: '1px solid rgba(56, 189, 248, 0.6)',
        watermark: '💎',
      };
    }
    if (matchesCount >= 50) {
      return {
        title: 'DORADO',
        bg: 'linear-gradient(155deg, #181300 0%, #3a2b00 45%, #1f1700 100%)',
        accent: '#fbbf24', // Dorado Neón
        border: 'rgba(251, 191, 36, 0.4)',
        glow: 'rgba(251, 191, 36, 0.35)',
        badgeBg: 'linear-gradient(90deg, #f59e0b, #d97706)',
        cardBorder: '1px solid rgba(251, 191, 36, 0.5)',
        watermark: '🏆',
      };
    }
    if (matchesCount >= 10) {
      return {
        title: 'PLATEADO',
        bg: 'linear-gradient(155deg, #12151c 0%, #222938 45%, #10141d 100%)',
        accent: '#e2e8f0', // Plata Brillante
        border: 'rgba(226, 232, 240, 0.4)',
        glow: 'rgba(226, 232, 240, 0.25)',
        badgeBg: 'linear-gradient(90deg, #94a3b8, #64748b)',
        cardBorder: '1px solid rgba(226, 232, 240, 0.4)',
        watermark: '⚡',
      };
    }
    return {
      title: 'INICIANTE',
      bg: 'linear-gradient(155deg, #071a0e 0%, #12331c 45%, #0a1f12 100%)',
      accent: '#22c55e', // Verde Esmeralda
      border: 'rgba(34, 197, 94, 0.4)',
      glow: 'rgba(34, 197, 94, 0.3)',
      badgeBg: 'linear-gradient(90deg, #15803d, #166534)',
      cardBorder: '1px solid rgba(34, 197, 94, 0.4)',
      watermark: '⚽',
    };
  })();

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
            <p className="text-xs text-muted-foreground">Descárgala y compártela en Instagram o WhatsApp para presumir tu progreso.</p>
          </div>
        )}

        {/* ─── TARJETA (se captura como imagen) ─── */}
        <div
          ref={cardRef}
          style={{
            background: rank.bg,
            borderRadius: 32,
            overflow: 'hidden',
            fontFamily: "'system-ui', -apple-system, sans-serif",
            position: 'relative',
            width: '100%',
            border: rank.cardBorder,
            boxShadow: `0 20px 50px ${rank.glow}, inset 0 0 20px ${rank.border}`,
          }}
        >
          {/* Glow de fondo dinámico */}
          <div style={{ position: 'absolute', top: -90, right: -90, width: 300, height: 300, borderRadius: '50%', background: `radial-gradient(circle, ${rank.glow} 0%, transparent 70%)`, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -70, left: -70, width: 240, height: 240, borderRadius: '50%', background: `radial-gradient(circle, ${rank.glow} 0%, transparent 70%)`, pointerEvents: 'none' }} />

          {/* Marca de agua de fondo */}
          <div style={{ position: 'absolute', right: 15, top: '35%', fontSize: 140, opacity: 0.04, userSelect: 'none', pointerEvents: 'none' }}>
            {rank.watermark}
          </div>

          {/* ── Header ── */}
          <div style={{ padding: '24px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 2 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 900, color: rank.accent, letterSpacing: '0.25em', textTransform: 'uppercase' }}>
                CANCHAS PASTO
              </div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 2 }}>
                Tarjeta Oficial
              </div>
            </div>

            <div style={{ background: rank.badgeBg, color: '#ffffff', padding: '5px 14px', borderRadius: 999, fontSize: 10, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', boxShadow: `0 4px 12px ${rank.glow}`, border: '1px solid rgba(255,255,255,0.2)' }}>
              {rank.title}
            </div>
          </div>

          {/* ── Avatar + Nombre ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 20, position: 'relative', zIndex: 2, padding: '0 24px' }}>
            <div style={{ position: 'relative', width: 96, height: 96, borderRadius: '50%', border: `3px solid ${rank.accent}`, boxShadow: `0 0 25px ${rank.glow}`, overflow: 'hidden', background: 'rgba(0,0,0,0.4)' }}>
              {profile?.avatar_url ? (
                <img
                  src={avatarDataUrl || profile.avatar_url}
                  alt={profile.full_name || 'Jugador'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, fontWeight: 900, color: rank.accent, background: 'rgba(255,255,255,0.05)' }}>
                  {profile?.full_name?.substring(0, 1).toUpperCase() || '?'}
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', lineHeight: 1.1, margin: 0, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                {profile?.full_name || 'Jugador'}
              </h1>
            </div>
          </div>

          {/* ── PARTIDOS DESTACADOS (big number) ── */}
          <div style={{ margin: '20px 24px 16px', background: 'rgba(255, 255, 255, 0.04)', border: `1px solid ${rank.border}`, borderRadius: 24, padding: '18px 16px', textAlign: 'center', position: 'relative', zIndex: 2, backdropFilter: 'blur(10px)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: rank.accent, letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: 2 }}>
              ⚽ PARTIDOS JUGADOS
            </div>
            <div style={{ fontSize: 68, fontWeight: 900, color: '#ffffff', lineHeight: 1, letterSpacing: '-2px', textShadow: `0 0 20px ${rank.glow}` }}>
              {matchesCount}
            </div>
            {/* <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginTop: 4, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Partidos Jugados
            </div> */}
          </div>

          {/* ── Pierna hábil y Reseñas únicamente ── */}
          <div style={{ margin: '0 24px', display: 'grid', gridTemplateColumns: preferredFoot ? '1fr 1fr' : '1fr', gap: 12, position: 'relative', zIndex: 2 }}>
            {preferredFoot && (
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 18, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 8, fontWeight: 800, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4 }}>
                  Pierna Hábil
                </div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#ffffff', textTransform: 'uppercase' }}>
                  {FOOT_LABELS?.[preferredFoot] || preferredFoot}
                </div>
              </div>
            )}

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 18, padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 8, fontWeight: 800, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4 }}>
                Reseñas
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: rank.accent, lineHeight: 1 }}>
                {stats?.reviews || 0}
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{ margin: '20px 24px 24px', padding: '10px 16px', background: 'rgba(0,0,0,0.25)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: rank.accent, boxShadow: `0 0 8px ${rank.accent}` }} />
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              canchaspasto.app
            </span>
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
            disabled={downloading || sharingWhatsApp}
            className="flex flex-col items-center justify-center gap-2 py-4 bg-secondary text-foreground hover:bg-border rounded-2xl transition-all font-bold text-sm border border-border disabled:opacity-50 shadow-xs"
          >
            {downloading ? <Loader2 size={22} className="animate-spin text-primary" /> : <Download size={22} />}
            {downloading ? 'Generando...' : 'Descargar'}
          </button>

          <button
            onClick={handleShareWhatsApp}
            disabled={downloading || sharingWhatsApp}
            className="flex flex-col items-center justify-center gap-2 py-4 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-2xl transition-all font-bold text-sm shadow-md shadow-emerald-600/20 disabled:opacity-50"
          >
            {sharingWhatsApp ? <Loader2 size={22} className="animate-spin" /> : <Share2 size={22} />}
            {sharingWhatsApp ? 'Preparando...' : 'WhatsApp'}
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
