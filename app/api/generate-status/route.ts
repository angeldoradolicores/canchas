import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { safeServerErrorResponse } from '@/lib/error-handler';
import { getConflictingPitchIds } from '@/lib/combined-pitch-utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TZ = 'America/Bogota';

function hourLabel(h: number): string {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${suffix}`;
}

function allSlots(): string[] {
  const out: string[] = [];
  for (let h = 6; h <= 23; h++) out.push(hourLabel(h));
  return out;
}

function parseBookingHours(startTime: string, endTime?: string): { startH: number; endH: number } {
  const sDate = new Date(startTime);
  const parts = new Intl.DateTimeFormat('es-CO', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(sDate);
  let startH = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  if (startH === 24) startH = 0;

  let endH = startH + 1;
  if (endTime) {
    const eDate = new Date(endTime);
    const eParts = new Intl.DateTimeFormat('es-CO', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(eDate);
    let h = parseInt(eParts.find(p => p.type === 'hour')?.value || '0', 10);
    if (h === 24) h = 0;
    if (h > startH) {
      endH = h;
    }
  }
  return { startH, endH };
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

    // 2. Calcular fecha objetivo en zona Colombia (UTC-5)
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

    // 3. Todas las canchas del complejo (incluyendo configuración modular/combinada)
    const { data: allPitches, error: pitchErr } = await supabase
      .from('pitches')
      .select('id, name, is_active, custom_pricing, is_combined, linked_pitch_ids')
      .eq('company_id', companyId)
      .order('name');

    if (pitchErr) {
      console.error('[generate-status] Error fetching pitches:', pitchErr);
    }

    const pitches = (allPitches ?? []).filter((p: any) => p.is_active !== false);

    if (pitches.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          pitches: [],
          freeHours: allSlots(),
          bookedHours: [],
          inProgressHours: [],
          slotsDetail: allSlots().map(slot => ({
            slot,
            status: 'free',
            freeCount: 0,
            bookedCount: 0,
            inProgressCount: 0,
            bookings: [],
          })),
          companyName: company.name,
          address: company.address || company.zone || '',
          targetDate,
        },
      });
    }

    // 4. Determinar los IDs relevantes considerando canchas combinadas y conflictos
    const isSinglePitch = Boolean(pitchId && pitchId !== 'all');
    let targetIds: string[] = [];

    if (isSinglePitch) {
      targetIds = getConflictingPitchIds(pitchId, pitches);
    } else {
      targetIds = pitches.map((p: any) => p.id);
    }

    // 5. Obtener reservas del día en rango UTC-5 completo
    const startDate = `${targetDate}T00:00:00-05:00`;
    const endDate = `${targetDate}T23:59:59-05:00`;

    const { data: bookings, error: bookErr } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, pitch_id, status, source, expires_at, customer_name, customer_phone')
      .in('pitch_id', targetIds)
      .gte('start_time', startDate)
      .lte('start_time', endDate)
      .neq('status', 'cancelled');

    if (bookErr) {
      console.error('[generate-status] Error fetching bookings:', bookErr);
    }

    const now = new Date();
    const pitchMap = new Map(pitches.map((p: any) => [p.id, p]));

    // Mapear reservas por hora
    const bookedByHour = new Map<string, Set<string>>(); // label -> Set<pitchId>
    const inProgressByHour = new Map<string, Set<string>>(); // label -> Set<pitchId>
    const detailsByHour = new Map<string, any[]>(); // label -> array de reservas

    for (const b of bookings ?? []) {
      // Ignorar borradores que ya expiraron
      if (b.status === 'draft') {
        if (!b.expires_at || new Date(b.expires_at) <= now) {
          continue;
        }
      }

      const { startH, endH } = parseBookingHours(b.start_time, b.end_time);

      for (let h = startH; h < endH && h <= 23; h++) {
        if (h < 6) continue;
        const label = hourLabel(h);

        if (!detailsByHour.has(label)) detailsByHour.set(label, []);
        detailsByHour.get(label)!.push({
          id: b.id,
          pitch_id: b.pitch_id,
          pitch_name: pitchMap.get(b.pitch_id)?.name || 'Cancha',
          customer_name: b.customer_name || 'Cliente',
          status: b.status,
          source: b.source,
          expires_at: b.expires_at,
        });

        // Clasificación:
        // 'draft' (activo) o 'pending' -> Siendo reservada / En proceso
        // 'confirmed' o reserva manual del dueño -> Reservada / Ocupada
        if (b.status === 'draft' || b.status === 'pending') {
          if (!inProgressByHour.has(label)) inProgressByHour.set(label, new Set());
          inProgressByHour.get(label)!.add(b.pitch_id);
        } else {
          if (!bookedByHour.has(label)) bookedByHour.set(label, new Set());
          bookedByHour.get(label)!.add(b.pitch_id);
        }
      }
    }

    // 6. Clasificar cada franja horaria de 06:00 a 23:00
    const freeHours: string[] = [];
    const bookedHours: string[] = [];
    const inProgressHours: string[] = [];
    const slotsDetail: any[] = [];

    const slots = allSlots();

    for (const slot of slots) {
      const occupiedConfirmed = bookedByHour.get(slot) ?? new Set();
      const occupiedInProgress = inProgressByHour.get(slot) ?? new Set();
      const details = detailsByHour.get(slot) ?? [];

      if (isSinglePitch) {
        // Cancha específica seleccionada (incluyendo sus canchas vinculadas por modularidad)
        const hasConfirmedConflict = targetIds.some(id => occupiedConfirmed.has(id));
        const hasInProgressConflict = targetIds.some(id => occupiedInProgress.has(id));

        let slotStatus: 'free' | 'booked' | 'in_progress' = 'free';

        if (hasConfirmedConflict) {
          slotStatus = 'booked';
          bookedHours.push(slot);
        } else if (hasInProgressConflict) {
          slotStatus = 'in_progress';
          inProgressHours.push(slot);
        } else {
          slotStatus = 'free';
          freeHours.push(slot);
        }

        slotsDetail.push({
          slot,
          status: slotStatus,
          isBooked: slotStatus === 'booked',
          isInProgress: slotStatus === 'in_progress',
          isFree: slotStatus === 'free',
          freeCount: slotStatus === 'free' ? 1 : 0,
          bookedCount: slotStatus === 'booked' ? 1 : 0,
          inProgressCount: slotStatus === 'in_progress' ? 1 : 0,
          totalPitches: 1,
          details,
        });
      } else {
        // Modo: Todas las canchas del complejo
        const totalCount = pitches.length;
        const bookedPitchesList: string[] = [];
        const inProgressPitchesList: string[] = [];
        const freePitchesList: string[] = [];

        pitches.forEach((p: any) => {
          const conflicting = getConflictingPitchIds(p.id, pitches);
          const isConfirmed = conflicting.some(id => occupiedConfirmed.has(id));
          const isInProg = conflicting.some(id => occupiedInProgress.has(id));

          if (isConfirmed) {
            bookedPitchesList.push(p.name);
          } else if (isInProg) {
            inProgressPitchesList.push(p.name);
          } else {
            freePitchesList.push(p.name);
          }
        });

        const allBooked = bookedPitchesList.length === totalCount;
        const allOccupiedOrProg = bookedPitchesList.length + inProgressPitchesList.length === totalCount;
        const hasAnyFree = freePitchesList.length > 0;

        let slotStatus: 'free' | 'booked' | 'in_progress' = 'free';

        if (allBooked) {
          slotStatus = 'booked';
          bookedHours.push(slot);
        } else if (allOccupiedOrProg && !hasAnyFree) {
          slotStatus = 'in_progress';
          inProgressHours.push(slot);
        } else {
          // Hay al menos 1 cancha libre
          slotStatus = 'free';
          freeHours.push(slot);

          // Si además hay alguna siendo reservada o ya reservada, registrar en listas de soporte
          if (inProgressPitchesList.length > 0) {
            inProgressHours.push(slot);
          }
          if (bookedPitchesList.length > 0) {
            bookedHours.push(slot);
          }
        }

        slotsDetail.push({
          slot,
          status: slotStatus,
          isBooked: allBooked,
          isInProgress: inProgressPitchesList.length > 0,
          isFree: hasAnyFree,
          freeCount: freePitchesList.length,
          bookedCount: bookedPitchesList.length,
          inProgressCount: inProgressPitchesList.length,
          totalPitches: totalCount,
          freePitches: freePitchesList,
          bookedPitches: bookedPitchesList,
          inProgressPitches: inProgressPitchesList,
          details,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        pitches,
        freeHours,
        bookedHours,
        inProgressHours,
        slotsDetail,
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
