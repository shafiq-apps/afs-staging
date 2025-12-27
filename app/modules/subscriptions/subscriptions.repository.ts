/**
 * Subscriptions Repository
 * Handles Elasticsearch operations for Shopify app subscriptions (recurring charges)
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';
import { v4 as uuidv4 } from 'uuid';
import { SUBSCRIPTIONS_INDEX_NAME } from '@shared/constants/es.constant';
import { ShopifyAdminHandler } from '@core/http/shopify-admin.handler';
import { ShopsRepository } from '@modules/shops/shops.repository';

import {
  GraphQLResponse,
  StoredSubscription,
  StoredSubscriptionLineItem,
} from './subscriptions.type';
import { APP_SUBSCRIPTION_QUERY } from './subscriptions.graphql';

const logger = createModuleLogger('subscriptions-repository');

export class SubscriptionsRepository {
  private handler: ReturnType<typeof ShopifyAdminHandler.create>;

  constructor(private esClient: Client, shopsRepository: ShopsRepository) {
    this.handler = ShopifyAdminHandler.create({ shopsRepository });
  }

  async post<T>(
    shop: string,
    { query, variables }: { query: string; variables?: any }
  ): Promise<GraphQLResponse<T>> {
    const response = await this.handler.graphql<T>(shop, query, variables);

    return {
      status: response.status,
      data: response.data,
      errors: response.errors,
    };
  }

  /**
   * Normalize subscription data from Elasticsearch
   */
  private normalize(data: any): StoredSubscription {
    return {
      id: data.id,
      shop: data.shop,
      shopifySubscriptionId: data.shopifySubscriptionId,
      name: data.name,
      status: data.status,
      confirmationUrl: data.confirmationUrl ?? null,
      test: data.test ?? false,
      lineItems: (data.lineItems || []) as StoredSubscriptionLineItem[],
      createdAt: data.createdAt,
      updatedAt: data.updatedAt ?? null,
    };
  }

  /**
   * Get subscription by ID for a shop
   */
  async getSubscription(
    shop: string
  ): Promise<StoredSubscription | null> {
    try {
      const index = SUBSCRIPTIONS_INDEX_NAME;

      const response = await this.esClient.search({
        index,
        query: {
          "term": {
            "_id": {
              "value": shop
            }
          }
        },
        size: 1
      });

      if (response.hits.hits.length > 0) {
        const hits = this.normalize(response.hits.hits[0]._source as any);
        console.log("hits", hits);
        return hits;
      }

      return null;
    } catch (error: any) {
      if (error.statusCode === 404) return null;
      logger.error('Error getting subscription', {
        shop,
        error: error?.message || error,
      });
      throw error;
    }
  }

  /**
 * Create or update subscription by fetching latest data from Shopify
 * This prevents client-side tampering.
 */
  async createOrUpdateSubscription(shop: string, shopifySubscriptionId: string): Promise<StoredSubscription> {
    try {
      const index = SUBSCRIPTIONS_INDEX_NAME;
      const shopifyRes = await this.post<{
        node: {
          id: string;
          name: string;
          status: string;
          test: boolean;
          lineItems: any[]
          createdAt: string;
        } | null;
      }>(shop, {
        query: APP_SUBSCRIPTION_QUERY,
        variables: {
          shopifySubscriptionId: shopifySubscriptionId, // must be gid://shopify/AppSubscription/...
        },
      });

      if (shopifyRes.errors?.length) {
        logger.error('Errors fetching subscription from Shopify', {
          shop,
          shopifySubscriptionId: shopifySubscriptionId,
          errors: shopifyRes.errors,
        });
        console.log(shopifyRes.errors)
        throw new Error('Failed to fetch subscription from Shopify');
      }

      const remote = shopifyRes.data?.node;
      if (!remote) {
        throw new Error(
          `Shopify subscription not found: ${shopifySubscriptionId}`
        );
      }

      const updated: StoredSubscription = {
        ...remote,
        name: remote.name,
        status: remote.status,
        test: remote.test,
        updatedAt: new Date().toISOString(),
        shopifySubscriptionId: remote.id || shopifySubscriptionId,
        createdAt: remote.createdAt || new Date().toISOString(),
        lineItems: remote.lineItems || [],
      };

      await this.esClient.index({
        index,
        id: shop,
        document: updated
      });

      logger.info('Subscription status synced from Shopify', {
        shop,
        id: remote.id,
        shopifySubscriptionId: shopifySubscriptionId,
        status: updated.status,
      });

      return updated;
    } catch (error: any) {
      logger.error('Error syncing subscription status from Shopify', {
        shop,
        id: shopifySubscriptionId,
        error: error?.message || error,
        stack: error?.stack,
      });
      throw error;
    }
  }



  /**
   * Delete a subscription
   */
  async deleteSubscription(shop: string, id: string): Promise<boolean> {
    try {
      const index = SUBSCRIPTIONS_INDEX_NAME;

      const existing = await this.getSubscription(shop);
      if (!existing) return false;

      await this.esClient.delete({ index, id });

      logger.info('Subscription deleted', { shop, id });
      return true;
    } catch (error: any) {
      if (error.statusCode === 404) return false;
      logger.error('Error deleting subscription', {
        shop,
        id,
        error: error?.message || error,
      });
      throw error;
    }
  }
}
