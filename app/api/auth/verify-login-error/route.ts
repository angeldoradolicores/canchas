import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json().catch(() => ({}));
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ message: 'Correo inválido.' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceKey || !supabaseUrl) {
      return NextResponse.json({
        message: 'Correo o contraseña incorrectos.',
      });
    }

    const admin = createAdminClient(supabaseUrl, serviceKey);
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });

    if (error) {
      return NextResponse.json({
        message: 'Correo o contraseña incorrectos.',
      });
    }

    const user = data.users.find(u => u.email?.toLowerCase() === cleanEmail);

    if (!user) {
      return NextResponse.json({
        exists: false,
        message: 'Esta cuenta no está registrada. Verifica tu correo o regístrate para continuar.',
      });
    }

    if (user.banned_until && new Date(user.banned_until) > new Date()) {
      return NextResponse.json({
        exists: true,
        message: 'Tu cuenta se encuentra suspendida. Comunícate con soporte.',
      });
    }

    return NextResponse.json({
      exists: true,
      message: 'Contraseña incorrecta. Por favor verifica tu clave o recupérala.',
    });
  } catch (err: any) {
    return NextResponse.json({
      message: 'Correo o contraseña incorrectos.',
    });
  }
}
