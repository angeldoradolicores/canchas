import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, verifyPitchOwnership, isPlatformAdmin } from '@/lib/auth-guard';
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
  const stablePath = `/api/receipts/${key}`;
  const { data: rows, error } = await supabase
    .from('bookings')
    .select('id, user_id, pitch_id, payment_proof_url')
    .or(`payment_proof_url.ilike.%${key}%,payment_proof_url.eq.${stablePath}`)
    .limit(50);

  if (error) {
    return NextResponse.json({ error: 'Error al verificar el comprobante' }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'Comprobante no encontrado' }, { status: 404 });
  }

  // Autorización: admin de plataforma, o dueño de la cancha, o el propio cliente de la reserva.
  let allowed = isPlatformAdmin(user);
  if (!allowed) {
    for (const r of rows) {
      if (r.user_id && r.user_id === user.id) { allowed = true; break; }
      if (r.pitch_id && (await verifyPitchOwnership(user.id, r.pitch_id))) { allowed = true; break; }
    }
  }
  if (!allowed) {
    return NextResponse.json({ error: 'No tienes permiso sobre este comprobante' }, { status: 403 });
  }

  try {
    const signed = await getPresignedR2Url(key, 3600); // 1 hora
    return NextResponse.redirect(signed, {
      status: 302,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo generar el acceso al comprobante' }, { status: 502 });
  }
}
