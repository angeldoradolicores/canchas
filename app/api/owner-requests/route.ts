import { boundedJson } from '@/lib/bounded-json';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';

const schema = z.object({
  full_name: z.string().trim().min(2).max(100),
  company_name: z.string().trim().min(2).max(150),
  phone: z.string().regex(/^[0-9+]{10,16}$/),
  address: z.string().trim().min(5).max(300),
  evidence: z.string().trim().min(10).max(2000),
}).strict();

const NO_STORE = { 'Cache-Control': 'private, no-store' };

async function handle(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // El rol de plataforma solo se lee de app_metadata (el usuario no puede editarlo).
    const admin = user.app_metadata?.role === 'superadmin';

    // Los datos personales de los solicitantes y la aprobación exigen segundo factor (aal2).
    async function hasMfa() {
      const jar = await cookies();
      const sessionClient = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: { getAll: () => jar.getAll(), setAll: () => {} },
      });
      const { data: claims, error: claimsError } = await sessionClient.auth.getClaims();
      return !claimsError && claims?.claims.sub === user!.id && claims?.claims.aal === 'aal2';
    }

    if (req.method === 'GET') {
      if (admin) {
        if (!await hasMfa()) return NextResponse.json({ data: [], admin, mfaRequired: true }, { headers: NO_STORE });
        const page = Math.max(0, Math.min(100000, Number(req.nextUrl.searchParams.get('page')) || 0));
        const { data, error } = await db.from('owner_requests').select('*').eq('status', 'pending')
          .order('created_at', { ascending: true }).range(page * 50, page * 50 + 49);
        if (error) throw error;
        return NextResponse.json({ data, admin }, { headers: NO_STORE });
      }

      let { data, error } = await db.from('owner_requests').select('*').eq('user_id', user.id);
      if (error) throw error;
      // Solicitud llenada al registrarse (antes de confirmar el correo): se registra ahora,
      // una sola vez. Solo son datos de la solicitud; no concede ningún permiso.
      if (!data?.length) {
        const draft = schema.safeParse(user.user_metadata?.owner_request);
        if (draft.success) {
          const { error: createError } = await db.rpc('resubmit_owner_request', { p_user: user.id, p_data: draft.data });
          if (!createError) ({ data } = await db.from('owner_requests').select('*').eq('user_id', user.id));
        }
      }
      const prefill = {
        full_name: typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.slice(0, 100) : '',
        phone: typeof user.user_metadata?.phone === 'string' ? user.user_metadata.phone.replace(/\D/g, '').slice(0, 16) : '',
      };
      return NextResponse.json({ data: data || [], admin, prefill }, { headers: NO_STORE });
    }

    if (req.headers.get('origin') !== req.nextUrl.origin)
      return NextResponse.json({ error: 'Origen no autorizado' }, { status: 403 });
    const rl = checkRateLimit(req, { limit: 10, windowSeconds: 60, keyPrefix: 'owner-requests', identifier: user.id });
    if (!rl.success) return createRateLimitErrorResponse(rl);
    const body = await boundedJson(req, 8000);

    if (req.method === 'PATCH') {
      if (!admin) return NextResponse.json({ error: 'Solo superadministradores' }, { status: 403 });
      if (!await hasMfa()) return NextResponse.json({ error: 'Verifica tu segundo factor antes de revisar solicitudes' }, { status: 403 });
      const parsed = z.object({ user_id: z.string().uuid(), approve: z.boolean() }).strict().safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
      const { error } = await db.rpc('review_owner_request', { p_user: parsed.data.user_id, p_reviewer: user.id, p_approve: parsed.data.approve });
      if (error) return NextResponse.json({ error: 'No se pudo resolver la solicitud pendiente' }, { status: 409 });

      // Aviso push al solicitante (si activó notificaciones). La notificación interna la crea la BD.
      if (parsed.data.approve && process.env.INTERNAL_API_SECRET) {
        const target = parsed.data.user_id;
        after(async () => {
          await fetch(`${req.nextUrl.origin}/api/send-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET! },
            body: JSON.stringify({
              userId: target,
              title: '🎉 ¡Ya eres dueño en Cancheros!',
              message: 'Aprobamos tu solicitud. Entra a tu panel para configurar tus canchas.',
              url: '/dashboard',
            }),
          }).catch(() => {});
        });
      }
      return NextResponse.json({ success: true });
    }

    // El dueño recién aprobado marca como vista su celebración.
    if (body?.action === 'ack_approval') {
      await db.from('owner_requests').update({ celebrated_at: new Date().toISOString() })
        .eq('user_id', user.id).eq('status', 'approved').is('celebrated_at', null);
      return NextResponse.json({ success: true });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Completa todos los datos y una evidencia de al menos 10 caracteres' }, { status: 400 });
    const { error } = await db.rpc('resubmit_owner_request', { p_user: user.id, p_data: parsed.data });
    if (error) return NextResponse.json({ error: 'Ya existe una solicitud o no pudo guardarse' }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'No se pudo procesar la solicitud' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
