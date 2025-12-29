/**
 * Subscriptions GraphQL Resolvers
 * Handles Shopify appSubscriptionCreate + persists to Elasticsearch
*/

import { GraphQLContext } from '../graphql.type';
import { createModuleLogger } from '@shared/utils/logger.util';
import { SubscriptionsRepository } from '@modules/subscriptions/subscriptions.repository';
import { ShopsRepository } from '@modules/shops/shops.repository';
import { APP_SUBSCRIPTION_CREATE_MUTATION } from '@modules/subscriptions/subscriptions.graphql';
import { SubscriptionPlansRepository } from '@modules/subscription-plans/subscription-plans.repository';
import { normalizeShopName } from '@shared/utils/shop.util';

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
    async subscription(parent: any, args: any, context: GraphQLContext) {
      try {
        const { shop } = context.req.query as any;
        if (!shop) throw new Error('Shop and id are required');

        logger.log('Fetching subscription', { shop });
        const repo = getSubscriptionsRepository(context);
        return await repo.getSubscription(shop);
      } catch (error: any) {
        logger.error('Error in subscription query', {
          error: error?.message || error,
          stack: error?.stack,
          args,
        });
        throw error;
      }
    },

    subscriptionPlans: async (parent, args, context: GraphQLContext) => {
      const repo = new SubscriptionPlansRepository(context.req.esClient);
      return repo.list();
    },
    subscriptionPlan: async (parent, args, context: GraphQLContext) => {
      const repo = new SubscriptionPlansRepository(context.req.esClient);
      return repo.get(args.id);
    },
  },

  Mutation: {
    async appSubscriptionCreate(
      parent: any,
      args: {
        planId: string;
      },
      context: GraphQLContext
    ) {
      try {
        const { planId } = args;

        if (!planId) {
          throw new Error('planId is required');
        }

        const { shop } = context.req.query as any;
        if (!shop) throw new Error('Shop not found in request context');

        logger.log('Creating Shopify app subscription from plan', {
          shop,
          planId
        });

        // Fetch trusted plan from your ES repository
        const plansRepo = new SubscriptionPlansRepository(context.req.esClient);
        const plan = await plansRepo.get(planId);

        if (!plan) {
          throw new Error(`Subscription plan not found: ${planId}`);
        }

        // Build lineItems ONLY from server-side plan
        const lineItems = [
          {
            plan: {
              appRecurringPricingDetails: {
                price: {
                  amount: plan.price.amount,
                  currencyCode: plan.price.currencyCode,
                },
                interval: plan.interval, // EVERY_30_DAYS | ANNUAL
              },
            },
          },
        ];

        const repo = getSubscriptionsRepository(context);

        const timestamps = Date.now();

        const returnUrl = `https://admin.shopify.com/store/${normalizeShopName(shop)}/apps/${process.env.SHOPIFY_APP_HANDLE}/app/subscriptions/thankyou?timestamps=${timestamps}&shop=${encodeURIComponent(shop)}`

        const variables = {
          name: plan.name,
          lineItems,
          returnUrl,
          trialDays: parseInt(process.env.SHOPIFY_APP_SUBSCRIPTIONS_TRIAL_DAYS, 10)??21,
          test: process.env.SHOPIFY_APP_SUBSCRIPTIONS_TEST_MODE === 'true',
        };

        const payload = await repo.post<{
          appSubscriptionCreate: {
            appSubscription: {
              id: string;
              name: string;
              status: string;
              confirmationUrl: string;
              lineItems: {
                id: string;
                plan: { pricingDetails: any };
              }[];
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

        if (payload.data?.appSubscriptionCreate?.userErrors?.length) {
          logger.warn('Shopify returned user errors', {
            errors: payload.data.appSubscriptionCreate.userErrors,
            shop,
            planId,
          });
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

    async updateSubscriptionStatus(parent: any, args: { id: string; }, context: GraphQLContext) {
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
    },
    createSubscriptionPlan: async (parent, args, context: GraphQLContext) => {
      const repo = new SubscriptionPlansRepository(context.req.esClient);
      return repo.create(args.input);
    },
    deleteSubscriptionPlan: async (parent, args, context: GraphQLContext) => {
      const repo = new SubscriptionPlansRepository(context.req.esClient);
      return repo.delete(args.id);
    },

  },
};
