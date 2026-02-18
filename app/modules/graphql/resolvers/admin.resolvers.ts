/**
 * Admin GraphQL Resolvers
 * Handles admin panel queries and mutations.
 */

import { GraphQLContext } from '../graphql.type';
import { createModuleLogger } from '@shared/utils/logger.util';
import { AdminUsersRepository } from '@modules/admin/admin-users.repository';
import {
  ADMIN_USERS_INDEX_NAME,
  SHOPS_INDEX_NAME,
  SUBSCRIPTIONS_INDEX_NAME,
  SUBSCRIPTION_PLANS_INDEX_NAME,
} from '@shared/constants/es.constant';
import { addApiKey, removeApiKey } from '@core/security/api-keys.helper';
import { ShopsRepository } from '@modules/shops/shops.repository';
import { SubscriptionPlansRepository } from '@modules/subscription-plans/subscription-plans.repository';

const logger = createModuleLogger('admin-resolvers');

let adminUsersRepo: AdminUsersRepository | null = null;
let shopsRepo: ShopsRepository | null = null;

function getESClient(context: GraphQLContext): any {
  const esClient = (context.req as any)?.esClient;
  if (!esClient) {
    logger.error('ES client not found in GraphQL context');
    throw new Error('Elasticsearch client not available in context');
  }
  return esClient;
}

function requireAdmin(context: GraphQLContext): any {
  const adminUser = (context.req as any)?.adminUser;
  if (!adminUser) {
    throw new Error('Admin authentication required');
  }
  return adminUser;
}

function getAdminUsersRepository(context: GraphQLContext): AdminUsersRepository {
  if (!adminUsersRepo) {
    adminUsersRepo = new AdminUsersRepository(getESClient(context), ADMIN_USERS_INDEX_NAME);
  }
  return adminUsersRepo;
}

function getShopsRepository(context: GraphQLContext): ShopsRepository {
  if (!shopsRepo) {
    shopsRepo = new ShopsRepository(getESClient(context), SHOPS_INDEX_NAME);
  }
  return shopsRepo;
}

function toPagination(args: { limit?: number; offset?: number }) {
  return {
    limit: Math.min(Math.max(args.limit || 50, 1), 500),
    offset: Math.max(args.offset || 0, 0),
  };
}

async function resolveSubscriptionDocId(esClient: any, id: string): Promise<string | null> {
  try {
    const existing = await esClient.get({
      index: SUBSCRIPTIONS_INDEX_NAME,
      id,
    });
    if (existing?.found) {
      return id;
    }
  } catch (error: any) {
    if (error?.statusCode !== 404) {
      throw error;
    }
  }

  const response = await esClient.search({
    index: SUBSCRIPTIONS_INDEX_NAME,
    size: 1,
    query: {
      bool: {
        should: [
          { term: { id } },
          { term: { shopifySubscriptionId: id } },
        ],
        minimum_should_match: 1,
      },
    },
  });

  const hit = response?.hits?.hits?.[0];
  if (!hit) {
    return null;
  }
  return hit._id || null;
}

