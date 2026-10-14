import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { safeServerErrorResponse } from '@/lib/error-handler';

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

    // 3. Todas las canchas del complejo
    const { data: allPitches, error: pitchErr } = await supabase
      .from('pitches')
      .select('id, name, is_active')
      .eq('company_id', companyId)
      .order('name');

    if (pitchErr) {
      console.error('[generate-status] Error fetching pitches:', pitchErr);
    }

    // Filtrar solo las que no estén explícitamente inactivas (si existe el campo)
    const pitches = (allPitches ?? []).filter((p: any) => p.is_active !== false);

    if (pitches.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          pitches: [],
          freeHours: allSlots(),
          bookedHours: [],
          companyName: company.name,
          address: company.address || company.zone || '',
          targetDate,
        },
      });
    }

    // 4. Filtrar por cancha seleccionada o todas
    const targetIds = pitchId && pitchId !== 'all'
      ? [pitchId]
      : pitches.map((p: any) => p.id);

    // 5. Obtener reservas del día en zona Colombia (UTC-5)
    const startDate = `${targetDate}T00:00:00-05:00`;
    const endDate = `${targetDate}T23:59:59-05:00`;

    const { data: bookings, error: bookErr } = await supabase
      .from('bookings')
      .select('start_time, end_time, pitch_id, status, expires_at')
      .in('pitch_id', targetIds)
      .gte('start_time', startDate)
      .lte('start_time', endDate)
      .neq('status', 'cancelled');

    if (bookErr) {
      console.error('[generate-status] Error fetching bookings:', bookErr);
    }

    // 6. Mapear horas ocupadas por pitch (considerando reservas confirmadas, pendientes y bloqueos activos)
    const now = new Date();
    const bookedByHour = new Map<string, Set<string>>(); // label → Set<pitchId>
    const inProgressByHour = new Map<string, Set<string>>(); // label → Set<pitchId>

    for (const b of bookings ?? []) {
      // Ignorar borradores que ya expiraron
      if (b.status === 'draft') {
        if (!b.expires_at || new Date(b.expires_at) <= now) {
          continue;
        }
      }

      const startH = isoToLocalHour(b.start_time);
      let endH = b.end_time ? isoToLocalHour(b.end_time) : startH + 1;
      // Corregir franjas de medianoche o iguales
      if (endH <= startH) endH = startH + 1;

      for (let h = startH; h < endH && h <= 22; h++) {
        if (h < 6) continue;
        const label = hourLabel(h);

        if (b.status === 'draft') {
          if (!inProgressByHour.has(label)) inProgressByHour.set(label, new Set());
          inProgressByHour.get(label)!.add(b.pitch_id);
        } else {
          // 'confirmed' o 'pending'
          if (!bookedByHour.has(label)) bookedByHour.set(label, new Set());
          bookedByHour.get(label)!.add(b.pitch_id);
        }
      }
    }

    // 7. Clasificar cada franja
    const freeHours: string[] = [];
    const bookedHours: string[] = [];
    const inProgressHours: string[] = [];

    for (const slot of allSlots()) {
      const occupiedConfirmed = bookedByHour.get(slot) ?? new Set();
      const occupiedInProgress = inProgressByHour.get(slot) ?? new Set();

      if (pitchId && pitchId !== 'all') {
        // Cancha específica:
        if (occupiedConfirmed.has(pitchId)) {
          bookedHours.push(slot);
        } else if (occupiedInProgress.has(pitchId)) {
          inProgressHours.push(slot);
          bookedHours.push(slot); // También se considera no libre
        } else {
          freeHours.push(slot);
        }
      } else {
        // Todas las canchas:
        const allOccupiedConfirmed = targetIds.every((id: string) => occupiedConfirmed.has(id));
        const allOccupiedOrProgress = targetIds.every(
          (id: string) => occupiedConfirmed.has(id) || occupiedInProgress.has(id)
        );

        if (allOccupiedConfirmed) {
          bookedHours.push(slot);
        } else if (allOccupiedOrProgress) {
          inProgressHours.push(slot);
          bookedHours.push(slot);
        } else {
          freeHours.push(slot);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        pitches,
        freeHours,
        bookedHours,
        inProgressHours,
        companyName: company.name,
        address: company.address || company.zone || '',
        targetDate,
        forTomorrow,
      },
    });
  } catch (err: any) {
    return NextResponse.json(safeServerErrorResponse(err, 'Error al generar el reporte de disponibilidad.'), { status: 500 });
  }
}
