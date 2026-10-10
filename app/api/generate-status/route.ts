import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TZ = 'America/Bogota';

/** Convierte una fecha ISO a la hora local de Colombia en formato "H:00 AM/PM" */
function isoToLocalHourLabel(iso: string): string {
  const date = new Date(iso);
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(date)
  ) % 24;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${suffix}`;
}

/** Genera todas las franjas horarias de un día (6 AM a 10 PM) */
function allDaySlots(): string[] {
  const slots: string[] = [];
  for (let h = 6; h <= 22; h++) {
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    slots.push(`${h12}:00 ${suffix}`);
  }
  return slots;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { companyId, pitchId, forTomorrow = false, date } = body;

    if (!companyId) {
      return NextResponse.json({ success: false, error: 'companyId requerido' }, { status: 400 });
    }

    // 1. Verificar empresa y obtener nombre
    const { data: company, error: compErr } = await supabase
      .from('companies')
      .select('id, name, address, zone')
      .eq('id', companyId)
      .maybeSingle();

    if (compErr || !company) {
      return NextResponse.json({ success: false, error: 'Complejo no encontrado' }, { status: 404 });
    }

    // 2. Calcular fecha objetivo en zona horaria de Colombia
    let targetDate = date as string | undefined;
    if (!targetDate) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(new Date());
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
      const ymd = `${get('year')}-${get('month')}-${get('day')}`;
      if (forTomorrow) {
        const [y, m, d] = ymd.split('-').map(Number);
        const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
        targetDate = tomorrow.toISOString().slice(0, 10);
      } else {
        targetDate = ymd;
      }
    }

    // Rango del día en UTC (Colombia es UTC-5)
    const startUTC = `${targetDate}T05:00:00Z`; // 00:00 COT
    const endUTC   = `${targetDate}T28:59:59Z`; // usando next day T04:59 COT — simplificamos con rango amplio

    // 3. Obtener canchas del complejo (filtrar por una si se especificó)
    let pitchQuery = supabase
      .from('pitches')
      .select('id, name, custom_pricing')
      .eq('company_id', companyId)
      .eq('is_active', true);

    if (pitchId && pitchId !== 'all') {
      pitchQuery = pitchQuery.eq('id', pitchId);
    }

    const { data: pitches, error: pitchErr } = await pitchQuery;

    if (pitchErr || !pitches || pitches.length === 0) {
      return NextResponse.json({
        success: true,
        data: { availableHours: allDaySlots(), pitches: [], companyName: company.name },
        message: 'No hay canchas activas; mostrando todas las franjas posibles.',
      });
    }

    const pitchIds = pitches.map((p: any) => p.id);

    // 4. Obtener reservas del día (confirmadas o pendientes)
    const { data: bookings } = await supabase
      .from('bookings')
      .select('start_time, end_time, pitch_id, status')
      .in('pitch_id', pitchIds)
      .gte('start_time', startUTC)
      .lte('start_time', `${targetDate}T23:59:00-05:00`)
      .in('status', ['confirmed', 'pending']);

    // 5. Construir un mapa: hora → pitches ocupadas esa hora
    const bookedByHour = new Map<string, Set<string>>();
    for (const b of bookings ?? []) {
      const label = isoToLocalHourLabel(b.start_time);
      if (!bookedByHour.has(label)) bookedByHour.set(label, new Set());
      bookedByHour.get(label)!.add(b.pitch_id);
    }

    // 6. Calcular horas disponibles:
    //    - Si es UNA cancha: hora libre si no tiene reserva esa hora
    //    - Si son TODAS: hora libre si AL MENOS UNA cancha no tiene reserva esa hora
    const allSlots = allDaySlots();
    const availableHours: string[] = [];

    for (const slot of allSlots) {
      const occupiedPitches = bookedByHour.get(slot) ?? new Set();
      if (pitchId && pitchId !== 'all') {
        // Cancha específica
        if (!occupiedPitches.has(pitchId)) {
          availableHours.push(slot);
        }
      } else {
        // Todas: libre si al menos una no está ocupada
        const hasFreePitch = pitchIds.some((id: string) => !occupiedPitches.has(id));
        if (hasFreePitch) {
          availableHours.push(slot);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        companyName: company.name,
        address: company.address || company.zone || '',
        availableHours,
        pitches: pitches.map((p: any) => ({ id: p.id, name: p.name })),
        targetDate,
        forTomorrow,
      },
    });
  } catch (err: any) {
    console.error('[generate-status] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
