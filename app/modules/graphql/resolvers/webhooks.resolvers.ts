/**
 * Webhooks Resolvers
 * Handles webhook processing via GraphQL mutations
 */

import { createModuleLogger } from '@shared/utils/logger.util';
import { GraphQLContext } from '../graphql.type';
import { getESClient as getESClientCore } from '@core/elasticsearch/es.client';
import { WEBHOOKS_QUEUE_INDEX_NAME } from '@shared/constants/es.constant';
import { v4 as uuidv4 } from 'uuid';
import { WebhooksRepository } from '@modules/webhooks/webhooks.repository';
import { WebhookReconciliationService } from '@modules/webhooks/webhooks.reconciliation.service';
import { performUninstallCleanup } from '@modules/webhooks/webhooks.uninstall.service';

const logger = createModuleLogger('webhooks-resolvers');

// Helper function to get ES client from context (matching pattern from other resolvers)
function getESClient(context: GraphQLContext): any {
  // Get ES client from request (injected by bootstrap)
  const esClient = (context.req as any)?.esClient;
  if (!esClient) {
    logger.warn('ES client not found in context.req, using core client', {
      reqKeys: Object.keys(context.req || {}),
      hasReq: !!context.req,
    });
    return getESClientCore();
  }
  return esClient;
}

