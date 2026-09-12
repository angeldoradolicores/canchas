import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';
import { getAuthenticatedUser } from '@/lib/auth-guard';

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

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const allowed = ['jpg', 'jpeg', 'png', 'webp'];
    if (!allowed.includes(ext)) {
      return NextResponse.json({ error: 'Formato no permitido. Solo se aceptan JPG, PNG o WebP.' }, { status: 400 });
    }

    // Límite de 8MB
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: 'La imagen no puede superar los 8 MB' }, { status: 400 });
    }

    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const supabase = getServiceSupabase();
    const { error } = await supabase.storage.from(BUCKET).upload(fileName, buffer, {
      contentType: file.type || `image/${ext}`,
      upsert: true,
    });

    if (error) {
      console.error('[upload-school-image error]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
    return NextResponse.json({ success: true, url: urlData.publicUrl });
  } catch (err: any) {
    console.error('[upload-school-image catch]', err);
    return NextResponse.json({ error: err.message || 'Error al procesar la imagen' }, { status: 500 });
  }
}
