import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import Link from 'next/link';
import FilterBar from '@/components/FilterBar';

export const revalidate = 0;

type ListingWithHistory = Prisma.ListingGetPayload<{
  include: { priceHistory: true };
}>;

const PRIORITY_CITIES = ['Cluj-Napoca', 'Brasov', 'Bucuresti'];

export default async function HomePage(props: {
  searchParams: Promise<{
    type?: string;
    page?: string;
    city?: string;
    district?: string;
    deals?: string;
    sort?: string;
  }>;
}) {
  const searchParams = await props.searchParams;

  // URL Parameters setup
  const currentType = searchParams?.type || 'sale';
  const currentPage = Number(searchParams?.page) || 1;
  const currentCity = searchParams?.city || '';
  const currentDistrict = searchParams?.district || '';
  const currentDeals = searchParams?.deals === 'true';
  const currentSort = searchParams?.sort || 'newest';
  const pageSize = 50;

  // Filter based on price (Sale vs Rent)
  const priceFilter = currentType === 'rent' ? { lt: 5000 } : { gte: 5000 };
  // Reasonable €/sqm bounds to prevent typos on OLX from skewing market averages
  const sqmPriceBounds =
    currentType === 'rent' ? { gt: 2, lt: 50 } : { gt: 500, lt: 6000 };

  const whereClause: Prisma.ListingWhereInput = { price: priceFilter };

  if (currentCity) {
    whereClause.city = currentCity;
  }

  if (currentCity && currentDistrict) {
    whereClause.district = currentDistrict;
  }

  if (currentDeals) {
    whereClause.priceHistory = {
      some: {},
    };
  }

  // Dynamic sorting configuration
  let orderByClause:
    | Prisma.ListingOrderByWithRelationInput
    | Prisma.ListingOrderByWithRelationInput[] = { firstSeenAt: 'desc' };

  if (currentSort === 'price_asc') {
    orderByClause = [{ price: 'asc' }, { firstSeenAt: 'desc' }];
  } else if (currentSort === 'price_desc') {
    orderByClause = [{ price: 'desc' }, { firstSeenAt: 'desc' }];
  } else if (currentSort === 'sqm_asc') {
    orderByClause = [{ pricePerSqm: 'asc' }, { firstSeenAt: 'desc' }];
  }

  // Fetch listings, total count, city stats, district dropdowns, and market averages in parallel
  const [listings, totalCount, cityGroups, districtGroups, marketBenchmarks] =
    await Promise.all([
      prisma.listing.findMany({
        where: whereClause,
        orderBy: orderByClause,
        take: pageSize,
        skip: (currentPage - 1) * pageSize,
        include: {
          priceHistory: {
            orderBy: { changedAt: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.listing.count({
        where: whereClause,
      }),
      // Group cities by count and average €/sqm
      prisma.listing.groupBy({
        by: ['city'],
        where: {
          price: priceFilter,
          city: { gt: '' },
        },
        _count: { city: true },
        _avg: { pricePerSqm: true },
        orderBy: { _count: { city: 'desc' } },
      }),
      // Group neighborhoods for dropdown if a city is selected
      currentCity
        ? prisma.listing.groupBy({
            by: ['district'],
            where: {
              price: priceFilter,
              city: currentCity,
              district: { gt: '' },
            },
            _count: { district: true },
            orderBy: { _count: { district: 'desc' } },
          })
        : Promise.resolve([]),
      // Compute clean €/sqm averages per (city + district) for the Market Value Indicator
      prisma.listing.groupBy({
        by: ['city', 'district'],
        where: {
          price: priceFilter,
          pricePerSqm: sqmPriceBounds,
          city: { gt: '' },
        },
        _avg: { pricePerSqm: true },
        _count: { id: true },
      }),
    ]);

  // Build fast lookup maps for City and District averages
  const cityAvgMap = new Map<string, number>();
  const districtAvgMap = new Map<string, number>();

  for (const group of cityGroups) {
    if (group.city && group._avg.pricePerSqm) {
      cityAvgMap.set(group.city, Number(group._avg.pricePerSqm));
    }
  }

  for (const bench of marketBenchmarks) {
    // Require at least 3 listings in a neighborhood so the average is statistically reliable
    if (
      bench.city &&
      bench.district &&
      bench._avg.pricePerSqm &&
      bench._count.id >= 3
    ) {
      districtAvgMap.set(
        `${bench.city}::${bench.district}`,
        Number(bench._avg.pricePerSqm)
      );
    }
  }

  // Separate main cities (Cluj, Brasov, Bucuresti) from other cities
  const mainCities = PRIORITY_CITIES.map((name) => {
    const match = cityGroups.find(
      (g) => g.city?.toLowerCase() === name.toLowerCase()
    );
    return {
      name: match?.city || name,
      count: match ? match._count.city : 0,
    };
  }).filter((c) => c.count > 0);

  const otherCities = cityGroups
    .filter(
      (g) =>
        g.city &&
        !PRIORITY_CITIES.some(
          (p) => p.toLowerCase() === g.city!.toLowerCase()
        ) &&
        g._count.city >= 3
    )
    .map((g) => ({
      name: g.city!,
      count: g._count.city,
    }));

  const districts = districtGroups
    .filter((d) => d.district)
    .map((d) => ({
      name: d.district!,
      count: d._count.district,
    }));

  // Map stats with accent-insensitive city comparison (matches București with Bucuresti)
  const mapStats = marketBenchmarks
    .filter(
      (b) =>
        b.city &&
        b.district &&
        (!currentCity ||
          b.city.localeCompare(currentCity, undefined, { sensitivity: 'base' }) === 0)
    )
    .map((b) => ({
      city: b.city!,
      district: b.district!,
      count: b._count.id,
      avgSqm: b._avg.pricePerSqm ? Number(b._avg.pricePerSqm) : null,
    }));

  const totalPages = Math.ceil(totalCount / pageSize);

  const cityParam = currentCity ? `&city=${encodeURIComponent(currentCity)}` : '';
  const districtParam = currentDistrict
    ? `&district=${encodeURIComponent(currentDistrict)}`
    : '';
  const dealParam = currentDeals ? `&deals=true` : '';
  const sortParam = currentSort && currentSort !== 'newest' ? `&sort=${currentSort}` : '';

  // Active area average for header banner
  const activeBenchmarkAvg =
    currentCity && currentDistrict
      ? districtAvgMap.get(`${currentCity}::${currentDistrict}`) ||
        cityAvgMap.get(currentCity)
      : currentCity
      ? cityAvgMap.get(currentCity)
      : null;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">ImoPont</h1>
              <p className="text-gray-600 mt-1">
                Showing {listings.length} of {totalCount}{' '}
                {currentType === 'rent' ? 'rentals' : 'properties for sale'}
                {currentCity ? ` in ${currentCity}` : ''}
                {currentDistrict ? ` (${currentDistrict})` : ''}
                {activeBenchmarkAvg ? (
                  <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-blue-100 text-blue-800">
                    Area Avg: {Math.round(activeBenchmarkAvg).toLocaleString()} €/m²
                  </span>
                ) : null}
              </p>
            </div>

            {/* Navigation Tabs */}
            <div className="flex bg-gray-200 p-1 rounded-lg">
              <Link
                href={`/?type=sale${cityParam}${districtParam}${dealParam}${sortParam}`}
                className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentType === 'sale'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                For Sale
              </Link>
              <Link
                href={`/?type=rent${cityParam}${districtParam}${dealParam}${sortParam}`}
                className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentType === 'rent'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                For Rent
              </Link>
            </div>
          </div>
        </header>

        {/* Cascading Filter Bar + Map View */}
        <FilterBar
          mainCities={mainCities}
          otherCities={otherCities}
          districts={districts}
          currentCity={currentCity}
          currentDistrict={currentDistrict}
          currentDeals={currentDeals}
          currentSort={currentSort}
          mapStats={mapStats}
        />

        {listings.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500">
              No {currentType} listings found on this page.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
              {listings.map((item: ListingWithHistory) => {
                const latestHistory = item.priceHistory?.[0];
                const isDiscount =
                  latestHistory &&
                  Number(latestHistory.oldPrice ?? 0) >
                    Number(latestHistory.newPrice ?? 0);

                // Market Value Calculation
                const itemSqmPrice = item.pricePerSqm
                  ? Number(item.pricePerSqm)
                  : null;
                const districtAvg =
                  item.city && item.district
                    ? districtAvgMap.get(`${item.city}::${item.district}`)
                    : undefined;
                const cityAvg = item.city
                  ? cityAvgMap.get(item.city)
                  : undefined;

                const referenceAvg = districtAvg || cityAvg;
                const referenceLabel = districtAvg ? 'district' : 'city';

                let belowMarketPercent = 0;
                if (
                  itemSqmPrice &&
                  referenceAvg &&
                  itemSqmPrice < referenceAvg
                ) {
                  belowMarketPercent = Math.round(
                    ((referenceAvg - itemSqmPrice) / referenceAvg) * 100
                  );
                }

                // Flag as Great Value if 15% - 65% below area benchmark
                const isUnderpriced =
                  belowMarketPercent >= 15 && belowMarketPercent <= 65;

                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow relative"
                  >
                    {/* Top-right Badges */}
                    <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5 z-10">
                      {isDiscount && (
                        <span className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
                          PRICE DROP
                        </span>
                      )}
                      {isUnderpriced && (
                        <span className="bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
                          💎 {belowMarketPercent}% BELOW AVG
                        </span>
                      )}
                    </div>

                    <div>
                      {/* Thumbnail Image */}
                      <div className="h-48 w-full bg-gray-100 relative overflow-hidden">
                        {item.imageUrl &&
                        item.imageUrl !== 'NO_IMAGE' &&
                        item.imageUrl !== 'DEAD_LINK' ? (
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            loading="lazy"
                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                            No image available
                          </div>
                        )}
                        <span className="absolute bottom-3 left-3 text-xs font-semibold uppercase tracking-wider bg-white/90 backdrop-blur-sm text-blue-700 px-2.5 py-1 rounded-full shadow-sm">
                          {item.city || 'Romania'}
                        </span>
                      </div>

                      {/* Card Body */}
                      <div className="p-5 pb-0">
                        <div className="flex justify-between items-baseline mb-2">
                          <div>
                            <span className="text-xl font-bold text-emerald-600">
                              {item.price
                                ? `${Number(item.price).toLocaleString()} ${
                                    item.currency || 'EUR'
                                  }`
                                : 'N/A'}
                            </span>
                            {isDiscount && (
                              <span className="text-sm line-through text-gray-400 ml-2">
                                {Number(latestHistory.oldPrice)?.toLocaleString()}{' '}
                                {item.currency || 'EUR'}
                              </span>
                            )}
                          </div>
                          {itemSqmPrice && (
                            <div className="text-right">
                              <span
                                className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                  isUnderpriced
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'text-gray-600'
                                }`}
                              >
                                {Math.round(itemSqmPrice).toLocaleString()} €/m²
                              </span>
                              {referenceAvg && (
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                  {referenceLabel} avg:{' '}
                                  {Math.round(referenceAvg).toLocaleString()} €/m²
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        <h2
                          className="font-semibold text-gray-800 line-clamp-2 mb-3"
                          title={item.title}
                        >
                          {item.title}
                        </h2>

                        <div className="text-sm text-gray-500 mb-4 flex flex-col gap-1">
                          <p>
                            📍{' '}
                            {item.district
                              ? item.district
                              : 'Location on request'}
                          </p>
                          {item.surfaceSqm && (
                            <p>📐 {Number(item.surfaceSqm)} m²</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {item.url && (
                      <div className="p-5 pt-0">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-center w-full py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          View Original Listing ↗
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-6 border-t border-gray-200">
                {currentPage > 1 ? (
                  <Link
                    href={`/?type=${currentType}&page=${
                      currentPage - 1
                    }${cityParam}${districtParam}${dealParam}${sortParam}`}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <button
                    disabled
                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-400 bg-gray-50 cursor-not-allowed"
                  >
                    ← Previous
                  </button>
                )}

                <span className="text-sm text-gray-600 font-medium">
                  Page {currentPage} of {totalPages}
                </span>

                {currentPage < totalPages ? (
                  <Link
                    href={`/?type=${currentType}&page=${
                      currentPage + 1
                    }${cityParam}${districtParam}${dealParam}${sortParam}`}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                  >
                    Next →
                  </Link>
                ) : (
                  <button
                    disabled
                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-400 bg-gray-50 cursor-not-allowed"
                  >
                    Next →
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}