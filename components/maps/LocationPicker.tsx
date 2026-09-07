'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';

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

  const [searchQuery, setSearchQuery] = useState(initialAddress);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    const initMap = async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');

      if (!mapContainerRef.current || mapRef.current) return;

      // Default: Pasto, Colombia
      const defaultCenter: [number, number] = [lat ?? 1.2136, lng ?? -77.2811];

      delete (L.Icon.Default.prototype as any)._getIconUrl;

      pinIconRef.current = L.divIcon({
        className: '',
        html: `<div style="
          width: 32px; height: 32px;
          background: #16a34a;
          border: 3px solid white;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 4px 15px rgba(22,163,74,0.5);
        "></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -36],
      });

      mapRef.current = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 15,
        zoomControl: true,
      });

      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          attribution: '© OSM © CARTO',
          subdomains: 'abcd',
          maxZoom: 20,
        }
      ).addTo(mapRef.current);

      // If initial coordinates exist, place marker
      if (lat && lng) {
        markerRef.current = L.marker([lat, lng], { icon: pinIconRef.current, draggable: true }).addTo(mapRef.current);
        markerRef.current.on('dragend', (e: any) => {
          const pos = e.target.getLatLng();
          onChange(pos.lat, pos.lng);
        });
      }

      // On map click, place/move marker
      mapRef.current.on('click', (e: any) => {
        const { lat: clickLat, lng: clickLng } = e.latlng;
        onChange(clickLat, clickLng);

        if (markerRef.current) {
          markerRef.current.setLatLng([clickLat, clickLng]);
        } else {
          markerRef.current = L.marker([clickLat, clickLng], { icon: pinIconRef.current, draggable: true }).addTo(mapRef.current);
          markerRef.current.on('dragend', (ev: any) => {
            const pos = ev.target.getLatLng();
            onChange(pos.lat, pos.lng);
          });
        }
      });
    };

    initMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError('');

    try {
      const query = encodeURIComponent(`${searchQuery}, Pasto, Nariño, Colombia`);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&accept-language=es`,
        { headers: { 'Accept-Language': 'es' } }
      );
      const data = await res.json();

      if (!data || data.length === 0) {
        setSearchError('No se encontró esa dirección. Intenta ser más específico.');
        return;
      }

      const result = data[0];
      const newLat = parseFloat(result.lat);
      const newLng = parseFloat(result.lon);
      const displayName = result.display_name;

      onChange(newLat, newLng, displayName);

      // Move map and marker
      if (mapRef.current) {
        mapRef.current.setView([newLat, newLng], 17, { animate: true });

        const L = (await import('leaflet')).default;
        if (markerRef.current) {
          markerRef.current.setLatLng([newLat, newLng]);
        } else {
          markerRef.current = L.marker([newLat, newLng], { icon: pinIconRef.current, draggable: true }).addTo(mapRef.current);
          markerRef.current.on('dragend', (ev: any) => {
            const pos = ev.target.getLatLng();
            onChange(pos.lat, pos.lng);
          });
        }
      }
    } catch (err) {
      setSearchError('Error al buscar. Verifica tu conexión.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Buscar dirección en el mapa..."
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-border rounded-xl bg-background outline-none focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching}
          className="px-4 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-60"
        >
          {searching ? <Loader2 size={14} className="animate-spin" /> : 'Buscar'}
        </button>
      </div>

      {searchError && (
        <p className="text-xs text-red-500 font-semibold px-1">{searchError}</p>
      )}

      {/* Map */}
      <div className="relative w-full rounded-xl overflow-hidden border border-border shadow-sm" style={{ height: '240px' }}>
        <div ref={mapContainerRef} className="w-full h-full" />
        <div className="absolute bottom-2 left-2 z-[1000] bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded-lg text-[10px] font-semibold text-green-700 border border-green-100 shadow-sm">
          Haz clic o busca para marcar ubicación
        </div>
      </div>
    </div>
  );
}
