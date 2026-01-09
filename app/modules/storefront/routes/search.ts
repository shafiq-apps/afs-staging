/**
 * Storefront Search Route
 * GET /storefront/search
 * 
 * Advanced search endpoint with modern features:
 * - Autocomplete / Predictive Suggestions
 * - Synonyms & Typo Tolerance
 * - Natural Language / Semantic Search
 * - Faceted / Filtered Search
 * - Zero-Results Handling
 * 
 * @example
 * GET /storefront/search?shop=shop.myshopify.com&q=nike shoes
 * GET /storefront/search?shop=shop.myshopify.com&q=nike&autocomplete=true&suggestions=true
 * GET /storefront/search?shop=shop.myshopify.com&q=nike&semanticSearch=true&includeFacets=true
 */

import { handler } from '@core/http/http.handler';
import { HttpRequest } from '@core/http/http.types';
import { validateShopDomain } from '@core/http/validation.middleware';
import { rateLimit } from '@core/security/rate-limit.middleware';
import { buildSearchInput, hasSearchParams } from '@modules/storefront/search.helper';
import { createModuleLogger } from '@shared/utils/logger.util';
import { formatFilters } from '@shared/storefront/filter-format.helper';
import {
  getActiveFilterConfig,
  applyFilterConfigToInput,
} from '@shared/storefront/filter-config.helper';
import { RATE_LIMIT } from '@shared/constants/app.constant';

const logger = createModuleLogger('StorefrontSearchRoute');

export const middleware = [
  validateShopDomain(),
  rateLimit({
    max: RATE_LIMIT.STOREFRONT_SEARCH.MAX,
    windowMs: RATE_LIMIT.STOREFRONT_SEARCH.BUCKET_DURATION_MS,
    message: "Too many storefront search requests"
  })
];

