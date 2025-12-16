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
import { buildFilterInput } from '@modules/storefront/products.helper';
import { createModuleLogger } from '@shared/utils/logger.util';
import { formatFilters } from '@shared/storefront/filter-format.helper';
import {
  getActiveFilterConfig,
  applyFilterConfigToInput,
  formatFilterConfigForStorefront,
} from '@shared/storefront/filter-config.helper';

const logger = createModuleLogger('ProductFiltersRoute');

export const middleware = [validateShopDomain(), rateLimit()];

export const GET = handler(async (req: HttpRequest) => {
  // Shop is already validated and normalized by validation middleware
  const shopParam = req.query.shop as string;

  // Build filter input from request query parameters
  let filterInput = buildFilterInput(req.query);

  logger.log(`Fetching storefront filters for shop=${shopParam}`, filterInput ? `with filters=${JSON.stringify(filterInput)}` : '');

  // Get services from request (injected by bootstrap/factory)
  const productsService = (req as any).productsService;
  const filtersRepository = (req as any).filtersRepository;

  if (!productsService) {
    logger.error('Products service not available');
    throw new Error('Products service not available');
  }

  // Get active filter configuration with collection priority
  let filterConfig = null;
  if (filtersRepository) {
    // Extract collection ID from query params or filter input for priority matching
    const collectionId = (req.query.collection as string) || filterInput?.collections?.[0];
    // Extract cpid (collection page ID) for cache key generation
    const cpid = typeof req.query.cpid === 'string' ? req.query.cpid.trim() : filterInput?.cpid;
    filterConfig = await getActiveFilterConfig(filtersRepository, shopParam, collectionId, cpid);

    if (filterConfig) {
      logger.log('Active filter configuration found', {
        shop: shopParam,
        filterId: filterConfig.id,
        title: filterConfig.title,
        filterType: filterConfig.filterType,
        collectionId: collectionId || 'none',
        optionsCount: filterConfig.options?.length || 0,
        publishedOptionsCount: filterConfig.options?.filter(o => o.status === 'PUBLISHED').length || 0,
      });

      // Apply filter configuration to filter input
      if (filterInput) {
        const collection = filterInput.collections?.[0];
        filterInput = applyFilterConfigToInput(filterConfig, filterInput, collection);
      }
    } else {
      logger.log('No active filter configuration found for shop', { shop: shopParam });
    }
  } else {
    logger.warn('Filters repository not available', { shop: shopParam });
  }

  // Get raw aggregations from repository (not formatted yet)
  // We need FacetAggregations (raw ES format) to pass to formatFilters
  // This allows formatFilters to apply filterConfig settings (position sorting, targetScope filtering, etc.)
  // For REST endpoint, we want ALL aggregations regardless of filterConfig (unlike GraphQL which respects filterConfig)
  // Pass null as filterConfig to getRawAggregations to ensure all aggregations are included
  const aggregations = await productsService.getRawAggregations(
    shopParam,
    filterInput,
    null // Pass null to get all aggregations for REST endpoint
  );

  logger.debug('Raw aggregations from repository', {
    shop: shopParam,
    hasVendors: !!aggregations?.vendors?.buckets?.length,
    hasProductTypes: !!aggregations?.productTypes?.buckets?.length,
    hasTags: !!aggregations?.tags?.buckets?.length,
    hasCollections: !!aggregations?.collections?.buckets?.length,
    hasOptionPairs: !!aggregations?.optionPairs?.buckets?.length,
    hasPriceRange: !!aggregations?.priceRange,
    vendorsBucketCount: aggregations?.vendors?.buckets?.length || 0,
    productTypesBucketCount: aggregations?.productTypes?.buckets?.length || 0,
    tagsBucketCount: aggregations?.tags?.buckets?.length || 0,
    collectionsBucketCount: aggregations?.collections?.buckets?.length || 0,
    optionPairsBucketCount: aggregations?.optionPairs?.buckets?.length || 0,
  });

  // Format filters with filterConfig settings applied (position sorting, targetScope filtering, etc.)
  // This pre-compiles filters on server-side for optimal performance
  // formatFilters expects FacetAggregations (raw ES format), not ProductFilters
  // For REST endpoint, pass null as filterConfig to formatFilters to get ALL filters (not just configured ones)
  const formattedFilters = formatFilters(aggregations, filterConfig)


  logger.debug('Formatted filters', {
    shop: shopParam,
    filterCount: formattedFilters.length,
    optionFilters: formattedFilters.filter((filter) => filter.type === 'option').length,
    standardFilters: formattedFilters.filter((filter) => filter.type !== 'option').length,
  });

  // Return response with filter configuration (for storefront script)
  // Remove empty values from appliedFilters as well
  // Also remove internal __handleMapping metadata (not needed by frontend)
  let cleanedAppliedFilters: any = undefined;
  if (filterInput && Object.keys(filterInput).length > 0) {
    cleanedAppliedFilters = { ...filterInput };
    // Remove internal metadata that shouldn't be sent to frontend
    delete (cleanedAppliedFilters as any).__handleMapping;
  }

  return {
    success: true,
    data: {
      // filterConfig: filterConfig ? formatFilterConfigForStorefront(filterConfig) : null, // --> REMOVED (to save payload size)
      filters: formattedFilters, // Pre-compiled filter aggregations (facets) with settings applied
      appliedFilters: cleanedAppliedFilters,
    }
  };
});
