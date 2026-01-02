/**
 * GraphQL Handler
 * Unified handler for all GraphQL operations (read, write, list, update, delete, etc.)
 * Provides simple API for CRUD operations using GraphQL
 */

import { GraphQLService } from './graphql.service';
import { GraphQLRequest, GraphQLExecutionResult } from './graphql.type';
import { createModuleLogger } from '@shared/utils/logger.util';
import { resolveDynamicIndexName } from './graphql.index-config';
import { GraphQLSchema, GraphQLObjectType, GraphQLField, GraphQLInputObjectType, isObjectType, isInputObjectType, isScalarType, isListType, isNonNullType, getNamedType } from 'graphql';

const logger = createModuleLogger('graphql-handler');

export interface ReadOptions {
  id?: string;
  [key: string]: any; // Field-based filters
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  sort?: Array<{ field: string; order: 'asc' | 'desc' }>;
}

export interface WriteOptions {
  id?: string; // If provided, performs upsert
}

export class GraphQLHandler {
  private graphqlService: GraphQLService;
  private schema: GraphQLSchema;
  private defaultContext: any;

  constructor(graphqlService: GraphQLService, schema: GraphQLSchema) {
    this.graphqlService = graphqlService;
    this.schema = schema;
    // Create minimal context for handler usage
    this.defaultContext = {
      req: {},
    };
  }

  /**
   * Read a single document
   * @param type GraphQL type name (e.g., 'Shop', 'Filter')
   * @param identifier Can be { id }, { domain }, or any field-based filter
   * @returns Document or null if not found
   */
  async read(type: string, identifier: ReadOptions): Promise<any | null> {
    try {
      // Determine if it's ID-based or field-based lookup
      const id = identifier.id || identifier._id;
      let query: string;
      let variables: Record<string, any> = {};
      let dataKey: string;

      if (id) {
        // ID-based lookup
        const fieldName = 'id';
        dataKey = this.getFieldNameForType(type, 'read');
        query = `
          query Read${type}($${fieldName}: ID!) {
            ${dataKey}(${fieldName}: $${fieldName}) {
              ${this.getFieldsForType(type)}
            }
          }
        `;
        variables[fieldName] = id;
      } else {
        // Field-based lookup (use first field in identifier)
        const fieldName = Object.keys(identifier)[0];
        if (!fieldName) {
          logger.error(`No identifier provided for reading ${type}`);
          return null;
        }
        const value = identifier[fieldName];
        dataKey = this.getFieldNameForType(type, 'read');
        
        // Get field type from schema
        const queryField = this.getOperationField('Query', dataKey);
        if (!queryField) {
          logger.error(`Query field ${dataKey} not found in schema for type ${type}`);
          return null;
        }

        // Find the argument that matches our field name
        const arg = queryField.args.find(a => a.name === fieldName);
        if (!arg) {
          logger.error(`Argument ${fieldName} not found in query ${dataKey}`);
          return null;
        }

        // Get the GraphQL type name for the argument
        const argType = getNamedType(arg.type);
        const argTypeName = argType.toString();
        
        query = `
          query Read${type}($${fieldName}: ${argTypeName}!) {
            ${dataKey}(${fieldName}: $${fieldName}) {
              ${this.getFieldsForType(type)}
            }
          }
        `;
        variables[fieldName] = value;
      }

      logger.info(`Executing read query for ${type}`, { query: query.trim(), variables, dataKey });

      if (!this.graphqlService) {
        logger.error(`GraphQL service not available for ${type}`);
        throw new Error('GraphQL service not initialized');
      }

      const result = await this.graphqlService.execute({
        query,
        variables,
      }, this.defaultContext);

      if (result.errors && result.errors.length > 0) {
        logger.error(`Error reading ${type}`, { 
          errors: result.errors, 
          identifier,
          query: query.trim(),
          variables,
        });
        // Log first error in detail for debugging
        if (result.errors[0]) {
          logger.error(`First error details:`, {
            message: result.errors[0].message,
            extensions: result.errors[0].extensions,
            path: result.errors[0].path,
          });
        }
        return null;
      }

      const data = result.data?.[dataKey] || null;
      logger.info(`Read result for ${type}`, { 
        dataKey, 
        hasData: !!data,
        dataKeys: data ? Object.keys(data) : [],
      });
      return data;
    } catch (error: any) {
      logger.error(`Error reading ${type}`, { 
        error: error?.message || error,
        stack: error?.stack,
        identifier 
      });
      return null;
    }
  }

