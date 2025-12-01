/**
 * Generic Elasticsearch Service for GraphQL
 * Provides CRUD operations for any index - fully dynamic
 */

import { GraphQLESRepository, ESRepositoryOptions } from './graphql.es-repository';
import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('graphql-es-service');

export interface ESServiceOptions extends ESRepositoryOptions {
  sensitiveFields?: string[]; // Fields to filter out automatically
}

export class GraphQLESService {
  private repository: GraphQLESRepository;
  private sensitiveFields: string[];

  constructor(esClient: Client, options: ESServiceOptions) {
    this.repository = new GraphQLESRepository(esClient, {
      index: options.index,
      idField: options.idField,
    });
    this.sensitiveFields = options.sensitiveFields || [];
  }

  /**
   * Filter sensitive fields from data
   */
  private filterSensitive(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.filterSensitive(item));
    }

    const filtered = { ...data };
    this.sensitiveFields.forEach(field => {
      delete filtered[field];
    });

    return filtered;
  }

  /**
   * Get by ID
   */
  async getById(id: string): Promise<any | null> {
    const result = await this.repository.getById(id);
    return result ? this.filterSensitive(result) : null;
  }

  /**
   * Get by field (dynamic - works with any field)
   */
  async getByField(fieldName: string, value: string): Promise<any | null> {
    const result = await this.repository.getByField(fieldName, value);
    return result ? this.filterSensitive(result) : null;
  }

  /**
   * Check if exists by ID
   */
  async exists(id: string): Promise<boolean> {
    return await this.repository.exists(id);
  }

  /**
   * Check if exists by field
   */
  async existsByField(fieldName: string, value: string): Promise<boolean> {
    return await this.repository.existsByField(fieldName, value);
  }

  /**
   * List with filters
   */
  async list(filters: Record<string, any> = {}, options: {
    limit?: number;
    offset?: number;
    sort?: Array<{ field: string; order: 'asc' | 'desc' }>;
  } = {}): Promise<any[]> {
    const results = await this.repository.list(filters, options);
    return results.map(item => this.filterSensitive(item));
  }

  /**
   * Create
   */
  async create(document: any, id?: string): Promise<any> {
    const result = await this.repository.create(document, id);
    return this.filterSensitive(result);
  }

  /**
   * Update
   */
  async update(id: string, updates: any): Promise<any | null> {
    const result = await this.repository.update(id, updates);
    return result ? this.filterSensitive(result) : null;
  }

  /**
   * Delete
   */
  async delete(id: string): Promise<boolean> {
    return await this.repository.delete(id);
  }

  /**
   * Count
   */
  async count(filters: Record<string, any> = {}): Promise<number> {
    return await this.repository.count(filters);
  }
}

