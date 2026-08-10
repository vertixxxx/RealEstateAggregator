import { prisma } from '@/lib/prisma';
import { Listing } from '@prisma/client';
import Link from 'next/link';

export const revalidate = 0;

export default async function HomePage(props: {
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const searchParams = await props.searchParams;
  
  // URL Parameters setup
  const currentType = searchParams?.type || 'sale';
  const currentPage = Number(searchParams?.page) || 1;
  const pageSize = 50;

  // Filter based on price
  const priceFilter = currentType === 'rent' ? { lt: 5000 } : { gte: 5000 };
  const whereClause = { price: priceFilter };

  // Fetch listings and total count in parallel for maximum speed
  const [listings, totalCount] = await Promise.all([
    prisma.listing.findMany({
      where: whereClause,
      orderBy: { firstSeenAt: 'desc' },
      take: pageSize,
      skip: (currentPage - 1) * pageSize, // Skip the records from previous pages
    }),
    prisma.listing.count({
      where: whereClause,
    })
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                ImoPont
              </h1>
              <p className="text-gray-600 mt-1">
                Showing {listings.length} of {totalCount} {currentType === 'rent' ? 'rentals' : 'properties for sale'}.
              </p>
            </div>

            {/* Navigation Tabs - Switching tabs resets to page 1 */}
            <div className="flex bg-gray-200 p-1 rounded-lg">
              <Link
                href="/?type=sale"
                className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                  currentType === 'sale'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                For Sale
              </Link>
              <Link
                href="/?type=rent"
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

        {listings.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-lg border border-gray-200">
            <p className="text-gray-500">No {currentType} listings found on this page.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
              {listings.map((item: Listing) => (
                <div
                  key={item.id}
                  className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow"
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-xs font-semibold uppercase tracking-wider bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
                        {item.city || 'Romania'}
                      </span>
                      <div className="text-right">
                        <span className="text-xl font-bold text-emerald-600 block">
                          {item.price ? `${item.price} ${item.currency || 'EUR'}` : 'N/A'}
                        </span>
                        {item.pricePerSqm && (
                          <span className="text-xs text-gray-500 font-medium">
                            {item.pricePerSqm} €/m²
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <h2 className="font-semibold text-gray-800 line-clamp-2 mb-2" title={item.title}>
                      {item.title}
                    </h2>
                    
                    <div className="text-sm text-gray-500 mb-4 flex flex-col gap-1">
                      <p>📍 {item.district ? item.district : 'Location on request'}</p>
                      {item.surfaceSqm && <p>📐 {item.surfaceSqm} m²</p>}
                    </div>
                  </div>

                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-center w-full py-2 mt-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      View Original Listing ↗
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-6 border-t border-gray-200">
                {currentPage > 1 ? (
                  <Link
                    href={`/?type=${currentType}&page=${currentPage - 1}`}
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
                    href={`/?type=${currentType}&page=${currentPage + 1}`}
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