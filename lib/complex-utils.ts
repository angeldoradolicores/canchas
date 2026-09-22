import { Pitch } from '@/lib/types';
import { ComplexData } from '@/components/ui/ComplexCard';

// Coordenadas céntricas de Pasto por defecto si el complejo no tiene
const PASTO_CENTER = { lat: 1.2136, lng: -77.2811 };

export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}

export function groupPitchesByComplex(
  pitches: Pitch[],
  userCoords?: { lat: number; lng: number } | null,
  bookingCounts?: Record<string, number>
): ComplexData[] {
  if (!pitches || pitches.length === 0) return [];

  const map = new Map<string, {
    id: string;
    name: string;
    address?: string | null;
    zone?: string | null;
    city?: string | null;
    lat?: number;
    lng?: number;
    pitches: Pitch[];
  }>();

  for (const pitch of pitches) {
    const pAny = pitch as any;
    const comp = pAny.companies || pAny.company;
    const groupKey = comp?.id || pitch.company_id || pitch.id;
    const compName = (comp?.name || pitch.name || 'Complejo Deportivo').trim();

    if (!map.has(groupKey)) {
      map.set(groupKey, {
        id: groupKey,
        name: compName,
        address: comp?.address || pAny.address || null,
        zone: comp?.zone || pAny.zone || null,
        city: (comp as any)?.city || pitch.city || 'Pasto',
        department: (comp as any)?.department || (pitch as any).department || 'Nariño',
        lat: comp?.lat ?? pitch.lat,
        lng: comp?.lng ?? pitch.lng,
        pitches: [],
      });
    }

    map.get(groupKey)!.pitches.push(pitch);
  }

  const complexes: ComplexData[] = [];

  for (const group of map.values()) {
    const siblingPitches = group.pitches;

    // Obtener las mejores coordenadas disponibles
    let resolvedLat = group.lat;
    let resolvedLng = group.lng;

    if (!resolvedLat || !resolvedLng) {
      const pitchWithCoords = siblingPitches.find(p => p.lat && p.lng);
      if (pitchWithCoords) {
        resolvedLat = pitchWithCoords.lat;
        resolvedLng = pitchWithCoords.lng;
      } else {
        // Asignar cercanía en Pasto con pequeña dispersión determinística
        const hash = group.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        resolvedLat = PASTO_CENTER.lat + ((hash % 20) - 10) * 0.0015;
        resolvedLng = PASTO_CENTER.lng + (((hash * 3) % 20) - 10) * 0.0015;
      }
    }

    // Calcular precios mínimos y máximos
    let minPrice = Infinity;
    let maxPrice = 0;
    const formatsSet = new Set<string>();
    const surfacesSet = new Set<string>();
    const amenitiesSet = new Set<string>();
    const allMedia: string[] = [];

    let bestImage = '';
    let totalBookings = 0;

    for (const p of siblingPitches) {
      const pAny = p as any;
      const price = Number(pAny.price_per_hour || pAny.price || 0);
      if (price > 0) {
        if (price < minPrice) minPrice = price;
        if (price > maxPrice) maxPrice = price;
      }

      // Conteo de reservas del complejo
      if (bookingCounts && bookingCounts[p.id]) {
        totalBookings += bookingCounts[p.id];
      }

      // Formatos
      if (Array.isArray(pAny.supported_types) && pAny.supported_types.length > 0) {
        pAny.supported_types.forEach((t: string) => t && formatsSet.add(t));
      } else if (p.type) {
        formatsSet.add(p.type);
      }

      // Superficies
      if (pAny.surface) surfacesSet.add(pAny.surface);
      if (pAny.custom_surface) surfacesSet.add(pAny.custom_surface);

      // Amenidades
      if (Array.isArray(pAny.amenities)) {
        pAny.amenities.forEach((a: string) => a && amenitiesSet.add(a));
      } else if (typeof pAny.amenities === 'string') {
        pAny.amenities.split('·').forEach((a: string) => {
          const trimmed = a.trim();
          if (trimmed) amenitiesSet.add(trimmed);
        });
      }

      // Medios / Fotos
      const pMedia = Array.isArray(pAny.media_urls) && pAny.media_urls.length > 0
        ? pAny.media_urls
        : (pAny.image_url || pAny.image ? [pAny.image_url || pAny.image] : []);

      pMedia.forEach((m: string) => {
        if (m && !allMedia.includes(m)) allMedia.push(m);
      });

      if (!bestImage && pMedia.length > 0) {
        bestImage = pMedia[0];
      }
    }

    if (minPrice === Infinity) minPrice = 60000;
    if (maxPrice === 0) maxPrice = minPrice;
    if (!bestImage) {
      bestImage = 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&auto=format&fit=crop&q=60';
    }

    // Calcular distancia GPS si se proveyeron coordenadas del usuario
    let distanceKm: number | undefined;
    let formattedDistance: string | undefined;

    if (userCoords && resolvedLat && resolvedLng) {
      distanceKm = calculateDistanceKm(userCoords.lat, userCoords.lng, resolvedLat, resolvedLng);
      formattedDistance = formatDistance(distanceKm);
    }

    complexes.push({
      id: group.id,
      name: group.name,
      address: group.address,
      zone: group.zone,
      city: group.city || 'Pasto',
      department: (group as any).department || 'Nariño',
      lat: resolvedLat,
      lng: resolvedLng,
      rating: 5.0,
      image: bestImage,
      mediaUrls: allMedia,
      minPrice,
      maxPrice,
      pitchesCount: siblingPitches.length,
      pitches: siblingPitches,
      formats: Array.from(formatsSet),
      surfaces: Array.from(surfacesSet),
      amenities: Array.from(amenitiesSet),
      featuredPitch: siblingPitches[0],
      distanceKm,
      formattedDistance,
      totalBookings,
    });
  }

  return complexes;
}
