import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || '';
  if (q.length < 2) return NextResponse.json([]);

  try {
    const supabase = getServiceSupabase();
    // Nota: 'companies' no tiene columna 'city', la ciudad se obtiene de sus canchas asociadas
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, zone, address, pitches(id, name, city)')
      .ilike('name', `%${q}%`)
      .limit(8);

    if (error) {
      console.error('search-companies error:', error);
      return NextResponse.json([], { status: 500 });
    }

    const formatted = (data || []).map((company: any) => ({
      id: company.id,
      company_id: company.id,
      name: company.name,
      zone: company.zone,
      address: company.address,
      city: company.pitches?.[0]?.city || '',
      pitch_id: company.pitches?.[0]?.id || null,
      pitches_count: company.pitches?.length || 0,
      pitch: company.pitches?.[0] || null,
    }));

    return NextResponse.json(formatted);
  } catch (err: any) {
    console.error('search-companies exception:', err);
    return NextResponse.json([], { status: 500 });
  }
}
