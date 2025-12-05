/**
 * Product Search Route
 * GET /storefront/products
 * Returns products with filter configuration for storefront script
 */

import { handler } from '@core/http/http.handler';
import { HttpRequest } from '@core/http/http.types';
import { validateShopDomain } from '@core/http/validation.middleware';
import { rateLimit } from '@core/security/rate-limit.middleware';
import { buildSearchInput } from '@modules/products/products.helper';
import { formatFilters } from '@shared/storefront/filter-format.helper';
import {
  getActiveFilterConfig,
  applyFilterConfigToInput,
  formatFilterConfigForStorefront,
} from '@shared/storefront/filter-config.helper';

export const middleware = [validateShopDomain(), rateLimit()];

export const GET = handler(async (req: HttpRequest) => {
  const shop = req.query.shop as string;
  let searchInput = buildSearchInput(req.query);

  const productsService = (req as any).productsService;
  const filtersRepository = (req as any).filtersRepository;

  if (!productsService) {
    throw new Error('Products service not available');
  }

  // Get active filter configuration
  let filterConfig = null;
  if (filtersRepository) {
    filterConfig = await getActiveFilterConfig(filtersRepository, shop);
    
    // Apply filter configuration to search input
    if (filterConfig) {
      const collection = searchInput.collections?.[0];
      searchInput = applyFilterConfigToInput(filterConfig, searchInput, collection);
    }
  }

  // Pass filterConfig to only calculate aggregations for enabled options
  const result = await productsService.searchProducts(shop, searchInput, filterConfig);

  // Format filters with filterConfig settings applied (position sorting, targetScope filtering, etc.)
  // This pre-compiles filters on server-side for optimal performance
  const formattedFilters = result.filters ? formatFilters(result.filters, filterConfig) : [];

  // Remove empty values from appliedFilters
  const cleanedAppliedFilters = Object.keys(searchInput || {}).length > 0 ? searchInput : undefined;

  const responseBody: any = {
    success: true,
    data: {
      products: result.products,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
      appliedFilters: cleanedAppliedFilters,
    },
  };

  // Only include filters if they exist and have data
  if (formattedFilters.length > 0) {
    responseBody.data.filters = formattedFilters;
  }

  // Include filter configuration for storefront script
  if (filterConfig) {
    responseBody.data.filterConfig = formatFilterConfigForStorefront(filterConfig);
  }

  return responseBody;
});

