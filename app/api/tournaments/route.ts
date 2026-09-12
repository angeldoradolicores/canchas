import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';
import { getAuthenticatedUser } from '@/lib/auth-guard';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

// GET — Listar torneos (público con rate limiting)
export async function GET(req: NextRequest) {
  const rateLimit = checkRateLimit(req, {
    limit: 60,
    windowSeconds: 60,
    keyPrefix: 'api:tournaments:get',
  });
  if (!rateLimit.success) return createRateLimitErrorResponse(rateLimit);

  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(req.url);
    const pitchId = searchParams.get('pitch_id');

    let query = supabase
      .from('tournaments')
      .select(`
        *,
        pitches (
          id,
          name,
          image_url,
          media_urls,
          type,
          companies (
            name,
            zone
          )
        )
      `)
      .order('start_date', { ascending: true });

    if (pitchId) {
      query = query.eq('pitch_id', pitchId);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, {
    limit: 25,
    windowSeconds: 60,
    keyPrefix: 'api:tournaments:post',
  });
  if (!rateLimit.success) return createRateLimitErrorResponse(rateLimit);

  try {
    const supabase = getSupabase();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Cuerpo de petición inválido' }, { status: 400 });
    }

    const { action, payload } = body;

    // ── AUTENTICACIÓN ESTRICTA: EL PAYLOAD.USER_ID SE IGNORA ──
    const authedUser = await getAuthenticatedUser(req);
    let userId = authedUser?.id || null;

    if (!userId) {
      const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
      if (authHeader) {
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (token) {
          const { data } = await supabase.auth.getUser(token);
          userId = data?.user?.id || null;
        }
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'Debes iniciar sesión para realizar esta acción' }, { status: 401 });
    }

    // ── CREAR TORNEO ──
    if (action === 'create_tournament') {
      if (!payload?.name || typeof payload.name !== 'string' || payload.name.trim().length < 3) {
        return NextResponse.json({ error: 'El nombre del torneo debe tener al menos 3 caracteres' }, { status: 400 });
      }

      let createdByOwner = false;
      if (payload.pitch_id) {
        const { data: pitch } = await supabase
          .from('pitches')
          .select('id, companies(owner_id)')
          .eq('id', payload.pitch_id)
          .maybeSingle();

        if ((pitch as any)?.companies?.owner_id === userId) {
          createdByOwner = true;
        }
      }

      const { data, error } = await supabase
        .from('tournaments')
        .insert({
          user_id: userId,
          pitch_id: payload.pitch_id || null,
          name: payload.name.trim().slice(0, 120),
          description: typeof payload.description === 'string' ? payload.description.slice(0, 2000) : null,
          start_date: payload.start_date || null,
          registration_end_date: payload.registration_end_date || null,
          final_date: payload.final_date || null,
          location: typeof payload.location === 'string' ? payload.location.slice(0, 200) : null,
          entry_fee: parseFloat(payload.entry_fee) || 0,
          prize: typeof payload.prize === 'string' ? payload.prize.slice(0, 500) : null,
          prize_value: payload.prize_value ? parseFloat(payload.prize_value) : null,
          media_urls: Array.isArray(payload.media_urls) ? payload.media_urls.slice(0, 10) : [],
          created_by_owner: createdByOwner,
          status: 'active',
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    // ── ACTUALIZAR TORNEO ──
    if (action === 'update_tournament') {
      const { tournament_id, ...rest } = payload || {};
      if (!tournament_id) {
        return NextResponse.json({ error: 'Falta tournament_id' }, { status: 400 });
      }

      // Verificar propiedad estricta
      const { data: existing } = await supabase
        .from('tournaments')
        .select('user_id')
        .eq('id', tournament_id)
        .maybeSingle();

      if (!existing || (existing as any).user_id !== userId) {
        return NextResponse.json({ error: 'No tienes permiso para modificar este torneo' }, { status: 403 });
      }

      const { data, error } = await supabase
        .from('tournaments')
        .update({
          name: typeof rest.name === 'string' ? rest.name.trim().slice(0, 120) : undefined,
          description: typeof rest.description === 'string' ? rest.description.slice(0, 2000) : undefined,
          start_date: rest.start_date || undefined,
          registration_end_date: rest.registration_end_date || undefined,
          final_date: rest.final_date || undefined,
          location: typeof rest.location === 'string' ? rest.location.slice(0, 200) : undefined,
          entry_fee: rest.entry_fee !== undefined ? parseFloat(rest.entry_fee) : undefined,
          prize: typeof rest.prize === 'string' ? rest.prize.slice(0, 500) : undefined,
          prize_value: rest.prize_value !== undefined ? parseFloat(rest.prize_value) : undefined,
          media_urls: Array.isArray(rest.media_urls) ? rest.media_urls.slice(0, 10) : undefined,
          pitch_id: rest.pitch_id !== undefined ? rest.pitch_id : undefined,
          status: rest.status || undefined,
        })
        .eq('id', tournament_id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    // ── ELIMINAR TORNEO ──
    if (action === 'delete_tournament') {
      const { tournament_id } = payload || {};
      if (!tournament_id) {
        return NextResponse.json({ error: 'Falta tournament_id' }, { status: 400 });
      }

      const { data: existing } = await supabase
        .from('tournaments')
        .select('user_id')
        .eq('id', tournament_id)
        .maybeSingle();

      if (!existing || (existing as any).user_id !== userId) {
        return NextResponse.json({ error: 'No tienes permiso para eliminar este torneo' }, { status: 403 });
      }

      const { error } = await supabase.from('tournaments').delete().eq('id', tournament_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
