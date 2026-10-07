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

/**
 * Limpia una dirección para conservar únicamente la nomenclatura vial (calle, carrera, número, etc.),
 * eliminando ciudad (Pasto, Cali, etc.), departamento (Nariño, etc.) y país (Colombia).
 */
export function cleanAddress(addr: string | null | undefined): string {
  if (!addr || typeof addr !== 'string') return '';
  let s = addr.trim();

  // Si es solo ciudad/departamento/país sin nomenclatura vial, retornar vacío
  const isOnlyLocation = /^(pasto|san juan de pasto|cali|ipiales|tumaco|túquerres|tuquerres|bogotá|bogota|medellín|medellin|nariño|narino|valle del cauca|colombia)(\s*[,·\-\/]\s*(pasto|san juan de pasto|cali|ipiales|tumaco|túquerres|tuquerres|bogotá|bogota|medellín|medellin|nariño|narino|valle del cauca|colombia))*$/i;
  if (isOnlyLocation.test(s)) {
    return '';
  }

  // 1. Eliminar ciudad/departamento entre paréntesis ej: (Pasto), (Pasto, Nariño)
  s = s.replace(/\(\s*(san juan de pasto|pasto|cali|colombia|nariño|narino)[^)]*\)/gi, '');
  s = s.replace(/\(\s*\)/g, '');

  // 2. Eliminar país (Colombia, CO)
  s = s.replace(/,?\s*\bcolombia\b/gi, '');
  s = s.replace(/,?\s*\bco\b(?!\w)/gi, '');

  // 3. Eliminar departamentos colombianos
  s = s.replace(/,?\s*\b(nariño|narino|valle del cauca|cundinamarca|antioquia|cauca|putumayo|huila|tolima|caldas|risaralda|quindío|quindio|boyacá|boyaca|santander)\b/gi, '');

  // 4. Eliminar ciudades
  s = s.replace(/,?\s*\b(san juan de pasto|pasto|cali|ipiales|tumaco|túquerres|tuquerres|bogotá|bogota|medellín|medellin|popayán|popayan|barranquilla|bucaramanga|pereira|manizales|ibagué|ibague|cartagena)\b/gi, '');

  // 5. Eliminar códigos postales comunes (5 o 6 dígitos)
  s = s.replace(/,?\s*\b\d{5,6}\b/g, '');

  // 6. Limpiar separadores sobrantes al inicio o al final (, - · /)
  s = s.replace(/^[\s,·\-\/]+|[\s,·\-\/]+$/g, '').trim();

  return s;
}

