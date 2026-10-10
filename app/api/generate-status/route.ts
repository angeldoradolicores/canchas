import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { companyId, availableHours, forTomorrow = false } = body;

    if (!companyId) {
      return NextResponse.json({ success: false, error: 'companyId requerido' }, { status: 400 });
    }

    // 1. Obtener datos del complejo
    const { data: company, error: compErr } = await supabase
      .from('companies')
      .select('id, name, address, zone')
      .eq('id', companyId)
      .maybeSingle();

    if (compErr || !company) {
      return NextResponse.json({ success: false, error: 'Complejo no encontrado' }, { status: 404 });
    }

    // 2. Si no se pasaron horas, buscar disponibilidad real de hoy/mañana
    let hoursToShow: string[] = availableHours || [];

    if (hoursToShow.length === 0) {
      const targetDate = forTomorrow
        ? new Date(Date.now() + 86400000).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      const { data: pitches } = await supabase
        .from('pitches')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('is_active', true);

      if (pitches && pitches.length > 0) {
        const pitchIds = pitches.map((p: any) => p.id);
        const { data: bookings } = await supabase
          .from('bookings')
          .select('start_time, end_time, pitch_id, status')
          .in('pitch_id', pitchIds)
          .gte('start_time', `${targetDate}T00:00:00`)
          .lt('start_time', `${targetDate}T23:59:59`)
          .in('status', ['confirmed', 'pending']);

        // Generar franjas horarias disponibles básicas (6am - 10pm)
        const bookedSlots = new Set(
          (bookings || []).map((b: any) => {
            const h = new Date(b.start_time).getHours();
            return `${h}:00`;
          })
        );

        const allSlots = [];
        for (let h = 6; h <= 22; h++) {
          const label = `${h === 12 ? 12 : h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`;
          if (!bookedSlots.has(`${h}:00`)) {
            allSlots.push(label);
          }
        }
        // Tomar hasta 8 franjas disponibles
        hoursToShow = allSlots.slice(0, 8);
      }
    }

    const dayLabel = forTomorrow ? 'mañana' : 'hoy';

    return NextResponse.json({
      success: true,
      data: {
        companyName: company.name,
        address: company.address || company.zone || '',
        availableHours: hoursToShow,
        dayLabel,
        forTomorrow,
      },
    });
  } catch (err: any) {
    console.error('[generate-status] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
