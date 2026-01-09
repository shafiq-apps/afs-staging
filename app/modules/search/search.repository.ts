/**
 * Search Configuration Repository
 * Handles Elasticsearch operations for search field configurations
 * Uses camelCase for all database field names (following coding standards)
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';
import { SearchConfig, SearchConfigInput } from '@shared/search/types';
import { getCacheService } from '@core/cache';
import { SEARCH_INDEX_NAME } from '@shared/constants/es.constant';

const logger = createModuleLogger('search-repository');

/**
 * Normalize shop name to use as document ID
 * Ensures consistent ID format and handles special characters
 */
function normalizeShopId(shop: string): string {
  if (!shop || shop.trim() === '') {
    throw new Error('Shop cannot be empty');
  }
  // Use shop as-is, but ensure it's trimmed
  // Elasticsearch document IDs can contain most characters except: /, *, ?, ", <, >, |, space, comma, #
  // We'll use shop directly but replace problematic characters
  return shop.trim().replace(/[/\*\?"<>|,\s#]/g, '_');
}

export class SearchRepository {
  constructor(private esClient: Client) {}

  /**
   * Normalize search config data from Elasticsearch
   * Uses document _id (which is the shop) as the id
   */
  private normalizeSearchConfig(data: any, documentId?: string): SearchConfig {
    // Document _id is the shop, use it as the id
    const id = documentId || data.shop || data.id;
    
    return {
      id: id,
      shop: data.shop,
      fields: (data.fields ?? []).map((field: any) => ({
        field: field.field,
        weight: field.weight ?? 1,
      })),
      createdAt: data.createdAt ?? data.created_at ?? new Date().toISOString(),
      updatedAt: data.updatedAt ?? data.updated_at ?? null,
    };
  }

  /**
   * Get search configuration for a shop
   * Returns default configuration if none exists
   * Uses shop as document _id to ensure only one document per shop
   */
  async getSearchConfig(shop: string): Promise<SearchConfig> {
    try {
      if (!shop || shop.trim() === '') {
        throw new Error('Shop parameter is required');
      }

      const normalizedShop = shop.trim();
      const index = SEARCH_INDEX_NAME;
      const documentId = normalizeShopId(normalizedShop);
      
      // Check if index exists first
      const indexExists = await this.esClient.indices.exists({ index });
      
      if (!indexExists) {
        logger.info('Search config index does not exist, returning default', { shop: normalizedShop });
        return this.getDefaultConfig(normalizedShop);
      }

      // Try to get document by shop ID (which is the document _id)
      try {
        const getResponse = await this.esClient.get({
          index,
          id: documentId,
        });

        if (getResponse.found && getResponse._source) {
          const source = getResponse._source as any;
          // Verify shop matches (security check)
          if (source.shop === normalizedShop) {
            logger.info('Search config found by shop ID', { shop: normalizedShop, id: documentId });
            return this.normalizeSearchConfig(source, documentId);
          } else {
            logger.warn('Shop mismatch in search config', {
              shop: normalizedShop,
              foundShop: source.shop,
              id: documentId,
            });
          }
        }
      } catch (getError: any) {
        // If 404, document doesn't exist - return default
        if (getError.statusCode === 404) {
          logger.info('Search config not found, returning default', { shop: normalizedShop, id: documentId });
          return this.getDefaultConfig(normalizedShop);
        }
        
        // For other errors, log and return default
        logger.warn('Error getting search config by ID, returning default', {
          shop: normalizedShop,
          id: documentId,
          error: getError?.message || getError,
        });
        return this.getDefaultConfig(normalizedShop);
      }

      // Should not reach here, but return default as fallback
      return this.getDefaultConfig(normalizedShop);
    } catch (error: any) {
      logger.error('Error getting search config', { shop, error: error?.message || error });
      // Return default on error
      return this.getDefaultConfig(shop.trim());
    }
  }

  /**
   * Get default search configuration
   * Uses shop as ID to ensure consistency
   */
  private getDefaultConfig(shop: string): SearchConfig {
    return {
      id: normalizeShopId(shop),
      shop: shop.trim(),
      fields: [
        { field: 'title', weight: 7 },
        { field: 'variants.displayName', weight: 6 },
        { field: 'variants.sku', weight: 6 },
        { field: 'tags', weight: 5 },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };
  }

  /**
   * Update search configuration for a shop
   * Uses shop as document _id to ensure only one document per shop
   * Inserts if index doesn't exist or document not found, updates if exists
   */
  async updateSearchConfig(shop: string, input: SearchConfigInput): Promise<SearchConfig> {
    try {
      // Validate shop
      if (!shop || shop.trim() === '') {
        throw new Error('Shop parameter is required');
      }

      const normalizedShop = shop.trim();

      // Validate input
      if (!input.fields || input.fields.length === 0) {
        throw new Error('At least one search field is required');
      }

      // Validate fields
      const fieldNames = new Set<string>();
      for (const field of input.fields) {
        // Check for empty field name
        if (!field.field || field.field.trim() === '') {
          throw new Error('Field name cannot be empty');
        }

        // Check for duplicate fields
        const trimmedField = field.field.trim();
        if (fieldNames.has(trimmedField)) {
          throw new Error(`Duplicate field: ${trimmedField}`);
        }
        fieldNames.add(trimmedField);

        // Validate weight (must be between 1 and 10)
        if (field.weight < 1 || field.weight > 10) {
          throw new Error(`Weight for field ${trimmedField} must be between 1 and 10, got ${field.weight}`);
        }
      }

      const index = SEARCH_INDEX_NAME;
      const documentId = normalizeShopId(normalizedShop); // Use shop as document _id
      
      // Check if index exists
      const indexExists = await this.esClient.indices.exists({ index });
      
      // Check if document exists
      let existing: SearchConfig | null = null;
      let isNewConfig = true;

      if (indexExists) {
        try {
          const getResponse = await this.esClient.get({
            index,
            id: documentId,
          });

          if (getResponse.found && getResponse._source) {
            const source = getResponse._source as any;
            // Verify shop matches (security check)
            if (source.shop === normalizedShop) {
              existing = this.normalizeSearchConfig(source, documentId);
              isNewConfig = false;
              logger.info('Existing search config found, will update', {
                shop: normalizedShop,
                id: documentId,
              });
            } else {
              logger.warn('Shop mismatch in existing config, will overwrite', {
                shop: normalizedShop,
                foundShop: source.shop,
                id: documentId,
              });
            }
          }
        } catch (getError: any) {
          // 404 means document doesn't exist - it's a new config
          if (getError.statusCode === 404) {
            logger.info('Search config document not found, will insert new', {
              shop: normalizedShop,
              id: documentId,
            });
          } else {
            // Other errors - log but continue (will try to insert/update)
            logger.warn('Error checking for existing config, will attempt insert/update', {
              shop: normalizedShop,
              id: documentId,
              error: getError?.message || getError,
            });
          }
        }
      } else {
        logger.info('Search config index does not exist, will create new document', {
          shop: normalizedShop,
          id: documentId,
        });
      }
      
      const now = new Date().toISOString();
      const config: SearchConfig = {
        id: documentId, // Use shop as ID
        shop: normalizedShop,
        fields: input.fields.map(field => ({
          field: field.field.trim(),
          weight: field.weight,
        })),
        // Preserve createdAt if updating existing, set new if creating
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      // Index the document using shop as _id
      // This ensures only one document per shop (creates if doesn't exist, updates if exists)
      await this.esClient.index({
        index,
        id: documentId, // Use shop as document _id to prevent duplicates
        document: config,
        refresh: 'wait_for', // Wait for refresh to ensure immediate availability
      });

      logger.info('Search config saved', {
        shop: normalizedShop,
        id: documentId,
        isNew: isNewConfig,
        fieldCount: config.fields.length,
        action: isNewConfig ? 'inserted' : 'updated',
      });

      // Invalidate caches
      try {
        const cacheService = getCacheService();
        cacheService.invalidateShop(normalizedShop);
        
        // Also invalidate the shared search config cache in StorefrontSearchRepository
        const { invalidateSharedSearchConfigCache } = await import('@shared/storefront/repository');
        invalidateSharedSearchConfigCache(normalizedShop);
        
        logger.info('Search config updated and all caches invalidated', { shop: normalizedShop, id: documentId });
      } catch (cacheError: any) {
        logger.warn('Failed to invalidate cache after search config update', {
          shop: normalizedShop,
          id: documentId,
          error: cacheError?.message || cacheError,
        });
      }

      return config;
    } catch (error: any) {
      logger.error('Error updating search config', { shop, error: error?.message || error });
      throw error;
    }
  }
}

