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
    limit: 180,
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
      .select('pitch_id, pitches(company_id)')
      .eq('user_id', userId);

    if (error) {
      console.error('[Favorites GET error]', error);
      return NextResponse.json({ favorites: [], favorite_companies: [] });
    }

    const favorites = (data || []).map((row: any) => row.pitch_id).filter(Boolean);
    const favoriteCompanies = Array.from(
      new Set(
        (data || [])
          .map((row: any) => row.pitches?.company_id)
          .filter(Boolean)
      )
    );

    return NextResponse.json({
      favorites,
      favorite_companies: favoriteCompanies,
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

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let targetPitchId = pitch_id;

    // Si viene como identificador de complejo 'companyUUID_pasto_loc_1', extraer el UUID base
    if (!UUID_REGEX.test(targetPitchId)) {
      const firstPart = targetPitchId.split('_')[0];
      if (UUID_REGEX.test(firstPart)) {
        targetPitchId = firstPart;
      }
    }

    const supabase = getAdminSupabase();

    // 1. Si targetPitchId no es UUID directo, intentar buscar por nombre de complejo o compañía
    let resolvedPitchId: string | null = null;

    if (UUID_REGEX.test(targetPitchId)) {
      // 1.1 Verificar si es ID directo de cancha
      const { data: pitchRow } = await supabase
        .from('pitches')
        .select('id')
        .eq('id', targetPitchId)
        .maybeSingle();

      if (pitchRow?.id) {
        resolvedPitchId = pitchRow.id;
      } else {
        // 1.2 Si es ID de compañía / complejo, asociar la primera cancha activa de ese complejo
        const { data: compPitch } = await supabase
          .from('pitches')
          .select('id')
          .eq('company_id', targetPitchId)
          .limit(1)
          .maybeSingle();

        if (compPitch?.id) {
          resolvedPitchId = compPitch.id;
        }
      }
    }

    if (!resolvedPitchId) {
      // Identificador no encontrado en DB, almacenar localmente
      return NextResponse.json({ success: true, isFavorite: action === 'add', localOnly: true });
    }

    targetPitchId = resolvedPitchId;

    const { data: existing, error: checkError } = await supabase
      .from('pitch_favorites')
      .select('id')
      .eq('pitch_id', targetPitchId)
      .eq('user_id', effectiveUserId)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.warn('[Favorites check warning]', checkError.message);
    }

    const isCurrentlyFav = !!existing;

    if (action === 'remove' || (action === 'toggle' && isCurrentlyFav) || (!action && isCurrentlyFav)) {
      const { error: delError } = await supabase
        .from('pitch_favorites')
        .delete()
        .eq('pitch_id', targetPitchId)
        .eq('user_id', effectiveUserId);

      if (delError) {
        console.warn('[Favorites delete warning]', delError.message);
        return NextResponse.json({ success: true, isFavorite: false, warning: delError.message });
      }

      return NextResponse.json({ success: true, isFavorite: false });
    } else {
      const { error: insError } = await supabase
        .from('pitch_favorites')
        .upsert({ pitch_id: targetPitchId, user_id: effectiveUserId }, { onConflict: 'pitch_id,user_id' });

      if (insError) {
        console.warn('[Favorites insert warning]', insError.message);
        return NextResponse.json({ success: true, isFavorite: true, warning: insError.message });
      }

      return NextResponse.json({ success: true, isFavorite: true });
    }
  } catch (err: any) {
    console.warn('[Favorites POST exception]', err.message);
    return NextResponse.json({ success: true, isFavorite: false }, { status: 200 });
  }
}
