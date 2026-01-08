/**
 * Search Configuration Repository
 * Handles Elasticsearch operations for search field configurations
 * Uses camelCase for all database field names (following coding standards)
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';
import { v4 as uuidv4 } from 'uuid';
import { SearchConfig, SearchConfigInput } from '@shared/search/types';
import { getCacheService } from '@core/cache';
import { SEARCH_INDEX_NAME } from '@shared/constants/es.constant';

const logger = createModuleLogger('search-repository');

export class SearchRepository {
  constructor(private esClient: Client) {}

  /**
   * Normalize search config data from Elasticsearch
   */
  private normalizeSearchConfig(data: any): SearchConfig {
    return {
      id: data.id,
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
   */
  async getSearchConfig(shop: string): Promise<SearchConfig> {
    try {
      const index = SEARCH_INDEX_NAME;
      
      const response = await this.esClient.search({
        index,
        query: {
          bool: {
            must: [
              {
                bool: {
                  should: [
                    { term: { 'shop.keyword': shop } },
                    { term: { shop: shop } }
                  ],
                  minimum_should_match: 1
                }
              }
            ]
          }
        },
        size: 1,
      });

      if (response.hits.hits.length > 0 && response.hits.hits[0]._source) {
        const source = response.hits.hits[0]._source as any;
        return this.normalizeSearchConfig(source);
      }

      // Return default configuration if none exists
      return this.getDefaultConfig(shop);
    } catch (error: any) {
      if (error.statusCode === 404) {
        // Index doesn't exist, return default
        return this.getDefaultConfig(shop);
      }
      logger.error('Error getting search config', { shop, error: error?.message || error });
      // Return default on error
      return this.getDefaultConfig(shop);
    }
  }

  /**
   * Get default search configuration
   */
  private getDefaultConfig(shop: string): SearchConfig {
    return {
      id: uuidv4(),
      shop,
      fields: [
        { field: 'title', weight: 5 },
        { field: 'vendor', weight: 3 },
        { field: 'productType', weight: 2 },
        { field: 'tags', weight: 1 },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };
  }

  /**
   * Update search configuration for a shop
   * Creates if it doesn't exist, updates if it does
   */
  async updateSearchConfig(shop: string, input: SearchConfigInput): Promise<SearchConfig> {
    try {
      const index = SEARCH_INDEX_NAME;
      
      // Get existing config to preserve ID
      const existing = await this.getSearchConfig(shop);
      const id = existing.id;
      
      const now = new Date().toISOString();
      const config: SearchConfig = {
        id,
        shop,
        fields: input.fields.map(field => ({
          field: field.field,
          weight: field.weight ?? 1,
        })),
        createdAt: existing.createdAt,
        updatedAt: now,
      };

      await this.esClient.index({
        index,
        id,
        document: config,
      });

      // Invalidate cache
      try {
        const cacheService = getCacheService();
        cacheService.invalidateShop(shop);
        logger.info('Search config updated and cache invalidated', { shop, id });
      } catch (cacheError: any) {
        logger.warn('Failed to invalidate cache after search config update', {
          shop,
          id,
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

