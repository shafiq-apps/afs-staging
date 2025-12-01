/**
 * Shops GraphQL Resolvers
 * Manual resolvers for shop queries and mutations
 * Uses ShopsRepository from modules/shops
 */

import { GraphQLContext } from '../graphql.type';
import { ShopsRepository } from '@modules/shops/shops.repository';
import { createModuleLogger } from '@shared/utils/logger.util';
import { ProductBulkIndexer, BulkIndexerDependencies } from '@modules/indexing/indexing.bulk.service';
import { IndexerOptions } from '@modules/indexing/indexing.type';
import { getESClient as getGlobalESClient } from '@core/elasticsearch/es.client';
import { getProductMapping } from '@modules/products/products.mapping';
import { IndexingStatusService } from '@modules/indexing/indexing.status.service';
import { IndexingLockService } from '@modules/indexing/indexing.lock.service';
import { IndexerCheckpointService } from '@modules/indexing/indexing.checkpoint.service';

const logger = createModuleLogger('shops-resolvers');

// Repository instance (initialized per request)
let shopsRepo: ShopsRepository | null = null;

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

function getShopsRepository(context: GraphQLContext): ShopsRepository {
  const esClient = getESClient(context);
  if (!esClient) {
    throw new Error('ES client not available in context');
  }
  
  if (!shopsRepo) {
    shopsRepo = new ShopsRepository(esClient, 'shops');
  }
  return shopsRepo;
}

