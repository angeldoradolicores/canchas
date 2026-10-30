import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';
import { withCache, TTL } from '@/lib/cache';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  // ── Rate limiting: 60 búsquedas por minuto por IP ─────────────────────────
  const rateLimit = checkRateLimit(req, {
    limit: 60,
    windowSeconds: 60,
    keyPrefix: 'api:search',
  });
  if (!rateLimit.success) {
    return createRateLimitErrorResponse(rateLimit);
  }

  const q    = req.nextUrl.searchParams.get('q')    || '';
  const city = req.nextUrl.searchParams.get('city') || '';

  // Búsquedas muy cortas: responder sin tocar la DB
  if (q.length < 2) {
    return NextResponse.json([], {
      headers: { 'Cache-Control': 'public, max-age=5' },
    });
  }

  // Normalizar clave de caché: minúsculas + trim
  const cacheKey = `search:${q.toLowerCase().trim()}:${city.toLowerCase().trim()}`;

  try {
    const formatted = await withCache(cacheKey, TTL.SEARCH_RESULTS, async () => {
      const supabase = getServiceSupabase();

      const { data, error } = await supabase
        .from('companies')
        .select('id, name, zone, address, pitches(id, name, city)')
        .ilike('name', `%${q}%`)
        .limit(30);

      if (error) {
        console.error('[search-companies] Supabase error:', error);
        throw error;
      }

      let filtered = data || [];
      if (city && city !== 'Todas') {
        const cityTarget = city.toLowerCase().trim();
        filtered = filtered.filter((company: any) =>
          (company.pitches || []).some((p: any) =>
            (p.city || '').toLowerCase().trim().includes(cityTarget)
          )
        );
      }

      return filtered.slice(0, 10).map((company: any) => ({
        id:           company.id,
        company_id:   company.id,
        name:         company.name,
        zone:         company.zone,
        address:      company.address,
        city:         company.pitches?.[0]?.city || '',
        pitch_id:     company.pitches?.[0]?.id || null,
        pitches_count: company.pitches?.length || 0,
        pitch:        company.pitches?.[0] || null,
      }));
    });

    return NextResponse.json(formatted, {
      headers: {
        // CDN puede cachear 30s; el cliente tiene datos frescos por 10s
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=15',
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
      },
    });
  } catch (err: any) {
    console.error('[search-companies] Exception:', err);
    return NextResponse.json([], { status: 500 });
  }
}
