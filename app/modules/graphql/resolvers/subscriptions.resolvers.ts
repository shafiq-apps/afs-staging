/**
 * Subscriptions GraphQL Resolvers
 * Handles Shopify appSubscriptionCreate + persists to Elasticsearch
*/

import { GraphQLContext } from '../graphql.type';
import { createModuleLogger } from '@shared/utils/logger.util';
import { SubscriptionsRepository } from '@modules/subscriptions/subscriptions.repository';
import { ShopsRepository } from '@modules/shops/shops.repository';
import { APP_SUBSCRIPTION_CREATE_MUTATION } from '@modules/subscriptions/subscriptions.graphql';

const logger = createModuleLogger('subscriptions-resolvers');

// Repo instance per request
let subscriptionsRepo: SubscriptionsRepository | null = null;

function getESClient(context: GraphQLContext): any {
  const esClient = (context.req as any)?.esClient;
  if (!esClient) {
    logger.error('ES client not found in context.req');
    throw new Error('Elasticsearch client not available in context');
  }
  return esClient;
}

function getSubscriptionsRepository(context: GraphQLContext): SubscriptionsRepository {
  if (!subscriptionsRepo) {
    subscriptionsRepo = new SubscriptionsRepository(getESClient(context), context.req.shopsRepository as ShopsRepository);
  }
  return subscriptionsRepo;
}

export const subscriptionsResolvers = {
  Query: {
    async subscription(parent: any, args: { id: string }, context: GraphQLContext) {
      try {
        const { id } = args;
        const { shop } = context.req.query as any;
        if (!shop || !id) throw new Error('Shop and id are required');

        logger.log('Fetching subscription', { shop, id });
        const repo = getSubscriptionsRepository(context);
        return await repo.getSubscription(shop, id);
      } catch (error: any) {
        logger.error('Error in subscription query', {
          error: error?.message || error,
          stack: error?.stack,
          args,
        });
        throw error;
      }
    },
    async subscriptions(parent: any, args: {}, context: GraphQLContext) {
      try {
        const { shop } = context.req.query as any;
        if (!shop) throw new Error('Shop is required');

        logger.log('Fetching subscriptions', { shop });
        console.log('Fetching subscriptions for shop:', shop);
        const repo = getSubscriptionsRepository(context);
        const results = await repo.listSubscriptions(shop);
        return results.subscriptions;
      } catch (error: any) {
        logger.error('Error in subscriptions query', {
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
     * Create Shopify app subscription and persist in ES
    */
    async appSubscriptionCreate(
      parent: any,
      args: {
        name: string;
        returnUrl: string;
        lineItems: any[];
        trialDays?: number;
        test?: boolean;
        replacementBehavior?: string;
      },
      context: GraphQLContext
    ) {
      try {
        const { name, returnUrl, lineItems, trialDays, test, replacementBehavior } = args;

        if (!name || !returnUrl || !lineItems?.length) {
          throw new Error('name, returnUrl and lineItems are required');
        }

        const { shop } = (context.req.query as any);
        if (!shop) throw new Error('Shop not found in request context');

        logger.log('Creating Shopify app subscription', {
          shop,
          name,
          trialDays,
          test,
          replacementBehavior,
        });

        const repo = getSubscriptionsRepository(context);

        const variables = {
          name,
          returnUrl,
          lineItems,
          trialDays,
          test,
          replacementBehavior,
        };

        const payload = await repo.post<{
          appSubscriptionCreate: {
            appSubscription: {
              id: string;
              name: string;
              status: string;
              confirmationUrl: string;
              lineItems: { id: string; plan: { pricingDetails: any } }[];
            } | null;
            userErrors: { field?: string[]; message: string }[];
          };
        }>(shop, {
          query: APP_SUBSCRIPTION_CREATE_MUTATION,
          variables,
        });

        if (!payload) {
          throw new Error('Invalid response from Shopify');
        }

        if (payload.errors?.length) {
          logger.warn('Shopify returned user errors', { errors: payload.errors, shop, name });
        }

        return payload.data?.appSubscriptionCreate;
      } catch (error: any) {
        logger.error('Error in appSubscriptionCreate resolver', {
          error: error?.message || error,
          stack: error?.stack,
          args,
        });
        throw error;
      }
    },

    async updateSubscriptionStatus(
      parent: any,
      args: {
        id: string;
      },
      context: GraphQLContext
    ) {
      try {
        const { shop } = context.req.query as any;
        if (!shop) throw new Error('Shop is required');

        logger.log('Fetching subscriptions', { shop });
        
        const repo = getSubscriptionsRepository(context);
        const results = await repo.createOrUpdateSubscription(shop, args.id);
        return results;
      } catch (error: any) {
        logger.error('Error in subscriptions query', {
          error: error?.message || error,
          stack: error?.stack,
          args,
        });
        throw error;
      }
    }

  },
};
