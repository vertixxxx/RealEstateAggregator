import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import Link from 'next/link';

export const revalidate = 0;

type ListingWithHistory = Prisma.ListingGetPayload<{
  include: { priceHistory: true };
}>;

export default async function HomePage(props: {
  searchParams: Promise<{ type?: string; page?: string; city?: string; deals?: string }>;
}) {
  const searchParams = await props.searchParams;

  // URL Parameters setup
  const currentType = searchParams?.type || 'sale';
  const currentPage = Number(searchParams?.page) || 1;
  const currentCity = searchParams?.city;
  const currentDeals = searchParams?.deals === 'true';
  const pageSize = 50;

  // Filter based on price
  const priceFilter = currentType === 'rent' ? { lt: 5000 } : { gte: 5000 };
  const whereClause: Prisma.ListingWhereInput = { price: priceFilter };
  
  if (currentCity) {
    whereClause.city = currentCity;
  }

  if (currentDeals) {
    whereClause.priceHistory = {
      some: {}, // Filter listings that have at least one price history record
    };
  }

  // Fetch listings, total count, and distinct cities in parallel for maximum speed
  const [listings, totalCount, distinctCities] = await Promise.all([
    prisma.listing.findMany({
      where: whereClause,
      orderBy: { firstSeenAt: 'desc' },
      take: pageSize,
      skip: (currentPage - 1) * pageSize, // Skip the records from previous pages
      include: {
        priceHistory: {
          orderBy: { changedAt: 'desc' },
          take: 1, // Only get the most recent price history record
        },
      },
    }),
    prisma.listing.count({
      where: whereClause,
    }),
    prisma.listing.findMany({
      select: { city: true },
      distinct: ['city'],
      where: {
        city: {
          gt: '', // Filter out null and empty strings
        },
      },
      orderBy: {
        city: 'asc',
      },
    }),
  ]);

  const cities = distinctCities.map((c) => c.city!);

  const totalPages = Math.ceil(totalCount / pageSize);

  const cityParam = currentCity ? `&city=${currentCity}` : '';
  const dealParam = currentDeals ? `&deals=true` : '';

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
                {currentCity ? ` in ${currentCity}` : ''}.
              </p>
            </div>

            {/* Navigation Tabs - Switching tabs resets to page 1 */}
            <div className="flex bg-gray-200 p-1 rounded-lg">
              <Link
                href={`/?type=sale${cityParam}${dealParam}`}
                className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentType === 'sale'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                For Sale
              </Link>
              <Link
                href={`/?type=rent${cityParam}${dealParam}`}
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

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-8">
          {/* Deals Filter Button */}
          <Link
            href={`/?type=${currentType}${cityParam}${currentDeals ? '' : '&deals=true'}`}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${
              currentDeals
                ? 'bg-red-600 text-white shadow-sm border border-red-600'
                : 'bg-white text-red-600 border border-red-200 hover:bg-red-50'
            }`}
          >
            🔥 Deals Only
          </Link>
          
          <div className="w-px h-6 bg-gray-300 mx-1"></div> {/* Divider */}

          {/* City Filter Buttons */}
          <Link
            href={`/?type=${currentType}${dealParam}`}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              !currentCity
                ? 'bg-gray-900 text-white shadow-sm'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
            }`}
          >
            All Cities
          </Link>
          {cities.map((city) => (
            <Link
              key={city}
              href={`/?type=${currentType}&city=${city}${dealParam}`}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                currentCity === city
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
              }`}
            >
              {city}
            </Link>
          ))}
        </div>

        {listings.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500">No {currentType} listings found on this page.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
              {listings.map((item: ListingWithHistory) => {
                const latestHistory = item.priceHistory?.[0];
                const isDiscount =
                  latestHistory &&
                  (latestHistory.oldPrice ?? 0) > (latestHistory.newPrice ?? 0);

                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow relative"
                  >
                    {isDiscount && (
                      <span className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md z-10">
                        PRICE DROP
                      </span>
                    )}

                    <div>
                      {/* Thumbnail Image */}
                      <div className="h-48 w-full bg-gray-100 relative overflow-hidden">
                        {item.imageUrl ? (
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
                                ? `${item.price.toLocaleString()} ${item.currency || 'EUR'}`
                                : 'N/A'}
                            </span>
                            {isDiscount && (
                              <span className="text-sm line-through text-gray-400 ml-2">
                                {latestHistory.oldPrice?.toLocaleString()}{' '}
                                {item.currency || 'EUR'}
                              </span>
                            )}
                          </div>
                          {item.pricePerSqm && (
                            <span className="text-xs text-gray-500 font-medium">
                              {item.pricePerSqm} €/m²
                            </span>
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
                            📍 {item.district ? item.district : 'Location on request'}
                          </p>
                          {item.surfaceSqm && <p>📐 {item.surfaceSqm} m²</p>}
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
                    href={`/?type=${currentType}&page=${currentPage - 1}${cityParam}${dealParam}`}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <button disabled className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-400 bg-gray-50 cursor-not-allowed">
                    ← Previous
                  </button>
                )}

                <span className="text-sm text-gray-600 font-medium">
                  Page {currentPage} of {totalPages}
                </span>

                {currentPage < totalPages ? (
                  <Link
                    href={`/?type=${currentType}&page=${currentPage + 1}${cityParam}${dealParam}`}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                  >
                    Next →
                  </Link>
                ) : (
                  <button disabled className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-400 bg-gray-50 cursor-not-allowed">
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