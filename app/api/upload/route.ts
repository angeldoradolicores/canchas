import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { uploadToR2, isR2Configured } from '@/lib/storage/r2';

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, {
    limit: 30,
    windowSeconds: 60,
    keyPrefix: 'api:upload',
  });
  if (!rateLimit.success) return createRateLimitErrorResponse(rateLimit);

  try {
    const user = await getAuthenticatedUser(req);
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const uploadType = (formData.get('type') as string) || 'pitch'; // 'pitch' | 'school' | 'tournament' | 'receipt' | 'avatar'

    if (!file) {
      return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 });
    }

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isImage && !isVideo) {
      return NextResponse.json({ error: 'Tipo de archivo no permitido. Solo se aceptan imágenes o videos.' }, { status: 400 });
    }

    // Tamaño máximo: 50MB para videos, 10MB para imágenes
    const maxSizeBytes = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return NextResponse.json({
        error: `El archivo excede el tamaño máximo permitido (${isVideo ? '50 MB' : '10 MB'}).`
      }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || (isVideo ? 'mp4' : 'jpg');
    const folder = uploadType === 'receipt' ? 'comprobantes' : `${uploadType}s`;
    const userPrefix = user?.id || 'public';
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 9);
    const filePath = `${folder}/${userPrefix}/${timestamp}_${randomSuffix}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = file.type || (isVideo ? 'video/mp4' : `image/${ext}`);
    const isPrivate = uploadType === 'receipt';

    // ── 1. Si Cloudflare R2 está configurado, usar R2 ──
    if (isR2Configured()) {
      try {
        const { url, key } = await uploadToR2({
          buffer,
          key: filePath,
          contentType,
          isPrivate,
        });

        return NextResponse.json({
          success: true,
          url,
          key,
          storage: 'r2',
          isPrivate,
          type: isVideo ? 'video' : 'photo',
        });
      } catch (r2Err: any) {
        console.error('[Cloudflare R2 Upload error]', r2Err);
        // Continuar al fallback de Supabase si R2 falla
      }
    }

    // ── 2. Fallback a Supabase Storage mientras se configuran las claves de R2 ──
    const supabase = getServiceSupabase();
    const targetBucket = uploadType === 'receipt'
      ? 'payment-proofs'
      : uploadType === 'school'
      ? 'school-images'
      : uploadType === 'avatar'
      ? 'avatars'
      : 'pitch-images';

    const { error: supaErr } = await supabase.storage.from(targetBucket).upload(filePath, buffer, {
      contentType,
      upsert: true,
    });

    if (supaErr) {
      console.error('[Supabase Storage Fallback error]', supaErr);
      return NextResponse.json({ error: 'Error al subir el archivo: ' + supaErr.message }, { status: 500 });
    }

    const { data: publicData } = supabase.storage.from(targetBucket).getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      url: publicData.publicUrl,
      key: filePath,
      storage: 'supabase',
      isPrivate,
      type: isVideo ? 'video' : 'photo',
    });
  } catch (err: any) {
    console.error('[api:upload catch]', err);
    return NextResponse.json({ error: 'Error procesando archivo: ' + (err.message || 'Error desconocido') }, { status: 500 });
  }
}
