"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { DistrictMapStat } from "./NeighborhoodMap";

const NeighborhoodMap = dynamic(() => import("./NeighborhoodMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[380px] bg-gray-100 animate-pulse rounded-xl mb-8 flex items-center justify-center text-gray-500 text-sm">
      Loading neighborhood map...
    </div>
  ),
});

interface LocationOption {
  name: string;
  count: number;
}

interface FilterBarProps {
  mainCities: LocationOption[];
  otherCities: LocationOption[];
  districts: LocationOption[];
  currentCity: string;
  currentDistrict: string;
  currentDeals: boolean;
  mapStats: DistrictMapStat[];
}

export default function FilterBar({
  mainCities,
  otherCities,
  districts,
  currentCity,
  currentDistrict,
  currentDeals,
  mapStats,
}: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showMap, setShowMap] = useState(true);

  const updateFilters = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");

    Object.entries(updates).forEach(([key, value]) => {
      if (value && value !== "all") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    router.push(`/?${params.toString()}`);
  };

  return (
    <>
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-wrap gap-4 items-end">
        {/* 1. City Dropdown */}
        <div className="flex flex-col flex-1 min-w-[220px]">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
            City
          </label>
          <select
            value={currentCity || "all"}
            onChange={(e) =>
              updateFilters({
                city: e.target.value,
                district: null,
              })
            }
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900 cursor-pointer"
          >
            <option value="all" className="text-gray-900 bg-white font-normal">
              All Cities
            </option>

            {mainCities.length > 0 && (
              <optgroup label="Main Cities" className="text-gray-900 bg-white font-bold">
                {mainCities.map((c) => (
                  <option
                    key={c.name}
                    value={c.name}
                    className="text-gray-900 bg-white font-normal"
                  >
                    {c.name} ({c.count})
                  </option>
                ))}
              </optgroup>
            )}

            {otherCities.length > 0 && (
              <optgroup label="Other Locations" className="text-gray-900 bg-white font-bold">
                {otherCities.map((c) => (
                  <option
                    key={c.name}
                    value={c.name}
                    className="text-gray-900 bg-white font-normal"
                  >
                    {c.name} ({c.count})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {/* 2. Neighborhood Dropdown */}
        <div className="flex flex-col flex-1 min-w-[220px]">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
            Neighborhood
          </label>
          <select
            value={currentDistrict || "all"}
            disabled={!currentCity || districts.length === 0}
            onChange={(e) => updateFilters({ district: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 font-medium disabled:bg-gray-100 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 cursor-pointer disabled:cursor-not-allowed"
          >
            <option value="all" className="text-gray-900 bg-white font-normal">
              {!currentCity
                ? "Select a city first"
                : districts.length === 0
                ? "All Neighborhoods (None specified)"
                : `All in ${currentCity}`}
            </option>
            {districts.map((d) => (
              <option
                key={d.name}
                value={d.name}
                className="text-gray-900 bg-white font-normal"
              >
                {d.name} ({d.count})
              </option>
            ))}
          </select>
        </div>

        {/* 3. Deals Only Button */}
        <button
          type="button"
          onClick={() =>
            updateFilters({ deals: currentDeals ? null : "true" })
          }
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 border h-[38px] ${
            currentDeals
              ? "bg-red-600 text-white shadow-sm border-red-600"
              : "bg-white text-red-600 border-red-200 hover:bg-red-50"
          }`}
        >
          🔥 Deals Only
        </button>

        {/* 4. Toggle Map Button */}
        <button
          type="button"
          onClick={() => setShowMap(!showMap)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 border h-[38px] ${
            showMap
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
          }`}
        >
          🗺️ {showMap ? "Hide Map" : "Show Map"}
        </button>
      </div>

      {showMap && (
        <NeighborhoodMap
          currentCity={currentCity}
          currentDistrict={currentDistrict}
          stats={mapStats}
        />
      )}
    </>
  );
}