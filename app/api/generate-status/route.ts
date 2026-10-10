import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TZ = 'America/Bogota';

function isoToLocalHour(iso: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date(iso))
  ) % 24;
}

function hourLabel(h: number): string {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${suffix}`;
}

function allSlots(): string[] {
  const out: string[] = [];
  for (let h = 6; h <= 22; h++) out.push(hourLabel(h));
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { companyId, pitchId, forTomorrow = false, date } = body;

    if (!companyId) {
      return NextResponse.json({ success: false, error: 'companyId requerido' }, { status: 400 });
    }

    // 1. Verificar empresa
    const { data: company, error: compErr } = await supabase
      .from('companies')
      .select('id, name, address, zone')
      .eq('id', companyId)
      .maybeSingle();

    if (compErr || !company) {
      return NextResponse.json({ success: false, error: 'Complejo no encontrado' }, { status: 404 });
    }

    // 2. Calcular fecha objetivo (Colombia UTC-5)
    let targetDate = date as string | undefined;
    if (!targetDate) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(new Date());
      const get = (t: string) => parts.find(p => p.type === t)?.value ?? '0';
      const ymd = `${get('year')}-${get('month')}-${get('day')}`;
      if (forTomorrow) {
        const [y, m, d] = ymd.split('-').map(Number);
        targetDate = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
      } else {
        targetDate = ymd;
      }
    }

    // 3. Todas las canchas activas del complejo
    const { data: allPitches } = await supabase
      .from('pitches')
      .select('id, name')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name');

    const pitches = allPitches ?? [];

    if (pitches.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          pitches: [],
          freeHours: allSlots(),
          bookedHours: [],
          companyName: company.name,
          targetDate,
        },
      });
    }

    // 4. Filtrar por cancha seleccionada o todas
    const targetIds = pitchId && pitchId !== 'all'
      ? [pitchId]
      : pitches.map((p: any) => p.id);

    // 5. Obtener reservas del día en zona Colombia
    const { data: bookings } = await supabase
      .from('bookings')
      .select('start_time, end_time, pitch_id, status')
      .in('pitch_id', targetIds)
      .gte('start_time', `${targetDate}T05:00:00Z`)   // 00:00 COT
      .lt('start_time', `${targetDate}T29:00:00Z`)    // rango generoso
      .in('status', ['confirmed', 'pending']);

    // 6. Mapear horas ocupadas por pitch
    const bookedByHour = new Map<string, Set<string>>(); // label → Set<pitchId>
    for (const b of bookings ?? []) {
      const h = isoToLocalHour(b.start_time);
      if (h < 6 || h > 22) continue;
      const label = hourLabel(h);
      if (!bookedByHour.has(label)) bookedByHour.set(label, new Set());
      bookedByHour.get(label)!.add(b.pitch_id);
    }

    // 7. Clasificar cada franja
    const freeHours: string[] = [];
    const bookedHours: string[] = [];

    for (const slot of allSlots()) {
      const occupied = bookedByHour.get(slot) ?? new Set();

      if (pitchId && pitchId !== 'all') {
        // Cancha específica: libre si NO tiene reserva
        if (occupied.has(pitchId)) bookedHours.push(slot);
        else freeHours.push(slot);
      } else {
        // Todas: libre si AL MENOS UNA cancha está libre
        const allOccupied = targetIds.every((id: string) => occupied.has(id));
        if (allOccupied) bookedHours.push(slot);
        else freeHours.push(slot);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        pitches,
        freeHours,
        bookedHours,
        companyName: company.name,
        address: company.address || company.zone || '',
        targetDate,
        forTomorrow,
      },
    });
  } catch (err: any) {
    console.error('[generate-status]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
