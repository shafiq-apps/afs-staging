/**
 * Products GraphQL Resolvers
 * Custom resolvers for product queries with aggregations and filters
 * Uses the existing products repository for business logic
 */

import { GraphQLContext } from '../graphql.type';
import { StorefrontSearchRepository } from '@shared/storefront/repository';
import { StorefrontSearchService } from '@shared/storefront/service';
import { PRODUCT_INDEX_NAME } from '@shared/constants/products.constants';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('products-resolvers');

// Initialize repository and service
let productsRepo: StorefrontSearchRepository | null = null;
let productsSvc: StorefrontSearchService | null = null;

function getESClient(context: GraphQLContext): any {
  // Get ES client from request (injected by bootstrap)
  const esClient = (context.req as any).esClient;
  if (!esClient) {
    logger.error('ES client not found in context.req', {
      reqKeys: Object.keys(context.req || {}),
      hasReq: !!context.req,
    });
    throw new Error('ES client not available in context. Make sure it is injected in bootstrap.');
  }
  return esClient;
}

function getProductsService(context: GraphQLContext): StorefrontSearchService {
  const esClient = getESClient(context);
  if (!esClient) {
    throw new Error('ES client not available in context');
  }
  
  if (!productsRepo) {
    productsRepo = new StorefrontSearchRepository(esClient);
  }
  if (!productsSvc) {
    productsSvc = new StorefrontSearchService(productsRepo);
  }
  return productsSvc;
}

/**
 * Encode cursor from offset
 */
function encodeCursor(offset: number): string {
  return Buffer.from(offset.toString()).toString('base64');
}

/**
 * Decode cursor to offset
 */
function decodeCursor(cursor: string): number {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    return parseInt(decoded, 10);
  } catch {
    return 0;
  }
}

