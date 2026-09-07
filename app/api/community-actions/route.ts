import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, payload } = body;
    const supabase = getSupabase();

    // Extraer userId del payload o del token de autorización
    let userId = payload?.user_id;
    if (!userId) {
      const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const { data: userData } = await supabase.auth.getUser(token);
        if (userData?.user?.id) {
          userId = userData.user.id;
        }
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // ELIMINAR RETO O BÚSQUEDA DE JUGADOR
    if (action === 'delete_challenge') {
      const { challenge_id } = payload;
      if (!challenge_id) return NextResponse.json({ error: 'Falta challenge_id' }, { status: 400 });

      // Check ownership
      const { data: challenge } = await supabase
        .from('challenges')
        .select('creator_id')
        .eq('id', challenge_id)
        .single();
      
      if (!challenge || challenge.creator_id !== userId) {
        return NextResponse.json({ error: 'No tienes permisos para eliminar este reto.' }, { status: 403 });
      }

      const { error } = await supabase.from('challenges').delete().eq('id', challenge_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // ACTUALIZAR RETO O BÚSQUEDA DE JUGADOR
    if (action === 'update_challenge') {
      const { challenge_id, updateData } = payload;
      if (!challenge_id || !updateData) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });

      // Check ownership
      const { data: challenge } = await supabase
        .from('challenges')
        .select('creator_id')
        .eq('id', challenge_id)
        .single();
      
      if (!challenge || challenge.creator_id !== userId) {
        return NextResponse.json({ error: 'No tienes permisos para editar este reto.' }, { status: 403 });
      }

      const { data, error } = await supabase
        .from('challenges')
        .update(updateData)
        .eq('id', challenge_id)
        .select()
        .single();
      
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });

  } catch (error: any) {
    console.error('Error en community-actions:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
