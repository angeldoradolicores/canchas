import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';
import { getAuthenticatedUser } from '@/lib/auth-guard';

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  const rateLimit = checkRateLimit(req, {
    limit: 60,
    windowSeconds: 60,
    keyPrefix: 'api:favorites:get',
  });
  if (!rateLimit.success) return createRateLimitErrorResponse(rateLimit);

  try {
    const authedUser = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const requestedUserId = searchParams.get('user_id');

    // Usar el usuario autenticado si existe, o el solicitado si no hay sesión
    const userId = authedUser?.id || requestedUserId;
    if (!userId) {
      return NextResponse.json({ favorites: [] });
    }

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from('pitch_favorites')
      .select('pitch_id')
      .eq('user_id', userId);

    if (error) {
      console.error('[Favorites GET error]', error);
      return NextResponse.json({ favorites: [] });
    }

    return NextResponse.json({
      favorites: (data || []).map((row: any) => row.pitch_id),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, {
    limit: 40,
    windowSeconds: 60,
    keyPrefix: 'api:favorites:post',
  });
  if (!rateLimit.success) return createRateLimitErrorResponse(rateLimit);

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Cuerpo de petición inválido' }, { status: 400 });
    }

    const { pitch_id, action } = body;
    if (!pitch_id || typeof pitch_id !== 'string') {
      return NextResponse.json({ error: 'Falta pitch_id' }, { status: 400 });
    }

    // Resolver usuario auténtico desde la sesión
    const authedUser = await getAuthenticatedUser(req);
    const effectiveUserId = authedUser?.id || (typeof body.user_id === 'string' ? body.user_id : null);

    if (!effectiveUserId) {
      return NextResponse.json({
        success: true,
        isFavorite: action === 'add',
        message: 'Guardado localmente',
      });
    }

    const supabase = getAdminSupabase();

    const { data: existing, error: checkError } = await supabase
      .from('pitch_favorites')
      .select('id')
      .eq('pitch_id', pitch_id)
      .eq('user_id', effectiveUserId)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.warn('[Favorites check error]', checkError);
    }

    const isCurrentlyFav = !!existing;

    if (action === 'remove' || (action === 'toggle' && isCurrentlyFav) || (!action && isCurrentlyFav)) {
      const { error: delError } = await supabase
        .from('pitch_favorites')
        .delete()
        .eq('pitch_id', pitch_id)
        .eq('user_id', effectiveUserId);

      if (delError) {
        return NextResponse.json({ error: delError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, isFavorite: false });
    } else {
      const { error: insError } = await supabase
        .from('pitch_favorites')
        .upsert({ pitch_id, user_id: effectiveUserId }, { onConflict: 'pitch_id,user_id' });

      if (insError) {
        return NextResponse.json({ error: insError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, isFavorite: true });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error del servidor' }, { status: 500 });
  }
}