  /**
   * List documents with filters and pagination
   * @param type GraphQL type name
   * @param filters Field filters
   * @param options Pagination and sorting options
   * @returns Array of documents
   */
  async list(
    type: string,
    filters: Record<string, any> = {},
    options: ListOptions = {}
  ): Promise<any[]> {
    try {
      const pluralFieldName = this.getFieldNameForType(type, 'list');
      const variables: Record<string, any> = { ...filters };
      
      // Build query with filters
      const filterArgs = Object.keys(filters).map(key => {
        const value = filters[key];
        const fieldType = this.inferFieldType(value);
        variables[key] = value;
        return `$${key}: ${fieldType}!`;
      }).join(', ');

      // Add pagination options
      if (options.limit) {
        variables.limit = options.limit;
      }
      if (options.offset) {
        variables.offset = options.offset;
      }

      const limitArg = options.limit ? '$limit: Int' : '';
      const offsetArg = options.offset ? '$offset: Int' : '';
      const paginationArgs = [limitArg, offsetArg].filter(Boolean).join(', ');
      const allArgs = filterArgs ? (paginationArgs ? `${filterArgs}, ${paginationArgs}` : filterArgs) : paginationArgs;

      const query = `
        query List${type}${allArgs ? `(${allArgs})` : ''} {
          ${pluralFieldName}${allArgs ? `(${Object.keys(filters).map(k => `${k}: $${k}`).concat(
            options.limit ? ['limit: $limit'] : [],
            options.offset ? ['offset: $offset'] : []
          ).join(', ')})` : ''} {
            ${this.getFieldsForType(type)}
          }
        }
      `;

      const result = await this.graphqlService.execute({
        query,
        variables,
      }, this.defaultContext);

      if (result.errors && result.errors.length > 0) {
        logger.error(`Error listing ${type}`, { errors: result.errors, filters });
        return [];
      }

      return result.data?.[pluralFieldName] || [];
    } catch (error: any) {
      logger.error(`Error listing ${type}`, { error: error?.message || error, filters });
      return [];
    }
  }

  /**
   * Write (upsert) - Create or update document
   * @param type GraphQL type name
   * @param input Document data
   * @param options Optional id for upsert
   * @returns Created or updated document
   */
  async write(
    type: string,
    input: Record<string, any>,
    options: WriteOptions = {}
  ): Promise<any | null> {
    try {
      // Try to update if id provided, otherwise create
      if (options.id) {
        // Check if exists first
        const existing = await this.read(type, { id: options.id });
        if (existing) {
          // Update existing
          return await this.update(type, options.id, input);
        }
        // Create with provided id
        return await this.create(type, { ...input, id: options.id });
      }

      // Create new
      return await this.create(type, input);
    } catch (error: any) {
      logger.error(`Error writing ${type}`, { error: error?.message || error, input });
      return null;
    }
  }

