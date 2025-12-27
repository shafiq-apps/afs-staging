/**
 * GraphQL Schema Index
 * Combines all schema definitions
 * 
 * To add a new schema:
 * 1. Create {domain}.schema.ts in this directory
 * 2. Export schema string from that file
 * 3. Import and add to schemas array below
 */

// Import schema definitions from modules
import { shopsSchema } from './shops.schema';
import { productsSchema } from './products.schema';
import { filtersSchema } from './filters.schema';
import { cacheSchema } from './cache.schema';
import { webhooksSchema } from './webhooks.schema';
import { subscriptionSchema } from './subscriptions.schema';
// Example:
// import { settingsSchema } from './settings.schema';

/**
 * Array of schema strings to combine
 * Add your schema exports here
 * 
 * IMPORTANT: Only ONE schema should define Query, Mutation, and scalar types (like JSON)
 * Other schemas should only define their specific types
 * 
 * Order matters: Base schema (with Query/Mutation) should come first
 */
export const schemas: string[] = [
  shopsSchema, // Base schema with Query, Mutation, JSON scalar
  productsSchema, // Product types only (no Query/Mutation)
  filtersSchema, // Filter types with Query and Mutation
  cacheSchema, // Cache admin/debug endpoints
  webhooksSchema, // Webhook processing mutations
  subscriptionSchema, // Subscription types and mutations
  
  // Example: settingsSchema,
];

/**
 * Default empty schema (used when no schemas are defined)
 */
export const defaultSchema = `
  type Query {
    _empty: String
  }
  
  type Mutation {
    _empty: String
  }
`;

