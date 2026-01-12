/**
 * Storefront Search Route
 * GET /storefront/search
 * 
 * Fast search endpoint with modern features:
 * - Autocomplete / Predictive Suggestions
 * - Synonyms & Typo Tolerance
 * - Natural Language / Semantic Search
 * - Zero-Results Handling
 * 
 * @example
 * GET /storefront/search?shop=shop.myshopify.com&q=nike shoes
 * GET /storefront/search?shop=shop.myshopify.com&q=nike&autocomplete=true&suggestions=true
 * GET /storefront/search?shop=shop.myshopify.com&q=nike&semanticSearch=true
 */

import { handler } from '@core/http/http.handler';
import { HttpRequest } from '@core/http/http.types';
import { validateShopDomain } from '@core/http/validation.middleware';
import { rateLimit } from '@core/security/rate-limit.middleware';
import { buildSearchInput, hasSearchParams } from '@modules/storefront/search.helper';
import { createModuleLogger } from '@shared/utils/logger.util';
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
  });

  // Get services from request (injected by bootstrap/factory)
  const productsService = (req as any).productsService;

  if (!productsService) {
    logger.error('Products service not available');
    throw new Error('Products service not available');
  }

  // ULTRA-SIMPLE: Only search query, NO filters, NO other processing
  if (!searchInput.search || !searchInput.search.trim()) {
    return {
      success: true,
      data: {
        products: [],
        pagination: {
          total: 0,
          page: 1,
          limit: searchInput.limit || 10,
          totalPages: 0,
        },
        zeroResults: true,
        message: 'Please provide a search query (q parameter)',
      },
    };
  }

  // Only fetch suggestions if explicitly requested
  const needsSuggestions = searchInput.suggestions === true;
  const limit = Math.min(searchInput.limit || 10, 10);
  
  // Use simple search method with caching - uses cached search config
  const msearchResult = await productsService.searchProductsSimple(
    shopParam,
    searchInput.search,
    limit,
    {
      includeSuggestions: needsSuggestions,
      suggestionLimit: 5,
    }
  );
  
  const result = msearchResult.result;
  const suggestions = msearchResult.suggestions || [];
  
  const zeroResults = result.total === 0;

  // Build response with only relevant fields
  // Products are already filtered to: id, title, imageUrl, vendor, productType, tags, minPrice, maxPrice
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
    },
  };

  // Add search-specific features
  if (suggestions.length > 0) {
    responseBody.data.suggestions = suggestions;
  }

  if (result.total === 0) {
    responseBody.data.zeroResults = true;
    responseBody.data.message = 'No products found. Try adjusting your search terms.';
  }

  logger.info('Search completed', {
    shop: shopParam,
    total: result.total,
    hasSuggestions: suggestions.length > 0,
  });

  return responseBody;
});

