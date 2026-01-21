/**
 * Product Index Utilities
 * Utilities for managing product indices in Elasticsearch
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';
import { ShopifyShopName } from '@shared/utils/shopify-shop.util';
import { PRODUCT_MAPPING } from './mapping';
import { PRODUCT_INDEX_NAME } from '@shared/constants/products.constants';

const logger = createModuleLogger('ProductIndexUtil');

/**
 * Ensure product index exists with proper mapping and settings
 * This prevents field limit errors by:
 * 1. Setting field limit to 5000 (if needed)
 * 2. Using strict dynamic mapping to prevent unmapped fields
 * 3. Ensuring all fields are properly mapped
 */
export async function ensureProductIndex(esClient: Client, shop: string): Promise<void> {
  const indexName = PRODUCT_INDEX_NAME(shop);

  try {
    const exists = await esClient.indices.exists({ index: indexName });

    if (!exists) {
      logger.info(`Creating product index: ${indexName}`);
      
      await esClient.indices.create({
        index: indexName,
        mappings: PRODUCT_MAPPING as any,
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
          index: {
            refresh_interval: '1s',
            mapping: {
              total_fields: {
                limit: 5000
              },
            },
            max_result_window: 50000,
          },
        },
      } as any);

      logger.info(`Product index created: ${indexName}`);
    } else {
      // Check if we need to update settings
      try {
        const currentSettings = await esClient.indices.getSettings({ index: indexName });
        const fieldLimit = currentSettings[indexName]?.settings?.index?.mapping?.total_fields?.limit;
        const fieldLimitNum = typeof fieldLimit === 'string' ? parseInt(fieldLimit, 10) : (fieldLimit as number);

        if (!fieldLimitNum || fieldLimitNum < 5000) {
          logger.info(`Updating field limit for index: ${indexName}`);
          await esClient.indices.putSettings({
            index: indexName,
            body: {
              index: {
                mapping: {
                  total_fields: {
                    limit: 5000,
                  },
                },
              },
            },
          } as any);
          logger.info(`Field limit updated to 5000 for: ${indexName}`);
        }
      } catch (error: any) {
        logger.warn(`Failed to update index settings: ${error?.message || error}`);
      }
    }
  } catch (error: any) {
    // Handle race condition where index is created concurrently
    if (error.meta?.body?.error?.type === 'resource_already_exists_exception') {
      logger.info(`Index already exists (concurrent creation): ${indexName}`);
      return;
    }
    logger.error(`Failed to ensure product index: ${indexName}`, error?.message || error);
    throw error;
  }
}

