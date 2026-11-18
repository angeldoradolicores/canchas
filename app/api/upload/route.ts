import { randomUUID } from 'node:crypto';
import { sanitizeReceipt, sanitizePromotionImage, optimizePublicImage } from '@/lib/receipt-security';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { uploadToR2, isR2Configured } from '@/lib/storage/r2';
import { safeServerErrorResponse } from '@/lib/error-handler';
import { validateImageUpload, safeUploadPath } from '@/lib/image-upload-validator';

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
    const requestedType = (formData.get('type') as string) || 'pitch';
    const allowedTypes = new Set(['pitch', 'school', 'tournament', 'receipt', 'avatar', 'promotion']);
    if (!allowedTypes.has(requestedType)) {
      return NextResponse.json({ error: 'Tipo de archivo no permitido' }, { status: 400 });
    }
    const uploadType = requestedType as 'pitch' | 'school' | 'tournament' | 'receipt' | 'avatar' | 'promotion';

    // Imágenes de promociones: solo dueños aprobados (rol leído de la BD, no del cliente).
    if (uploadType === 'promotion') {
      if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
      const { data: ownerProfile } = await getServiceSupabase().from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (ownerProfile?.role !== 'owner') {
        return NextResponse.json({ error: 'Solo los dueños aprobados pueden subir imágenes de promociones' }, { status: 403 });
      }
    }

    // Los comprobantes contienen información financiera y nunca deben poder
    // subirse de forma anónima.
    if (uploadType === 'receipt' && !user) {
      return NextResponse.json({ error: 'Debes iniciar sesión para subir un comprobante' }, { status: 401 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 });
    }

    // ── Leer buffer primero para validar con magic bytes reales ──
    if (file.size > (uploadType === 'receipt' || uploadType === 'avatar' || uploadType === 'promotion' ? 5 : 50) * 1024 * 1024) {
      return NextResponse.json({error:'Archivo demasiado grande'}, {status:413});
    }
    const arrayBuffer = await file.arrayBuffer();
    let buffer: Buffer = Buffer.from(arrayBuffer);

    // ── Validación de seguridad: magic bytes + tamaño (no confiamos en file.type) ──
    const isReceiptOrAvatar = uploadType === 'receipt' || uploadType === 'avatar' || uploadType === 'promotion';
    const validation = validateImageUpload(buffer, {
      allowVideo: !isReceiptOrAvatar, // comprobantes y avatares: solo imágenes
      maxBytes: isReceiptOrAvatar ? 5 * 1024 * 1024 : 50 * 1024 * 1024, // 5MB imágenes, 50MB videos
      rejectGif: isReceiptOrAvatar, // sin GIF para avatares
    });

    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    let { contentType, ext, isVideo } = validation;
    if (uploadType === 'receipt') {
      buffer = await sanitizeReceipt(buffer); contentType = 'image/jpeg'; ext = 'jpeg';
    }
    if (uploadType === 'promotion') {
      try {
        buffer = await sanitizePromotionImage(buffer); contentType = 'image/webp'; ext = 'webp';
      } catch {
        return NextResponse.json({ error: 'Solo se permiten imágenes JPG, PNG o WebP de máximo 5 MB' }, { status: 400 });
      }
    }
    // Fotos públicas: comprimir a WebP para que carguen rápido (los videos y GIF se dejan igual).
    if (!isVideo && uploadType !== 'receipt' && uploadType !== 'promotion') {
      const optimized = await optimizePublicImage(buffer, uploadType === 'avatar' ? 512 : 1600);
      if (optimized) { buffer = optimized; contentType = 'image/webp'; ext = 'webp'; }
    }
    const folder = uploadType === 'receipt' ? 'comprobantes' : `${uploadType}s`;
    const userPrefix = user?.id || 'public';
    const timestamp = Date.now();
    // Sufijo criptográfico (antes Math.random, ~36 bits y no criptográfico).
    const randomSuffix = randomUUID().replace(/-/g, '');
    // Ruta generada desde el servidor, nunca desde datos del cliente
    const filePath = `${folder}/${userPrefix}/${timestamp}_${randomSuffix}.${ext}`;
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

    if (isPrivate) {
      const {data: bucket,error: bucketError}=await supabase.storage.getBucket(targetBucket);
      if(bucketError || !bucket || bucket.public) throw new Error('El bucket de comprobantes debe ser privado');
    }
    const { error: supaErr } = await supabase.storage.from(targetBucket).upload(filePath, buffer, {
      contentType,
      upsert: true,
    });

    if (supaErr) {
      return NextResponse.json(safeServerErrorResponse(supaErr, 'Error al subir el archivo.'), { status: 500 });
    }

    // El bucket de comprobantes debe permanecer privado. Se devuelve una ruta
    // estable de la aplicación; /api/receipts la autoriza y firma por poco tiempo.
    const publicUrl = isPrivate
      ? `/api/receipts/supabase/${filePath}`
      : supabase.storage.from(targetBucket).getPublicUrl(filePath).data.publicUrl;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      key: filePath,
      storage: 'supabase',
      isPrivate,
      type: isVideo ? 'video' : 'photo',
    });
  } catch (err: any) {
    return NextResponse.json(safeServerErrorResponse(err, 'Error al procesar el archivo.'), { status: 500 });
  }
}
