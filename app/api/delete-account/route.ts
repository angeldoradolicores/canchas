import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-guard';

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user: supports Authorization Bearer header OR SSR cookies
    let user = await getAuthenticatedUser(req);

    if (!user) {
      try {
        const supabase = await createClient();
        const { data: { user: serverUser } } = await supabase.auth.getUser();
        user = serverUser;
      } catch (cookieErr) {
        console.warn('Error checking server cookies for user:', cookieErr);
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Sesión no válida o expirada. Por favor vuelve a iniciar sesión.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const confirmation = typeof body?.confirmation === 'string' ? body.confirmation.trim().toUpperCase() : '';

    // Require explicit confirmation string to prevent accidents
    if (confirmation !== 'ELIMINAR') {
      return NextResponse.json({ error: 'Debes escribir la palabra ELIMINAR para confirmar.' }, { status: 400 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is not defined in environment');
      return NextResponse.json({ error: 'Error de configuración en el servidor' }, { status: 500 });
    }

    // Use service_role key to perform admin operations (delete from auth.users)
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const userId = user.id;

    // 1. Delete user favorites
    try {
      await supabaseAdmin.from('pitch_favorites').delete().eq('user_id', userId);
    } catch (e) {
      console.warn('Error deleting pitch_favorites:', e);
    }

    // 2. Delete user notifications (both received and sent)
    try {
      await supabaseAdmin.from('notifications').delete().or(`user_id.eq.${userId},sender_id.eq.${userId}`);
    } catch (e) {
      console.warn('Error deleting notifications:', e);
    }

    // 3. Delete user's bookings
    try {
      await supabaseAdmin.from('bookings').delete().eq('user_id', userId);
    } catch (e) {
      console.warn('Error deleting bookings:', e);
    }

    // 4. Delete user's challenges / convocatorias
    try {
      await supabaseAdmin.from('challenges').delete().eq('creator_id', userId);
    } catch (e) {
      console.warn('Error deleting challenges:', e);
    }

    // 5. Delete user's profile
    try {
      await supabaseAdmin.from('profiles').delete().eq('id', userId);
    } catch (e) {
      console.warn('Error deleting profile:', e);
    }

    // 6. Delete the auth user account (requires service_role)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('Error deleting auth user:', deleteError);
      return NextResponse.json({ error: 'Error al eliminar la cuenta: ' + deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Delete account exception:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}
