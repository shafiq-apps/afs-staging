/**
 * Webhook Uninstall Service
 * Shared service for app uninstallation cleanup
 * Used by both REST endpoint and GraphQL resolver
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';
import { FiltersRepository } from '@modules/filters/filters.repository';
import { IndexingLockService } from '@modules/indexing/indexing.lock.service';
import { CHECKPOINT_INDEX_NAME, LOCK_INDEX_NAME } from '@shared/constants/es.constant';
import { PRODUCT_INDEX_NAME } from '@shared/constants/products.constants';
import { ShopifyShopName } from '@shared/utils/shopify-shop.util';
import { ON_UNINSTALLED_APP_DELETE_DATA_BY_ID_FROM_INDEXES } from '@core/elasticsearch/es.index.config';

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

  // 1. Delete Elasticsearch product index for this shop
  try {
    const productIndexName = PRODUCT_INDEX_NAME(shop);
    const indexExists = await esClient.indices.exists({ index: productIndexName });

    if (indexExists) {
      await esClient.indices.delete({ index: productIndexName });
      cleanupResults.shopIndexDeleted = true;
      logger.info(`Product index deleted for shop: ${shop}`, { indexName: productIndexName });
    } else {
      logger.info(`Product index does not exist for shop: ${shop}`, { indexName: productIndexName });
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

  const results = await Promise.allSettled(
    ON_UNINSTALLED_APP_DELETE_DATA_BY_ID_FROM_INDEXES.map((index) =>
      esClient.delete({
        index,
        id: shop,
        refresh: false,
      })
    )
  );

  results.forEach((res, i) => {
    const index = ON_UNINSTALLED_APP_DELETE_DATA_BY_ID_FROM_INDEXES[i];

    if (res.status === "fulfilled") {
      logger.info(`Deleted document for shop: ${shop} from index: ${index}`);
    } else {
      logger.error(`Failed to delete documnt for _id: ${shop} from index: ${index}`, res.reason);
    }
  });

  logger.info(`Uninstallation cleanup completed for shop: ${shop}`, cleanupResults);
  return cleanupResults;
}
