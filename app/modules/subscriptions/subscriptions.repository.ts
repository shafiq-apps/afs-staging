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
import { APP_SUBSCRIPTION_STATUS_QUERY } from './subscriptions.graphql';

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
    shop: string,
    id: string
  ): Promise<StoredSubscription | null> {
    try {
      const index = SUBSCRIPTIONS_INDEX_NAME;

      const response = await this.esClient.search({
        index,
        query: {
          bool: {
            must: [
              {
                bool: {
                  should: [
                    { term: { 'shop.keyword': shop } },
                    { term: { shop } },
                  ],
                  minimum_should_match: 1,
                },
              },
              {
                bool: {
                  should: [
                    { term: { 'id.keyword': id } },
                    { term: { id } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
        },
        size: 1,
      });

      if (response.hits.hits.length > 0) {
        return this.normalize(response.hits.hits[0]._source as any);
      }

      return null;
    } catch (error: any) {
      if (error.statusCode === 404) return null;
      logger.error('Error getting subscription', {
        shop,
        id,
        error: error?.message || error,
      });
      throw error;
    }
  }

  /**
   * List all subscriptions for a shop
   */
  async listSubscriptions(
    shop: string
  ): Promise<{ subscriptions: StoredSubscription[]; total: number }> {
    try {
      const index = SUBSCRIPTIONS_INDEX_NAME;

      const response = await this.esClient.search({
        index,
        query: {
          bool: {
            must: [
              {
                bool: {
                  should: [
                    { term: { 'shop.keyword': shop } },
                    { term: { shop } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
        },
        size: 10000,
        sort: [{ createdAt: { order: 'desc' } }],
      });

      const total =
        typeof response.hits.total === 'number'
          ? response.hits.total
          : response.hits.total?.value || 0;

      const subscriptions = response.hits.hits.map(hit =>
        this.normalize(hit._source as any)
      );

      return { subscriptions, total };
    } catch (error: any) {
      if (error.statusCode === 404) {
        return { subscriptions: [], total: 0 };
      }
      logger.error('Error listing subscriptions', {
        shop,
        error: error?.message || error,
      });
      throw error;
    }
  }

  /**
   * Create and store a new subscription record
   */
  async createSubscription(
    shop: string,
    data: Omit<StoredSubscription, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<StoredSubscription> {
    try {
      const index = SUBSCRIPTIONS_INDEX_NAME;
      const id = uuidv4();
      const now = new Date().toISOString();

      const subscription: StoredSubscription = {
        id,
        shop,
        shopifySubscriptionId: data.shopifySubscriptionId,
        name: data.name,
        status: data.status,
        confirmationUrl: data.confirmationUrl ?? null,
        test: data.test ?? false,
        lineItems: data.lineItems || [],
        createdAt: now,
        updatedAt: null,
      };

      await this.esClient.index({
        index,
        id,
        document: subscription,
      });

      logger.info('Subscription created', {
        shop,
        id,
        shopifySubscriptionId: subscription.shopifySubscriptionId,
        status: subscription.status,
      });

      return subscription;
    } catch (error: any) {
      logger.error('Error creating subscription', {
        shop,
        error: error?.message || error,
      });
      throw error;
    }
  }

  /**
 * Update subscription status by fetching latest state from Shopify
 * This prevents client-side tampering.
 */
  async updateSubscriptionStatus(
    shop: string,
    id: string
  ): Promise<StoredSubscription> {
    try {
      const index = SUBSCRIPTIONS_INDEX_NAME;

      const existing = await this.getSubscription(shop, id);
      if (!existing) {
        throw new Error(`Subscription ${id} not found for shop ${shop}`);
      }

      // 🔐 Fetch latest status from Shopify
      const shopifyRes = await this.post<{
        appSubscription: {
          id: string;
          status: string;
          name: string;
          lineItems: Array<{
            id: string;
            plan?: { pricingDetails?: any };
          }>;
        } | null;
      }>(shop, {
        query: APP_SUBSCRIPTION_STATUS_QUERY,
        variables: {
          id: existing.shopifySubscriptionId,
        },
      });

      if (shopifyRes.errors?.length) {
        logger.error('Errors fetching subscription from Shopify', {
          shop,
          id,
          errors: shopifyRes.errors,
        });
        throw new Error('Failed to fetch subscription from Shopify');
      }

      const remote = shopifyRes.data?.appSubscription;
      if (!remote) {
        throw new Error(
          `Shopify subscription not found: ${existing.shopifySubscriptionId}`
        );
      }

      const updated: StoredSubscription = {
        ...existing,
        name: remote.name ?? existing.name,
        status: remote.status, // authoritative status
        lineItems: remote.lineItems.map(li => ({
          id: li.id,
          pricingDetails: li.plan?.pricingDetails,
        })),
        updatedAt: new Date().toISOString(),
      };

      await this.esClient.index({
        index,
        id,
        document: updated,
      });

      logger.info('Subscription status synced from Shopify', {
        shop,
        id,
        shopifyId: existing.shopifySubscriptionId,
        status: updated.status,
      });

      return updated;
    } catch (error: any) {
      logger.error('Error syncing subscription status from Shopify', {
        shop,
        id,
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

      const existing = await this.getSubscription(shop, id);
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