  /**
   * Create a new document
   * @param type GraphQL type name
   * @param input Document data
   * @returns Created document
   */
  async create(type: string, input: Record<string, any>): Promise<any | null> {
    try {
      const mutationName = this.getFieldNameForType(type, 'create');
      
      // Check if mutation exists in schema
      const mutationField = this.getOperationField('Mutation', mutationName);
      if (!mutationField) {
        logger.warn(`Mutation ${mutationName} not found in schema for type ${type}. Add mutation to schema to enable create operation.`);
        return null;
      }

      // Get input type from mutation arguments
      const inputArg = mutationField.args.find(arg => arg.name === 'input');
      if (!inputArg) {
        logger.error(`Mutation ${mutationName} does not have 'input' argument`);
        return null;
      }

      const inputType = getNamedType(inputArg.type);
      if (!isInputObjectType(inputType)) {
        logger.error(`Input type for ${mutationName} is not an input object type`);
        return null;
      }

      const inputTypeName = inputType.name;
      const variables: Record<string, any> = { input };

      const query = `
        mutation Create${type}($input: ${inputTypeName}!) {
          ${mutationName}(input: $input) {
            ${this.getFieldsForType(type)}
          }
        }
      `;

      const result = await this.graphqlService.execute({
        query,
        variables,
      }, this.defaultContext);

      if (result.errors && result.errors.length > 0) {
        logger.error(`Error creating ${type}`, { errors: result.errors, input });
        return null;
      }

      return result.data?.[mutationName] || null;
    } catch (error: any) {
      logger.error(`Error creating ${type}`, { error: error?.message || error, input });
      return null;
    }
  }

  /**
   * Update an existing document
   * @param type GraphQL type name
   * @param id Document ID
   * @param input Update data
   * @returns Updated document or null if not found
   */
  async update(
    type: string,
    id: string,
    input: Record<string, any>
  ): Promise<any | null> {
    try {
      const mutationName = this.getFieldNameForType(type, 'update');
      
      // Check if mutation exists in schema
      const mutationField = this.getOperationField('Mutation', mutationName);
      if (!mutationField) {
        logger.warn(`Mutation ${mutationName} not found in schema for type ${type}. Add mutation to schema to enable update operation.`);
        return null;
      }

      // Get ID argument name from schema (could be 'id', 'domain', etc.)
      const idArg = mutationField.args.find(arg => 
        arg.name === 'id' || arg.name === 'domain' || arg.name === '_id'
      ) || mutationField.args[0]; // Fallback to first arg if no ID found
      
      if (!idArg) {
        logger.error(`Mutation ${mutationName} does not have an ID argument`);
        return null;
      }

      const idArgName = idArg.name;
      const idArgType = getNamedType(idArg.type);
      const idArgTypeName = idArgType.toString();

      // Get input type from mutation arguments
      const inputArg = mutationField.args.find(arg => arg.name === 'input');
      if (!inputArg) {
        logger.error(`Mutation ${mutationName} does not have 'input' argument`);
        return null;
      }

      const inputType = getNamedType(inputArg.type);
      if (!isInputObjectType(inputType)) {
        logger.error(`Input type for ${mutationName} is not an input object type`);
        return null;
      }

      const inputTypeName = inputType.name;

      const query = `
        mutation Update${type}($${idArgName}: ${idArgTypeName}!, $input: ${inputTypeName}!) {
          ${mutationName}(${idArgName}: $${idArgName}, input: $input) {
            ${this.getFieldsForType(type)}
          }
        }
      `;

      const variables: Record<string, any> = { input };
      variables[idArgName] = id;

      const result = await this.graphqlService.execute({
        query,
        variables,
      }, this.defaultContext);

      if (result.errors && result.errors.length > 0) {
        logger.error(`Error updating ${type}`, { errors: result.errors, id, input });
        return null;
      }

      return result.data?.[mutationName] || null;
    } catch (error: any) {
      logger.error(`Error updating ${type}`, { error: error?.message || error, id, input });
      return null;
    }
  }

