'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, Loader2, MapPin, Crosshair, X, ExternalLink, CheckCircle2 } from 'lucide-react';
import {
  LocationDetails,
  parseGoogleAddressComponents,
  buildGoogleMapsUrl,
} from '@/lib/pitch-location';

interface SuggestionItem {
  name: string;
  address: string;
  lat: number;
  lng: number;
  place_id?: string;
  source?: 'google' | 'osm';
}

export interface LocationPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number, address?: string, details?: LocationDetails) => void;
  initialAddress?: string;
  initialNeighborhood?: string;
  initialPlaceId?: string;
  initialPlaceName?: string;
}

export default function LocationPicker({
  lat,
  lng,
  onChange,
  initialAddress = '',
  initialNeighborhood = '',
  initialPlaceId = '',
  initialPlaceName = '',
}: LocationPickerProps) {
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<any>(null);
  const pinIconRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const debounceRef = useRef<any>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const [googleLoaded, setGoogleLoaded] = useState(false);

  const [searchQuery, setSearchQuery] = useState(initialAddress);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedAddress, setSelectedAddress] = useState(initialAddress);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Estado para el lugar exacto detectado en Google Maps
  const [linkedPlace, setLinkedPlace] = useState<{
    placeId: string;
    placeName: string;
    neighborhood?: string;
    mapsUrl?: string;
  } | null>(
    initialPlaceId
      ? {
          placeId: initialPlaceId,
          placeName: initialPlaceName || initialAddress,
          neighborhood: initialNeighborhood,
          mapsUrl: buildGoogleMapsUrl({
            placeId: initialPlaceId,
            placeName: initialPlaceName,
            address: initialAddress,
            lat,
            lng,
          }),
        }
      : null
  );

  // Sincronizar dirección inicial si cambia externamente
  useEffect(() => {
    if (initialAddress && initialAddress !== selectedAddress) {
      setSearchQuery(initialAddress);
      setSelectedAddress(initialAddress);
    }
  }, [initialAddress]);

  // Cargar Google Maps Places API si hay API key configurada
  useEffect(() => {
    if (!googleApiKey || typeof window === 'undefined') return;
    if ((window as any).google?.maps?.places) {
      setGoogleLoaded(true);
      return;
    }
    const existing = document.getElementById('google-maps-places-script');
    if (!existing) {
      const script = document.createElement('script');
      script.id = 'google-maps-places-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${googleApiKey}&libraries=places&language=es&region=CO`;
      script.async = true;
      script.onload = () => setGoogleLoaded(true);
      document.head.appendChild(script);
    } else {
      existing.addEventListener('load', () => setGoogleLoaded(true));
    }
  }, [googleApiKey]);

  // Cerrar sugerencias al hacer clic por fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /**
   * Reverse geocoding completo: lat/lng → dirección puntual, barrio y lugar de Google Maps
   */
  const reverseGeocodeDetails = async (
    targetLat: number,
    targetLng: number
  ): Promise<{ address: string; details: LocationDetails } | null> => {
    // 1. Google Maps Geocoder (máxima precisión en Colombia)
    if (typeof window !== 'undefined' && (window as any).google?.maps?.Geocoder) {
      try {
        const geocoder = new (window as any).google.maps.Geocoder();
        const res = await new Promise<any>((resolve) => {
          geocoder.geocode({ location: { lat: targetLat, lng: targetLng } }, (results: any[], status: any) => {
            if (status === 'OK' && results && results.length > 0) {
              const bestMatch =
                results.find(
                  (r: any) =>
                    r.types?.includes('establishment') ||
                    r.types?.includes('premise') ||
                    r.types?.includes('street_address') ||
                    r.types?.includes('route')
                ) || results[0];
              resolve(bestMatch);
            } else {
              resolve(null);
            }
          });
        });

        if (res) {
          const parsed = parseGoogleAddressComponents(res.address_components, res.formatted_address);
          const pId = res.place_id || undefined;
          const directMapsUrl = buildGoogleMapsUrl({
            placeId: pId,
            placeName: parsed.fullAddress,
            address: parsed.fullAddress,
            city: parsed.city,
            lat: targetLat,
            lng: targetLng,
          });

          return {
            address: parsed.fullAddress,
            details: {
              lat: targetLat,
              lng: targetLng,
              address: parsed.address,
              neighborhood: parsed.neighborhood,
              city: parsed.city,
              department: parsed.department,
              placeId: pId,
              fullAddress: parsed.fullAddress,
              mapsUrl: directMapsUrl,
            },
          };
        }
      } catch (err) {
        console.warn('Google reverse geocode error:', err);
      }
    }

    // 2. Nominatim fallback con barrio y calle en Colombia
    try {
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${targetLat}&lon=${targetLng}&format=json&accept-language=es&addressdetails=1`,
        { headers: { 'Accept-Language': 'es' }, signal: AbortSignal.timeout(4000) }
      );
      const nomData = await nomRes.json();
      if (nomData?.address) {
        const a = nomData.address;
        const street = a.road ? (a.house_number ? `${a.road} #${a.house_number}` : a.road) : '';
        const neighborhood = a.neighbourhood || a.suburb || a.city_district || '';
        const city = a.city || a.town || a.village || 'Pasto';
        const department = a.state || 'Nariño';

        let full = street;
        if (neighborhood && street) full = `${street}, Barrio ${neighborhood}`;
        else if (neighborhood) full = `Barrio ${neighborhood}`;
        else if (nomData.display_name) full = nomData.display_name.split(',').slice(0, 3).join(',');

        const directMapsUrl = buildGoogleMapsUrl({
          address: full,
          city,
          lat: targetLat,
          lng: targetLng,
        });

        return {
          address: full,
          details: {
            lat: targetLat,
            lng: targetLng,
            address: street,
            neighborhood,
            city,
            department,
            fullAddress: full,
            mapsUrl: directMapsUrl,
          },
        };
      }
    } catch {}

    return null;
  };

  useEffect(() => {
    let isCancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let initTimer: any = null;

    const initMap = async () => {
      try {
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');

        if (isCancelled || !mapContainerRef.current) return;
        LRef.current = L;

        if (mapRef.current) return;
        if ((mapContainerRef.current as any)._leaflet_id) {
          delete (mapContainerRef.current as any)._leaflet_id;
        }

        const currentLat = lat || 1.2136;
        const currentLng = lng || -77.2811;
        const defaultCenter: [number, number] = [currentLat, currentLng];

        delete (L.Icon.Default.prototype as any)._getIconUrl;

        pinIconRef.current = L.divIcon({
          className: 'custom-pitch-pin',
          html: `
            <div style="
              position: relative;
              width: 38px; height: 38px;
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              border: 3px solid #ffffff;
              border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg);
              box-shadow: 0 6px 18px rgba(5, 150, 105, 0.6);
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: grab;
            ">
              <div style="
                transform: rotate(45deg);
                width: 14px; height: 14px;
                background: #ffffff;
                border-radius: 50%;
              "></div>
            </div>
          `,
          iconSize: [38, 38],
          iconAnchor: [19, 38],
          popupAnchor: [0, -40],
        });

        if (isCancelled || !mapContainerRef.current) return;

        const map = L.map(mapContainerRef.current, {
          center: defaultCenter,
          zoom: 15,
          zoomControl: true,
        });

        if (isCancelled) {
          try {
            map.remove();
          } catch {}
          return;
        }

        mapRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 20,
        }).addTo(map);

        if (lat && lng) {
          markerRef.current = L.marker([lat, lng], { icon: pinIconRef.current, draggable: true }).addTo(map);
          markerRef.current.bindPopup('<b>⚽ Cancha aquí</b><br/>Arrastra para ajustar').openPopup();

          markerRef.current.on('dragend', async (e: any) => {
            const pos = e.target.getLatLng();
            const geoRes = await reverseGeocodeDetails(pos.lat, pos.lng);
            if (geoRes) {
              onChange(pos.lat, pos.lng, geoRes.address, geoRes.details);
              setSelectedAddress(geoRes.address);
              setSearchQuery(geoRes.address);
              if (geoRes.details.placeId) {
                setLinkedPlace({
                  placeId: geoRes.details.placeId,
                  placeName: geoRes.details.placeName || geoRes.address,
                  neighborhood: geoRes.details.neighborhood,
                  mapsUrl: geoRes.details.mapsUrl,
                });
              }
            } else {
              onChange(pos.lat, pos.lng);
            }
          });
        }

        map.on('click', async (e: any) => {
          const { lat: clickLat, lng: clickLng } = e.latlng;
          setShowSuggestions(false);

          const geoRes = await reverseGeocodeDetails(clickLat, clickLng);
          const addr = geoRes?.address || undefined;

          onChange(clickLat, clickLng, addr, geoRes?.details);
          if (addr) {
            setSelectedAddress(addr);
            setSearchQuery(addr);
            if (geoRes?.details?.placeId) {
              setLinkedPlace({
                placeId: geoRes.details.placeId,
                placeName: geoRes.details.placeName || addr,
                neighborhood: geoRes.details.neighborhood,
                mapsUrl: geoRes.details.mapsUrl,
              });
            }
          }

          const popupContent = `<b>⚽ Cancha aquí</b><br/>${addr || 'Arrastra para ajustar'}`;

          if (markerRef.current) {
            markerRef.current.setLatLng([clickLat, clickLng]);
            markerRef.current.bindPopup(popupContent).openPopup();
          } else {
            markerRef.current = L.marker([clickLat, clickLng], {
              icon: pinIconRef.current,
              draggable: true,
            }).addTo(map);
            markerRef.current.bindPopup(popupContent).openPopup();

            markerRef.current.on('dragend', async (ev: any) => {
              const pos = ev.target.getLatLng();
              const dragRes = await reverseGeocodeDetails(pos.lat, pos.lng);
              if (dragRes) {
                onChange(pos.lat, pos.lng, dragRes.address, dragRes.details);
                setSelectedAddress(dragRes.address);
                setSearchQuery(dragRes.address);
                if (dragRes.details.placeId) {
                  setLinkedPlace({
                    placeId: dragRes.details.placeId,
                    placeName: dragRes.details.placeName || dragRes.address,
                    neighborhood: dragRes.details.neighborhood,
                    mapsUrl: dragRes.details.mapsUrl,
                  });
                }
              } else {
                onChange(pos.lat, pos.lng);
              }
            });
          }
        });

        initTimer = setTimeout(() => {
          if (isCancelled || !mapRef.current) return;
          try {
            const m = mapRef.current;
            if (m && (m as any)._mapPane && (m as any)._loaded && mapContainerRef.current?.offsetParent !== null) {
              m.invalidateSize();
            }
          } catch {}
        }, 300);

        if (mapContainerRef.current && typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => {
            if (mapRef.current && (mapRef.current as any)._loaded) {
              try {
                mapRef.current.invalidateSize();
              } catch {}
            }
          });
          resizeObserver.observe(mapContainerRef.current);
        }
      } catch (err) {
        console.error('Error inicializando mapa Leaflet:', err);
      }
    };

    initMap();

    return () => {
      isCancelled = true;
      if (initTimer) clearTimeout(initTimer);
      if (resizeObserver) resizeObserver.disconnect();
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {}
        mapRef.current = null;
      }
    };
  }, []);

  // Centrar mapa si las coordenadas iniciales cambian
  useEffect(() => {
    if (!mapRef.current || !lat || !lng || !LRef.current) return;
    try {
      const map = mapRef.current;
      if ((map as any)._loaded && (map as any)._mapPane) {
        map.setView([lat, lng], map.getZoom() || 15);
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else if (pinIconRef.current) {
          markerRef.current = LRef.current
            .marker([lat, lng], { icon: pinIconRef.current, draggable: true })
            .addTo(map);
          markerRef.current.bindPopup('<b>⚽ Cancha aquí</b><br/>Arrastra para ajustar');
        }
      }
    } catch {}
  }, [lat, lng]);

  const fallbackOsmSuggestions = async (query: string) => {
    try {
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=co&addressdetails=1&accept-language=es`,
        { headers: { 'Accept-Language': 'es' }, signal: AbortSignal.timeout(5000) }
      );
      const nomData = await nomRes.json();
      if (nomData?.length > 0) {
        const items: SuggestionItem[] = nomData.map((r: any) => ({
          name: r.name || r.display_name.split(',')[0],
          address: r.display_name,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          source: 'osm',
        }));
        setSuggestions(items);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch {}
  };

  const fetchSuggestions = useCallback(
    async (query: string) => {
      if (query.trim().length < 3) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      // Google Places Autocomplete para máxima precisión de canchas y establecimientos
      if (googleApiKey && typeof window !== 'undefined' && (window as any).google?.maps?.places?.AutocompleteService) {
        try {
          const service = new (window as any).google.maps.places.AutocompleteService();
          service.getPlacePredictions(
            {
              input: query,
              componentRestrictions: { country: 'co' },
            },
            (predictions: any[], status: any) => {
              if (
                status === (window as any).google.maps.places.PlacesServiceStatus.OK &&
                predictions &&
                predictions.length > 0
              ) {
                const items: SuggestionItem[] = predictions.slice(0, 6).map((p: any) => ({
                  name: p.structured_formatting?.main_text || p.description,
                  address: p.description,
                  lat: 0,
                  lng: 0,
                  place_id: p.place_id,
                  source: 'google',
                }));
                setSuggestions(items);
                setShowSuggestions(true);
              } else {
                fallbackOsmSuggestions(query);
              }
            }
          );
          return;
        } catch {
          // Fallback a OSM si falla
        }
      }

      await fallbackOsmSuggestions(query);
    },
    [googleApiKey]
  );

  const handleInputChange = (value: string) => {
    setSearchQuery(value);
    setSearchError('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 400);
  };

  /**
   * Cuando el usuario selecciona un resultado (ej: "Los Campeones")
   */
  const selectSuggestion = async (item: SuggestionItem) => {
    let targetLat = item.lat;
    let targetLng = item.lng;
    let targetAddress = item.address;
    let targetNeighborhood = '';
    let targetCity = 'Pasto';
    let targetDepartment = 'Nariño';
    let targetStreet = '';
    let resolvedPlaceName = item.name;

    // Resolver lugar con Google Maps API (PlacesService o Geocoder)
    if (item.place_id && typeof window !== 'undefined') {
      try {
        let placeResult: any = null;

        // Intentar primero con PlacesService (obtiene datos completos del establecimiento)
        if ((window as any).google?.maps?.places?.PlacesService) {
          const dummyNode = document.createElement('div');
          const placesService = new (window as any).google.maps.places.PlacesService(dummyNode);
          placeResult = await new Promise<any>((resolve) => {
            placesService.getDetails(
              {
                placeId: item.place_id,
                fields: ['name', 'geometry', 'formatted_address', 'address_components', 'url'],
              },
              (detail: any, status: any) => {
                if (status === (window as any).google.maps.places.PlacesServiceStatus.OK && detail) {
                  resolve(detail);
                } else {
                  resolve(null);
                }
              }
            );
          });
        }

        // Fallback a Geocoder si PlacesService no resolvió
        if (!placeResult && (window as any).google?.maps?.Geocoder) {
          const geocoder = new (window as any).google.maps.Geocoder();
          placeResult = await new Promise<any>((resolve) => {
            geocoder.geocode({ placeId: item.place_id }, (results: any[], status: any) => {
              if (status === 'OK' && results && results[0]) resolve(results[0]);
              else resolve(null);
            });
          });
        }

        if (placeResult) {
          if (placeResult.geometry?.location) {
            targetLat = placeResult.geometry.location.lat();
            targetLng = placeResult.geometry.location.lng();
          }
          if (placeResult.name) resolvedPlaceName = placeResult.name;

          const parsed = parseGoogleAddressComponents(
            placeResult.address_components,
            placeResult.formatted_address || item.address,
            resolvedPlaceName
          );

          targetNeighborhood = parsed.neighborhood;
          targetStreet = parsed.address;
          targetCity = parsed.city;
          targetDepartment = parsed.department;
          targetAddress = parsed.fullAddress;
        }
      } catch (err) {
        console.warn('Error resolviendo lugar con Google Maps:', err);
      }
    }

    if (!targetLat && !targetLng) return;

    const mapsUrl = buildGoogleMapsUrl({
      placeId: item.place_id,
      placeName: resolvedPlaceName,
      address: targetAddress,
      city: targetCity,
      lat: targetLat,
      lng: targetLng,
    });

    const locationDetails: LocationDetails = {
      lat: targetLat,
      lng: targetLng,
      address: targetStreet || targetAddress,
      neighborhood: targetNeighborhood,
      city: targetCity,
      department: targetDepartment,
      placeId: item.place_id,
      placeName: resolvedPlaceName,
      fullAddress: targetAddress,
      mapsUrl,
    };

    setSearchQuery(targetAddress);
    setSelectedAddress(targetAddress);
    setSuggestions([]);
    setShowSuggestions(false);
    setSearchError('');

    if (item.place_id) {
      setLinkedPlace({
        placeId: item.place_id,
        placeName: resolvedPlaceName,
        neighborhood: targetNeighborhood,
        mapsUrl,
      });
    }

    // Notificar al formulario padre con todos los datos juntos y separados
    onChange(targetLat, targetLng, targetAddress, locationDetails);

    // Mover mapa al punto exacto
    if (mapRef.current && (mapRef.current as any)._loaded && (mapRef.current as any)._mapPane) {
      try {
        mapRef.current.setView([targetLat, targetLng], 17, { animate: true });

        const popupText = `<b>⚽ ${resolvedPlaceName}</b><br/>${targetAddress}<br/><span style="color:#10b981;font-weight:700;font-size:11px;">✓ Vinculado con Google Maps</span>`;

        if (markerRef.current) {
          markerRef.current.setLatLng([targetLat, targetLng]);
          markerRef.current.bindPopup(popupText).openPopup();
        } else if (pinIconRef.current && LRef.current) {
          const L = LRef.current;
          markerRef.current = L.marker([targetLat, targetLng], {
            icon: pinIconRef.current,
            draggable: true,
          }).addTo(mapRef.current);
          markerRef.current.bindPopup(popupText).openPopup();

          markerRef.current.on('dragend', async (ev: any) => {
            const pos = ev.target.getLatLng();
            const dragRes = await reverseGeocodeDetails(pos.lat, pos.lng);
            if (dragRes) {
              onChange(pos.lat, pos.lng, dragRes.address, dragRes.details);
              setSelectedAddress(dragRes.address);
              setSearchQuery(dragRes.address);
              if (dragRes.details.placeId) {
                setLinkedPlace({
                  placeId: dragRes.details.placeId,
                  placeName: dragRes.details.placeName || dragRes.address,
                  neighborhood: dragRes.details.neighborhood,
                  mapsUrl: dragRes.details.mapsUrl,
                });
              }
            } else {
              onChange(pos.lat, pos.lng);
            }
          });
        }
      } catch {}
    }
  };

  const handleSearch = async () => {
    const raw = searchQuery.trim();
    if (!raw) return;
    setSearching(true);
    setSearchError('');
    setSuggestions([]);
    setShowSuggestions(false);

    // 1. Google Maps Geocoder si está activo
    if (googleApiKey && typeof window !== 'undefined' && (window as any).google?.maps?.Geocoder) {
      try {
        const geocoder = new (window as any).google.maps.Geocoder();
        const res = await new Promise<any>((resolve) => {
          geocoder.geocode(
            { address: raw, componentRestrictions: { country: 'co' } },
            (results: any[], status: any) => {
              if (status === 'OK' && results && results[0]) resolve(results[0]);
              else resolve(null);
            }
          );
        });

        if (res && res.geometry?.location) {
          const parsed = parseGoogleAddressComponents(res.address_components, res.formatted_address, raw);
          const targetLat = res.geometry.location.lat();
          const targetLng = res.geometry.location.lng();
          const pId = res.place_id || undefined;
          const mapsUrl = buildGoogleMapsUrl({
            placeId: pId,
            placeName: raw,
            address: parsed.fullAddress,
            city: parsed.city,
            lat: targetLat,
            lng: targetLng,
          });

          const details: LocationDetails = {
            lat: targetLat,
            lng: targetLng,
            address: parsed.address,
            neighborhood: parsed.neighborhood,
            city: parsed.city,
            department: parsed.department,
            placeId: pId,
            placeName: raw,
            fullAddress: parsed.fullAddress,
            mapsUrl,
          };

          setSelectedAddress(parsed.fullAddress);
          setSearchQuery(parsed.fullAddress);
          if (pId) {
            setLinkedPlace({
              placeId: pId,
              placeName: raw,
              neighborhood: parsed.neighborhood,
              mapsUrl,
            });
          }

          onChange(targetLat, targetLng, parsed.fullAddress, details);

          if (mapRef.current && (mapRef.current as any)._loaded) {
            mapRef.current.setView([targetLat, targetLng], 17, { animate: true });
            if (markerRef.current) {
              markerRef.current.setLatLng([targetLat, targetLng]);
              markerRef.current.bindPopup(`<b>⚽ Cancha aquí</b><br/>${parsed.fullAddress}`).openPopup();
            }
          }
          setSearching(false);
          return;
        }
      } catch {}
    }

    // 2. OSM Nominatim fallback
    try {
      const q = raw.toLowerCase().includes('pasto') ? raw : `${raw}, Pasto, Colombia`;
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=co&addressdetails=1&accept-language=es`
      );
      const nomData = await nomRes.json();
      if (nomData && nomData[0]) {
        const item = nomData[0];
        const targetLat = parseFloat(item.lat);
        const targetLng = parseFloat(item.lon);
        const a = item.address || {};
        const street = a.road ? (a.house_number ? `${a.road} #${a.house_number}` : a.road) : '';
        const neighborhood = a.neighbourhood || a.suburb || '';
        const city = a.city || a.town || 'Pasto';
        const department = a.state || 'Nariño';
        let full = street;
        if (neighborhood && street) full = `${street}, Barrio ${neighborhood}`;
        else if (neighborhood) full = `Barrio ${neighborhood}`;
        else full = item.display_name;

        const mapsUrl = buildGoogleMapsUrl({
          address: full,
          city,
          lat: targetLat,
          lng: targetLng,
        });

        const details: LocationDetails = {
          lat: targetLat,
          lng: targetLng,
          address: street,
          neighborhood,
          city,
          department,
          fullAddress: full,
          mapsUrl,
        };

        setSelectedAddress(full);
        setSearchQuery(full);
        onChange(targetLat, targetLng, full, details);

        if (mapRef.current && (mapRef.current as any)._loaded) {
          mapRef.current.setView([targetLat, targetLng], 17, { animate: true });
          if (markerRef.current) {
            markerRef.current.setLatLng([targetLat, targetLng]);
            markerRef.current.bindPopup(`<b>⚽ Cancha aquí</b><br/>${full}`).openPopup();
          }
        }
        setSearching(false);
        return;
      }
    } catch {}

    setSearching(false);
    setSearchError('No encontramos esa dirección. Prueba buscando por barrio o haz clic en el mapa.');
  };

  const centerOnMarker = () => {
    if (mapRef.current && lat && lng) {
      mapRef.current.setView([lat, lng], 17, { animate: true });
      if (markerRef.current) markerRef.current.openPopup();
    }
  };

  return (
    <div className="space-y-3">
      {/* Buscador de ubicación */}
      <div ref={suggestionsRef} className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              placeholder="Escribe el nombre de la cancha o barrio (ej: Los Campeones)..."
              value={searchQuery}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              className="w-full pl-9 pr-9 py-2.5 bg-background border border-border rounded-xl text-xs sm:text-sm font-medium focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none transition-all placeholder:text-muted-foreground/60 shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSuggestions([]);
                  setShowSuggestions(false);
                  setSearchError('');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-60 cursor-pointer active:scale-95 shrink-0"
          >
            {searching ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
            <span>{searching ? 'Buscando...' : 'Buscar'}</span>
          </button>
        </div>

        {/* Indicador de ayuda */}
        <div className="mt-1.5 flex items-center justify-between text-[11px] px-1">
          <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
            <MapPin size={12} className="text-emerald-500 shrink-0" />
            <span>Escribe el nombre del lugar en Google Maps o haz clic en el mapa.</span>
          </span>
          {googleApiKey && googleLoaded && (
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[10px] hidden sm:flex items-center gap-1 shrink-0">
              ✓ Google Maps activo
            </span>
          )}
        </div>

        {/* Dropdown de sugerencias */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-[2000] mt-1 bg-background border border-border rounded-xl shadow-xl overflow-hidden">
            {suggestions.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectSuggestion(item);
                }}
                className="w-full text-left px-4 py-3 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors border-b border-border/50 last:border-0 group cursor-pointer"
              >
                <div className="flex items-start gap-2.5">
                  <MapPin size={13} className="mt-0.5 text-emerald-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-400 truncate">
                        {item.name}
                      </p>
                      {item.source === 'google' && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 font-bold shrink-0">
                          Google Maps
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                      {item.address}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pill de confirmación de vinculación con Google Maps */}
      {linkedPlace && (
        <div className="flex items-center justify-between gap-2 p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 animate-in fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
            <div className="truncate">
              <span className="font-bold">Lugar oficial de Google Maps:</span>{' '}
              <span className="font-semibold text-foreground">{linkedPlace.placeName}</span>
              {linkedPlace.neighborhood && (
                <span className="text-muted-foreground ml-1">({linkedPlace.neighborhood})</span>
              )}
            </div>
          </div>
          {linkedPlace.mapsUrl && (
            <a
              href={linkedPlace.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 underline shrink-0"
            >
              <span>Ver en Maps</span>
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}

      {searchError && (
        <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs rounded-xl">
          {searchError}
        </div>
      )}

      {/* Contenedor del Mapa */}
      <div
        className="relative w-full rounded-2xl overflow-hidden border border-border shadow-md bg-secondary/20"
        style={{ height: '340px', minHeight: '300px' }}
      >
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Badge flotante informativa */}
        <div className="absolute top-3 left-3 z-[1000] bg-background/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-[11px] font-semibold text-foreground border border-border/80 shadow-md flex items-center gap-1.5 pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Haz clic en el mapa o arrastra el pin para ajustar la ubicación</span>
        </div>

        {/* Botón centrar */}
        {lat && lng && (
          <button
            type="button"
            onClick={centerOnMarker}
            title="Centrar en el pin"
            className="absolute bottom-3 right-3 z-[1000] p-2 bg-background/90 hover:bg-background text-foreground rounded-xl border border-border shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <Crosshair size={16} className="text-emerald-600" />
          </button>
        )}
      </div>

      {selectedAddress && (
        <p className="text-[11px] text-muted-foreground truncate px-1">
          📍 <strong className="text-foreground">Ubicación guardada:</strong> {selectedAddress}
        </p>
      )}
    </div>
  );
}
