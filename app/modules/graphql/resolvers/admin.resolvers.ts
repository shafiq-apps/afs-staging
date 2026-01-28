/**
 * Admin GraphQL Resolvers
 * Resolvers for admin panel queries and mutations
 * Includes permission checks
 */

import { GraphQLContext } from '../graphql.type';
import { createModuleLogger } from '@shared/utils/logger.util';
import { AdminUsersService } from '@modules/admin-users/admin-users.service';
import { AdminUser } from '@modules/admin-users/admin-users.type';
import { SHOPS_INDEX_NAME, SUBSCRIPTIONS_INDEX_NAME, SUBSCRIPTION_PLANS_INDEX_NAME } from '@shared/constants/es.constant';

const logger = createModuleLogger('admin-resolvers');

/**
 * Get current admin user from context
 */
function getCurrentUser(context: GraphQLContext): AdminUser | null {
  return (context.req as any).adminUser || null;
}

/**
 * Check if user has permission
 */
function hasPermission(user: AdminUser | null, permission: keyof AdminUser['permissions']): boolean {
  if (!user || !user.isActive) {
    return false;
  }
  return user.permissions[permission] === true;
}

/**
 * Require permission or throw error
 */
function requirePermission(user: AdminUser | null, permission: keyof AdminUser['permissions'], operation: string): void {
  if (!hasPermission(user, permission)) {
    throw new Error(`Permission denied: ${permission} required for ${operation}`);
  }
}

/**
 * Get ES client from context
 */
function getESClient(context: GraphQLContext): any {
  const esClient = (context.req as any).esClient;
  if (!esClient) {
    throw new Error('ES client not available in context');
  }
  return esClient;
}

/**
 * Get admin users service from context
 */
function getAdminUsersService(context: GraphQLContext): AdminUsersService {
  const service = (context.req as any).adminUsersService;
  if (!service) {
    throw new Error('AdminUsersService not available in context');
  }
  return service;
}

