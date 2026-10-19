"use client";

import { useRouter, useSearchParams } from "next/navigation";

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
}

export default function FilterBar({
  mainCities,
  otherCities,
  districts,
  currentCity,
  currentDistrict,
  currentDeals,
}: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilters = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    // Reset pagination to page 1 whenever filters change
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
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-8 flex flex-wrap gap-4 items-end">
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
              district: null, // Reset neighborhood when switching cities
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

      {/* 2. Neighborhood (District) Dropdown */}
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

      {/* 3. Original Deals Button */}
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
    </div>
  );
}