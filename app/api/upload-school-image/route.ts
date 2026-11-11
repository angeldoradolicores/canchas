import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { uploadToR2, isR2Configured } from '@/lib/storage/r2';
import { validateImageUpload } from '@/lib/image-upload-validator';

const BUCKET = 'school-images';

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  // ── RATE LIMIT: 15 subidas por minuto por IP ──
  const rateLimit = checkRateLimit(req, {
    limit: 15,
    windowSeconds: 60,
    keyPrefix: 'api:upload-school-image',
  });
  if (!rateLimit.success) return createRateLimitErrorResponse(rateLimit);

  try {
    // Obtener usuario autenticado si existe (desde Bearer token o cookies)
    const user = await getAuthenticatedUser(req);
    const folder = user?.id || 'community_uploads';

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 });

    // ── Leer buffer primero para validar con magic bytes reales ──
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ── Validación de seguridad: solo imágenes JPG, PNG, WebP — NO confiamos en file.type ──
    const validation = validateImageUpload(buffer, {
      allowVideo: false,
      maxBytes: 4 * 1024 * 1024, // 4 MB
      rejectGif: true,            // sin GIF para imágenes de escuela
    });

    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { contentType, ext } = validation;
    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

    // ── Si Cloudflare R2 está configurado, usar R2 ──
    if (isR2Configured()) {
      try {
        const { url } = await uploadToR2({
          buffer,
          key: `schools/${fileName}`,
          contentType,
          isPrivate: false,
        });
        return NextResponse.json({ success: true, url, storage: 'r2' });
      } catch (r2Err) {
        console.error('[R2 upload school error, falling back to Supabase]', r2Err);
      }
    }

    const supabase = getServiceSupabase();
    const { error } = await supabase.storage.from(BUCKET).upload(fileName, buffer, {
      contentType,
      upsert: true,
    });

    if (error) {
      console.error('[upload-school-image error]', error);
      return NextResponse.json({ error: 'No se pudo guardar la imagen en el almacenamiento seguro' }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
    return NextResponse.json({ success: true, url: urlData.publicUrl, storage: 'supabase' });
  } catch (err: any) {
    console.error('[upload-school-image catch]', err);
    return NextResponse.json({ error: 'Error procesando la imagen' }, { status: 500 });
  }
}
