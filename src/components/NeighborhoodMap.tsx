"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface DistrictMapStat {
  city: string;
  district: string;
  count: number;
  avgSqm: number | null;
}

interface NeighborhoodMapProps {
  currentCity: string;
  currentDistrict: string;
  stats: DistrictMapStat[];
}

function normalizeKey(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const CITY_CENTERS: Record<string, { lat: number; lng: number; zoom: number }> = {
  "cluj-napoca": { lat: 46.7712, lng: 23.6236, zoom: 12 },
  "brasov": { lat: 45.6579, lng: 25.6012, zoom: 12 },
  "bucuresti": { lat: 44.4323, lng: 26.1063, zoom: 11 },
};

const DISTRICT_COORDS: Record<string, [number, number]> = {
  // Bucuresti - Sectors & Zones
  "sector 1": [44.4750, 26.0750],
  "sectorul 1": [44.4750, 26.0750],
  "sector 2": [44.4550, 26.1350],
  "sectorul 2": [44.4550, 26.1350],
  "sector 3": [44.4200, 26.1500],
  "sectorul 3": [44.4200, 26.1500],
  "sector 4": [44.3950, 26.1150],
  "sectorul 4": [44.3950, 26.1150],
  "sector 5": [44.4050, 26.0700],
  "sectorul 5": [44.4050, 26.0700],
  "sector 6": [44.4300, 26.0300],
  "sectorul 6": [44.4300, 26.0300],

  // Bucuresti - Specific Neighborhoods
  "militari": [44.4345, 26.0195],
  "drumul taberei": [44.4205, 26.0265],
  "titan": [44.4225, 26.1625],
  "berceni": [44.3875, 26.1195],
  "dristor": [44.4195, 26.1405],
  "vitan": [44.4115, 26.1325],
  "tineretului": [44.4125, 26.1065],
  "pantelimon": [44.4435, 26.1695],
  "colentina": [44.4645, 26.1455],
  "crangasi": [44.4515, 26.0475],
  "pipera": [44.4925, 26.1245],
  "aviatiei": [44.4805, 26.0985],
  "floreasca": [44.4635, 26.1025],
  "dorobanti": [44.4565, 26.0955],
  "baneasa": [44.4955, 26.0775],
  "cotroceni": [44.4335, 26.0685],
  "tei": [44.4605, 26.1205],
  "stefan cel mare": [44.4525, 26.1095],
  "iancului": [44.4415, 26.1335],
  "obor": [44.4495, 26.1255],
  "centru / romana": [44.4415, 26.0975],
  "rahova": [44.4045, 26.0645],
  "bucurestii noi": [44.4885, 26.0425],

  // Cluj-Napoca
  "manastur": [46.7550, 23.5580],
  "marasti": [46.7810, 23.6190],
  "gheorgheni": [46.7680, 23.6280],
  "zorilor": [46.7555, 23.5895],
  "grigorescu": [46.7690, 23.5570],
  "buna ziua": [46.7495, 23.6065],
  "centru": [46.7709, 23.5899],
  "iris": [46.7950, 23.6080],
  "intre lacuri": [46.7765, 23.6360],
  "europa": [46.7480, 23.5820],
  "andrei muresanu": [46.7610, 23.6050],
  "borhanci": [46.7460, 23.6350],
  "sopor": [46.7650, 23.6550],
  "someseni": [46.7820, 23.6620],
  "dambul rotund": [46.7870, 23.5680],
  "plopilor": [46.7645, 23.5690],
  "gruia": [46.7775, 23.5775],
  "baciu": [46.7925, 23.5250],
  "floresti": [46.7455, 23.4925],

  // Brasov
  "tractorul": [45.6725, 25.6145],
  "astra": [45.6455, 25.6295],
  "centrul istoric": [45.6425, 25.5885],
  "centrul civic": [45.6535, 25.6105],
  "racadau": [45.6355, 25.6115],
  "bartolomeu": [45.6675, 25.5745],
  "noua": [45.6195, 25.6465],
  "florilor": [45.6565, 25.6265],
  "craiter": [45.6615, 25.6375],
  "stupini": [45.6945, 25.5795],
  "triaj": [45.6755, 25.6385],
  "grivitei": [45.6625, 25.5985],
  "scriitorilor": [45.6485, 25.6145],
};

function resolveCoords(districtName: string): [number, number] | null {
  const norm = normalizeKey(districtName);
  if (DISTRICT_COORDS[norm]) return DISTRICT_COORDS[norm];

  // Resolve sector naming variants: e.g. "sectorul 1" -> "sector 1"
  for (let i = 1; i <= 6; i++) {
    if (norm.includes(`sectorul ${i}`) || norm.includes(`sector ${i}`)) {
      return DISTRICT_COORDS[`sector ${i}`] || null;
    }
  }

  // Fuzzy match on known neighborhoods
  for (const [key, coords] of Object.entries(DISTRICT_COORDS)) {
    if (norm.includes(key) || key.includes(norm)) {
      return coords;
    }
  }

  return null;
}

export default function NeighborhoodMap({
  currentCity,
  currentDistrict,
  stats,
}: NeighborhoodMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSelectLocation = (city: string, district?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    params.set("city", city);
    if (district) {
      params.set("district", district);
    } else {
      params.delete("district");
    }
    router.push(`/?${params.toString()}`);
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const normCity = normalizeKey(currentCity);
    const centerConfig =
      normCity && CITY_CENTERS[normCity]
        ? CITY_CENTERS[normCity]
        : { lat: 45.9432, lng: 24.9668, zoom: 7 };

    // Initialize Map
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current).setView(
        [centerConfig.lat, centerConfig.lng],
        centerConfig.zoom
      );

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    // Adjust camera view
    if (currentDistrict) {
      const distCoord = resolveCoords(currentDistrict);
      if (distCoord) {
        map.setView(distCoord, 13, { animate: true });
      }
    } else if (normCity && CITY_CENTERS[normCity]) {
      const c = CITY_CENTERS[normCity];
      map.setView([c.lat, c.lng], c.zoom, { animate: true });
    }

    // Render Markers
    stats.forEach((item) => {
      const coords = resolveCoords(item.district);
      if (!coords) return;

      const isSelected =
        normalizeKey(currentDistrict || "") === normalizeKey(item.district);

      const priceText = item.avgSqm
        ? `${Math.round(item.avgSqm)} €/m²`
        : `${item.count} listings`;

      const badgeHtml = `
        <div style="
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          background: ${isSelected ? "#059669" : "#111827"};
          color: white;
          padding: 5px 11px;
          border-radius: 9999px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.25);
          border: 2px solid white;
          font-family: sans-serif;
          white-space: nowrap;
          transform: translate(-50%, -50%);
          cursor: pointer;
        ">
          <span style="font-size: 11px; font-weight: 700; line-height: 1.1;">
            ${item.district} (${item.count})
          </span>
          <span style="font-size: 10px; color: #a7f3d0; font-weight: 600;">
            ${priceText}
          </span>
        </div>
      `;

      const icon = L.divIcon({
        html: badgeHtml,
        className: "",
        iconSize: [0, 0],
      });

      const marker = L.marker(coords, { icon });
      marker.on("click", () => {
        handleSelectLocation(item.city, isSelected ? undefined : item.district);
      });

      markersLayer.addLayer(marker);
    });
  }, [currentCity, currentDistrict, stats]);

  return (
    <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 mb-8">
      <div className="flex items-center justify-between px-2 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-800">
            🗺️ Interactive Neighborhood Price Map
          </span>
          <span className="text-xs text-gray-500">
            (Click any bubble to filter listings)
          </span>
        </div>
        {currentDistrict && (
          <button
            onClick={() => handleSelectLocation(currentCity, undefined)}
            className="text-xs font-semibold text-blue-600 hover:underline"
          >
            Reset Neighborhood Zoom
          </button>
        )}
      </div>
      <div
        ref={mapContainerRef}
        className="w-full h-[380px] rounded-lg overflow-hidden border border-gray-200 z-0"
      />
    </div>
  );
}