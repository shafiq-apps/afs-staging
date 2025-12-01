/**
 * Centralized Elasticsearch CRUD Operations for GraphQL
 * 
 * This module provides a unified interface for all GraphQL CRUD operations.
 * Auto-resolvers use these functions instead of individual module repositories.
 * 
 * Benefits:
 * - Single source of truth for ES operations
 * - Consistent error handling and logging
 * - Automatic sensitive field filtering
 * - Support for dynamic indexes
 * - No need for module-specific repositories for GraphQL operations
 * 
 * Usage in auto-resolvers:
 * ```typescript
 * import { esCRUD } from './graphql.es-crud';
 * 
 * // Get ES service and perform operation
 * const service = await esCRUD.getService('Shop', esClient, context, graphqlArgs);
 * const shop = await esCRUD.getById(service, domain);
 * ```
 */

import { Client } from '@elastic/elasticsearch';
import { GraphQLContext } from './graphql.type';
import { GraphQLESService } from './graphql.es-service';
import { getESServiceForType } from './graphql.auto-resolver';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('graphql-es-crud');

/**
 * CRUD operation result types
 */
export interface CRUDResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Options for CRUD operations
 */
export interface CRUDOptions {
  refresh?: boolean; // Refresh ES index after write operations
  sensitiveFields?: string[]; // Override sensitive fields
}

/**
 * Centralized ES CRUD operations
 */
export class ESCRUD {
  /**
   * Get ES service for a GraphQL type
   * Handles both static and dynamic indexes
   */
  static async getService(
    typeName: string,
    esClient: Client,
    context: GraphQLContext,
    graphqlArgs?: Record<string, any>
  ): Promise<GraphQLESService | null> {
    try {
      return getESServiceForType(typeName, esClient, context, graphqlArgs);
    } catch (error: any) {
      logger.error(`Failed to get ES service for type: ${typeName}`, {
        error: error?.message || error,
      });
      return null;
    }
  }

  /**
   * Get document by ID
   */
  static async getById<T = any>(
    service: GraphQLESService,
    id: string
  ): Promise<CRUDResult<T>> {
    try {
      const data = await service.getById(id);
      if (!data) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Document with ID '${id}' not found`,
          },
        };
      }
      return { success: true, data: data as T };
    } catch (error: any) {
      logger.error('Error in getById', { id, error: error?.message || error });
      return {
        success: false,
        error: {
          code: 'GET_ERROR',
          message: error?.message || 'Failed to get document',
          details: error,
        },
      };
    }
  }

  /**
   * Get document by field
   */
  static async getByField<T = any>(
    service: GraphQLESService,
    fieldName: string,
    value: string
  ): Promise<CRUDResult<T>> {
    try {
      const data = await service.getByField(fieldName, value);
      if (!data) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Document with ${fieldName}='${value}' not found`,
          },
        };
      }
      return { success: true, data: data as T };
    } catch (error: any) {
      logger.error('Error in getByField', {
        fieldName,
        value,
        error: error?.message || error,
      });
      return {
        success: false,
        error: {
          code: 'GET_ERROR',
          message: error?.message || 'Failed to get document by field',
          details: error,
        },
      };
    }
  }

  /**
   * Check if document exists
   */
  static async exists(
    service: GraphQLESService,
    id: string
  ): Promise<CRUDResult<boolean>> {
    try {
      const exists = await service.exists(id);
      return { success: true, data: exists };
    } catch (error: any) {
      logger.error('Error in exists', { id, error: error?.message || error });
      return {
        success: false,
        error: {
          code: 'EXISTS_ERROR',
          message: error?.message || 'Failed to check existence',
          details: error,
        },
      };
    }
  }

  /**
   * Check if document exists by field
   */
  static async existsByField(
    service: GraphQLESService,
    fieldName: string,
    value: string
  ): Promise<CRUDResult<boolean>> {
    try {
      const exists = await service.existsByField(fieldName, value);
      return { success: true, data: exists };
    } catch (error: any) {
      logger.error('Error in existsByField', {
        fieldName,
        value,
        error: error?.message || error,
      });
      return {
        success: false,
        error: {
          code: 'EXISTS_ERROR',
          message: error?.message || 'Failed to check existence by field',
          details: error,
        },
      };
    }
  }

  /**
   * List documents with filters
   */
  static async list<T = any>(
    service: GraphQLESService,
    filters: Record<string, any> = {},
    options: {
      limit?: number;
      offset?: number;
      sort?: Array<{ field: string; order: 'asc' | 'desc' }>;
    } = {}
  ): Promise<CRUDResult<T[]>> {
    try {
      const data = await service.list(filters, options);
      return { success: true, data: data as T[] };
    } catch (error: any) {
      logger.error('Error in list', {
        filters,
        options,
        error: error?.message || error,
      });
      return {
        success: false,
        error: {
          code: 'LIST_ERROR',
          message: error?.message || 'Failed to list documents',
          details: error,
        },
      };
    }
  }

  /**
   * Create document
   */
  static async create<T = any>(
    service: GraphQLESService,
    document: any,
    id?: string,
    options?: CRUDOptions
  ): Promise<CRUDResult<T>> {
    try {
      const data = await service.create(document, id);
      return { success: true, data: data as T };
    } catch (error: any) {
      logger.error('Error in create', {
        id,
        error: error?.message || error,
      });
      return {
        success: false,
        error: {
          code: 'CREATE_ERROR',
          message: error?.message || 'Failed to create document',
          details: error,
        },
      };
    }
  }

  /**
   * Update document
   */
  static async update<T = any>(
    service: GraphQLESService,
    id: string,
    updates: any,
    options?: CRUDOptions
  ): Promise<CRUDResult<T>> {
    try {
      const data = await service.update(id, updates);
      if (!data) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Document with ID '${id}' not found for update`,
          },
        };
      }
      return { success: true, data: data as T };
    } catch (error: any) {
      logger.error('Error in update', {
        id,
        error: error?.message || error,
      });
      return {
        success: false,
        error: {
          code: 'UPDATE_ERROR',
          message: error?.message || 'Failed to update document',
          details: error,
        },
      };
    }
  }

  /**
   * Delete document
   */
  static async delete(
    service: GraphQLESService,
    id: string,
    options?: CRUDOptions
  ): Promise<CRUDResult<boolean>> {
    try {
      const deleted = await service.delete(id);
      return { success: true, data: deleted };
    } catch (error: any) {
      logger.error('Error in delete', { id, error: error?.message || error });
      return {
        success: false,
        error: {
          code: 'DELETE_ERROR',
          message: error?.message || 'Failed to delete document',
          details: error,
        },
      };
    }
  }

  /**
   * Count documents
   */
  static async count(
    service: GraphQLESService,
    filters: Record<string, any> = {}
  ): Promise<CRUDResult<number>> {
    try {
      const count = await service.count(filters);
      return { success: true, data: count };
    } catch (error: any) {
      logger.error('Error in count', {
        filters,
        error: error?.message || error,
      });
      return {
        success: false,
        error: {
          code: 'COUNT_ERROR',
          message: error?.message || 'Failed to count documents',
          details: error,
        },
      };
    }
  }
}

/**
 * Convenience export - use esCRUD for cleaner imports
 */
export const esCRUD = ESCRUD;

