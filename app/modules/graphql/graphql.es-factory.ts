/**
 * Generic Elasticsearch Factory for GraphQL
 * Creates services dynamically based on index names - no hardcoded values
 */

import { Client } from '@elastic/elasticsearch';
import { GraphQLESService, ESServiceOptions } from './graphql.es-service';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('graphql-es-factory');

/**
 * Index configuration
 * Maps GraphQL type names to ES index names and options
 */
interface IndexConfig {
  index: string;
  idField?: string;
  sensitiveFields?: string[];
  // Field mappings for getByField operations
  fieldMappings?: Record<string, string>; // GraphQL arg name -> ES field name
}

/**
 * Default sensitive fields per index type
 * Can be configured dynamically - no hardcoded values required
 */
let DEFAULT_SENSITIVE_FIELDS: Record<string, string[]> = {
  // shops: ['accessToken', 'refreshToken'],
  filters: ['internalId', 'secret'],
  // Add more as needed
};

/**
 * Configure sensitive fields (optional - for custom filters)
 */
export function configureSensitiveFields(mappings: Record<string, string[]>): void {
  Object.assign(DEFAULT_SENSITIVE_FIELDS, mappings);
  logger.info('Updated sensitive fields mappings', { mappings });
}

/**
 * Create ES service for a GraphQL type
 */
export function createESService(
  esClient: Client,
  typeName: string,
  config: IndexConfig
): GraphQLESService {
  const indexName = config.index || typeName.toLowerCase() + 's'; // Default: Shop -> shops
  const sensitiveFields = config.sensitiveFields || DEFAULT_SENSITIVE_FIELDS[indexName] || [];

  logger.info(`Creating ES service for type ${typeName}`, {
    index: indexName,
    idField: config.idField,
    sensitiveFieldsCount: sensitiveFields.length,
  });

  return new GraphQLESService(esClient, {
    index: indexName,
    idField: config.idField,
    sensitiveFields,
  });
}

/**
 * Service registry - stores created services
 * Key format: "typeName" for static indexes, "typeName:indexName" for dynamic indexes
 */
class ESServiceRegistry {
  private services: Map<string, GraphQLESService> = new Map();

  /**
   * Register a service
   * @param key Service key (typeName or typeName:indexName for dynamic)
   * @param service ES service instance
   */
  register(key: string, service: GraphQLESService): void {
    this.services.set(key, service);
    logger.debug(`Registered ES service: ${key}`);
  }

  /**
   * Get a service by key
   */
  get(key: string): GraphQLESService | null {
    return this.services.get(key) || null;
  }

  /**
   * Check if service exists
   */
  has(key: string): boolean {
    return this.services.has(key);
  }

  /**
   * Get all services
   */
  getAll(): Map<string, GraphQLESService> {
    return this.services;
  }

  /**
   * Generate service key
   * For static: "Shop"
   * For dynamic: "Filter:filters-example.com"
   */
  generateKey(typeName: string, indexName?: string): string {
    if (indexName && indexName !== typeName.toLowerCase() + 's') {
      return `${typeName}:${indexName}`;
    }
    return typeName;
  }
}

export const esServiceRegistry = new ESServiceRegistry();