  /**
   * Delete a document
   * @param type GraphQL type name
   * @param id Document ID
   * @returns True if deleted, false if not found
   */
  async delete(type: string, id: string): Promise<boolean> {
    try {
      const mutationName = this.getFieldNameForType(type, 'delete');
      
      // Check if mutation exists in schema
      const mutationField = this.getOperationField('Mutation', mutationName);
      if (!mutationField) {
        logger.warn(`Mutation ${mutationName} not found in schema for type ${type}. Add mutation to schema to enable delete operation.`);
        return false;
      }

      // Get ID argument name from schema (could be 'id', 'domain', etc.)
      const idArg = mutationField.args.find(arg => 
        arg.name === 'id' || arg.name === 'domain' || arg.name === '_id'
      ) || mutationField.args[0]; // Fallback to first arg if no ID found
      
      if (!idArg) {
        logger.error(`Mutation ${mutationName} does not have an ID argument`);
        return false;
      }

      const idArgName = idArg.name;
      const idArgType = getNamedType(idArg.type);
      const idArgTypeName = idArgType.toString();

      const query = `
        mutation Delete${type}($${idArgName}: ${idArgTypeName}!) {
          ${mutationName}(${idArgName}: $${idArgName})
        }
      `;

      const variables: Record<string, any> = {};
      variables[idArgName] = id;

      const result = await this.graphqlService.execute({
        query,
        variables,
      }, this.defaultContext);

      if (result.errors && result.errors.length > 0) {
        logger.error(`Error deleting ${type}`, { errors: result.errors, id });
        return false;
      }

      return result.data?.[mutationName] || false;
    } catch (error: any) {
      logger.error(`Error deleting ${type}`, { error: error?.message || error, id });
      return false;
    }
  }

  /**
   * Check if document exists
   * @param type GraphQL type name
   * @param identifier Can be { id } or field-based filter
   * @returns True if exists, false otherwise
   */
  async exists(type: string, identifier: ReadOptions): Promise<boolean> {
    try {
      const existsFieldName = this.getFieldNameForType(type, 'exists');
      const id = identifier.id || identifier._id;
      
      let query: string;
      let variables: Record<string, any> = {};

      if (id) {
        query = `
          query ${type}Exists($id: ID!) {
            ${existsFieldName}(id: $id)
          }
        `;
        variables.id = id;
      } else {
        // Field-based lookup
        const fieldName = Object.keys(identifier)[0];
        const value = identifier[fieldName];
        const fieldType = this.inferFieldType(value);
        
        query = `
          query ${type}Exists($${fieldName}: ${fieldType}!) {
            ${existsFieldName}(${fieldName}: $${fieldName})
          }
        `;
        variables[fieldName] = value;
      }

      const result = await this.graphqlService.execute({
        query,
        variables,
      }, this.defaultContext);

      if (result.errors && result.errors.length > 0) {
        logger.error(`Error checking existence of ${type}`, { errors: result.errors, identifier });
        return false;
      }

      return result.data?.[existsFieldName] || false;
    } catch (error: any) {
      logger.error(`Error checking existence of ${type}`, { error: error?.message || error, identifier });
      return false;
    }
  }

  /**
   * Count documents matching filters
   * @param type GraphQL type name
   * @param filters Field filters
   * @returns Count of documents
   */
  async count(type: string, filters: Record<string, any> = {}): Promise<number> {
    try {
      // Count is typically done via list with limit 0, or a separate count query
      // For now, we'll use list and return length
      // In future, can add dedicated count query if schema supports it
      const results = await this.list(type, filters, { limit: 10000 }); // Large limit for count
      return results.length;
    } catch (error: any) {
      logger.error(`Error counting ${type}`, { error: error?.message || error, filters });
      return 0;
    }
  }

  /**
   * Get field name for GraphQL operation based on type
   */
  private getFieldNameForType(type: string, operation: 'read' | 'list' | 'create' | 'update' | 'delete' | 'exists' | 'id'): string {
    const typeLower = type.toLowerCase();
    
    switch (operation) {
      case 'read':
        // shop(domain), filter(id) - singular, lowercase
        return typeLower;
      case 'list':
        // shops(shop), filters(shop) - plural, lowercase
        return typeLower.endsWith('s') ? typeLower : `${typeLower}s`;
      case 'create':
        // createShop, createFilter
        return `create${type}`;
      case 'update':
        // updateShop, updateFilter
        return `update${type}`;
      case 'delete':
        // deleteShop, deleteFilter
        return `delete${type}`;
      case 'exists':
        // shopExists, filterExists
        return `${typeLower}Exists`;
      case 'id':
        // For ID field in queries
        return 'id';
      default:
        return typeLower;
    }
  }

