'use client';

import { useEffect, useRef } from 'react';
import { Pitch } from '@/lib/types';

interface DynamicMapProps {
  pitches: Pitch[];
  onMarkerClick: (pitch: Pitch) => void;
}

export default function DynamicMap({ pitches, onMarkerClick }: DynamicMapProps) {
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    // Importar leaflet solo en el cliente para evitar SSR issues
    const initMap = async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');

      if (!mapContainerRef.current || mapRef.current) return;

      // Pasto, Colombia
      const DEFAULT_CENTER: [number, number] = [1.2136, -77.2811];

      // Arreglar íconos de Leaflet en Next.js
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      // Ícono personalizado verde
      const greenIcon = L.divIcon({
        className: '',
        html: `<div style="
          width: 36px; height: 36px;
          background: #22c55e;
          border: 3px solid white;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 4px 15px rgba(34,197,94,0.4);
          display: flex; align-items: center; justify-content: center;
        "></div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -40],
      });

      mapRef.current = L.map(mapContainerRef.current, {
        center: DEFAULT_CENTER,
        zoom: 14,
        zoomControl: true,
      });

      // Tile layer CartoDB Voyager (bello, oscuro suave)
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          attribution: '&copy; <a href="https://www.openstreetmap.org/">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
          subdomains: 'abcd',
          maxZoom: 20,
        }
      ).addTo(mapRef.current);

      // Agregar marcadores de canchas reales
      updateMarkers(L, greenIcon, pitches);
    };

    initMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Actualizar marcadores cuando cambien los pitches
  useEffect(() => {
    if (!mapRef.current) return;

    const updateMap = async () => {
      const L = (await import('leaflet')).default;
      const greenIcon = L.divIcon({
        className: '',
        html: `<div style="
          width: 36px; height: 36px;
          background: #22c55e;
          border: 3px solid white;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 4px 15px rgba(34,197,94,0.4);
        "></div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -40],
      });
      updateMarkers(L, greenIcon, pitches);
    };

    updateMap();
  }, [pitches]);

  const updateMarkers = (L: any, greenIcon: any, pitchesList: Pitch[]) => {
    if (!mapRef.current) return;

    // Limpiar marcadores anteriores
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // For pitches with individual coords, create individual markers
    // For pitches without coords, group by company
    const individualPitches: any[] = [];
    const companyMap = new Map<string, { lat: number; lng: number; name: string; pitches: Pitch[] }>();

    pitchesList.forEach((pitch: any) => {
      // Priority 1: individual pitch coords
      if (pitch.lat && pitch.lng) {
        individualPitches.push(pitch);
        return;
      }
      // Priority 2: company coords
      if (pitch.companies?.lat && pitch.companies?.lng) {
        const key = `${pitch.companies.lat},${pitch.companies.lng}`;
        if (!companyMap.has(key)) {
          companyMap.set(key, {
            lat: pitch.companies.lat,
            lng: pitch.companies.lng,
            name: pitch.companies.name || 'Complejo',
            pitches: [],
          });
        }
        companyMap.get(key)!.pitches.push(pitch);
      }
    });

    if (individualPitches.length === 0 && companyMap.size === 0) return;

    companyMap.forEach((company) => {
      const popupContent = `
        <div style="font-family: Inter, sans-serif; min-width: 180px; padding: 4px;">
          <strong style="font-size: 13px; display: block; margin-bottom: 8px; color: #111;">🏟️ ${company.name}</strong>
          ${company.pitches.map(p => `
            <div style="
              padding: 6px 8px; border-radius: 8px; margin-bottom: 4px;
              background: #f0fdf4; cursor: pointer; font-size: 12px;
              border: 1px solid #bbf7d0;
            " onclick="window._mapSelectPitch('${p.id}')">
              ⚽ <strong>${(p as any).name}</strong><br>
              <span style="color:#16a34a;">$${(p as any).price_per_hour?.toLocaleString()}/hr</span>
              · ${(p as any).type || 'Fútbol 5'}
            </div>
          `).join('')}
        </div>
      `;

      if (mapRef.current) {
        const marker = L.marker([company.lat, company.lng], { icon: greenIcon })
          .addTo(mapRef.current)
          .bindPopup(popupContent, { maxWidth: 260 });
        markersRef.current.push(marker);
      }
    });

    // Individual pitch markers (have their own lat/lng)
    individualPitches.forEach((pitch: any) => {
      const popupContent = `
        <div style="font-family: Inter, sans-serif; min-width: 180px; padding: 4px;">
          <div style="
            padding: 6px 8px; border-radius: 8px;
            background: #f0fdf4; cursor: pointer; font-size: 12px;
            border: 1px solid #bbf7d0;
          " onclick="window._mapSelectPitch('${pitch.id}')">
            ⚽ <strong>${pitch.name}</strong><br>
            <span style="color:#16a34a;">$${pitch.price_per_hour?.toLocaleString()}/hr</span>
            · ${pitch.type || 'Fútbol 5'}
          </div>
        </div>
      `;
      if (mapRef.current) {
        const marker = L.marker([pitch.lat, pitch.lng], { icon: greenIcon })
          .addTo(mapRef.current)
          .bindPopup(popupContent, { maxWidth: 260 });
        markersRef.current.push(marker);
      }
    });

    // Global handler for popup clicks
    (window as any)._mapSelectPitch = (pitchId: string) => {
      const found = pitchesList.find((p: any) => p.id === pitchId);
      if (found) onMarkerClick(found);
    };
  };

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-border shadow-md" style={{ height: '420px' }}>
      <div ref={mapContainerRef} className="w-full h-full" />
      {/* Overlay de marca */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-xl text-xs font-semibold text-green-700 border border-green-100 shadow-sm">
        📍 Pasto, Nariño
      </div>
    </div>
  );
}
