import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, isPlatformAdmin } from '@/lib/auth-guard';
import { getPresignedR2Url } from '@/lib/storage/r2';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Sirve un comprobante de pago PRIVADO. El valor guardado en bookings.payment_proof_url
 * es `/api/receipts/<key>` (ruta estable). Aquí:
 *  1) Se exige sesión.
 *  2) Se comprueba que el solicitante sea el dueño de la cancha de alguna reserva que
 *     use ese comprobante (o el cliente dueño de la reserva, o un admin de plataforma).
 *  3) Se devuelve un redirect a una URL firmada de R2 de corta duración (1 hora).
 * Así los comprobantes antiguos siguen siendo accesibles (antes caducaban a los 7 días)
 * y nunca se exponen públicamente.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const rl = checkRateLimit(req, { limit: 60, windowSeconds: 60, keyPrefix: 'api:receipts' });
  if (!rl.success) return createRateLimitErrorResponse(rl);

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { path } = await params;
  const key = (path || []).join('/');
  // Charset estricto: solo lo que generamos nosotros (evita inyección en el filtro .or
  // de PostgREST y path traversal).
  if (!key || key.length > 512 || key.includes('..') || !/^[A-Za-z0-9/_.\-]+$/.test(key)) {
    return NextResponse.json({ error: 'Clave inválida' }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  // Buscar las reservas que referencian este comprobante (por clave o por la ruta estable).
  const isSupabaseObject = key.startsWith('supabase/');
  const storageKey = isSupabaseObject ? key.slice('supabase/'.length) : key;
  if (!storageKey || storageKey.startsWith('/') || storageKey.includes('//')) {
    return NextResponse.json({ error: 'Clave inválida' }, { status: 400 });
  }
  const stablePath = `/api/receipts/${key}`;
  const { data: rows, error } = await supabase.rpc('receipt_bookings', {p_path:stablePath});

  if (error) {
    return NextResponse.json({ error: 'Error al verificar el comprobante' }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'Comprobante no encontrado' }, { status: 404 });
  }

  // Autorización: admin de plataforma, o dueño de la cancha, o el propio cliente de la reserva.
  // (Una sola consulta para todas las canchas en vez de 3 consultas por reserva.)
  let allowed = isPlatformAdmin(user) || rows.some((r: any) => r.user_id && r.user_id === user.id);
  if (!allowed) {
    const pitchIds = [...new Set(rows.map((r: any) => r.pitch_id).filter(Boolean))] as string[];
    if (pitchIds.length) {
      const [{ data: profile }, { data: owned }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
        supabase.from('pitches').select('id, companies!inner(owner_id)').in('id', pitchIds).eq('companies.owner_id', user.id).limit(1),
      ]);
      allowed = profile?.role === 'owner' && (owned || []).length > 0;
    }
  }
  if (!allowed) {
    return NextResponse.json({ error: 'No tienes permiso sobre este comprobante' }, { status: 403 });
  }

  try {
    let signed: string;
    if (isSupabaseObject) {
      const { data, error: signError } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(storageKey, 3600);
      if (signError || !data?.signedUrl) throw signError || new Error('No se pudo firmar el comprobante');
      signed = data.signedUrl;
    } else {
      // Firma "estable" por bloques de 30 min: la misma URL se repite y el navegador
      // reutiliza la imagen ya descargada en vez de bajarla cada vez que se abre.
      const windowMs = 30 * 60 * 1000;
      signed = await getPresignedR2Url(storageKey, 3600, {
        signingDate: new Date(Math.floor(Date.now() / windowMs) * windowMs),
        cacheControl: 'private, max-age=1800',
      });
    }
    return NextResponse.redirect(signed, {
      status: 302,
      // Privado (solo este navegador) y corto: nunca lo guarda un CDN ni un proxy.
      headers: { 'Cache-Control': 'private, max-age=900' },
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo generar el acceso al comprobante' }, { status: 502 });
  }
}