export const productsResolvers = {
  Query: {
    /**
     * Get product by ID
     */
    async product(parent: any, args: { shop: string; id: string }, context: GraphQLContext) {
      try {
        const { shop, id } = args;
        if (!shop || !id) {
          throw new Error('Shop and ID are required');
        }

        // Get product directly from ES using products repository
        const esClient = getESClient(context);
        if (!esClient) {
          throw new Error('ES client not available in context');
        }

        const indexName = PRODUCT_INDEX_NAME(shop);
        
        try {
          const response = await esClient.get({
            index: indexName,
            id,
          });
          
          if (response.found && response._source) {
            return response._source;
          }
          
          return null;
        } catch (error: any) {
          if (error.statusCode === 404) {
            return null;
          }
          throw error;
        }
      } catch (error: any) {
        logger.error('Error in product resolver', {
          error: error?.message || error,
          args,
        });
        throw error;
      }
    },

    /**
     * Get products with filters and cursor-based pagination
     */
    async products(
      parent: any,
      args: { shop: string; filters?: any },
      context: GraphQLContext
    ) {
      try {
        const { shop, filters } = args;
        if (!shop) {
          throw new Error('Shop is required');
        }

        logger.log('🔵 Products query received', {
          shop,
          hasFilters: !!filters,
          filters: filters || {},
        });

        const service = getProductsService(context);
        
        // Convert cursor to page for backward compatibility with repository
        // Enforce maximum limit of 500
        const MAX_LIMIT = 500;
        const requestedLimit = filters?.limit || 20;
        const limit = Math.min(requestedLimit, MAX_LIMIT);
        
        if (requestedLimit > MAX_LIMIT) {
          logger.warn('⚠️ Requested limit exceeds maximum', {
            requested: requestedLimit,
            max: MAX_LIMIT,
            using: limit,
          });
        }
        
        let page = 1;
        let offset = 0;
        
        if (filters?.cursor) {
          offset = decodeCursor(filters.cursor);
          page = Math.floor(offset / limit) + 1;
        }
        
        // Create filters with page/limit for repository
        // For GraphQL, we want all fields available (GraphQL handles field selection)
        // So we pass all available fields if no fields are specified
        const repositoryFilters: any = filters ? {
          ...filters,
          page,
          limit,
        } : {
          page,
          limit,
        };
        if (repositoryFilters.cursor) {
          delete repositoryFilters.cursor; // Remove cursor from filters
        }
        
        // For GraphQL, we want all fields available (GraphQL handles field selection natively)
        // So we pass all available fields if no fields are specified
        // This ensures all requested GraphQL fields are returned
        if (!repositoryFilters.fields) {
          // Include all available product fields so GraphQL can select what it needs
          repositoryFilters.fields = [
            'id', 'productId', 'title', 'handle', 'status', 'tags', 'productType', 'vendor',
            'category', 'createdAt', 'updatedAt', 'publishedAt', 'totalInventory',
            'variantsCount', 'priceRangeV2', 'options', 'collections', 'collectionSortOrder',
            'bestSellerRank', 'variants', 'metafields', 'media', 'imageUrl', 'imagesUrls',
            'minPrice', 'maxPrice'
          ].join(',');
        }
        
        logger.log('Calling service.searchProducts', {
          shop,
          repositoryFilters,
          includeFilters: repositoryFilters.includeFilters,
        });
        
        const result = await service.searchProducts(shop, repositoryFilters);
        
        logger.log('Service returned results', {
          shop,
          productCount: result.products?.length || 0,
          total: result.total || 0,
          page: result.page || 0,
          hasFiltersInResult: !!result.filters,
          includeFiltersRequested: filters?.includeFilters,
        });
        
        // Calculate cursor-based pagination
        const currentOffset = (page - 1) * limit;
        const nextOffset = currentOffset + result.products.length;
        const prevOffset = currentOffset - limit;
        
        const hasNextPage = nextOffset < result.total;
        const nextCursor = hasNextPage ? encodeCursor(nextOffset) : null;
        const prevCursor = currentOffset > 0 ? encodeCursor(Math.max(0, prevOffset)) : null;

        // Format filters if they were requested (convert FacetAggregations to ProductFilters)
        let formattedFilters = null;
        
        // Check if filters were requested and if they exist in the result
        if (filters?.includeFilters) {
          if (result.filters) {
            // Use filters from search result (already aggregated)
            logger.log('Using filters from search result', { hasFilters: !!result.filters });
            formattedFilters = formatFilters(result.filters);
          } else {
            // Fetch filters separately if not included in search result
            // Use the same filters but without pagination/sorting parameters
            const filterInput: any = {};
            if (filters.vendors) filterInput.vendors = filters.vendors;
            if (filters.productTypes) filterInput.productTypes = filters.productTypes;
            if (filters.tags) filterInput.tags = filters.tags;
            if (filters.collections) filterInput.collections = filters.collections;
            if (filters.options) filterInput.options = filters.options;
            if (filters.search) filterInput.search = filters.search;
            if (filters.variantOptionKeys) filterInput.variantOptionKeys = filters.variantOptionKeys;
            if (filters.priceMin !== undefined) filterInput.priceMin = filters.priceMin;
            if (filters.priceMax !== undefined) filterInput.priceMax = filters.priceMax;
            if (filters.variantSkus) filterInput.variantSkus = filters.variantSkus;
            
            logger.log('Fetching filters for aggregations', { shop, filterInput });
            const productFilters = await service.getFilters(shop, filterInput);
            formattedFilters = formatFilters(productFilters);
            logger.log('Filters fetched', { 
              hasFilters: !!formattedFilters,
              vendorsCount: formattedFilters?.vendors?.length || 0,
              productTypesCount: formattedFilters?.productTypes?.length || 0,
            });
          }
        }

        return {
          products: result.products || [],
          total: result.total || 0,
          nextCursor,
          hasNextPage,
          prevCursor,
          filters: formattedFilters,
        };
      } catch (error: any) {
        logger.error('Error in products resolver', {
          error: error?.message || error,
          args,
        });
        throw error;
      }
    },

    /**
     * Get storefront filters (aggregations/facets) for products
     * Returns the same data as the REST endpoint: GET /storefront/filters?shop={shop}
     */
    async storefrontFilters(
      parent: any,
      args: { shop: string; filters?: any },
      context: GraphQLContext
    ) {
      try {
        const { shop, filters } = args;
        if (!shop) {
          throw new Error('Shop is required');
        }

        logger.log('🔵 Storefront filters query received', {
          shop,
          hasFilters: !!filters,
          filters: filters || {},
        });

        const service = getProductsService(context);
        
        // Build filter input from GraphQL args (same as REST endpoint)
        const filterInput: any = {};
        if (filters) {
          if (filters.vendors) filterInput.vendors = filters.vendors;
          if (filters.productTypes) filterInput.productTypes = filters.productTypes;
          if (filters.tags) filterInput.tags = filters.tags;
          if (filters.collections) filterInput.collections = filters.collections;
          if (filters.options) filterInput.options = filters.options;
          if (filters.search) filterInput.search = filters.search;
          if (filters.variantOptionKeys) filterInput.variantOptionKeys = filters.variantOptionKeys;
          if (filters.priceMin !== undefined) filterInput.priceMin = filters.priceMin;
          if (filters.priceMax !== undefined) filterInput.priceMax = filters.priceMax;
          if (filters.variantSkus) filterInput.variantSkus = filters.variantSkus;
        }
        
        logger.log('Fetching storefront filters', { shop, filterInput });
        
        // Use the same service method as the REST endpoint
        const productFilters = await service.getFilters(shop, Object.keys(filterInput).length > 0 ? filterInput : undefined);
        
        logger.log('Storefront filters fetched', { 
          hasFilters: !!productFilters,
          vendorsCount: productFilters?.vendors?.length || 0,
          productTypesCount: productFilters?.productTypes?.length || 0,
          tagsCount: productFilters?.tags?.length || 0,
          collectionsCount: productFilters?.collections?.length || 0,
          optionsCount: productFilters?.options ? Object.keys(productFilters.options).length : 0,
        });
        
        // Return ProductFilters directly (already formatted by service.getFilters)
        // GraphQL schema expects ProductFilters type, not StorefrontFilterDescriptor[]
        return productFilters;
      } catch (error: any) {
        logger.error('Error in storefrontFilters resolver', {
          error: error?.message || error,
          args,
        });
        throw error;
      }
    },
  },
};

/**
 * Format ProductFilters to GraphQL ProductFilters type
 */
function formatFilters(filters: any): any {
  if (!filters) {
    logger.warn('formatFilters called with null/undefined filters');
    return {
      vendors: [],
      productTypes: [],
      tags: [],
      collections: [],
      options: {},
      price: null,
    };
  }

  logger.log('Formatting filters', {
    hasVendors: !!filters.vendors,
    hasProductTypes: !!filters.productTypes,
    hasTags: !!filters.tags,
    hasCollections: !!filters.collections,
    hasOptions: !!filters.options,
    hasPriceRange: !!filters.price,
  });

  return {
    vendors: Array.isArray(filters.vendors) ? filters.vendors : [],
    productTypes: Array.isArray(filters.productTypes) ? filters.productTypes : [],
    tags: Array.isArray(filters.tags) ? filters.tags : [],
    collections: Array.isArray(filters.collections) ? filters.collections : [],
    options: filters.options && typeof filters.options === 'object' ? filters.options : {},
    price: filters.price
      ? {
          min: filters.price.min ?? 0,
          max: filters.price.max ?? 0,
        }
      : null,
  };
}