export function groupPitchesByComplex(
  pitches: Pitch[],
  userCoords?: { lat: number; lng: number } | null,
  bookingCounts?: Record<string, number>
): ComplexData[] {
  if (!pitches || pitches.length === 0) return [];

  const map = new Map<string, {
    id: string;
    baseId: string;
    name: string;
    address?: string | null;
    zone?: string | null;
    city: string;
    department?: string | null;
    lat?: number;
    lng?: number;
    pitches: Pitch[];
  }>();

  for (const pitch of pitches) {
    const pAny = pitch as any;
    const comp = pAny.companies || pAny.company;
    const pitchCity = (pAny.city || pitch.city || comp?.city || 'Pasto').trim();
    const baseId = comp?.id || pitch.company_id || pitch.id;
    const compName = (comp?.name || pitch.name || 'Complejo Deportivo').trim();

    // Priorizar la dirección real de la cancha (incluyendo custom_pricing.address)
    let initialAddress = (pAny.address || pAny.custom_pricing?.address || '').trim();
    if (!initialAddress || (initialAddress.toLowerCase().includes('pasto') && pitchCity.toLowerCase() !== 'pasto')) {
      if (comp?.address && (!comp.address.toLowerCase().includes('pasto') || pitchCity.toLowerCase() === 'pasto')) {
        initialAddress = comp.address;
      } else {
        const dept = (pitch as any).department || pAny.department || (pitchCity.toLowerCase() === 'cali' ? 'Valle del Cauca' : 'Nariño');
        initialAddress = `${pitchCity}, ${dept}`;
      }
    }

    const pLat = Number(pAny.lat ?? comp?.lat);
    const pLng = Number(pAny.lng ?? comp?.lng);
    const normPitchAddr = initialAddress.toLowerCase();

    // Buscar si ya existe una sede para esta empresa en la misma ubicación física
    let targetKey: string | null = null;
    for (const [key, grp] of map.entries()) {
      if (grp.baseId !== baseId) continue;
      if (grp.city.toLowerCase() !== pitchCity.toLowerCase()) continue;

      const normGrpAddr = (grp.address || '').toLowerCase();
      const bothHaveExplicit = normPitchAddr.length > 3 && normGrpAddr.length > 3;

      if (bothHaveExplicit) {
        if (normPitchAddr === normGrpAddr) {
          targetKey = key;
          break;
        } else {
          // Direcciones explícitas distintas -> sedes físicas distintas
          continue;
        }
      }

      // Si no hay direcciones escritas distintas, comparar proximidad de coordenadas (~150m)
      if (pLat && pLng && grp.lat && grp.lng) {
        if (Math.abs(grp.lat - pLat) < 0.0015 && Math.abs(grp.lng - pLng) < 0.0015) {
          targetKey = key;
          break;
        }
      } else {
        targetKey = key;
        break;
      }
    }

    if (!targetKey) {
      targetKey = `${baseId}_${pitchCity.toLowerCase()}_loc_${map.size + 1}`;
      map.set(targetKey, {
        id: targetKey,
        baseId,
        name: compName,
        address: initialAddress,
        zone: comp?.zone || pAny.zone || null,
        city: pitchCity,
        department: comp?.department || (pitch as any).department || pAny.department || (pitchCity.toLowerCase() === 'cali' ? 'Valle del Cauca' : 'Nariño'),
        lat: pLat || comp?.lat,
        lng: pLng || comp?.lng,
        pitches: [],
      });
    }

    map.get(targetKey)!.pitches.push(pitch);
  }

  const complexes: ComplexData[] = [];

  for (const group of map.values()) {
    // Ordenar para que la primera cancha agregada (created_at más antiguo) siempre sea la principal
    const siblingPitches = [...group.pitches].sort((a, b) => {
      const timeA = new Date((a as any).created_at || 0).getTime();
      const timeB = new Date((b as any).created_at || 0).getTime();
      return timeA - timeB;
    });

    const primaryPitch = siblingPitches[0] as any;
    const primaryCity = primaryPitch.city || group.city || 'Pasto';
    const primaryDept = primaryPitch.department || group.department || (primaryCity.toLowerCase() === 'cali' ? 'Valle del Cauca' : 'Nariño');

    let resolvedAddress = primaryPitch.address || group.address;
    if (!resolvedAddress || (resolvedAddress.toLowerCase().includes('pasto') && primaryCity.toLowerCase() !== 'pasto')) {
      resolvedAddress = primaryPitch.address && !primaryPitch.address.toLowerCase().includes('pasto')
        ? primaryPitch.address
        : `${primaryCity}, ${primaryDept}`;
    }

    // Obtener las mejores coordenadas disponibles
    let resolvedLat = group.lat;
    let resolvedLng = group.lng;

    if (!resolvedLat || !resolvedLng) {
      const pitchWithCoords = siblingPitches.find(p => (p as any).lat && (p as any).lng) as any;
      if (pitchWithCoords) {
        resolvedLat = pitchWithCoords.lat;
        resolvedLng = pitchWithCoords.lng;
      } else {
        const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
          'pasto': { lat: 1.2136, lng: -77.2811 },
          'cali': { lat: 3.4516, lng: -76.5320 },
          'ipiales': { lat: 0.8294, lng: -77.6444 },
          'tumaco': { lat: 1.7986, lng: -78.8156 },
          'túquerres': { lat: 1.0872, lng: -77.6186 },
          'tuquerres': { lat: 1.0872, lng: -77.6186 },
          'bogotá': { lat: 4.7110, lng: -74.0721 },
          'bogota': { lat: 4.7110, lng: -74.0721 },
          'medellín': { lat: 6.2442, lng: -75.5812 },
          'medellin': { lat: 6.2442, lng: -75.5812 },
        };
        const center = CITY_CENTERS[primaryCity.toLowerCase()] || PASTO_CENTER;
        const hash = group.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        resolvedLat = center.lat + ((hash % 20) - 10) * 0.0015;
        resolvedLng = center.lng + (((hash * 3) % 20) - 10) * 0.0015;
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
      address: cleanAddress(resolvedAddress),
      zone: group.zone || primaryPitch.zone,
      city: primaryCity,
      department: primaryDept,
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
