import { createClient } from '@supabase/supabase-js';

export interface CombinedPitchConfig {
  is_combined?: boolean;
  linked_pitch_ids?: string[];
  combined_notes?: string;
}

/**
 * Verifica si una cancha es combinada / modular
 */
export function isCombinedPitch(pitch: any): boolean {
  if (!pitch) return false;
  return Boolean(
    pitch.custom_pricing?.is_combined === true ||
    pitch.is_combined === true
  );
}

/**
 * Obtiene la lista de IDs de canchas hijas que componen la cancha combinada
 */
export function getLinkedPitchIds(pitch: any): string[] {
  if (!pitch) return [];
  const list = pitch.custom_pricing?.linked_pitch_ids || pitch.linked_pitch_ids;
  if (Array.isArray(list)) {
    return list.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  }
  return [];
}

/**
 * Obtiene todos los IDs de canchas que tienen conflicto de horario mutuo con targetPitchId.
 * - Si targetPitch es combinada: conflicto con ella misma + todas sus canchas hijas.
 * - Si targetPitch es hija: conflicto con ella misma + todas las canchas combinadas que la contienen.
 */
export function getConflictingPitchIds(targetPitchId: string, allPitches: any[]): string[] {
  if (!targetPitchId) return [];
  const conflicts = new Set<string>([targetPitchId]);

  const targetPitch = allPitches.find(p => p.id === targetPitchId);

  // 1. Si targetPitch es combinada, incluir todas sus canchas hijas
  if (targetPitch && isCombinedPitch(targetPitch)) {
    const linkedIds = getLinkedPitchIds(targetPitch);
    linkedIds.forEach(id => conflicts.add(id));
  }

  // 2. Si targetPitch forma parte de alguna cancha combinada padre, incluir esa cancha combinada
  allPitches.forEach(p => {
    if (isCombinedPitch(p)) {
      const linked = getLinkedPitchIds(p);
      if (linked.includes(targetPitchId)) {
        conflicts.add(p.id);
      }
    }
  });

  return Array.from(conflicts);
}

/**
 * Obtiene los IDs en conflicto directamente desde Supabase en el backend o frontend
 */
export async function fetchConflictingPitchIds(supabase: any, pitchId: string): Promise<string[]> {
  if (!pitchId) return [];
  try {
    // 1. Obtener la cancha objetivo
    const { data: targetPitch, error } = await supabase
      .from('pitches')
      .select('id, company_id, custom_pricing')
      .eq('id', pitchId)
      .maybeSingle();

    if (error || !targetPitch) return [pitchId];

    // 2. Si no tiene company_id, solo evaluar sus propios linked_pitch_ids
    if (!targetPitch.company_id) {
      const linked = getLinkedPitchIds(targetPitch);
      return Array.from(new Set([pitchId, ...linked]));
    }

    // 3. Obtener todas las canchas de la misma empresa para mapear relaciones padre-hijo
    const { data: companyPitches } = await supabase
      .from('pitches')
      .select('id, custom_pricing')
      .eq('company_id', targetPitch.company_id);

    return getConflictingPitchIds(pitchId, companyPitches || [targetPitch]);
  } catch (err) {
    console.error('[fetchConflictingPitchIds] error:', err);
    return [pitchId];
  }
}

/**
 * Obtiene texto descriptivo legible de las canchas que forman una combinada
 */
export function getCombinedPitchNames(pitch: any, allPitches: any[]): string {
  const linkedIds = getLinkedPitchIds(pitch);
  if (linkedIds.length === 0) return '';
  const names = linkedIds
    .map(id => allPitches.find(p => p.id === id)?.name)
    .filter(Boolean);
  return names.join(' + ');
}
