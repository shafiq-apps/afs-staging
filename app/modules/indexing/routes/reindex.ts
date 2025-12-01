/**
 * Reindex Route
 * POST /admin/reindex
 * Triggers product bulk indexing for a shop
 */

import { handler } from '@core/http/http.handler';
import { HttpRequest } from '@core/http/http.types';
import { validateShopDomain } from '@core/http/validation.middleware';
import { rateLimit } from '@core/security/rate-limit.middleware';
import { createModuleLogger } from '@shared/utils/logger.util';
import { ProductBulkIndexer, BulkIndexerDependencies } from '../indexing.bulk.service';
import { IndexerOptions } from '../indexing.type';
import { getESClient } from '@core/elasticsearch/es.client';
import { ShopsRepository } from '@modules/shops/shops.repository';
import { getProductMapping } from '@modules/products/products.mapping';
import { IndexingLockService } from '../indexing.lock.service';
import { IndexerCheckpointService } from '../indexing.checkpoint.service';

const logger = createModuleLogger('admin:reindex');

export const middleware = [validateShopDomain(), rateLimit({ windowMs: 60000, max: 5 })];

export const POST = handler(async (req: HttpRequest) => {
  const shopParam = (req.query.shop as string) || (req.query.shop_domain as string);
  if (!shopParam) {
    return {
      statusCode: 400,
      body: { success: false, message: 'Missing required query param `shop`' }
    };
  }

  // Get shops repository from request (injected by bootstrap)
  const shopsRepository = (req as any).shopsRepository as ShopsRepository | undefined;
  
  if (!shopsRepository) {
    return {
      statusCode: 500,
      body: { success: false, message: 'Shops repository not available' }
    };
  }

  // Verify shop exists and has access token
  logger.log(`Looking up shop in ES: ${shopParam}`);
  const shop = await shopsRepository.getShop(shopParam);
  
  if (!shop) {
    logger.error(`Shop not found in ES: ${shopParam}`);
    return {
      statusCode: 404,
      body: { success: false, message: `Shop not found: ${shopParam}. Please ensure the shop is saved in Elasticsearch.` }
    };
  }

  logger.log(`Shop found in ES`, {
    shop: shop.shop,
    hasAccessToken: !!shop.accessToken,
    isActive: shop.isActive,
  });

  if (!shop.accessToken) {
    logger.error(`Shop missing access token: ${shopParam}`);
    return {
      statusCode: 422,
      body: { success: false, message: `Shop missing access token: ${shopParam}` }
    };
  }

  if (shop.isActive === false) {
    logger.warn(`Shop is not active: ${shopParam}`);
    return {
      statusCode: 422,
      body: { success: false, message: `Shop is not active: ${shopParam}` }
    };
  }

  // Check if indexing is already in progress
  const esClient = getESClient();
  const lockService = new IndexingLockService(esClient);
  const isLocked = await lockService.isLocked(shopParam);

  if (isLocked) {
    // Check if the lock is stale (exists but no actual process running)
    const isStale = await lockService.isLockStale(shopParam);
    if (isStale) {
      logger.warn(`Stale lock detected for shop: ${shopParam}, releasing and allowing new indexing`);
      await lockService.releaseLock(shopParam);
      // Continue to acquire new lock below
    } else {
      logger.warn(`Indexing already in progress for shop: ${shopParam}`);
      return {
        statusCode: 409, // Conflict
        body: { 
          success: false, 
          message: `Indexing is already in progress for this shop. Please wait for the current indexing to complete.` 
        }
      };
    }
  }

  // Try to acquire lock
  const lockAcquired = await lockService.acquireLock(shopParam);
  if (!lockAcquired) {
    // Double-check if lock is stale before giving up
    const isStale = await lockService.isLockStale(shopParam);
    if (isStale) {
      logger.warn(`Stale lock detected after failed acquisition for shop: ${shopParam}, releasing and retrying`);
      await lockService.releaseLock(shopParam);
      const retryAcquired = await lockService.acquireLock(shopParam);
      if (!retryAcquired) {
        logger.warn(`Failed to acquire indexing lock for shop: ${shopParam} (another process may have started)`);
        return {
          statusCode: 409, // Conflict
          body: { 
            success: false, 
            message: `Indexing is already in progress for this shop. Please wait for the current indexing to complete.` 
          }
        };
      }
    } else {
      logger.warn(`Failed to acquire indexing lock for shop: ${shopParam} (another process may have started)`);
      return {
        statusCode: 409, // Conflict
        body: { 
          success: false, 
          message: `Indexing is already in progress for this shop. Please wait for the current indexing to complete.` 
        }
      };
    }
  }

  // Start indexing in background and return 202 Accepted
  (async () => {
    try {
      logger.log(`Starting background reindex for shop=${shopParam}`, {
        shop: shop.shop,
        hasToken: !!shop.accessToken,
      });
      
      const productMapping = getProductMapping();
      
      // Set status to in_progress immediately in checkpoint before starting indexer
      const checkpointService = new IndexerCheckpointService(esClient, shopParam, 2000);
      
      // Initialize checkpoint with in_progress status immediately
      checkpointService.updateCheckpoint({
        status: 'in_progress',
        startedAt: new Date().toISOString(),
        totalIndexed: 0,
        totalFailed: 0,
        failedItems: [],
      });
      // Force save immediately to make status visible
      await checkpointService.forceSave();
      
      logger.log(`Indexing status set to in_progress for shop=${shopParam}`);
      
      const deps: BulkIndexerDependencies = {
        esClient,
        shopsRepository,
        esMapping: productMapping, // Pass mapping to filter fields and prevent field limit errors
      };

      const opts: IndexerOptions = {
        shop: shopParam,
      };

      logger.log('Creating ProductBulkIndexer instance...');
      const indexer = new ProductBulkIndexer(opts, deps);
      
      logger.log('Starting indexer.run()...');
      await indexer.run();
      
      logger.log(`Background reindex finished successfully for shop=${shopParam}`);
    } catch (err: any) {
      logger.error(`Background reindex error for shop=${shopParam}`, {
        error: err?.message || err,
        stack: err?.stack,
      });
    } finally {
      // Always release the lock when done
      try {
        await lockService.releaseLock(shopParam);
        logger.log(`Indexing lock released for shop=${shopParam}`);
      } catch (releaseError: any) {
        logger.warn(`Error releasing lock for shop=${shopParam}`, {
          error: releaseError?.message || releaseError,
        });
      }
    }
  })();

  return {
    statusCode: 202,
    body: { success: true, message: 'Indexing started' }
  };
});