export const webhooksResolvers = {
  Mutation: {
    /**
     * Process webhook event
     * Stores webhook in queue for async processing
     */
    async processWebhook(
      parent: any,
      args: { input: any },
      context: GraphQLContext
    ): Promise<{ success: boolean; message: string; webhookId?: string; processedAt?: string }> {
      try {
        const { input } = args;
        
        // Validate required fields
        if (!input || !input.topic || !input.shop || !input.eventType) {
          throw new Error('Missing required fields: topic, shop, eventType');
        }
        
        const { topic, shop, eventType, payload, receivedAt } = input;

        logger.info('Processing webhook event', {
          topic,
          shop,
          eventType,
        });

        const esClient = getESClient(context);
        if (!esClient) {
          throw new Error('Elasticsearch client not available');
        }
        
        const webhooksRepository = new WebhooksRepository(esClient);

        // Check for duplicates (deduplication)
        const entityId = input.productId || input.collectionId;
        const isDuplicate = await webhooksRepository.isDuplicate(topic, shop, entityId);

        if (isDuplicate) {
          logger.warn('Duplicate webhook detected, skipping', {
            topic,
            shop,
            entityId,
          });
          return {
            success: true,
            message: `Duplicate webhook ignored`,
            webhookId: uuidv4(),
            processedAt: new Date().toISOString(),
          };
        }

        // Store webhook in queue for async processing
        const webhook = await webhooksRepository.createWebhook({
          topic,
          shop,
          eventType,
          payload,
          receivedAt: receivedAt || new Date().toISOString(),
          productId: input.productId,
          productGid: input.productGid,
          productTitle: input.productTitle,
          productHandle: input.productHandle,
          collectionId: input.collectionId,
          collectionGid: input.collectionGid,
          collectionHandle: input.collectionHandle,
          collectionTitle: input.collectionTitle,
          isBestSellerCollection: input.isBestSellerCollection,
          sortOrderUpdated: input.sortOrderUpdated,
        });

        logger.info('Webhook event queued for processing', {
          webhookId: webhook.webhookId,
          topic,
          shop,
          eventType,
        });

        return {
          success: true,
          message: `Webhook event queued for processing`,
          webhookId: webhook.webhookId,
          processedAt: webhook.receivedAt,
        };
      } catch (error: any) {
        logger.error('Error processing webhook', {
          error: error?.message || error,
          stack: error?.stack,
          args,
        });
        throw error;
      }
    },

    /**
     * Process app uninstallation
     * Handles complete cleanup: delete index, filters, checkpoints, locks
     */
    async processAppUninstall(
      parent: any,
      args: { shop: string },
      context: GraphQLContext
    ): Promise<{ success: boolean; message: string; webhookId?: string; processedAt?: string }> {
      try {
        const { shop } = args;
        
        if (!shop) {
          throw new Error('Shop domain is required');
        }

        logger.info('Processing app uninstallation', { shop });

        const esClient = getESClient(context);
        if (!esClient) {
          throw new Error('Elasticsearch client not available');
        }

        // Use shared uninstall cleanup service
        await performUninstallCleanup(esClient, shop);
        
        const processedAt = new Date().toISOString();

        return {
          success: true,
          message: `Shop uninstalled successfully`,
          webhookId: uuidv4(),
          processedAt,
        };
      } catch (error: any) {
        logger.error(`Error during uninstallation cleanup`, {
          error: error?.message || error,
          stack: error?.stack,
          shop: args.shop,
        });
        throw error;
      }
    },

    /**
     * Trigger webhook reconciliation for a shop
     */
    async reconcileWebhooks(
      parent: any,
      args: { shop: string },
      context: GraphQLContext
    ): Promise<any> {
      try {
        const { shop } = args;
        
        if (!shop) {
          throw new Error('Shop domain is required');
        }

        logger.info('Triggering webhook reconciliation', { shop });

        const esClient = getESClient(context);
        const reconciliationService = new WebhookReconciliationService(esClient);
        
        const result = await reconciliationService.reconcileShop(shop);

        return result;
      } catch (error: any) {
        logger.error('Error during webhook reconciliation', {
          error: error?.message || error,
          stack: error?.stack,
          shop: args.shop,
        });
        throw error;
      }
    },

    /**
     * Trigger webhook reconciliation for all shops
     */
    async reconcileAllWebhooks(
      parent: any,
      args: {},
      context: GraphQLContext
    ): Promise<any[]> {
      try {
        logger.info('Triggering webhook reconciliation for all shops');

        const esClient = getESClient(context);
        const reconciliationService = new WebhookReconciliationService(esClient);
        
        const results = await reconciliationService.reconcileAllShops();

        return results;
      } catch (error: any) {
        logger.error('Error during webhook reconciliation for all shops', {
          error: error?.message || error,
          stack: error?.stack,
        });
        throw error;
      }
    },
  },
  Query: {
    /**
     * Get webhook status by ID
     */
    async webhookStatus(
      parent: any,
      args: { webhookId: string },
      context: GraphQLContext
    ): Promise<any | null> {
      try {
        const { webhookId } = args;
        
        if (!webhookId) {
          throw new Error('Webhook ID is required');
        }

        const esClient = getESClient(context);
        const webhooksRepository = new WebhooksRepository(esClient);
        
        // Search for webhook by webhookId
        const response = await esClient.search({
          index: WEBHOOKS_QUEUE_INDEX_NAME,
          query: {
            term: { webhookId },
          },
          size: 1,
        });

        if (!response.hits || !response.hits.hits || response.hits.hits.length === 0) {
          return null;
        }

        const webhook = response.hits.hits[0]?._source as any;
        if (!webhook) {
          return null;
        }
        return {
          webhookId: webhook.webhookId || args.webhookId,
          topic: webhook.topic || '',
          shop: webhook.shop || '',
          eventType: webhook.eventType || '',
          status: webhook.status || 'pending',
          receivedAt: webhook.receivedAt || '',
          processedAt: webhook.processedAt || null,
          retryCount: webhook.retryCount || 0,
          error: webhook.error || null,
        };
      } catch (error: any) {
        logger.error('Error getting webhook status', {
          error: error?.message || error,
          webhookId: args.webhookId,
        });
        throw error;
      }
    },

    /**
     * Get pending webhooks count for a shop
     */
    async pendingWebhooksCount(
      parent: any,
      args: { shop: string },
      context: GraphQLContext
    ): Promise<number> {
      try {
        const { shop } = args;
        
        if (!shop) {
          throw new Error('Shop domain is required');
        }

        const esClient = getESClient(context);
        if (!esClient) {
          logger.error('Elasticsearch client not available', { shop });
          return 0;
        }
        
        const webhooksRepository = new WebhooksRepository(esClient);
        
        const pendingWebhooks = await webhooksRepository.getPendingWebhooks(1000);
        if (!Array.isArray(pendingWebhooks)) {
          return 0;
        }
        
        const shopPending = pendingWebhooks.filter(w => w && w.shop === shop);

        return shopPending.length;
      } catch (error: any) {
        logger.error('Error getting pending webhooks count', {
          error: error?.message || error,
          shop: args.shop,
        });
        return 0;
      }
    },
  },
};

