/**
 * GraphQL Resolvers Index
 * 
 * 🎉 AUTO-RESOLVERS ENABLED! 🎉
 * 
 * Resolvers are now automatically generated from your schema!
 * You don't need to write resolver files anymore - just define your schema.
 * 
 * If you need custom resolvers for special cases, you can still add them here.
 * Otherwise, leave this array empty and resolvers will be auto-generated.
 */

// Import manual resolver definitions
import { shopsResolvers } from './shops.resolvers';
import { productsResolvers } from './products.resolvers';
import { filtersResolvers } from './filters.resolvers';
import { cacheResolvers } from './cache.resolvers';

/**
 * Array of manual resolver objects
 * Each schema should have its own resolver file for explicit control
 * Auto-resolver is disabled - all resolvers must be manually defined
 */
export const resolvers: any[] = [
  shopsResolvers,    // Manual shop resolvers
  productsResolvers, // Manual product resolvers
  filtersResolvers,  // Manual filter resolvers
  cacheResolvers,    // Cache admin/debug resolvers
  // Add more manual resolvers here as needed
];

/**
 * Default empty resolvers (used when no resolvers are defined)
 */
export const defaultResolvers = {
  Query: {
    _empty: () => null,
  },
  Mutation: {
    _empty: () => null,
  },
};