export const adminResolvers = {
  Query: {
    /**
     * Get all admin users
     */
    async adminUsers(parent: any, args: any, context: GraphQLContext) {
      const user = getCurrentUser(context);
      requirePermission(user, 'canManageTeam', 'adminUsers');

      try {
        const service = getAdminUsersService(context);
        const users = await service.getAllUsers();
        return users;
      } catch (error: any) {
        logger.error('Failed to get admin users', { error: error?.message || error });
        throw error;
      }
    },

    /**
     * Get admin user by ID
     */
    async adminUser(parent: any, args: { id: string }, context: GraphQLContext) {
      const user = getCurrentUser(context);
      requirePermission(user, 'canManageTeam', 'adminUser');

      try {
        const service = getAdminUsersService(context);
        const foundUser = await service.getUserById(args.id);
        
        if (!foundUser) {
          throw new Error(`Admin user with ID ${args.id} not found`);
        }

        return foundUser;
      } catch (error: any) {
        logger.error('Failed to get admin user', { id: args.id, error: error?.message || error });
        throw error;
      }
    },

    /**
     * Get admin user by email
     */
    async adminUserByEmail(parent: any, args: { email: string }, context: GraphQLContext) {
      const user = getCurrentUser(context);
      requirePermission(user, 'canManageTeam', 'adminUserByEmail');

      try {
        const service = getAdminUsersService(context);
        const foundUser = await service.getUserByEmail(args.email);
        
        if (!foundUser) {
          throw new Error(`Admin user with email ${args.email} not found`);
        }

        return foundUser;
      } catch (error: any) {
        logger.error('Failed to get admin user by email', { email: args.email, error: error?.message || error });
        throw error;
      }
    },

    /**
     * Get all shops (admin view)
     */
    async adminShops(parent: any, args: { limit?: number; offset?: number }, context: GraphQLContext) {
      const user = getCurrentUser(context);
      requirePermission(user, 'canManageShops', 'adminShops');

      try {
        const esClient = getESClient(context);
        const limit = args.limit || 100;
        const offset = args.offset || 0;

        const response = await esClient.search({
          index: SHOPS_INDEX_NAME,
          body: {
            query: { match_all: {} },
            size: limit,
            from: offset,
          },
        });

        const shops = response.hits.hits.map((hit: any) => ({
          ...hit._source,
          shop: hit._source.shop || hit._id,
        }));

        return shops;
      } catch (error: any) {
        logger.error('Failed to get admin shops', { error: error?.message || error });
        throw error;
      }
    },

    /**
     * Get shop by domain (admin view)
     */
    async adminShop(parent: any, args: { shop: string }, context: GraphQLContext) {
      const user = getCurrentUser(context);
      requirePermission(user, 'canManageShops', 'adminShop');

      try {
        const esClient = getESClient(context);
        const response = await esClient.get({
          index: SHOPS_INDEX_NAME,
          id: args.shop,
        });

        if (!response.found) {
          throw new Error(`Shop ${args.shop} not found`);
        }

        const shop = {
          ...response._source,
          shop: response._source.shop || args.shop,
        };

        return shop;
      } catch (error: any) {
        logger.error('Failed to get admin shop', { shop: args.shop, error: error?.message || error });
        throw error;
      }
    },

    /**
     * Get all subscriptions
     */
    async adminSubscriptions(parent: any, args: { limit?: number; offset?: number }, context: GraphQLContext) {
      const user = getCurrentUser(context);
      requirePermission(user, 'canViewSubscriptions', 'adminSubscriptions');

      try {
        const esClient = getESClient(context);
        const limit = args.limit || 100;
        const offset = args.offset || 0;

        const response = await esClient.search({
          index: SUBSCRIPTIONS_INDEX_NAME,
          body: {
            query: { match_all: {} },
            size: limit,
            from: offset,
          },
        });

        const subscriptions = response.hits.hits.map((hit: any) => ({
          ...hit._source,
          id: hit._id,
        }));

        return subscriptions;
      } catch (error: any) {
        logger.error('Failed to get admin subscriptions', { error: error?.message || error });
        throw error;
      }
    },

    /**
     * Get subscription by ID
     */
    async adminSubscription(parent: any, args: { id: string }, context: GraphQLContext) {
      const user = getCurrentUser(context);
      requirePermission(user, 'canViewSubscriptions', 'adminSubscription');

      try {
        const esClient = getESClient(context);
        const response = await esClient.get({
          index: SUBSCRIPTIONS_INDEX_NAME,
          id: args.id,
        });

        if (!response.found) {
          throw new Error(`Subscription ${args.id} not found`);
        }

        const subscription = {
          ...response._source,
          id: response._id,
        };

        return subscription;
      } catch (error: any) {
        logger.error('Failed to get admin subscription', { id: args.id, error: error?.message || error });
        throw error;
      }
    },

    /**
     * Get all subscription plans
     */
    async adminSubscriptionPlans(parent: any, args: { limit?: number; offset?: number }, context: GraphQLContext) {
      const user = getCurrentUser(context);
      requirePermission(user, 'canViewSubscriptions', 'adminSubscriptionPlans');

      try {
        const esClient = getESClient(context);
        const limit = args.limit || 100;
        const offset = args.offset || 0;

        const response = await esClient.search({
          index: SUBSCRIPTION_PLANS_INDEX_NAME,
          body: {
            query: { match_all: {} },
            size: limit,
            from: offset,
          },
        });

        const plans = response.hits.hits.map((hit: any) => ({
          ...hit._source,
          id: hit._id,
        }));

        return plans;
      } catch (error: any) {
        logger.error('Failed to get admin subscription plans', { error: error?.message || error });
        throw error;
      }
    },

    /**
     * Get subscription plan by ID
     */
    async adminSubscriptionPlan(parent: any, args: { id: string }, context: GraphQLContext) {
      const user = getCurrentUser(context);
      requirePermission(user, 'canViewSubscriptions', 'adminSubscriptionPlan');

      try {
        const esClient = getESClient(context);
        const response = await esClient.get({
          index: SUBSCRIPTION_PLANS_INDEX_NAME,
          id: args.id,
        });

        if (!response.found) {
          throw new Error(`Subscription plan ${args.id} not found`);
        }

        const plan = {
          ...response._source,
          id: response._id,
        };

        return plan;
      } catch (error: any) {
        logger.error('Failed to get admin subscription plan', { id: args.id, error: error?.message || error });
        throw error;
      }
    },
  },

  Mutation: {
    /**
     * Create admin user
     */
    async createAdminUser(parent: any, args: { input: any }, context: GraphQLContext) {
      const user = getCurrentUser(context);
      requirePermission(user, 'canManageTeam', 'createAdminUser');

      try {
        const service = getAdminUsersService(context);
        const result = await service.createUser(args.input);
        return result;
      } catch (error: any) {
        logger.error('Failed to create admin user', { error: error?.message || error });
        throw error;
      }
    },

    /**
     * Update admin user
     */
    async updateAdminUser(parent: any, args: { id: string; input: any }, context: GraphQLContext) {
      const user = getCurrentUser(context);
      requirePermission(user, 'canManageTeam', 'updateAdminUser');

      try {
        const service = getAdminUsersService(context);
        const updated = await service.updateUser(args.id, args.input);
        
        if (!updated) {
          throw new Error(`Admin user with ID ${args.id} not found`);
        }

        return updated;
      } catch (error: any) {
        logger.error('Failed to update admin user', { id: args.id, error: error?.message || error });
        throw error;
      }
    },

    /**
     * Delete admin user
     */
    async deleteAdminUser(parent: any, args: { id: string }, context: GraphQLContext) {
      const user = getCurrentUser(context);
      requirePermission(user, 'canManageTeam', 'deleteAdminUser');

      // Prevent deleting yourself
      if (user && user.id === args.id) {
        throw new Error('Cannot delete your own account');
      }

      try {
        const service = getAdminUsersService(context);
        const deleted = await service.deleteUser(args.id);
        
        if (!deleted) {
          throw new Error(`Admin user with ID ${args.id} not found`);
        }

        return true;
      } catch (error: any) {
        logger.error('Failed to delete admin user', { id: args.id, error: error?.message || error });
        throw error;
      }
    },

    /**
     * Regenerate API credentials for admin user
     */
    async regenerateAdminUserApiCredentials(parent: any, args: { id: string }, context: GraphQLContext) {
      const user = getCurrentUser(context);
      requirePermission(user, 'canManageTeam', 'regenerateAdminUserApiCredentials');

      try {
        const service = getAdminUsersService(context);
        const credentials = await service.regenerateApiCredentials(args.id);
        const updated = await service.getUserById(args.id);
        
        if (!updated) {
          throw new Error(`Admin user with ID ${args.id} not found`);
        }

        return {
          user: updated,
          apiKey: credentials.apiKey,
          apiSecret: credentials.apiSecret,
        };
      } catch (error: any) {
        logger.error('Failed to regenerate API credentials', { id: args.id, error: error?.message || error });
        throw error;
      }
    },

    /**
     * Update shop (admin)
     */
    async updateAdminShop(parent: any, args: { shop: string; input: any }, context: GraphQLContext) {
      const user = getCurrentUser(context);
      requirePermission(user, 'canManageShops', 'updateAdminShop');

      try {
        const esClient = getESClient(context);
        const existing = await esClient.get({
          index: SHOPS_INDEX_NAME,
          id: args.shop,
        });

        if (!existing.found) {
          throw new Error(`Shop ${args.shop} not found`);
        }

        const updated = {
          ...existing._source,
          ...args.input,
          updatedAt: new Date().toISOString(),
        };

        await esClient.index({
          index: SHOPS_INDEX_NAME,
          id: args.shop,
          document: updated,
          refresh: true,
        });

        return {
          ...updated,
          shop: args.shop,
        };
      } catch (error: any) {
        logger.error('Failed to update admin shop', { shop: args.shop, error: error?.message || error });
        throw error;
      }
    },

    /**
     * Update subscription (admin)
     */
    async updateAdminSubscription(parent: any, args: { id: string; input: any }, context: GraphQLContext) {
      const user = getCurrentUser(context);
      requirePermission(user, 'canViewSubscriptions', 'updateAdminSubscription');

      try {
        const esClient = getESClient(context);
        const existing = await esClient.get({
          index: SUBSCRIPTIONS_INDEX_NAME,
          id: args.id,
        });

        if (!existing.found) {
          throw new Error(`Subscription ${args.id} not found`);
        }

        const updated = {
          ...existing._source,
          ...args.input,
          updatedAt: new Date().toISOString(),
        };

        await esClient.index({
          index: SUBSCRIPTIONS_INDEX_NAME,
          id: args.id,
          document: updated,
          refresh: true,
        });

        return {
          ...updated,
          id: args.id,
        };
      } catch (error: any) {
        logger.error('Failed to update admin subscription', { id: args.id, error: error?.message || error });
        throw error;
      }
    },
  },
};

