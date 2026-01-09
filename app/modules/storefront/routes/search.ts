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

  // ULTRA-FAST: Use msearch to combine all queries in single request
  // This is inspired by filters endpoint which uses msearch for parallel queries
  let result: any;
  let suggestions: string[] = [];
  let alternativeQueries: string[] | undefined;
  let formattedFilters: any[] = [];
  
  if (searchInput.search) {
    // Use msearch approach for maximum speed
    const needsSuggestions = (searchInput.suggestions && searchInput.search) || 
                            (searchInput.handleZeroResults !== false);
    const needsFacets = searchInput.includeFacets && filtersRepository;
    
    try {
      // Use msearch method from repository
      const msearchResult = await (productsService as any).repo.searchProductsWithMsearch(
        shopParam,
        searchInput.search,
        searchInput,
        filterConfig,
        {
          includeSuggestions: needsSuggestions,
          includeFacets: needsFacets,
          suggestionLimit: 5,
        }
      );
      
      result = msearchResult.result;
      suggestions = msearchResult.suggestions || [];
      
      // Format facets if we got them
      if (msearchResult.facets && filterConfig) {
        // formatFilters expects FacetAggregations directly
        formattedFilters = formatFilters(msearchResult.facets as any, filterConfig);
        if (searchInput.facetLimit) {
          formattedFilters = formattedFilters.slice(0, searchInput.facetLimit);
        }
      }
      
      // Handle zero results "did you mean" suggestions (only if zero results)
      if (result.total === 0 && searchInput.handleZeroResults !== false && searchInput.search) {
        try {
          const didYouMeanSuggestions = await (productsService as any).getDidYouMeanSuggestions(
            shopParam,
            searchInput.search,
            3
          );
          if (didYouMeanSuggestions && didYouMeanSuggestions.length > 0) {
            alternativeQueries = didYouMeanSuggestions;
          }
        } catch (error: any) {
          logger.debug('Failed to get did you mean suggestions', { error: error?.message });
        }
      }
    } catch (msearchError: any) {
      // Fallback to regular search if msearch fails
      logger.debug('msearch failed, falling back to regular search', { error: msearchError?.message });
      result = await (productsService as any).searchProductsWithAutocomplete(
        shopParam,
        searchInput.search,
        searchInput,
        filterConfig
      );
      
      // Fallback to parallel approach for suggestions/facets
      const zeroResults = result.total === 0;
      const needsSuggestions = (zeroResults && searchInput.handleZeroResults !== false) || 
                              (searchInput.suggestions && result.total > 0);
      const needsFacets = searchInput.includeFacets && filtersRepository;
      
      const [suggestionsData, facetsData] = await Promise.all([
        needsSuggestions ? (async () => {
          try {
            if (zeroResults && searchInput.handleZeroResults !== false) {
              const [titleSuggestions, didYouMeanSuggestions] = await Promise.all([
                (productsService as any).getSearchSuggestions(shopParam, searchInput.search!, 5),
                (productsService as any).getDidYouMeanSuggestions(shopParam, searchInput.search!, 3)
              ]);
              const cleanedQuery = searchInput.search!.replace(/[^\w\s]/g, '');
              const altQueries = [
                ...(didYouMeanSuggestions || []),
                ...(cleanedQuery !== searchInput.search && !titleSuggestions.includes(cleanedQuery) ? [cleanedQuery] : [])
              ];
              return {
                suggestions: titleSuggestions || [],
                alternativeQueries: altQueries.length > 0 ? altQueries : undefined
              };
            } else if (searchInput.suggestions && result.total > 0) {
              const suggestResponse = await (productsService as any).getSearchSuggestions(
                shopParam,
                searchInput.search!,
                5
              );
              return {
                suggestions: suggestResponse || [],
                alternativeQueries: undefined
              };
            }
          } catch (suggestError: any) {
            logger.debug('Failed to get ES suggestions', { error: suggestError?.message });
            return { suggestions: [], alternativeQueries: undefined };
          }
          return { suggestions: [], alternativeQueries: undefined };
        })() : Promise.resolve({ suggestions: [], alternativeQueries: undefined }),
        
        needsFacets ? (async () => {
          try {
            const aggregations = await productsService.getRawAggregations(
              shopParam,
              searchInput,
              filterConfig
            );
            if (aggregations) {
              const formatted = formatFilters(aggregations, filterConfig);
              return searchInput.facetLimit 
                ? formatted.slice(0, searchInput.facetLimit)
                : formatted;
            }
          } catch (facetError: any) {
            logger.debug('Failed to get facets', { error: facetError?.message });
          }
          return [];
        })() : Promise.resolve([])
      ]);
      
      suggestions = suggestionsData.suggestions;
      alternativeQueries = suggestionsData.alternativeQueries;
      formattedFilters = facetsData;
    }
  } else {
    // Fallback to regular search (no search query)
    result = await productsService.searchProducts(shopParam, searchInput, filterConfig);
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
  
  const zeroResults = result.total === 0;

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
    if (alternativeQueries && alternativeQueries.length > 0) {
      responseBody.data.alternativeQueries = alternativeQueries;
      responseBody.data.didYouMean = alternativeQueries[0]; // Primary "Did you mean" suggestion
    }
    responseBody.data.message = 'No products found. Try adjusting your search terms.';
  }

  if (formattedFilters.length > 0) {
    responseBody.data.facets = formattedFilters;
  }

  // Include search metadata
  // Note: semanticSearch is currently not implemented (no actual semantic search logic)
  responseBody.data.searchMetadata = {
    query: searchInput.search,
    autocomplete: searchInput.autocomplete || false,
    semanticSearch: false, // Not implemented yet
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

