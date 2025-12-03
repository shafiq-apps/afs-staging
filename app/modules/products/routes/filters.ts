/**
 * Storefront Filters Route
 * GET /storefront/filters
 * 
 * Returns filter configuration and aggregations (facets) for products
 * Accepts the same filter parameters as the products endpoint
 * Includes filter configuration needed by storefront script
 * 
 * @example
 * GET /storefront/filters?shop=shop.myshopify.com
 * GET /storefront/filters?shop=shop.myshopify.com&vendor=Nike&productType=Jacket
 */

import { handler } from '@core/http/http.handler';
import { HttpRequest } from '@core/http/http.types';
import { validateShopDomain } from '@core/http/validation.middleware';
import { rateLimit } from '@core/security/rate-limit.middleware';
import { buildFilterInput } from '@modules/products/products.helper';
import { createModuleLogger } from '@shared/utils/logger.util';
import {
  getActiveFilterConfig,
  applyFilterConfigToInput,
  formatFilterConfigForStorefront,
} from '@modules/products/products.filter-config.helper';

const logger = createModuleLogger('ProductFiltersRoute');

export const middleware = [validateShopDomain(), rateLimit()];

export const GET = handler(async (req: HttpRequest) => {
  // Shop is already validated and normalized by validation middleware
  const shopParam = req.query.shop as string;

  // Build filter input from request query parameters
  let filterInput = buildFilterInput(req.query);

  logger.log(`Fetching storefront filters for shop=${shopParam}`, filterInput ? `with filters=${JSON.stringify(filterInput)}` : '');

  // Get products service from request (injected by bootstrap/factory)
  const productsService = (req as any).productsService;
  const filtersRepository = (req as any).filtersRepository;

  if (!productsService) {
    logger.error('Products service not available');
    throw new Error('Products service not available');
  }

  // Get active filter configuration
  let filterConfig = null;
  if (filtersRepository) {
    filterConfig = await getActiveFilterConfig(filtersRepository, shopParam);
    
    // Apply filter configuration to filter input
    if (filterConfig && filterInput) {
      const collection = filterInput.collections?.[0];
      filterInput = applyFilterConfigToInput(filterConfig, filterInput, collection);
    }
  }

  // Get filters (aggregations) from service
  // Pass filterConfig to only calculate aggregations for enabled options
  const filters = await productsService.getFilters(shopParam, filterInput, filterConfig);

  // Return response with filter configuration (for storefront script)
  return {
    success: true,
    data: {
      filterConfig: filterConfig ? formatFilterConfigForStorefront(filterConfig) : null,
      filters: filters, // Filter aggregations (facets)
      appliedFilters: filterInput ?? {},
    }
  };
});
