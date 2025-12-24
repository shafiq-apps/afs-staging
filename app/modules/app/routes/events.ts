/**
 * App Events Route
 * POST /app/events
 * Handles Shopify app lifecycle events
 */

import { handler } from '@core/http/http.handler';
import { HttpRequest } from '@core/http/http.types';
import { validate } from '@core/http/validation.middleware';
import { rateLimit } from '@core/security/rate-limit.middleware';
import { createModuleLogger } from '@shared/utils/logger.util';
import { ProductBulkIndexer, BulkIndexerDependencies } from '@modules/indexing/indexing.bulk.service';
import { IndexerOptions } from '@modules/indexing/indexing.type';
import { getESClient } from '@core/elasticsearch/es.client';
import { ShopsRepository } from '@modules/shops/shops.repository';
import { getProductMapping } from '@shared/storefront/mapping';
import { IndexingLockService } from '@modules/indexing/indexing.lock.service';
import { IndexerCheckpointService } from '@modules/indexing/indexing.checkpoint.service';
import { SHOPS_INDEX_NAME } from '@shared/constants/es.constant';
import { performUninstallCleanup } from '@modules/webhooks/webhooks.uninstall.service';

const logger = createModuleLogger('app-events');

export const middleware = [
  validate({
    body: {
      event: {
        type: 'string',
        required: true,
        enum: ['APP_INSTALLED', 'APP_UNINSTALLED'],
      },
      shop: {
        type: 'string',
        required: true,
      },
    },
  }),
  rateLimit({
    windowMs: 60000,
    max: 60,
    message: 'Too many event requests',
  }),
];

