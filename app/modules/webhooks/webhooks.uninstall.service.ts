/**
 * Webhook Uninstall Service
 * Shared service for app uninstallation cleanup
 * Used by both REST endpoint and GraphQL resolver
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';
import { ShopsRepository } from '@modules/shops/shops.repository';
import { FiltersRepository } from '@modules/filters/filters.repository';
import { IndexingLockService } from '@modules/indexing/indexing.lock.service';
import { SHOPS_INDEX_NAME, CHECKPOINT_INDEX_NAME, LOCK_INDEX_NAME } from '@shared/constants/es.constant';
import { PRODUCT_INDEX_NAME } from '@shared/constants/products.constants';
import { ShopifyShopName } from '@shared/utils/shopify-shop.util';

const logger = createModuleLogger('webhooks-uninstall');

export interface UninstallCleanupResult {
  shopIndexDeleted: boolean;
  filtersDeleted: number;
  checkpointsCleaned: boolean;
  locksCleaned: boolean;
}

/**
 * Perform complete uninstallation cleanup for a shop
 */
export async function performUninstallCleanup(
  esClient: Client,
  shop: string
): Promise<UninstallCleanupResult> {
  const cleanupResults: UninstallCleanupResult = {
    shopIndexDeleted: false,
    filtersDeleted: 0,
    checkpointsCleaned: false,
    locksCleaned: false,
  };

  const shopsRepository = new ShopsRepository(esClient, SHOPS_INDEX_NAME);
  
  // Get existing shop to preserve data
  const existingShop = await shopsRepository.getShop(shop);
  
  if (!existingShop) {
    logger.warn(`Shop not found for uninstall: ${shop}`);
    // Still perform cleanup even if shop not found
  }

  // 1. Delete Elasticsearch product index for this shop
  try {
    const productIndexName = PRODUCT_INDEX_NAME(shop);
    const indexExists = await esClient.indices.exists({ index: productIndexName });
    
    if (indexExists) {
      await esClient.indices.delete({ index: productIndexName });
      cleanupResults.shopIndexDeleted = true;
      logger.info(`Product index deleted for shop: ${shop}`, { indexName: productIndexName });
    } else {
      logger.log(`Product index does not exist for shop: ${shop}`, { indexName: productIndexName });
    }
  } catch (error: any) {
    logger.error(`Error deleting product index for shop: ${shop}`, {
      error: error?.message || error,
      stack: error?.stack,
    });
    // Continue with other cleanup steps
  }

  // 2. Delete all filters for this shop
  try {
    const filtersRepository = new FiltersRepository(esClient);
    const deletedCount = await filtersRepository.deleteAllFilters(shop);
    cleanupResults.filtersDeleted = deletedCount;
    logger.info(`Deleted ${deletedCount} filters for shop: ${shop}`);
  } catch (error: any) {
    logger.error(`Error deleting filters for shop: ${shop}`, {
      error: error?.message || error,
      stack: error?.stack,
    });
    // Continue with other cleanup steps
  }

  // 3. Clean up indexing checkpoints
  try {
    const checkpointId = `checkpoint_${ShopifyShopName(shop)}`;
    const checkpointExists = await esClient.exists({
      index: CHECKPOINT_INDEX_NAME,
      id: checkpointId,
    });
    
    if (checkpointExists) {
      await esClient.delete({
        index: CHECKPOINT_INDEX_NAME,
        id: checkpointId,
        refresh: false,
      });
      cleanupResults.checkpointsCleaned = true;
      logger.info(`Checkpoint deleted for shop: ${shop}`, { checkpointId });
    }
  } catch (error: any) {
    if (error.statusCode !== 404) {
      logger.error(`Error cleaning up checkpoint for shop: ${shop}`, {
        error: error?.message || error,
      });
    }
    // Continue with other cleanup steps
  }

  // 4. Clean up indexing locks
  try {
    const lockService = new IndexingLockService(esClient);
    const lockId = `lock_${ShopifyShopName(shop)}`;
    const lockExists = await esClient.exists({
      index: LOCK_INDEX_NAME,
      id: lockId,
    });
    
    if (lockExists) {
      await lockService.releaseLock(shop);
      cleanupResults.locksCleaned = true;
      logger.info(`Lock released for shop: ${shop}`, { lockId });
    }
  } catch (error: any) {
    if (error.statusCode !== 404) {
      logger.error(`Error cleaning up lock for shop: ${shop}`, {
        error: error?.message || error,
      });
    }
    // Continue with other cleanup steps
  }

  // 5. Update shop status to track uninstallation
  if (existingShop) {
    try {
      const updateData = {
        ...existingShop,
        isActive: false,
        uninstalledAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const updatedShop = await shopsRepository.saveShop(updateData);
      
      if (!updatedShop) {
        logger.warn(`Failed to update shop status for uninstall: ${shop}`);
      } else {
        logger.info(`Shop status updated for uninstall: ${shop}`, {
          isActive: updatedShop.isActive,
          uninstalledAt: updatedShop.uninstalledAt,
        });
      }
    } catch (error: any) {
      logger.error(`Error updating shop status for uninstall: ${shop}`, {
        error: error?.message || error,
      });
      // Don't fail cleanup if status update fails
    }
  }

  logger.info(`Uninstallation cleanup completed for shop: ${shop}`, cleanupResults);
  return cleanupResults;
}

