'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, Loader2, MapPin, Crosshair, X } from 'lucide-react';

interface SuggestionItem {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface LocationPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number, address?: string) => void;
  initialAddress?: string;
}

function buildPhotonAddress(props: any): string {
  const parts: string[] = [];
  if (props.name) parts.push(props.name);
  if (props.street) parts.push(props.street);
  if (props.locality) parts.push(props.locality);
  if (props.district) parts.push(props.district);
  if (props.city || props.county) parts.push(props.city || props.county);
  if (props.state) parts.push(props.state);
  return parts.filter(Boolean).join(', ');
}

export default function LocationPicker({ lat, lng, onChange, initialAddress = '' }: LocationPickerProps) {
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<any>(null);
  const pinIconRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const debounceRef = useRef<any>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState(initialAddress);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedAddress, setSelectedAddress] = useState(initialAddress);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
          try { map.remove(); } catch {}
          return;
        }

        mapRef.current = map;

        L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
          { attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 20 }
        ).addTo(map);

        if (lat && lng) {
          markerRef.current = L.marker([lat, lng], { icon: pinIconRef.current, draggable: true }).addTo(map);
          markerRef.current.bindPopup('<b>⚽ Cancha aquí</b><br/>Arrastra para ajustar').openPopup();
          markerRef.current.on('dragend', (e: any) => {
            const pos = e.target.getLatLng();
            onChange(pos.lat, pos.lng);
          });
        }

        map.on('click', (e: any) => {
          const { lat: clickLat, lng: clickLng } = e.latlng;
          onChange(clickLat, clickLng);
          setShowSuggestions(false);

          if (markerRef.current) {
            markerRef.current.setLatLng([clickLat, clickLng]);
          } else {
            markerRef.current = L.marker([clickLat, clickLng], { icon: pinIconRef.current, draggable: true }).addTo(map);
            markerRef.current.bindPopup('<b>⚽ Cancha aquí</b><br/>Arrastra para ajustar').openPopup();
            markerRef.current.on('dragend', (ev: any) => {
              const pos = ev.target.getLatLng();
              onChange(pos.lat, pos.lng);
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

        if (mapContainerRef.current && typeof window !== 'undefined' && 'ResizeObserver' in window) {
          resizeObserver = new ResizeObserver(() => {
            if (isCancelled || !mapRef.current) return;
            try {
              const m = mapRef.current;
              if (m && (m as any)._mapPane && (m as any)._loaded && mapContainerRef.current?.offsetParent !== null) {
                m.invalidateSize({ debounceMoveend: true });
              }
            } catch {}
          });
          if (mapContainerRef.current) resizeObserver.observe(mapContainerRef.current);
        }
      } catch (err) {
        console.error('Error inicializando mapa:', err);
      }
    };

    initMap();

    return () => {
      isCancelled = true;
      if (initTimer) clearTimeout(initTimer);
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch {}
        mapRef.current = null;
        markerRef.current = null;
      }
      if (mapContainerRef.current && (mapContainerRef.current as any)._leaflet_id) {
        delete (mapContainerRef.current as any)._leaflet_id;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !lat || !lng) return;
    const map = mapRef.current;
    if (!(map as any)._loaded || !(map as any)._mapPane) return;

    try {
      if (markerRef.current) {
        const curPos = markerRef.current.getLatLng();
        if (Math.abs(curPos.lat - lat) > 0.0001 || Math.abs(curPos.lng - lng) > 0.0001) {
          markerRef.current.setLatLng([lat, lng]);
          map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: true });
        }
      } else if (pinIconRef.current && LRef.current) {
        const L = LRef.current;
        markerRef.current = L.marker([lat, lng], { icon: pinIconRef.current, draggable: true }).addTo(map);
        markerRef.current.bindPopup('<b>⚽ Cancha aquí</b><br/>Arrastra para ajustar').openPopup();
        markerRef.current.on('dragend', (e: any) => {
          const pos = e.target.getLatLng();
          onChange(pos.lat, pos.lng);
        });
        map.setView([lat, lng], 15, { animate: true });
      }
    } catch {}
  }, [lat, lng]);

  // Fetch suggestions live as user types (debounced 400ms)
  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      // Photon: prioritize Colombia results
      const photonRes = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lang=es&limit=6&bbox=-79.0,-3.0,-66.0,13.0`,
        { signal: AbortSignal.timeout(5000) }
      );
      const photonData = await photonRes.json();

      if (photonData?.features?.length > 0) {
        const items: SuggestionItem[] = photonData.features.map((f: any) => ({
          name: f.properties.name || query,
          address: buildPhotonAddress(f.properties),
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
        }));
        setSuggestions(items);
        setShowSuggestions(true);
        return;
      }

      // Fallback: Nominatim
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
        }));
        setSuggestions(items);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch {
      // Silently ignore network errors during live suggestions
    }
  }, []);

  const handleInputChange = (value: string) => {
    setSearchQuery(value);
    setSearchError('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 400);
  };

  const selectSuggestion = (item: SuggestionItem) => {
    setSearchQuery(item.address);
    setSelectedAddress(item.address);
    setSuggestions([]);
    setShowSuggestions(false);
    setSearchError('');

    onChange(item.lat, item.lng, item.address);

    if (mapRef.current && (mapRef.current as any)._loaded && (mapRef.current as any)._mapPane) {
      try {
        mapRef.current.setView([item.lat, item.lng], 17, { animate: true });

        if (markerRef.current) {
          markerRef.current.setLatLng([item.lat, item.lng]);
          markerRef.current.bindPopup(`<b>⚽ ${item.name}</b><br/>${item.address}`).openPopup();
        } else if (pinIconRef.current && LRef.current) {
          const L = LRef.current;
          markerRef.current = L.marker([item.lat, item.lng], { icon: pinIconRef.current, draggable: true }).addTo(mapRef.current);
          markerRef.current.bindPopup(`<b>⚽ ${item.name}</b><br/>${item.address}`).openPopup();
          markerRef.current.on('dragend', (ev: any) => {
            const pos = ev.target.getLatLng();
            onChange(pos.lat, pos.lng);
          });
        }
      } catch {}
    }
  };

  // Manual search button / Enter key (also queries Photon)
  const handleSearch = async () => {
    const raw = searchQuery.trim();
    if (!raw) return;
    setSearching(true);
    setSearchError('');
    setSuggestions([]);
    setShowSuggestions(false);

    try {
      // 1. Try Photon first
      const photonRes = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(raw)}&lang=es&limit=5&bbox=-79.0,-3.0,-66.0,13.0`
      );
      const photonData = await photonRes.json();

      if (photonData?.features?.length > 0) {
        const f = photonData.features[0];
        const newLat = f.geometry.coordinates[1];
        const newLng = f.geometry.coordinates[0];
        const addr = buildPhotonAddress(f.properties);
        setSelectedAddress(addr);
        onChange(newLat, newLng, addr);
        moveMapAndPin(newLat, newLng, f.properties.name || raw, addr);
        return;
      }

      // 2. Fallback: Nominatim with Colombia filter
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(raw)}&format=json&limit=3&countrycodes=co&addressdetails=1&accept-language=es`,
        { headers: { 'Accept-Language': 'es' } }
      );
      const nomData = await nomRes.json();

      if (!nomData || nomData.length === 0) {
        setSearchError('No se encontró ese lugar. Intenta con el nombre completo o agrega la ciudad (ej: "Cancha Los Campeones, Pasto").');
        return;
      }

      const result = nomData[0];
      const newLat = parseFloat(result.lat);
      const newLng = parseFloat(result.lon);
      setSelectedAddress(result.display_name);
      onChange(newLat, newLng, result.display_name);
      moveMapAndPin(newLat, newLng, result.name || raw, result.display_name);
    } catch {
      setSearchError('Error al buscar la ubicación. Verifica tu conexión.');
    } finally {
      setSearching(false);
    }
  };

  const moveMapAndPin = (newLat: number, newLng: number, name: string, addr: string) => {
    if (mapRef.current && (mapRef.current as any)._loaded && (mapRef.current as any)._mapPane) {
      try {
        mapRef.current.setView([newLat, newLng], 17, { animate: true });
        if (markerRef.current) {
          markerRef.current.setLatLng([newLat, newLng]);
          markerRef.current.bindPopup(`<b>⚽ ${name}</b><br/>${addr}`).openPopup();
        } else if (pinIconRef.current && LRef.current) {
          const L = LRef.current;
          markerRef.current = L.marker([newLat, newLng], { icon: pinIconRef.current, draggable: true }).addTo(mapRef.current);
          markerRef.current.bindPopup(`<b>⚽ ${name}</b><br/>${addr}`).openPopup();
          markerRef.current.on('dragend', (ev: any) => {
            const pos = ev.target.getLatLng();
            onChange(pos.lat, pos.lng);
          });
        }
      } catch {}
    }
  };

  const centerOnMarker = () => {
    if (mapRef.current && lat && lng && (mapRef.current as any)._loaded && (mapRef.current as any)._mapPane) {
      try { mapRef.current.setView([lat, lng], 16, { animate: true }); } catch {}
    }
  };

  return (
    <div className="space-y-3 w-full">
      {/* Search bar + suggestions */}
      <div className="relative" ref={suggestionsRef}>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleSearch(); }
                if (e.key === 'Escape') { setShowSuggestions(false); }
              }}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Buscar por nombre de cancha, complejo o dirección (ej: Cancha Los Andes, Pasto)..."
              className="w-full pl-9 pr-8 py-2.5 text-xs sm:text-sm border border-border rounded-xl bg-background outline-none focus:border-emerald-500 transition-colors shadow-xs"
              autoComplete="off"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setSuggestions([]); setShowSuggestions(false); setSearchError(''); }}
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

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-[2000] mt-1 bg-background border border-border rounded-xl shadow-xl overflow-hidden">
            {suggestions.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); selectSuggestion(item); }}
                className="w-full text-left px-4 py-3 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors border-b border-border/50 last:border-0 group"
              >
                <div className="flex items-start gap-2.5">
                  <MapPin size={13} className="mt-0.5 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-400 truncate">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">{item.address}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {searchError && (
        <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs rounded-xl">
          {searchError}
        </div>
      )}

      {/* Map container */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-border shadow-md bg-secondary/20" style={{ height: '340px', minHeight: '300px' }}>
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Info badge */}
        <div className="absolute top-3 left-3 z-[1000] bg-background/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-[11px] font-semibold text-foreground border border-border/80 shadow-md flex items-center gap-1.5 pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Haz clic en el mapa o arrastra el pin para ubicar la cancha</span>
        </div>

        {/* Center button */}
        {lat && lng && (
          <button
            type="button"
            onClick={centerOnMarker}
            title="Centrar en el pin"
            className="absolute bottom-3 right-3 z-[1000] p-2 bg-background/90 hover:bg-background text-foreground rounded-xl border border-border shadow-md transition-all active:scale-95"
          >
            <Crosshair size={16} className="text-emerald-600" />
          </button>
        )}
      </div>

      {selectedAddress && (
        <p className="text-[11px] text-muted-foreground truncate px-1">
          📍 <strong className="text-foreground">Dirección detectada:</strong> {selectedAddress}
        </p>
      )}
    </div>
  );
}
