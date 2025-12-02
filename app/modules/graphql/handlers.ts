/**
 * GraphQL Handlers
 * Exports ready-to-use handler instances
 */

import { createModuleLogger } from '@shared/utils/logger.util';
import { GraphQLHandler } from './graphql-handler';
import { GraphQLService } from './graphql.service';
import { GraphQLSchema } from 'graphql';

const logger = createModuleLogger("GraphQLHandler");

// Handler instance - will be initialized by factory
let graphqlHandlerInstance: GraphQLHandler | null = null;

/**
 * Initialize handlers (called by factory)
 */
export function initializeHandlers(graphqlService: GraphQLService, schema: GraphQLSchema): void {
  graphqlHandlerInstance = new GraphQLHandler(graphqlService, schema);
}

/**
 * Get GraphQL handler instance
 * @throws Error if handler not initialized
 */
export function getGraphQLHandler(): GraphQLHandler {
  if (!graphqlHandlerInstance) {
    throw new Error('GraphQL handler not initialized. Call initializeHandlers() first.');
  }
  return graphqlHandlerInstance;
}

/**
 * Exported handler instance (for direct import)
 * Use: import { graphqlHandler } from '@modules/graphql';
 */
export const graphqlHandler = new Proxy({} as GraphQLHandler, {
  get(target, prop) {
    if (!graphqlHandlerInstance) {
      const error = new Error('GraphQL handler not initialized. Ensure GraphQL module is properly initialized in bootstrap.');
      logger.error(error.message);
      logger.error('Stack:', error.stack);
      throw error;
    }
    const method = (graphqlHandlerInstance as any)[prop];
    if (typeof method === 'function') {
      return method.bind(graphqlHandlerInstance);
    }
    return method;
  },
});