export const GET = handler(async (req: HttpRequest) => {
  // Shop is already validated and normalized by validation middleware
  const shopParam = req.query.shop as string;

  // Build search input from request query parameters
  const searchInput = buildSearchInput(req.query);

  logger.info(`Processing search request for shop=${shopParam}`, {
    hasQuery: !!searchInput.search,
    autocomplete: searchInput.autocomplete,
    suggestions: searchInput.suggestions,
    semanticSearch: searchInput.semanticSearch,
    includeFacets: searchInput.includeFacets,
  });

  // Get services from request (injected by bootstrap/factory)
  const productsService = (req as any).productsService;
  const filtersRepository = (req as any).filtersRepository;

  if (!productsService) {
    logger.error('Products service not available');
    throw new Error('Products service not available');
  }

  // Validate that we have a search query
  if (!searchInput.search && !hasSearchParams(searchInput)) {
    return {
      success: true,
      data: {
        products: [],
        suggestions: [],
        pagination: {
          total: 0,
          page: 1,
          limit: searchInput.limit || 20,
          totalPages: 0,
        },
        zeroResults: true,
        message: 'Please provide a search query (q, query, or search parameter)',
      },
    };
  }

  // Get active filter configuration
  let filterConfig = null;
  if (filtersRepository) {
    const collectionId = (req.query.collection as string) || searchInput?.collections?.[0];
    const cpid = typeof req.query.cpid === 'string' ? req.query.cpid.trim() : searchInput?.cpid;
    filterConfig = await getActiveFilterConfig(filtersRepository, shopParam, collectionId, cpid);

    if (filterConfig) {
      logger.info('Active filter configuration found', {
        shop: shopParam,
        filterId: filterConfig.id,
        title: filterConfig.title,
      });

      // Apply filter configuration to search input
      if (searchInput) {
        const collection = searchInput.collections?.[0];
        const appliedInput = applyFilterConfigToInput(filterConfig, searchInput, collection);
        // Merge applied input back to searchInput
        Object.assign(searchInput, appliedInput);
      }
    }
  }

  // Perform advanced search with autocomplete and typo tolerance
  let result;
  if (searchInput.search) {
    // Use advanced search with autocomplete and typo tolerance
    // This method already returns only: id, title, imageUrl, vendor, productType, tags, minPrice, maxPrice
    result = await (productsService as any).searchProductsWithAutocomplete(
      shopParam,
      searchInput.search,
      searchInput,
      filterConfig
    );
  } else {
    // Fallback to regular search if no query provided
    result = await productsService.searchProducts(shopParam, searchInput, filterConfig);
    
    // Filter to only return specified fields
    result.products = result.products.map((product: any) => ({
      id: product.id,
      title: product.title,
      imageUrl: product.imageUrl || product.image,
      vendor: product.vendor,
      productType: product.productType,
      tags: product.tags || [],
      minPrice: product.minPrice,
      maxPrice: product.maxPrice,
    }));
  }

  // Handle zero results with suggestions
  let suggestions: string[] = [];
  let alternativeQueries: string[] = [];
  let zeroResults = false;

  if (result.total === 0) {
    zeroResults = true;
    
    if (searchInput.handleZeroResults !== false) {
      logger.info('Zero results found, generating suggestions', { query: searchInput.search });

      // Generate suggestions based on actual ES product data
      // Get both product title suggestions and "Did you mean" suggestions
      if (searchInput.search) {
        try {
          // Get product title suggestions (e.g., "Sheep" → "Sheepskin products")
          const titleSuggestions = await (productsService as any).getSearchSuggestions(
            shopParam,
            searchInput.search,
            5 // Get at least 5 suggestions
          );
          
          // Get "Did you mean" suggestions (similar queries that would return results)
          const didYouMeanSuggestions = await (productsService as any).getDidYouMeanSuggestions(
            shopParam,
            searchInput.search,
            3 // Get up to 3 "did you mean" suggestions
          );
          
          // Combine suggestions
          suggestions = [...titleSuggestions];
          
          // Add "Did you mean" suggestions if we have them
          if (didYouMeanSuggestions && didYouMeanSuggestions.length > 0) {
            // Store separately for "did you mean" display
            alternativeQueries = didYouMeanSuggestions;
          }
          
          // Also add cleaned query if different
          const cleanedQuery = searchInput.search.replace(/[^\w\s]/g, '');
          if (cleanedQuery !== searchInput.search && !suggestions.includes(cleanedQuery)) {
            alternativeQueries.push(cleanedQuery);
          }
        } catch (suggestError: any) {
          logger.debug('Failed to get ES suggestions for zero results', { error: suggestError?.message });
          // Don't show fake suggestions
          suggestions = [];
        }
      }
    }
  }

  // Get suggestions if requested - based on actual ES product data
  if (searchInput.suggestions && searchInput.search && result.total > 0) {
    try {
      // Get actual suggestions from Elasticsearch based on product titles
      const suggestResponse = await (productsService as any).getSearchSuggestions(
        shopParam,
        searchInput.search,
        5 // Get at least 5 suggestions
      );
      
      if (suggestResponse && suggestResponse.length > 0) {
        suggestions = suggestResponse;
      }
    } catch (suggestError: any) {
      logger.debug('Failed to get ES suggestions', { error: suggestError?.message });
      // Fallback: don't show fake suggestions
      suggestions = [];
    }
  }

  // Get facets if requested
  let formattedFilters: any[] = [];
  if (searchInput.includeFacets && filtersRepository) {
    const aggregations = await productsService.getRawAggregations(
      shopParam,
      searchInput,
      filterConfig
    );

    if (aggregations) {
      formattedFilters = formatFilters(aggregations, filterConfig);
      
      // Limit facets if specified
      if (searchInput.facetLimit) {
        formattedFilters = formattedFilters.slice(0, searchInput.facetLimit);
      }
    }
  }

  // Build response with only relevant fields
  // Products are already filtered to: id, title, imageUrl, vendor, productType, tags, minPrice, maxPrice
  const responseBody: any = {
    success: true,
    data: {
      products: result.products.map((product: any) => ({
        id: product.id,
        title: product.title,
        image: product.imageUrl, // Map imageUrl to image for frontend
        vendor: product.vendor,
        productType: product.productType,
        tags: product.tags,
        minPrice: product.minPrice,
        maxPrice: product.maxPrice,
      })),
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    },
  };

  // Add search-specific features
  if (suggestions.length > 0) {
    responseBody.data.suggestions = suggestions;
  }

  if (zeroResults) {
    responseBody.data.zeroResults = true;
    if (alternativeQueries.length > 0) {
      responseBody.data.alternativeQueries = alternativeQueries;
      responseBody.data.didYouMean = alternativeQueries[0]; // Primary "Did you mean" suggestion
    }
    responseBody.data.message = 'No products found. Try adjusting your search terms.';
  }

  if (formattedFilters.length > 0) {
    responseBody.data.facets = formattedFilters;
  }

  // Include search metadata
  responseBody.data.searchMetadata = {
    query: searchInput.search,
    autocomplete: searchInput.autocomplete || false,
    semanticSearch: searchInput.semanticSearch || false,
    typoTolerance: searchInput.typoTolerance !== false,
    synonymsEnabled: searchInput.enableSynonyms !== false,
  };

  // Add query correction information (like Google's "Showing results for...")
  if (result.correctedQuery && result.originalQuery) {
    responseBody.data.queryCorrection = {
      original: result.originalQuery,
      corrected: result.correctedQuery,
      message: `Showing results for "${result.correctedQuery}" instead of "${result.originalQuery}"`,
    };
  }

  logger.info('Search completed', {
    shop: shopParam,
    total: result.total,
    zeroResults,
    hasSuggestions: suggestions.length > 0,
    hasFacets: formattedFilters.length > 0,
  });

  return responseBody;
});

