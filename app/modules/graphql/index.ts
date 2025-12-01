/**
 * GraphQL Module Exports
 * Main entry point for GraphQL module
 */

// Export handler for easy import
export { graphqlHandler, getGraphQLHandler } from './handlers';

// Export types
export type { GraphQLRequest, GraphQLResponse, GraphQLContext } from './graphql.type';

// Export handler types
export type { ReadOptions, ListOptions, WriteOptions } from './graphql-handler';

// Export service (if needed)
export { GraphQLService } from './graphql.service';

// Export factory
export { createGraphQLModule } from './graphql.factory';

