/**
 * Generic Elasticsearch Repository for GraphQL
 * Works with any index - fully dynamic, no hardcoded values
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('graphql-es-repository');

export interface ESRepositoryOptions {
  index: string;
  idField?: string; // Field to use as document ID (default: 'id' or first arg)
}

export class GraphQLESRepository {
  private esClient: Client;
  private index: string;
  private idField: string;

  constructor(esClient: Client, options: ESRepositoryOptions) {
    this.esClient = esClient;
    this.index = options.index;
    this.idField = options.idField || 'id';
  }

  /**
   * Get document by ID
   */
  async getById(id: string): Promise<any | null> {
    try {
      logger.info(`Getting document by ID from ${this.index}`, { id });
      
      const response = await this.esClient.get({
        index: this.index,
        id,
      });

      if (response.found && response._source) {
        logger.info(`Document found by ID in ${this.index}`, { 
          id,
          hasSource: !!response._source,
          sourceKeys: response._source ? Object.keys(response._source) : [],
        });
        return response._source;
      }

      logger.info(`Document not found by ID in ${this.index}`, { id, found: response.found });
      return null;
    } catch (error: any) {
      if (error.statusCode === 404) {
        logger.info(`Document not found (404) in ${this.index}`, { id });
        return null;
      }
      logger.error(`Error getting document from ${this.index}`, {
        id,
        error: error?.message || error,
        statusCode: error?.statusCode,
      });
      throw error;
    }
  }

  /**
   * Get document by field (e.g., getByDomain, getByShop)
   */
  async getByField(fieldName: string, value: string): Promise<any | null> {
    try {
      logger.info(`Getting document by field from ${this.index}`, { field: fieldName, value });
      
      // Dynamic field lookup - try multiple field variants automatically
      // ES uses different field mappings: fieldName, fieldName.keyword, fieldName.raw, etc.
      // Build a query that tries all common variants
      const fieldVariants = [
        fieldName,                    // Direct field
        `${fieldName}.keyword`,       // Keyword variant (most common)
        `${fieldName}.raw`,           // Raw variant
        `${fieldName}.exact`,         // Exact variant
      ];

      // Use multi_match or bool.should to try all variants
      // multi_match with type 'phrase' works well for exact matches across field variants
      const query: any = {
        bool: {
          should: fieldVariants.map(field => ({
            term: { [field]: value },
          })),
          minimum_should_match: 1,
        },
      };

      const response = await this.esClient.search({
        index: this.index,
        body: {
          query,
          size: 1,
        } as any,
      });

      logger.info(`Field lookup result from ${this.index}`, {
        field: fieldName,
        value,
        hits: response.hits.hits.length,
        total: response.hits.total,
        triedVariants: fieldVariants,
      });

      if (response.hits.hits.length > 0) {
        const source = response.hits.hits[0]._source;
        logger.info(`Document found by field in ${this.index}`, {
          field: fieldName,
          value,
          hasSource: !!source,
          sourceKeys: source ? Object.keys(source) : [],
        });
        return source;
      }

      logger.info(`Document not found by field in ${this.index}`, { field: fieldName, value });
      return null;
    } catch (error: any) {
      logger.error(`Error getting document by field from ${this.index}`, {
        field: fieldName,
        value,
        error: error?.message || error,
        statusCode: error?.statusCode,
      });
      throw error;
    }
  }

  /**
   * Check if document exists
   */
  async exists(id: string): Promise<boolean> {
    try {
      const response = await this.esClient.exists({
        index: this.index,
        id,
      });
      return response;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return false;
      }
      logger.error(`Error checking existence in ${this.index}`, {
        id,
        error: error?.message || error,
      });
      return false;
    }
  }

  /**
   * Check if document exists by field
   */
  async existsByField(fieldName: string, value: string): Promise<boolean> {
    try {
      // Dynamic field lookup - try multiple field variants automatically
      const fieldVariants = [
        fieldName,                    // Direct field
        `${fieldName}.keyword`,       // Keyword variant (most common)
        `${fieldName}.raw`,           // Raw variant
        `${fieldName}.exact`,         // Exact variant
      ];

      // Use bool.should to try all variants
      const query: any = {
        bool: {
          should: fieldVariants.map(field => ({
            term: { [field]: value },
          })),
          minimum_should_match: 1,
        },
      };

      const response = await this.esClient.count({
        index: this.index,
        body: {
          query,
        } as any,
      });

      return response.count > 0;
    } catch (error: any) {
      logger.error(`Error checking existence by field in ${this.index}`, {
        field: fieldName,
        value,
        error: error?.message || error,
      });
      return false;
    }
  }

  /**
   * List documents with filters
   */
  async list(filters: Record<string, any> = {}, options: {
    limit?: number;
    offset?: number;
    sort?: Array<{ field: string; order: 'asc' | 'desc' }>;
  } = {}): Promise<any[]> {
    try {
      const query: any = {
        bool: {
          must: [],
        },
      };

      // Add filters with dynamic field mapping
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null) {
          // Dynamic field variants - try common ES field mappings
          const fieldVariants = [
            key,                    // Direct field
            `${key}.keyword`,       // Keyword variant (most common)
            `${key}.raw`,           // Raw variant
            `${key}.exact`,         // Exact variant
          ];
          
          // Use should query to try all variants automatically
          query.bool.must.push({
            bool: {
              should: fieldVariants.map(field => ({
                term: { [field]: filters[key] },
              })),
              minimum_should_match: 1,
            },
          });
        }
      });

      const searchBody: any = {
        query: query.bool.must.length > 0 ? query : { match_all: {} },
        size: options.limit || 10,
        from: options.offset || 0,
      };

      // Add sorting
      if (options.sort && options.sort.length > 0) {
        searchBody.sort = options.sort.map(s => ({
          [s.field]: { order: s.order },
        }));
      }

      const response = await this.esClient.search({
        index: this.index,
        body: searchBody,
      } as any);

      return response.hits.hits.map((hit: any) => hit._source);
    } catch (error: any) {
      logger.error(`Error listing documents from ${this.index}`, {
        filters,
        error: error?.message || error,
      });
      throw error;
    }
  }

  /**
   * Create document
   */
  async create(document: any, id?: string): Promise<any> {
    try {
      const indexParams: any = {
        index: this.index,
        document,
        refresh: true,
      };

      if (id) {
        indexParams.id = id;
      } else if (document[this.idField]) {
        indexParams.id = document[this.idField];
      }

      await this.esClient.index(indexParams);

      logger.info(`Document created in ${this.index}`, { id: indexParams.id });

      // Return the created document
      return id ? await this.getById(id) : document;
    } catch (error: any) {
      logger.error(`Error creating document in ${this.index}`, {
        error: error?.message || error,
      });
      throw error;
    }
  }

  /**
   * Update document
   */
  async update(id: string, updates: any): Promise<any | null> {
    try {
      const existing = await this.getById(id);
      if (!existing) {
        return null;
      }

      const updated = {
        ...existing,
        ...updates,
      };

      await this.esClient.index({
        index: this.index,
        id,
        document: updated,
        refresh: true,
      });

      logger.info(`Document updated in ${this.index}`, { id });

      return updated;
    } catch (error: any) {
      logger.error(`Error updating document in ${this.index}`, {
        id,
        error: error?.message || error,
      });
      throw error;
    }
  }

  /**
   * Delete document
   */
  async delete(id: string): Promise<boolean> {
    try {
      await this.esClient.delete({
        index: this.index,
        id,
        refresh: true,
      });

      logger.info(`Document deleted from ${this.index}`, { id });
      return true;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return false;
      }
      logger.error(`Error deleting document from ${this.index}`, {
        id,
        error: error?.message || error,
      });
      throw error;
    }
  }

  /**
   * Count documents
   */
  async count(filters: Record<string, any> = {}): Promise<number> {
    try {
      const query: any = {
        bool: {
          must: [],
        },
      };

      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null) {
          query.bool.must.push({
            term: { [key]: filters[key] },
          });
        }
      });

      const response = await this.esClient.count({
        index: this.index,
        body: {
          query: query.bool.must.length > 0 ? query : { match_all: {} },
        } as any,
      });

      return response.count;
    } catch (error: any) {
      logger.error(`Error counting documents in ${this.index}`, {
        filters,
        error: error?.message || error,
      });
      throw 0;
    }
  }
}

