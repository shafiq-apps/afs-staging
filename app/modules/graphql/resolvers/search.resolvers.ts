/**
 * Search Configuration GraphQL Resolvers
 * Manual resolvers for search configuration queries and mutations
 * Uses SearchRepository from modules/search
 */

import { GraphQLContext } from '../graphql.type';
import { SearchRepository } from '@modules/search/search.repository';
import { SearchConfig, SearchConfigInput } from '@shared/search/types';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('search-resolvers');

function getESClient(context: GraphQLContext): any {
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

function getSearchRepository(context: GraphQLContext): SearchRepository {
  const esClient = getESClient(context);
  if (!esClient) {
    throw new Error('ES client not available in context');
  }
  
  // Create new instance per request to avoid state sharing issues
  return new SearchRepository(esClient);
}

export const searchResolvers = {
  Query: {
    /**
     * Get search configuration for a shop
     */
    async searchConfig(
      parent: any,
      args: { shop: string },
      context: GraphQLContext
    ): Promise<SearchConfig> {
      try {
        const { shop } = args;
        if (!shop) {
          throw new Error('Shop is required');
        }

        logger.info('Getting search config', { shop });
        const repo = getSearchRepository(context);
        const config = await repo.getSearchConfig(shop);
        logger.info('Search config retrieved', { shop, fieldCount: config.fields.length });
        return config;
      } catch (error: any) {
        logger.error('Error in searchConfig resolver', {
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
     * Update search configuration for a shop
     */
    async updateSearchConfig(
      parent: any,
      args: { shop: string; input: SearchConfigInput },
      context: GraphQLContext
    ): Promise<SearchConfig> {
      try {
        const { shop, input } = args;
        if (!shop || !input) {
          throw new Error('Shop and input are required');
        }

        logger.info('Updating search config', { shop, fieldCount: input.fields.length });
        const repo = getSearchRepository(context);
        const config = await repo.updateSearchConfig(shop, input);
        logger.info('Search config updated', { shop, id: config.id });
        return config;
      } catch (error: any) {
        logger.error('Error in updateSearchConfig resolver', {
          error: error?.message || error,
          stack: error?.stack,
          args,
        });
        throw error;
      }
    },
  },
};

