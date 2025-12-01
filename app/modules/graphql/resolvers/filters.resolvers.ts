/**
 * Filters GraphQL Resolvers
 * Manual resolvers for filter queries and mutations
 * Uses FiltersRepository from modules/filters
 */

import { GraphQLContext } from '../graphql.type';
import { FiltersRepository } from '@modules/filters/filters.repository';
import { Filter, CreateFilterInput, UpdateFilterInput } from '@modules/filters/filters.type';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('filters-resolvers');

// Repository instance (initialized per request)
let filtersRepo: FiltersRepository | null = null;

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

function getFiltersRepository(context: GraphQLContext): FiltersRepository {
  const esClient = getESClient(context);
  if (!esClient) {
    throw new Error('ES client not available in context');
  }
  
  if (!filtersRepo) {
    filtersRepo = new FiltersRepository(esClient);
  }
  return filtersRepo;
}

export const filtersResolvers = {
  Query: {
    /**
     * Get filter by ID
     */
    async filter(parent: any, args: { shop: string; id: string }, context: GraphQLContext): Promise<Filter | null> {
      try {
        const { shop, id } = args;
        if (!shop || !id) {
          throw new Error('Shop and ID are required');
        }

        logger.log('Getting filter by ID', { shop, id });
        const repo = getFiltersRepository(context);
        const filter = await repo.getFilter(shop, id);
        logger.log('Filter lookup result', { shop, id, found: !!filter });
        return filter;
      } catch (error: any) {
        logger.error('Error in filter resolver', {
          error: error?.message || error,
          stack: error?.stack,
          args,
        });
        throw error;
      }
    },

    /**
     * List all filters for a shop
     */
    async filters(parent: any, args: { shop: string }, context: GraphQLContext): Promise<{ filters: Filter[]; total: number }> {
      try {
        const { shop } = args;
        if (!shop) {
          throw new Error('Shop is required');
        }

        logger.log('Listing filters', { shop });
        const repo = getFiltersRepository(context);
        const result = await repo.listFilters(shop);
        logger.log('Filters list result', { shop, count: result.filters.length, total: result.total });
        return result;
      } catch (error: any) {
        logger.error('Error in filters resolver', {
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
     * Create a new filter configuration
     */
    async createFilter(
      parent: any,
      args: { shop: string; input: CreateFilterInput },
      context: GraphQLContext
    ): Promise<Filter> {
      try {
        const { shop, input } = args;
        if (!shop || !input) {
          throw new Error('Shop and input are required');
        }

        logger.log('Creating filter', { shop, title: input.title });
        const repo = getFiltersRepository(context);
        const filter = await repo.createFilter(shop, { ...input, shop });
        logger.log('Filter created', { shop, id: filter.id, title: filter.title });
        return filter;
      } catch (error: any) {
        logger.error('Error in createFilter resolver', {
          error: error?.message || error,
          stack: error?.stack,
          args,
        });
        throw error;
      }
    },

    /**
     * Update an existing filter configuration
     */
    async updateFilter(
      parent: any,
      args: { shop: string; id: string; input: UpdateFilterInput },
      context: GraphQLContext
    ): Promise<Filter> {
      try {
        const { shop, id, input } = args;
        if (!shop || !id || !input) {
          throw new Error('Shop, ID, and input are required');
        }

        logger.log('Updating filter', { shop, id });
        const repo = getFiltersRepository(context);
        const filter = await repo.updateFilter(shop, id, input);
        logger.log('Filter updated', { shop, id, title: filter.title });
        return filter;
      } catch (error: any) {
        logger.error('Error in updateFilter resolver', {
          error: error?.message || error,
          stack: error?.stack,
          args,
        });
        throw error;
      }
    },

    /**
     * Delete a filter configuration
     */
    async deleteFilter(
      parent: any,
      args: { shop: string; id: string },
      context: GraphQLContext
    ) {
      try {
        const { shop, id } = args;
        if (!shop || !id) {
          throw new Error('Shop and ID are required');
        }

        logger.log('Deleting filter', { shop, id });
        const repo = getFiltersRepository(context);
        const deleted = await repo.deleteFilter(shop, id);
        logger.log('Filter deletion result', { shop, id, deleted });
        return deleted;
      } catch (error: any) {
        logger.error('Error in deleteFilter resolver', {
          error: error?.message || error,
          stack: error?.stack,
          args,
        });
        throw error;
      }
    },
  },
};

