'use client';

import { useEffect, useRef } from 'react';
import { Pitch } from '@/lib/types';
import { cleanAddress } from '@/lib/complex-utils';

export const COLOMBIAN_CITIES: Record<string, { lat: number; lng: number }> = {
  'Pasto': { lat: 1.2136, lng: -77.2811 },
  'Ipiales': { lat: 0.8294, lng: -77.6444 },
  'Popayán': { lat: 2.4419, lng: -76.6063 },
  'Cali': { lat: 3.4516, lng: -76.5320 },
  'Bogotá': { lat: 4.7110, lng: -74.0721 },
  'Medellín': { lat: 6.2442, lng: -75.5812 },
  'Barranquilla': { lat: 10.9685, lng: -74.7813 },
  'Bucaramanga': { lat: 7.1254, lng: -73.1198 },
};

interface DynamicMapProps {
  pitches: Pitch[];
  onMarkerClick: (pitch: Pitch) => void;
  userCoords?: { lat: number; lng: number } | null;
  selectedCity?: string;
}

export default function DynamicMap({ pitches, onMarkerClick, userCoords, selectedCity = 'Pasto' }: DynamicMapProps) {
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    const initMap = async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');

      if (!mapContainerRef.current || mapRef.current) return;

      const cityCoords = COLOMBIAN_CITIES[selectedCity] || COLOMBIAN_CITIES['Pasto'];
      const DEFAULT_CENTER: [number, number] = userCoords
        ? [userCoords.lat, userCoords.lng]
        : [cityCoords.lat, cityCoords.lng];

      delete (L.Icon.Default.prototype as any)._getIconUrl;

      mapRef.current = L.map(mapContainerRef.current, {
        center: DEFAULT_CENTER,
        zoom: 14,
        zoomControl: true,
      });

      L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 20,
        }
      ).addTo(mapRef.current);

      updateMarkers(L, pitches);
    };

    initMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    const updateMap = async () => {
      const L = (await import('leaflet')).default;
      updateMarkers(L, pitches);

      if (userCoords && mapRef.current) {
        mapRef.current.flyTo([userCoords.lat, userCoords.lng], 14, { duration: 1.2 });
      } else if (selectedCity && COLOMBIAN_CITIES[selectedCity] && mapRef.current) {
        const c = COLOMBIAN_CITIES[selectedCity];
        mapRef.current.flyTo([c.lat, c.lng], 13, { duration: 1.2 });
      }
    };

    updateMap();
  }, [pitches, userCoords, selectedCity]);

  const updateMarkers = (L: any, pitchesList: Pitch[]) => {
    if (!mapRef.current) return;

    // Limpiar marcadores anteriores
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // ── Marcador de ubicación del usuario (GRANDE y visible) ──
    if (userCoords) {
      const userIcon = L.divIcon({
        className: '',
        html: `
          <div style="position:relative;width:56px;height:56px;display:flex;align-items:center;justify-content:center;">
            <!-- Aro exterior pulsante -->
            <div style="
              position:absolute;width:56px;height:56px;
              background:rgba(37,99,235,0.18);
              border:2px solid rgba(37,99,235,0.35);
              border-radius:50%;
              animation:ping 1.8s cubic-bezier(0,0,0.2,1) infinite;
            "></div>
            <!-- Aro medio -->
            <div style="
              position:absolute;width:38px;height:38px;
              background:rgba(37,99,235,0.12);
              border-radius:50%;
            "></div>
            <!-- Punto central -->
            <div style="
              width:22px;height:22px;
              background:linear-gradient(135deg,#3b82f6,#2563eb);
              border:3px solid #ffffff;
              border-radius:50%;
              box-shadow:0 3px 12px rgba(37,99,235,0.55);
              position:relative;z-index:2;
            "></div>
          </div>
        `,
        iconSize: [56, 56],
        iconAnchor: [28, 28],
      });

      const userMarker = L.marker([userCoords.lat, userCoords.lng], { icon: userIcon, zIndexOffset: 2000 })
        .addTo(mapRef.current)
        .bindPopup(`
          <div style="font-family:Inter,sans-serif;font-size:13px;font-weight:800;color:#1e40af;text-align:center;padding:4px 6px;">
            📍 <span>Tu ubicación</span>
          </div>
        `);
      markersRef.current.push(userMarker);
    }

    // ── Icono de complejo deportivo ──
    const complexIcon = L.divIcon({
      className: '',
      html: `
        <div style="
          width:40px;height:40px;
          background:linear-gradient(135deg,#10b981,#059669);
          border:3px solid #ffffff;
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          box-shadow:0 4px 16px rgba(5,150,105,0.5);
          display:flex;align-items:center;justify-content:center;
        ">
          <div style="transform:rotate(45deg);color:#fff;font-size:14px;line-height:1;">⚽</div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -44],
    });

    // ── Agrupar pitches por ubicación (complejo y sede física) ──
    // Si dos canchas del mismo complejo están en la MISMA dirección/coordenadas, se agrupan juntas.
    // Si una cancha está en DIFERENTE dirección/ubicación, tiene su propio pin independiente en el mapa.
    interface LocationGroup {
      companyId: string | null;
      lat: number;
      lng: number;
      name: string;
      address?: string;
      explicitAddress?: string;
      city?: string;
      pitches: Pitch[];
    }
    const locationGroups: LocationGroup[] = [];

    pitchesList.forEach((pitch: any) => {
      const comp = pitch.companies || pitch.company;
      const lat = Number(pitch.lat ?? comp?.lat);
      const lng = Number(pitch.lng ?? comp?.lng);
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

      const companyId = comp?.id || pitch.company_id || null;
      const resolvedAddress = (pitch.address || pitch.custom_pricing?.address || comp?.address || '').trim();
      const explicitAddress = (pitch.address || pitch.custom_pricing?.address || '').trim();

      // Buscar si ya existe un grupo para esta misma empresa en la misma ubicación
      const existing = companyId
        ? locationGroups.find(g => {
          if (g.companyId !== companyId) return false;

          const explicitA = explicitAddress.toLowerCase();
          const explicitB = (g.explicitAddress || '').toLowerCase();

          // 1. Si ambas tienen direcciones explícitas:
          if (explicitA && explicitB) {
            if (explicitA !== explicitB) return false; // Direcciones distintas -> sedes físicas distintas
            return true; // Misma dirección -> misma sede
          }

          // 2. Si no hay direcciones explícitas distintas, comparar cercanía geográfica (< ~150m)
          const diffLat = Math.abs(g.lat - lat);
          const diffLng = Math.abs(g.lng - lng);
          return diffLat < 0.0015 && diffLng < 0.0015;
        })
        : null;

      if (existing) {
        existing.pitches.push(pitch);
      } else {
        locationGroups.push({
          companyId,
          lat,
          lng,
          name: comp?.name || pitch.name || 'Complejo Deportivo',
          address: resolvedAddress,
          explicitAddress,
          city: pitch.city || comp?.city,
          pitches: [pitch],
        });
      }
    });

    // ── Renderizar marcadores con dispersión inteligente (spiderfy) para coordenadas solapadas ──
    const coordClusters = new Map<string, LocationGroup[]>();
    locationGroups.forEach(g => {
      // Clave redondeada para agrupar marcadores que estén a menos de ~40m o en el mismo punto exacto
      const key = `${g.lat.toFixed(4)}_${g.lng.toFixed(4)}`;
      if (!coordClusters.has(key)) coordClusters.set(key, []);
      coordClusters.get(key)!.push(g);
    });

    coordClusters.forEach(cluster => {
      const count = cluster.length;
      cluster.forEach((group, idx) => {
        let renderLat = group.lat;
        let renderLng = group.lng;

        if (count > 1) {
          // Desplazar ligeramente en círculo para que ambos pines se vean perfectamente y nunca se tapen
          const angle = (idx / count) * 2 * Math.PI;
          const radiusLat = 0.00035; // ~35 metros
          const radiusLng = 0.00035 / Math.cos(group.lat * Math.PI / 180);
          renderLat += radiusLat * Math.sin(angle);
          renderLng += radiusLng * Math.cos(angle);
        }

        const isSinglePitch = group.pitches.length === 1;
        const firstPitch = group.pitches[0] as any;

        const pitchRows = group.pitches.map(p => {
          const type = (p as any).type || 'Fútbol 5';
          return `
        <div
          onclick="window._mapSelectPitch('${p.id}')"
          style="
            display:flex;align-items:center;gap:8px;
            padding:8px 10px;border-radius:10px;margin-bottom:6px;
            background:#f0fdf4;cursor:pointer;
            border:1px solid #bbf7d0;
            transition:background 0.15s;
          "
          onmouseover="this.style.background='#dcfce7'"
          onmouseout="this.style.background='#f0fdf4'"
        >
          <span style="font-size:16px;flex-shrink:0;">⚽</span>
          <div style="min-width:0;flex:1;word-break:break-word;">
            <div style="font-size:12px;font-weight:800;color:#065f46;text-transform:uppercase;line-height:1.25;white-space:normal;">
              ${(p as any).name}
            </div>
            <div style="font-size:11px;color:#16a34a;font-weight:600;margin-top:2px;">
              ${type}
            </div>
          </div>
          <span style="font-size:14px;color:#16a34a;flex-shrink:0;">›</span>
        </div>
      `;
        }).join('');

        const popupContent = `
      <div style="font-family:Inter,sans-serif;width:100%;max-width:280px;box-sizing:border-box;padding:2px 0;">
        <div style="font-size:14px;font-weight:900;color:#064e3b;margin-bottom:${isSinglePitch ? '2px' : '4px'};text-transform:uppercase;letter-spacing:0.02em;line-height:1.25;word-break:break-word;white-space:normal;">
          🏟️ ${group.name}
        </div>
        ${isSinglePitch ? `
          <div style="font-size:12px;font-weight:800;color:#059669;margin-bottom:6px;text-transform:uppercase;line-height:1.25;word-break:break-word;white-space:normal;">
            ⚽ ${firstPitch.name}
          </div>
        ` : ''}
        ${cleanAddress(group.address) ? `<div style="font-size:11px;color:#4b5563;margin-bottom:8px;display:flex;align-items:flex-start;gap:4px;line-height:1.3;word-break:break-word;"><span style="flex-shrink:0;">📍</span><span style="white-space:normal;">${cleanAddress(group.address)}</span></div>` : ''}
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#059669;letter-spacing:0.04em;margin-bottom:6px;">
          ${isSinglePitch ? 'Toca para ver disponibilidad' : `Canchas en esta sede (${group.pitches.length})`}
        </div>
        ${pitchRows}
      </div>
    `;

        const marker = L.marker([renderLat, renderLng], { icon: complexIcon })
          .addTo(mapRef.current)
          .bindPopup(popupContent, {
            minWidth: 220,
            maxWidth: 300,
            autoPanPadding: [20, 20],
            className: 'complex-popup'
          });

        markersRef.current.push(marker);
      });
    });

    // ── Handler global para clicks en popup ──
    (window as any)._mapSelectPitch = (pitchId: string) => {
      const found = pitchesList.find((p: any) => p.id === pitchId);
      if (found) onMarkerClick(found);
    };
  };

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-border shadow-md" style={{ height: '420px' }}>
      <div ref={mapContainerRef} className="w-full h-full" />
      <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 dark:bg-black/80 backdrop-blur-sm px-2.5 py-1 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 shadow-sm flex items-center gap-1.5">
        <span>📍</span>
        <span>{selectedCity ? `${selectedCity}, Colombia` : 'Colombia'}</span>
      </div>
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(1.8); opacity: 0; }
        }
        .complex-popup .leaflet-popup-content-wrapper {
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.18);
          border: 1px solid #d1fae5;
        }
        .complex-popup .leaflet-popup-tip {
          background: white;
        }
      `}</style>
    </div>
  );
}