  /**
   * Get fields for GraphQL query using schema introspection
   * Dynamically builds field selection based on actual schema
   */
  private getFieldsForType(type: string): string {
    try {
      const typeDef = this.schema.getType(type);
      if (!typeDef || !isObjectType(typeDef)) {
        logger.warn(`Type ${type} not found in schema or is not an object type`);
        return 'id'; // Fallback
      }

      const fields = typeDef.getFields();
      const fieldSelections: string[] = [];

      Object.keys(fields).forEach(fieldName => {
        const field = fields[fieldName];
        const fieldType = field.type;
        
        // Skip if it's a function/resolver-only field
        if (fieldName.startsWith('_')) {
          return;
        }

        // Check if field is an object type (needs subfields)
        const namedType = getNamedType(fieldType);
        if (isObjectType(namedType)) {
          // Recursively get subfields
          const subFields = this.getFieldsForObjectType(namedType);
          fieldSelections.push(`${fieldName} {\n${subFields}\n}`);
        } else {
          // Scalar or list of scalars
          fieldSelections.push(fieldName);
        }
      });

      return fieldSelections.join('\n');
    } catch (error: any) {
      logger.error(`Error getting fields for type ${type}`, { error: error?.message || error });
      return 'id'; // Fallback
    }
  }

  /**
   * Get fields for an object type (recursive for nested objects)
   */
  private getFieldsForObjectType(type: GraphQLObjectType, depth: number = 0, maxDepth: number = 3): string {
    // Prevent infinite recursion
    if (depth >= maxDepth) {
      return '';
    }

    const fields = type.getFields();
    const fieldSelections: string[] = [];

    Object.keys(fields).forEach(fieldName => {
      const field = fields[fieldName];
      const fieldType = field.type;
      const namedType = getNamedType(fieldType);

      if (isObjectType(namedType)) {
        // Recursive for nested objects
        const subFields = this.getFieldsForObjectType(namedType, depth + 1, maxDepth);
        fieldSelections.push(`  ${fieldName} {\n${subFields}\n  }`);
      } else {
        // Scalar field
        fieldSelections.push(`  ${fieldName}`);
      }
    });

    return fieldSelections.join('\n');
  }

  /**
   * Get input type fields from schema
   */
  private getInputTypeFields(inputTypeName: string): Record<string, any> {
    try {
      const inputType = this.schema.getType(inputTypeName);
      if (!inputType || !isInputObjectType(inputType)) {
        logger.warn(`Input type ${inputTypeName} not found in schema`);
        return {};
      }

      const fields = inputType.getFields();
      const inputFields: Record<string, any> = {};

      Object.keys(fields).forEach(fieldName => {
        const field = fields[fieldName];
        inputFields[fieldName] = field.type;
      });

      return inputFields;
    } catch (error: any) {
      logger.error(`Error getting input type fields for ${inputTypeName}`, { error: error?.message || error });
      return {};
    }
  }

  /**
   * Get mutation/query field from schema
   */
  private getOperationField(operation: 'Query' | 'Mutation', fieldName: string): GraphQLField<any, any> | null {
    try {
      const operationType = operation === 'Query' 
        ? this.schema.getQueryType()
        : this.schema.getMutationType();

      if (!operationType) {
        return null;
      }

      const field = operationType.getFields()[fieldName];
      return field || null;
    } catch (error: any) {
      logger.error(`Error getting ${operation} field ${fieldName}`, { error: error?.message || error });
      return null;
    }
  }

  /**
   * Infer GraphQL field type from value
   */
  private inferFieldType(value: any): string {
    if (typeof value === 'string') {
      // Check if it looks like an ID
      if (value.match(/^[a-zA-Z0-9_-]+$/)) {
        return 'String';
      }
      return 'String';
    }
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'Int' : 'Float';
    }
    if (typeof value === 'boolean') {
      return 'Boolean';
    }
    return 'String';
  }
}

