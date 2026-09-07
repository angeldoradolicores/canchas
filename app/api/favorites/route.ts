import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('user_id');
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
  try {
    const body = await req.json().catch(() => ({}));
    const { pitch_id, user_id, action } = body;

    if (!pitch_id) {
      return NextResponse.json({ error: 'Falta pitch_id' }, { status: 400 });
    }

    const supabase = getAdminSupabase();

    // Si no hay user_id, no podemos guardar en la base de datos pero el cliente puede usar localStorage
    if (!user_id) {
      return NextResponse.json({
        success: true,
        isFavorite: action === 'add' ? true : false,
        message: 'Guardado localmente',
      });
    }

    // Verificar si ya existe en pitch_favorites
    const { data: existing, error: checkError } = await supabase
      .from('pitch_favorites')
      .select('id')
      .eq('pitch_id', pitch_id)
      .eq('user_id', user_id)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.warn('[Favorites check error]', checkError);
    }

    const isCurrentlyFav = !!existing;

    if (action === 'remove' || (action === 'toggle' && isCurrentlyFav) || (!action && isCurrentlyFav)) {
      // Eliminar de favoritos
      const { error: delError } = await supabase
        .from('pitch_favorites')
        .delete()
        .eq('pitch_id', pitch_id)
        .eq('user_id', user_id);

      if (delError) {
        console.error('[Favorites delete error]', delError);
        return NextResponse.json({ error: delError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, isFavorite: false });
    } else {
      // Agregar a favoritos
      const { error: insError } = await supabase
        .from('pitch_favorites')
        .upsert({ pitch_id, user_id }, { onConflict: 'pitch_id,user_id' });

      if (insError) {
        console.error('[Favorites insert error]', insError);
        return NextResponse.json({ error: insError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, isFavorite: true });
    }
  } catch (err: any) {
    console.error('[Favorites POST error]', err);
    return NextResponse.json({ error: err.message || 'Error del servidor' }, { status: 500 });
  }
}
