/**
 * Ocupación de canchas sin exponer datos personales.
 *
 * Tras activar RLS en `bookings`, el navegador ya no puede leer la tabla directamente.
 * Esta utilidad usa la RPC `get_pitch_occupancy` (SECURITY DEFINER, solo devuelve
 * pitch_id/start_time/end_time/status/expires_at) y trocea la consulta en lotes de 50
 * canchas, que es el máximo que acepta la función.
 */

export interface OccupancyRow {
  pitch_id: string;
  start_time: string;
  end_time: string;
  status: string;
  expires_at: string | null;
}

const MAX_IDS_PER_CALL = 50;

export async function fetchOccupancy(
  supabase: any,
  pitchIds: Array<string | null | undefined>,
  fromIso: string,
  toIso: string,
): Promise<OccupancyRow[]> {
  const ids = Array.from(
    new Set((pitchIds || []).filter((id): id is string => typeof id === 'string' && id.length > 0)),
  );
  if (ids.length === 0) return [];

  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += MAX_IDS_PER_CALL) {
    batches.push(ids.slice(i, i + MAX_IDS_PER_CALL));
  }

  const results = await Promise.all(
    batches.map(async (batch) => {
      const { data, error } = await supabase.rpc('get_pitch_occupancy', {
        p_pitch_ids: batch,
        p_from: fromIso,
        p_to: toIso,
      });
      if (error) {
        console.error('[fetchOccupancy] error:', error.message || error);
        return [] as OccupancyRow[];
      }
      return (data || []) as OccupancyRow[];
    }),
  );

  return results.flat();
}