export const POST = handler(async (req: HttpRequest) => {
  const { event, shop } = req.body;

  logger.info(`Processing event: ${event} for shop: ${shop}`);

  try {
    if (event === 'APP_INSTALLED') {
      // Check if shop already exists to determine if this is a new installation
      const esClient = getESClient();
      const shopsRepository = new ShopsRepository(esClient, SHOPS_INDEX_NAME);
      const existingShop = await shopsRepository.getShop(shop);
      const isNewInstallation = !existingShop || !existingShop.installedAt;

      // Save/update shop data using ShopsRepository directly
      let savedShop: any;
      
      if (isNewInstallation) {
        // New installation - use saveShop()
        const shopData = {
          shop,
          // OAuth tokens
          accessToken: req.body.accessToken,
          refreshToken: req.body.refreshToken,
          // OAuth scopes
          scopes: req.body.scopes || [],
          // Metadata and locals
          metadata: req.body.metadata || {},
          locals: req.body.locals || {},
        };
        savedShop = await shopsRepository.saveShop(shopData);
      } else {
        // Update existing shop - use updateShop() to preserve existing data
        const updateData = {
          isActive: true,
          lastAccessed: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          // Update tokens if provided
          ...(req.body.accessToken && { accessToken: req.body.accessToken }),
          ...(req.body.refreshToken && { refreshToken: req.body.refreshToken }),
          ...(req.body.scopes && { scopes: req.body.scopes }),
          ...(req.body.metadata && { metadata: req.body.metadata }),
          ...(req.body.locals && { locals: req.body.locals }),
        };
        savedShop = await shopsRepository.updateShop(shop, updateData);
      }
      
      if (!savedShop) {
        logger.error(`Failed to save shop: ${shop}`);
        return {
          success: false,
          message: `Failed to save shop data`,
          event,
          shop,
        };
      }

      logger.info(`Shop saved successfully: ${shop}`, { 
        shop: savedShop.shop,
        isActive: savedShop.isActive,
        installedAt: savedShop.installedAt,
        isNewInstallation,
      });

      // Trigger reindexing automatically for new installations
      // Check if we have accessToken (either from request or from existing shop)
      const accessToken = req.body.accessToken || existingShop?.accessToken;
      if (isNewInstallation && accessToken) {
        logger.info(`New installation detected, starting automatic reindexing for shop: ${shop}`);
        
        // Start reindexing in background (non-blocking)
        (async () => {
          try {
            const esClient = getESClient();
            const shopsRepository = new ShopsRepository(esClient, SHOPS_INDEX_NAME);
            const lockService = new IndexingLockService(esClient);
            
            // Check if indexing is already in progress
            const isLocked = await lockService.isLocked(shop);
            if (isLocked) {
              logger.warn(`Indexing already in progress for shop: ${shop}, skipping auto-reindex`);
              return;
            }

            // Try to acquire lock
            const lockAcquired = await lockService.acquireLock(shop);
            if (!lockAcquired) {
              logger.warn(`Failed to acquire indexing lock for shop: ${shop}, skipping auto-reindex`);
              return;
            }

            logger.log(`Starting background reindex for new installation: shop=${shop}`);
            
            const productMapping = getProductMapping();
            const checkpointService = new IndexerCheckpointService(esClient, shop, 2000);
            
            // Initialize checkpoint with in_progress status
            checkpointService.updateCheckpoint({
              status: 'in_progress',
              startedAt: new Date().toISOString(),
              totalIndexed: 0,
              totalFailed: 0,
              failedItems: [],
            });
            await checkpointService.forceSave();
            
            logger.log(`Indexing status set to in_progress for shop=${shop}`);
            
            const deps: BulkIndexerDependencies = {
              esClient,
              shopsRepository,
              esMapping: productMapping,
            };

            const opts: IndexerOptions = {
              shop: shop,
            };

            logger.log('Creating ProductBulkIndexer instance...');
            const indexer = new ProductBulkIndexer(opts, deps);
            
            logger.log('Starting indexer.run()...');
            await indexer.run();
            
            logger.log(`Background reindex finished successfully for shop=${shop}`);
          } catch (err: any) {
            logger.error(`Background reindex error for shop=${shop}`, {
              error: err?.message || err,
              stack: err?.stack,
            });
          } finally {
            // Always release the lock when done
            try {
              const esClient = getESClient();
              const lockService = new IndexingLockService(esClient);
              await lockService.releaseLock(shop);
              logger.log(`Indexing lock released for shop=${shop}`);
            } catch (releaseError: any) {
              logger.warn(`Error releasing lock for shop=${shop}`, {
                error: releaseError?.message || releaseError,
              });
            }
          }
        })();
      }

      return {
        success: true,
        message: `Shop installed and saved successfully${isNewInstallation ? ', reindexing started' : ''}`,
        event,
        shop,
        data: {
          shop: savedShop.shop,
          isActive: savedShop.isActive,
          installedAt: savedShop.installedAt,
        },
      };
    } else if (event === 'APP_UNINSTALLED') {
      // Comprehensive uninstallation cleanup using shared service
      const esClient = getESClient();
      
      // Declare cleanupResults outside try-catch for proper scope
      let cleanupResults: any = null;
      
      try {
        // Use shared uninstall cleanup service
        cleanupResults = await performUninstallCleanup(esClient, shop);
        
        logger.info(`Uninstallation cleanup completed for shop: ${shop}`, cleanupResults);

        return {
          success: true,
          message: `Shop uninstalled successfully`,
          event,
          shop,
          data: {
            shop: shop,
            isActive: false,
            uninstalledAt: new Date().toISOString(),
            cleanupResults,
          },
        };
      } catch (error: any) {
        logger.error(`Error during uninstallation cleanup for shop: ${shop}`, {
          error: error?.message || error,
          stack: error?.stack,
          cleanupResults,
        });
        
        // Still return success as uninstall event was received
        // Partial cleanup is better than no cleanup
        return {
          success: true,
          message: `Uninstall event processed (some cleanup steps may have failed)`,
          event,
          shop,
          data: {
            cleanupResults,
            error: error?.message || 'Unknown error',
          },
        };
      }
    }

    // Unknown event type
    return {
      success: false,
      message: `Unknown event type: ${event}`,
      event,
      shop,
    };
  } catch (error: any) {
    logger.error(`Error processing event: ${event}`, {
      error: error?.message || error,
      stack: error?.stack,
      shop,
    });

    return {
      success: false,
      message: `Error processing event: ${error?.message || 'Unknown error'}`,
      event,
      shop,
    };
  }
});

