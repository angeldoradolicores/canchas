export { cleanAddress } from './complex-utils';

export interface LocationDetails {
  lat: number;
  lng: number;
  address?: string; // Dirección puntual o de calle
  neighborhood?: string; // Barrio extraído
  city?: string;
  department?: string;
  placeId?: string; // Google Maps place_id
  placeName?: string; // Nombre del lugar en Google Maps (ej: "Los Campeones")
  fullAddress?: string; // Dirección combinada legible (ej: "Calle 18 # 24-10, Barrio Pandiaco")
  mapsUrl?: string; // URL directa al lugar en Google Maps
}

/**
 * Parsea los componentes de dirección de Google Maps para extraer barrio, dirección puntual, ciudad y departamento.
 */
export function parseGoogleAddressComponents(
  components: any[] = [],
  formattedAddress = '',
  placeName = ''
): {
  neighborhood: string;
  address: string;
  city: string;
  department: string;
  fullAddress: string;
} {
  let route = '';
  let streetNumber = '';
  let neighborhood = '';
  let city = '';
  let department = '';

  for (const c of components) {
    const types: string[] = c.types || [];
    if (types.includes('route')) {
      route = c.long_name || c.short_name || '';
    } else if (types.includes('street_number')) {
      streetNumber = c.long_name || c.short_name || '';
    } else if (
      types.includes('neighborhood') ||
      types.includes('sublocality_level_1') ||
      types.includes('sublocality')
    ) {
      if (!neighborhood) {
        neighborhood = c.long_name || c.short_name || '';
      }
    } else if (types.includes('locality')) {
      city = c.long_name || c.short_name || '';
    } else if (types.includes('administrative_area_level_2') && !city) {
      city = c.long_name || c.short_name || '';
    } else if (types.includes('administrative_area_level_1')) {
      department = c.long_name || c.short_name || '';
    }
  }

  // Armar dirección puntual de la calle
  let streetAddress = '';
  if (route) {
    streetAddress = streetNumber ? `${route} #${streetNumber}` : route;
  } else if (formattedAddress) {
    // Si no vino componente route, extraer la primera sección antes de la coma
    const parts = formattedAddress.split(',');
    streetAddress = parts[0]?.trim() || '';
  }

  // Armar dirección completa con barrio
  let fullAddress = streetAddress;
  if (neighborhood && streetAddress) {
    if (!streetAddress.toLowerCase().includes(neighborhood.toLowerCase())) {
      fullAddress = `${streetAddress}, Barrio ${neighborhood}`;
    }
  } else if (neighborhood && !streetAddress) {
    fullAddress = `Barrio ${neighborhood}`;
  } else if (formattedAddress) {
    fullAddress = formattedAddress;
  }

  return {
    neighborhood: neighborhood.trim(),
    address: streetAddress.trim(),
    city: city.trim() || 'Pasto',
    department: department.trim() || 'Nariño',
    fullAddress: fullAddress.trim(),
  };
}

/**
 * Retorna la URL directa para abrir el lugar en Google Maps (app móvil o web).
 * Si hay place_id, abre exactamente ese lugar con su ficha técnica, nombre y pin preciso.
 */
export function buildGoogleMapsUrl(opts: {
  placeId?: string | null;
  placeName?: string | null;
  address?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
}): string {
  const { placeId, placeName, address, city, lat, lng } = opts;

  if (placeId) {
    // URL oficial de Google Maps con query_place_id para garantizar el lugar exacto registrado
    const queryParam = placeName || address || 'Cancha';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryParam)}&query_place_id=${placeId}`;
  }

  if (placeName && (address || city)) {
    const q = `${placeName}, ${address || ''}, ${city || 'Pasto'}, Colombia`.replace(/\s*,\s*,/g, ',');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q.trim())}`;
  }

  if (lat && lng) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address + (city ? `, ${city}` : ''))}`;
  }

  return 'https://maps.google.com';
}

/**
 * Extrae toda la información de ubicación de una cancha (tanto junta como separada)
 * de forma consistente a lo largo de toda la aplicación.
 */
export function getPitchLocation(pitch: any): {
  neighborhood: string;
  barrio: string;
  address: string;
  street: string;
  fullAddress: string;
  combinedAddress: string;
  city: string;
  department: string;
  placeId: string | null;
  placeName: string | null;
  googleMapsUrl: string;
  lat: number | null;
  lng: number | null;
} {
  if (!pitch) {
    return {
      neighborhood: '',
      barrio: '',
      address: '',
      street: '',
      fullAddress: '',
      combinedAddress: '',
      city: 'Pasto',
      department: 'Nariño',
      placeId: null,
      placeName: null,
      googleMapsUrl: '',
      lat: null,
      lng: null,
    };
  }

  const cp = pitch.custom_pricing || {};
  const lat = typeof pitch.lat === 'number' ? pitch.lat : null;
  const lng = typeof pitch.lng === 'number' ? pitch.lng : null;

  const placeId = cp.place_id || pitch.place_id || null;
  const placeName = cp.place_name || pitch.place_name || pitch.companies?.name || pitch.company?.name || pitch.name || null;

  const neighborhood =
    cp.neighborhood ||
    cp.barrio ||
    pitch.neighborhood ||
    pitch.barrio ||
    pitch.companies?.zone ||
    pitch.company?.zone ||
    '';

  const address =
    pitch.address ||
    cp.street ||
    cp.address ||
    pitch.companies?.address ||
    pitch.company?.address ||
    '';

  const city = pitch.city || cp.city || pitch.companies?.city || 'Pasto';
  const department = pitch.department || cp.department || 'Nariño';

  // Combinar dirección y barrio si ambos existen
  let combinedAddress = address;
  if (neighborhood && address) {
    if (!address.toLowerCase().includes(neighborhood.toLowerCase())) {
      combinedAddress = `${address}, Barrio ${neighborhood}`;
    }
  } else if (neighborhood && !address) {
    combinedAddress = `Barrio ${neighborhood}`;
  } else if (!combinedAddress) {
    combinedAddress = cp.full_address || `${city}, Colombia`;
  }

  const googleMapsUrl = buildGoogleMapsUrl({
    placeId,
    placeName,
    address: combinedAddress,
    city,
    lat,
    lng,
  });

  return {
    neighborhood: neighborhood.trim(),
    barrio: neighborhood.trim(),
    address: address.trim(),
    street: (cp.street || address).trim(),
    fullAddress: combinedAddress.trim(),
    combinedAddress: combinedAddress.trim(),
    city,
    department,
    placeId,
    placeName,
    googleMapsUrl,
    lat,
    lng,
  };
}
