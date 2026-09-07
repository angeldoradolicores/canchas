import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

async function getUserId(req: NextRequest, supabase: ReturnType<typeof getSupabase>): Promise<string | null> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  const { data } = await supabase.auth.getUser(token);
  return data?.user?.id || null;
}

// GET — List all tournaments (with pitch info joined)
export async function GET(req: NextRequest) {
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
  try {
    const supabase = getSupabase();
    const body = await req.json().catch(() => ({}));
    const { action, payload } = body;
    const userId = payload?.user_id || (await getUserId(req, supabase));

    // CREATE
    if (action === 'create_tournament') {
      if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

      // Check if pitch is from owner (created_by_owner flag)
      let createdByOwner = false;
      if (payload.pitch_id) {
        const { data: pitch } = await supabase
          .from('pitches')
          .select('id, companies(owner_id)')
          .eq('id', payload.pitch_id)
          .single();
        if ((pitch as any)?.companies?.owner_id === userId) {
          createdByOwner = true;
        }
      }

      const { data, error } = await supabase
        .from('tournaments')
        .insert({
          user_id: userId,
          pitch_id: payload.pitch_id || null,
          name: payload.name,
          description: payload.description || null,
          start_date: payload.start_date,
          registration_end_date: payload.registration_end_date || null,
          final_date: payload.final_date || null,
          location: payload.location || null,
          entry_fee: parseFloat(payload.entry_fee) || 0,
          prize: payload.prize || null,
          prize_value: payload.prize_value ? parseFloat(payload.prize_value) : null,
          media_urls: payload.media_urls || [],
          created_by_owner: createdByOwner,
          status: 'active',
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    // UPDATE
    if (action === 'update_tournament') {
      if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
      const { tournament_id, ...rest } = payload;

      // Verify ownership
      const { data: existing } = await supabase
        .from('tournaments')
        .select('user_id')
        .eq('id', tournament_id)
        .single();

      if ((existing as any)?.user_id !== userId) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
      }

      const { data, error } = await supabase
        .from('tournaments')
        .update({
          name: rest.name,
          description: rest.description || null,
          start_date: rest.start_date,
          registration_end_date: rest.registration_end_date || null,
          final_date: rest.final_date || null,
          location: rest.location || null,
          entry_fee: parseFloat(rest.entry_fee) || 0,
          prize: rest.prize || null,
          prize_value: rest.prize_value ? parseFloat(rest.prize_value) : null,
          media_urls: rest.media_urls || [],
          pitch_id: rest.pitch_id || null,
          status: rest.status || 'active',
        })
        .eq('id', tournament_id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    // DELETE
    if (action === 'delete_tournament') {
      if (!userId) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
      const { tournament_id } = payload;

      // Verify ownership
      const { data: existing } = await supabase
        .from('tournaments')
        .select('user_id')
        .eq('id', tournament_id)
        .single();

      if ((existing as any)?.user_id !== userId) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
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