export const adminResolvers = {
  Query: {
    async adminUsers(parent: any, args: any, context: GraphQLContext) {
      requireAdmin(context);
      return getAdminUsersRepository(context).list(500, 0);
    },

    async adminUser(parent: any, args: { id: string }, context: GraphQLContext) {
      requireAdmin(context);
      return getAdminUsersRepository(context).getById(args.id);
    },

    async adminUserByEmail(parent: any, args: { email: string }, context: GraphQLContext) {
      requireAdmin(context);
      return getAdminUsersRepository(context).getByEmail(args.email);
    },

    async adminShops(parent: any, args: { limit?: number; offset?: number }, context: GraphQLContext) {
      requireAdmin(context);
      const { limit, offset } = toPagination(args);
      const esClient = getESClient(context);

      const response = await esClient.search({
        index: SHOPS_INDEX_NAME,
        from: offset,
        size: limit,
        query: { match_all: {} },
        sort: [
          { updatedAt: { order: 'desc', unmapped_type: 'date' } },
          { shop: { order: 'asc', unmapped_type: 'keyword' } },
        ],
      });

      return (response?.hits?.hits || []).map((hit: any) => hit._source).filter(Boolean);
    },

    async adminShop(parent: any, args: { shop: string }, context: GraphQLContext) {
      requireAdmin(context);
      const repo = getShopsRepository(context);
      return repo.getShop(args.shop);
    },

    async adminSubscriptions(parent: any, args: { limit?: number; offset?: number }, context: GraphQLContext) {
      requireAdmin(context);
      const { limit, offset } = toPagination(args);
      const esClient = getESClient(context);

      const response = await esClient.search({
        index: SUBSCRIPTIONS_INDEX_NAME,
        from: offset,
        size: limit,
        query: { match_all: {} },
        sort: [
          { updatedAt: { order: 'desc', unmapped_type: 'date' } },
          { createdAt: { order: 'desc', unmapped_type: 'date' } },
        ],
      });

      return (response?.hits?.hits || []).map((hit: any) => hit._source).filter(Boolean);
    },

    async adminSubscription(parent: any, args: { id: string }, context: GraphQLContext) {
      requireAdmin(context);
      const esClient = getESClient(context);
      const docId = await resolveSubscriptionDocId(esClient, args.id);
      if (!docId) {
        return null;
      }

      const response = await esClient.get({
        index: SUBSCRIPTIONS_INDEX_NAME,
        id: docId,
      });

      if (!response?.found) {
        return null;
      }

      return response._source || null;
    },

    async adminSubscriptionPlans(parent: any, args: { limit?: number; offset?: number }, context: GraphQLContext) {
      requireAdmin(context);
      const { limit, offset } = toPagination(args);
      const esClient = getESClient(context);

      const response = await esClient.search({
        index: SUBSCRIPTION_PLANS_INDEX_NAME,
        from: offset,
        size: limit,
        query: { match_all: {} },
        sort: [
          { createdAt: { order: 'desc', unmapped_type: 'date' } },
        ],
      });

      return (response?.hits?.hits || []).map((hit: any) => hit._source).filter(Boolean);
    },

    async adminSubscriptionPlan(parent: any, args: { id: string }, context: GraphQLContext) {
      requireAdmin(context);
      const repo = new SubscriptionPlansRepository(getESClient(context));
      return repo.get(args.id);
    },
  },

  Mutation: {
    async createAdminUser(parent: any, args: { input: any }, context: GraphQLContext) {
      requireAdmin(context);
      const repo = getAdminUsersRepository(context);
      const created = await repo.create(args.input);

      addApiKey({
        key: created.apiKey,
        secret: created.apiSecret,
        name: `Admin user ${created.user.email}`,
        description: `Generated for admin user ${created.user.id}`,
        enabled: true,
      });

      return created;
    },

    async updateAdminUser(parent: any, args: { id: string; input: any }, context: GraphQLContext) {
      requireAdmin(context);
      const repo = getAdminUsersRepository(context);
      const updated = await repo.update(args.id, args.input);
      if (!updated) {
        throw new Error(`Admin user not found: ${args.id}`);
      }
      return updated;
    },

    async deleteAdminUser(parent: any, args: { id: string }, context: GraphQLContext): Promise<boolean> {
      requireAdmin(context);
      const repo = getAdminUsersRepository(context);
      const result = await repo.delete(args.id);
      if (result.deleted && result.apiKey) {
        removeApiKey(result.apiKey);
      }
      return result.deleted;
    },

    async regenerateAdminUserApiCredentials(parent: any, args: { id: string }, context: GraphQLContext) {
      requireAdmin(context);
      const repo = getAdminUsersRepository(context);
      const result = await repo.regenerateApiCredentials(args.id);
      if (!result) {
        throw new Error(`Admin user not found: ${args.id}`);
      }

      if (result.previousApiKey) {
        removeApiKey(result.previousApiKey);
      }

      addApiKey({
        key: result.apiKey,
        secret: result.apiSecret,
        name: `Admin user ${result.user.email}`,
        description: `Regenerated for admin user ${result.user.id}`,
        enabled: true,
      });

      return {
        user: result.user,
        apiKey: result.apiKey,
        apiSecret: result.apiSecret,
      };
    },

    async updateAdminShop(parent: any, args: { shop: string; input: Record<string, any> }, context: GraphQLContext) {
      requireAdmin(context);
      const repo = getShopsRepository(context);
      const updated = await repo.updateShop(args.shop, args.input || {});
      if (!updated) {
        throw new Error(`Shop not found: ${args.shop}`);
      }
      return updated;
    },

    async updateAdminSubscription(
      parent: any,
      args: { id: string; input: Record<string, any> },
      context: GraphQLContext
    ) {
      requireAdmin(context);
      const esClient = getESClient(context);
      const docId = await resolveSubscriptionDocId(esClient, args.id);
      if (!docId) {
        throw new Error(`Subscription not found: ${args.id}`);
      }

      await esClient.update({
        index: SUBSCRIPTIONS_INDEX_NAME,
        id: docId,
        doc: {
          ...(args.input || {}),
          updatedAt: new Date().toISOString(),
        },
        refresh: true,
      });

      const updated = await esClient.get({
        index: SUBSCRIPTIONS_INDEX_NAME,
        id: docId,
      });

      if (!updated?.found) {
        throw new Error(`Subscription not found after update: ${args.id}`);
      }

      return updated._source;
    },
  },
};