export const shopsResolvers = {
  Query: {
    /**
     * Get shop by domain
     */
    async shop(parent: any, args: { domain: string }, context: GraphQLContext) {
      try {
        const { domain } = args;
        if (!domain) {
          throw new Error('Domain is required');
        }

        logger.log('Getting shop by domain', { domain });

        const repo = getShopsRepository(context);
        
        // Get shop directly from ES to include accessToken (not filtered)
        const esClient = getESClient(context);
        try {
          const response = await esClient.get({
            index: 'shops',
            id: domain,
          });

          if (response.found && response._source) {
            const shop = response._source as any;

            logger.log('Shop found', {
              domain,
              shop: shop.shop,
              hasMetadata: !!shop.metadata,
              hasAccessToken: !!shop.accessToken,
            });

            // Return shop data (accessToken will be filtered by GraphQL service if needed)
            return shop;
          }
        } catch (esError: any) {
          if (esError.statusCode !== 404) {
            throw esError;
          }
        }
        
        logger.warn('Shop not found', { domain });
        return null;
      } catch (error: any) {
        logger.error('Error in shop resolver', {
          error: error?.message || error,
          stack: error?.stack,
          args,
        });
        throw error;
      }
    },

    /**
     * Check if shop exists
     */
    async shopExists(parent: any, args: { domain: string }, context: GraphQLContext): Promise<boolean> {
      try {
        const { domain } = args;
        if (!domain) {
          throw new Error('Domain is required');
        }

        logger.log('Checking if shop exists', { domain });

        const repo = getShopsRepository(context);
        
        // Check if shop exists by trying to get it
        const shop = await repo.getShop(domain);
        const exists = !!shop;
        
        logger.log('Shop exists check result', { domain, exists });
        return exists;
      } catch (error: any) {
        logger.error('Error in shopExists resolver', {
          error: error?.message || error,
          stack: error?.stack,
          args,
        });
        return false;
      }
    },

    /**
     * Get indexing status for a shop
     */
    async indexingStatus(parent: any, args: { shop: string }, context: GraphQLContext) {
      try {
        const { shop } = args;
        if (!shop) {
          throw new Error('Shop is required');
        }

        logger.log('Getting indexing status', { shop });

        const esClient = getESClient(context);
        if (!esClient) {
          throw new Error('ES client not available in context');
        }

        const statusService = new IndexingStatusService(esClient);
        const status = await statusService.getIndexingStatus(shop);

        if (!status) {
          // Return default not_started status
          return {
            shop,
            status: 'not_started',
            startedAt: null,
            completedAt: null,
            totalLines: null,
            totalIndexed: 0,
            totalFailed: 0,
            progress: 0,
            failedItems: [],
            error: null,
            lastShopifyUpdatedAt: null,
            indexExists: false,
            lastUpdatedAt: null,
            duration: null,
          };
        }

        logger.log('Indexing status retrieved', {
          shop,
          status: status.status,
          totalIndexed: status.totalIndexed,
          progress: `${status.progress}%`,
        });

        return status;
      } catch (error: any) {
        logger.error('Error in indexingStatus resolver', {
          error: error?.message || error,
          stack: error?.stack,
          args,
        });
        throw error;
      }
    },
  },

  Mutation: {
    /**
     * Create shop
     */
    async createShop(parent: any, args: { input: any }, context: GraphQLContext) {
      try {
        const { input } = args;
        if (!input || !input.shop) {
          throw new Error('Shop input with shop field is required');
        }

        logger.log('Creating shop', { shop: input.shop });

        const repo = getShopsRepository(context);
        
        // ShopsRepository.saveShop handles creation
        const shop = await repo.saveShop(input);
        logger.log('Shop created', { shop: shop?.shop });

        return shop;
      } catch (error: any) {
        logger.error('Error in createShop resolver', {
          error: error?.message || error,
          stack: error?.stack,
        });
        throw error;
      }
    },

    /**
     * Update shop
     */
    async updateShop(parent: any, args: { domain: string; input: any }, context: GraphQLContext) {
      try {
        const { domain, input } = args;
        if (!domain) {
          throw new Error('Domain is required');
        }

        logger.log('Updating shop', { domain });

        const repo = getShopsRepository(context);
        
        // ShopsRepository.updateShop handles updates
        const shop = await repo.updateShop(domain, input);
        
        logger.log('Shop updated', { domain, found: !!shop });
        return shop;
      } catch (error: any) {
        logger.error('Error in updateShop resolver', {
          error: error?.message || error,
          stack: error?.stack,
        });
        throw error;
      }
    },

    /**
     * Delete shop
     */
    async deleteShop(parent: any, args: { domain: string }, context: GraphQLContext): Promise<boolean> {
      try {
        const { domain } = args;
        if (!domain) {
          throw new Error('Domain is required');
        }

        logger.log('Deleting shop', { domain });

        const esClient = getESClient(context);
        if (!esClient) {
          throw new Error('ES client not available in context');
        }

        // Delete directly from ES (ShopsRepository doesn't have delete method)
        try {
          await esClient.delete({
            index: 'shops',
            id: domain,
            refresh: true,
          });
          logger.log('Shop deleted', { domain });
          return true;
        } catch (error: any) {
          if (error.statusCode === 404) {
            logger.warn('Shop not found for deletion', { domain });
            return false;
          }
          throw error;
        }
      } catch (error: any) {
        logger.error('Error in deleteShop resolver', {
          error: error?.message || error,
          stack: error?.stack,
        });
        return false;
      }
    },

    /**
     * Reindex products for a shop
     * Triggers bulk indexing of products from Shopify to Elasticsearch
     * Returns immediately while indexing runs in background
     */
    async reindexProducts(parent: any, args: { shop: string }, context: GraphQLContext) {
      try {
        const { shop } = args;
        if (!shop) {
          throw new Error('Shop is required');
        }

        logger.log('Reindex products request received', { shop });

        const repo = getShopsRepository(context);
        
        // Verify shop exists and has access token
        logger.log(`Looking up shop in ES: ${shop}`);
        const shopData = await repo.getShop(shop);
        
        if (!shopData) {
          logger.error(`Shop not found in ES: ${shop}`);
          return {
            success: false,
            message: `Shop not found: ${shop}`
          };
        }

        logger.log(`Shop found in ES`, {
          shop: shopData.shop,
          hasAccessToken: !!shopData.accessToken,
          isActive: shopData.isActive,
        });

        if (!shopData.accessToken) {
          logger.error(`Shop missing access token: ${shop}`);
          return {
            success: false,
            message: `Shop missing access token: ${shop}`
          };
        }

        if (shopData.isActive === false) {
          logger.warn(`Shop is not active: ${shop}`);
          return {
            success: false,
            message: `Shop is not active: ${shop}`
          };
        }

        // Check if indexing is already in progress
        const esClient = getESClient(context);
        if (!esClient) {
          throw new Error('ES client not available in context');
        }

        const lockService = new IndexingLockService(esClient);
        const isLocked = await lockService.isLocked(shop);

        if (isLocked) {
          // Check if the lock is stale (exists but no actual process running)
          const isStale = await lockService.isLockStale(shop);
          if (isStale) {
            logger.warn(`Stale lock detected for shop: ${shop}, releasing and allowing new indexing`);
            await lockService.releaseLock(shop);
            // Continue to acquire new lock below
          } else {
            logger.warn(`Indexing already in progress for shop: ${shop}`);
            return {
              success: false,
              message: `Indexing is already in progress for this shop. Please wait for the current indexing to complete.`
            };
          }
        }

        // Try to acquire lock
        const lockAcquired = await lockService.acquireLock(shop);
        if (!lockAcquired) {
          // Double-check if lock is stale before giving up
          const isStale = await lockService.isLockStale(shop);
          if (isStale) {
            logger.warn(`Stale lock detected after failed acquisition for shop: ${shop}, releasing and retrying`);
            await lockService.releaseLock(shop);
            const retryAcquired = await lockService.acquireLock(shop);
            if (!retryAcquired) {
              logger.warn(`Failed to acquire indexing lock for shop: ${shop} (another process may have started)`);
              return {
                success: false,
                message: `Indexing is already in progress for this shop. Please wait for the current indexing to complete.`
              };
            }
          } else {
            logger.warn(`Failed to acquire indexing lock for shop: ${shop} (another process may have started)`);
            return {
              success: false,
              message: `Indexing is already in progress for this shop. Please wait for the current indexing to complete.`
            };
          }
        }

        // Start indexing in background and return success
        (async () => {
          try {
            logger.log(`Starting background reindex for shop=${shop}`, {
              shop: shopData.shop,
              hasToken: !!shopData.accessToken,
            });
            
            const globalESClient = getGlobalESClient(); // Use global ES client like REST endpoint
            const productMapping = getProductMapping();
            
            // Set status to in_progress immediately in checkpoint before starting indexer
            const checkpointService = new IndexerCheckpointService(globalESClient, shop, 2000);
            
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
            
            logger.log(`Indexing status set to in_progress for shop=${shop}`);
            
            const deps: BulkIndexerDependencies = {
              esClient: globalESClient,
              shopsRepository: repo,
              esMapping: productMapping, // Pass mapping to filter fields and prevent field limit errors
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
              await lockService.releaseLock(shop);
              logger.log(`Indexing lock released for shop=${shop}`);
            } catch (releaseError: any) {
              logger.warn(`Error releasing lock for shop=${shop}`, {
                error: releaseError?.message || releaseError,
              });
            }
          }
        })();

        return {
          success: true,
          message: 'Indexing started'
        };
      } catch (error: any) {
        logger.error('Error in reindexProducts resolver', {
          error: error?.message || error,
          stack: error?.stack,
          args,
        });
        return {
          success: false,
          message: error?.message || 'Failed to start indexing'
        };
      }
    },
  },
};

