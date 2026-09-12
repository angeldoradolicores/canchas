import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  // Prohibir acceso en producción
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Endpoint no disponible' }, { status: 404 });
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Acceso no autorizado' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, key);

  try {
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name, owner_id')
      .eq('owner_id', user.id);

    const pitchesResult: any[] = [];
    for (const c of companies ?? []) {
      const { data: pitches } = await supabase
        .from('pitches')
        .select('id, name, company_id')
        .eq('company_id', c.id);
      pitchesResult.push({ company: c.name, pitches: pitches?.map(p => p.name) });
    }

    return NextResponse.json({
      userId: user.id,
      companiesFound: companies?.length ?? 0,
      companies,
      pitches: pitchesResult,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
