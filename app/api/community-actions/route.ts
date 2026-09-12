import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import {
  CommunityDeleteChallengeSchema,
  CommunityUpdateChallengeSchema,
} from '@/lib/validations/api-schemas';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  // ── 1. RATE LIMITING: 30 peticiones por minuto ──
  const rateLimit = checkRateLimit(req, {
    limit: 30,
    windowSeconds: 60,
    keyPrefix: 'api:community',
  });

  if (!rateLimit.success) {
    return createRateLimitErrorResponse(rateLimit);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Cuerpo de petición inválido' }, { status: 400 });
    }

    const { action, payload } = body;
    const supabase = getSupabase();

    // ── 2. AUTENTICACIÓN ESTRICTA (IGNORA PAYLOAD.USER_ID) ──
    const authedUser = await getAuthenticatedUser(req);
    let userId = authedUser?.id || null;

    if (!userId) {
      const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
      if (authHeader) {
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (token) {
          const { data: userData } = await supabase.auth.getUser(token);
          userId = userData?.user?.id || null;
        }
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'Debes iniciar sesión para realizar esta acción.' }, { status: 401 });
    }

    // ── 3. ELIMINAR RETO O BÚSQUEDA DE JUGADOR ──
    if (action === 'delete_challenge') {
      const validation = CommunityDeleteChallengeSchema.safeParse(payload || {});
      if (!validation.success) {
        return NextResponse.json({ error: 'ID de reto inválido' }, { status: 400 });
      }

      const { challenge_id } = validation.data;

      // Verificar que el reto le pertenece al usuario autenticado
      const { data: challenge } = await supabase
        .from('challenges')
        .select('creator_id')
        .eq('id', challenge_id)
        .maybeSingle();

      if (!challenge || challenge.creator_id !== userId) {
        return NextResponse.json({ error: 'No tienes permisos para eliminar este reto.' }, { status: 403 });
      }

      const { error } = await supabase.from('challenges').delete().eq('id', challenge_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // ── 4. ACTUALIZAR RETO O BÚSQUEDA DE JUGADOR ──
    if (action === 'update_challenge') {
      const validation = CommunityUpdateChallengeSchema.safeParse(payload || {});
      if (!validation.success) {
        return NextResponse.json({ error: 'Parámetros inválidos para actualizar reto' }, { status: 400 });
      }

      const { challenge_id, updateData } = validation.data;

      // Verificar que el reto le pertenece al usuario autenticado
      const { data: challenge } = await supabase
        .from('challenges')
        .select('creator_id')
        .eq('id', challenge_id)
        .maybeSingle();

      if (!challenge || challenge.creator_id !== userId) {
        return NextResponse.json({ error: 'No tienes permisos para editar este reto.' }, { status: 403 });
      }

      // Sanitizar campos permitidos para actualizar
      const safeUpdateData: Record<string, any> = {};
      const allowedFields = ['title', 'description', 'status', 'preferred_date', 'preferred_time', 'players_needed'];
      for (const key of allowedFields) {
        if (key in updateData) {
          safeUpdateData[key] = updateData[key];
        }
      }

      const { data, error } = await supabase
        .from('challenges')
        .update(safeUpdateData)
        .eq('id', challenge_id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  } catch (error: any) {
    console.error('Error en community-actions:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
