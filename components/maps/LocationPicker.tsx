'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, Loader2, MapPin, Navigation, Crosshair } from 'lucide-react';

interface LocationPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number, address?: string) => void;
  initialAddress?: string;
}

export default function LocationPicker({ lat, lng, onChange, initialAddress = '' }: LocationPickerProps) {
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<any>(null);
  const pinIconRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  const [searchQuery, setSearchQuery] = useState(initialAddress);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedAddress, setSelectedAddress] = useState(initialAddress);

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

        // Coordenadas por defecto: Pasto, Nariño (1.2136, -77.2811)
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

        L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
          {
            attribution: '© OpenStreetMap © CARTO',
            subdomains: 'abcd',
            maxZoom: 20,
          }
        ).addTo(map);

        // Si ya hay coordenadas válidas, ubicar el marcador
        if (lat && lng) {
          markerRef.current = L.marker([lat, lng], { icon: pinIconRef.current, draggable: true }).addTo(map);
          markerRef.current.bindPopup('<b>⚽ Cancha aquí</b><br/>Arrastra para ajustar').openPopup();
          markerRef.current.on('dragend', (e: any) => {
            const pos = e.target.getLatLng();
            onChange(pos.lat, pos.lng);
          });
        }

        // Al hacer clic en cualquier punto del mapa, colocar o mover el marcador
        map.on('click', (e: any) => {
          const { lat: clickLat, lng: clickLng } = e.latlng;
          onChange(clickLat, clickLng);

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

        // Asegurar redibujado de tiles al cargar solo si el mapa está activo y con contenedor
        initTimer = setTimeout(() => {
          if (isCancelled || !mapRef.current) return;
          try {
            const m = mapRef.current;
            if (m && (m as any)._mapPane && (m as any)._loaded && mapContainerRef.current?.offsetParent !== null) {
              m.invalidateSize();
            }
          } catch {}
        }, 300);

        // Observador de cambio de tamaño con validación defensiva de _mapPane
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
          if (mapContainerRef.current) {
            resizeObserver.observe(mapContainerRef.current);
          }
        }
      } catch (err) {
        console.error('Error inicializando mapa:', err);
      }
    };

    initMap();

    return () => {
      isCancelled = true;
      if (initTimer) clearTimeout(initTimer);
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {}
        mapRef.current = null;
        markerRef.current = null;
      }
      if (mapContainerRef.current && (mapContainerRef.current as any)._leaflet_id) {
        delete (mapContainerRef.current as any)._leaflet_id;
      }
    };
  }, []);

  // Escuchar actualizaciones externas de lat/lng (ej: GPS del teléfono o carga inicial)
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

  const handleSearch = async () => {
    const raw = searchQuery.trim();
    if (!raw) return;
    setSearching(true);
    setSearchError('');

    try {
      // Armar query priorizando Pasto, Nariño
      const hasCity = raw.toLowerCase().includes('pasto');
      const finalQuery = hasCity ? raw : `${raw}, Pasto, Nariño, Colombia`;
      
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(finalQuery)}&format=json&limit=3&accept-language=es`,
        { headers: { 'Accept-Language': 'es' } }
      );
      let data = await res.json();

      // Fallback si no encontró con sufijo estricto
      if ((!data || data.length === 0) && !hasCity) {
        const fallbackRes = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(raw + ', Colombia')}&format=json&limit=1&accept-language=es`
        );
        data = await fallbackRes.json();
      }

      if (!data || data.length === 0) {
        setSearchError('No se encontró esa dirección. Prueba con un barrio o punto de referencia en Pasto.');
        return;
      }

      const result = data[0];
      const newLat = parseFloat(result.lat);
      const newLng = parseFloat(result.lon);
      const displayName = result.display_name;

      setSelectedAddress(displayName);
      onChange(newLat, newLng, displayName);

      // Mover mapa y marcador
      if (mapRef.current && (mapRef.current as any)._loaded && (mapRef.current as any)._mapPane) {
        try {
          mapRef.current.setView([newLat, newLng], 16, { animate: true });

          if (markerRef.current) {
            markerRef.current.setLatLng([newLat, newLng]);
            markerRef.current.openPopup();
          } else if (pinIconRef.current && LRef.current) {
            const L = LRef.current;
            markerRef.current = L.marker([newLat, newLng], { icon: pinIconRef.current, draggable: true }).addTo(mapRef.current);
            markerRef.current.bindPopup('<b>⚽ Cancha aquí</b><br/>Arrastra para ajustar').openPopup();
            markerRef.current.on('dragend', (ev: any) => {
              const pos = ev.target.getLatLng();
              onChange(pos.lat, pos.lng);
            });
          }
        } catch {}
      }
    } catch {
      setSearchError('Error al buscar la ubicación. Verifica tu conexión.');
    } finally {
      setSearching(false);
    }
  };

  const centerOnMarker = () => {
    if (mapRef.current && lat && lng && (mapRef.current as any)._loaded && (mapRef.current as any)._mapPane) {
      try {
        mapRef.current.setView([lat, lng], 16, { animate: true });
      } catch {}
    }
  };

  return (
    <div className="space-y-3 w-full">
      {/* Barra de búsqueda de dirección */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Buscar barrio, calle o sitio en Pasto (ej: Maridiaz, Pandiaco)..."
            className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm border border-border rounded-xl bg-background outline-none focus:border-emerald-500 transition-colors shadow-xs"
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-60 cursor-pointer active:scale-95"
        >
          {searching ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
          <span>{searching ? 'Buscando...' : 'Buscar'}</span>
        </button>
      </div>

      {searchError && (
        <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs rounded-xl">
          {searchError}
        </div>
      )}

      {/* Contenedor del Mapa */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-border shadow-md bg-secondary/20" style={{ height: '340px', minHeight: '300px' }}>
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Badge flotante informativo */}
        <div className="absolute top-3 left-3 z-[1000] bg-background/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-[11px] font-semibold text-foreground border border-border/80 shadow-md flex items-center gap-1.5 pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Haz clic en el mapa o arrastra el pin para ubicar la cancha</span>
        </div>

        {/* Botón flotante para centrar si hay pin */}
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
