/**
 * GraphQL Service
 * Handles GraphQL query execution with dynamic schema and error handling
 */

import { GraphQLSchema, graphql, GraphQLError as GraphQLCoreError } from 'graphql';
import {
  GraphQLRequest,
  GraphQLResponse,
  GraphQLContext,
  GraphQLError,
  GraphQLExecutionResult,
} from './graphql.type';
import {
  generateRequestId,
  isValidGraphQLQuery,
  checkQueryComplexity,
  sanitizeQuery,
  createUserFriendlyError,
  validateGraphQLRequest,
  formatGraphQLResponse,
} from './graphql.helper';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('graphql-service');

export interface GraphQLServiceOptions {
  schema: GraphQLSchema;
  resolvers: any;
  maxQueryDepth?: number;
  maxQueryComplexity?: number;
  enableIntrospection?: boolean;
}

export class GraphQLService {
  private schema: GraphQLSchema;
  private resolvers: any;
  private maxQueryDepth: number;
  private maxQueryComplexity: number;
  private enableIntrospection: boolean;

  constructor(options: GraphQLServiceOptions) {
    this.schema = options.schema;
    this.resolvers = options.resolvers;
    this.maxQueryDepth = options.maxQueryDepth || 10;
    this.maxQueryComplexity = options.maxQueryComplexity || 1000;
    this.enableIntrospection = options.enableIntrospection ?? true;
  }

  /**
   * Execute GraphQL query/mutation
   */
  async execute(
    request: GraphQLRequest,
    context: GraphQLContext
  ): Promise<GraphQLResponse> {
    const requestId = generateRequestId();
    const startTime = Date.now();

    try {
      // Validate request structure
      const validation = validateGraphQLRequest(request);
      if (!validation.valid) {
        return this.createErrorResponse(validation.error || 'Invalid request', requestId);
      }

      const { query, variables, operationName } = validation.request!;

      // Sanitize query
      const sanitizedQuery = sanitizeQuery(query);

      // Basic syntax validation
      if (!isValidGraphQLQuery(sanitizedQuery)) {
        return this.createErrorResponse(
          'Invalid GraphQL query syntax',
          requestId,
          'SYNTAX_ERROR'
        );
      }

      // Check query complexity
      const complexityCheck = checkQueryComplexity(sanitizedQuery, this.maxQueryDepth);
      if (!complexityCheck.valid) {
        return this.createErrorResponse(
          complexityCheck.error || 'Query too complex',
          requestId,
          'QUERY_TOO_COMPLEX',
          { maxDepth: this.maxQueryDepth, actualDepth: complexityCheck.depth }
        );
      }

      // Disable introspection in production if configured
      if (!this.enableIntrospection && this.isIntrospectionQuery(sanitizedQuery)) {
        return this.createErrorResponse(
          'Introspection queries are disabled',
          requestId,
          'INTROSPECTION_DISABLED'
        );
      }

      // Execute GraphQL query
      const result = await this.executeQuery(sanitizedQuery, variables, operationName, context);

      // Log execution time
      const executionTime = Date.now() - startTime;
      logger.info('GraphQL query executed', {
        requestId,
        operationName,
        executionTime: `${executionTime}ms`,
        hasData: !!result.data,
        hasErrors: !!result.errors && result.errors.length > 0,
        dataKeys: result.data ? Object.keys(result.data) : [],
        errorCount: result.errors ? result.errors.length : 0,
      });

      // Format response
      return formatGraphQLResponse(
        result.data,
        result.errors,
        {
          requestId,
          executionTime: `${executionTime}ms`,
        }
      );
    } catch (error: any) {
      logger.error('GraphQL execution error', {
        error: error?.message || error,
        stack: error?.stack,
        requestId,
      });

      return this.createErrorResponse(
        error?.message || 'Internal server error',
        requestId,
        'INTERNAL_ERROR',
        process.env.NODE_ENV === 'development' ? { originalError: error } : undefined
      );
    }
  }

  /**
   * Execute GraphQL query using graphql library
   */
  private async executeQuery(
    query: string,
    variables: Record<string, any> | undefined,
    operationName: string | undefined,
    context: GraphQLContext
  ): Promise<GraphQLExecutionResult> {
    try {
      logger.info('Executing GraphQL query with graphql library', {
        hasSchema: !!this.schema,
        hasResolvers: !!this.resolvers,
        hasContext: !!context,
        hasVariables: !!variables,
        operationName,
      });

      const result = await graphql({
        schema: this.schema,
        source: query,
        variableValues: variables,
        operationName,
        contextValue: context,
        // rootValue is not needed - resolvers are attached to schema
      });

      logger.info('GraphQL library execution completed', {
        hasData: !!result.data,
        hasErrors: !!result.errors,
        dataKeys: result.data ? Object.keys(result.data) : [],
        errorCount: result.errors ? result.errors.length : 0,
      });

      // Transform GraphQL core errors to our error format
      const errors: GraphQLError[] = [];
      if (result.errors) {
        logger.warn('GraphQL execution returned errors', {
          errorCount: result.errors.length,
          errors: result.errors.map(e => ({
            message: e.message,
            path: e.path,
            locations: e.locations,
          })),
        });
        for (const error of result.errors) {
          errors.push(this.transformGraphQLError(error));
        }
      }

      return {
        data: result.data,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error: any) {
      logger.error('GraphQL execution error', {
        error: error?.message || error,
        stack: error?.stack,
      });
      // Handle execution errors
      throw new Error(`GraphQL execution failed: ${error?.message || error}`);
    }
  }

  /**
   * Transform GraphQL core error to our error format
   */
  private transformGraphQLError(error: GraphQLCoreError): GraphQLError {
    return createUserFriendlyError({
      message: error.message,
      locations: error.locations?.map(loc => ({
        line: loc.line,
        column: loc.column,
      })),
      path: error.path,
      extensions: error.extensions,
    });
  }

  /**
   * Check if query is an introspection query
   */
  private isIntrospectionQuery(query: string): boolean {
    const introspectionPatterns = [
      /__schema/i,
      /__type/i,
      /__typename/i,
      /IntrospectionQuery/i,
    ];

    return introspectionPatterns.some(pattern => pattern.test(query));
  }

  /**
   * Create error response
   */
  private createErrorResponse(
    message: string,
    requestId: string,
    code: string = 'ERROR',
    details?: any
  ): GraphQLResponse {
    const error: GraphQLError = {
      message,
      extensions: {
        code,
        timestamp: new Date().toISOString(),
        requestId,
        ...(details && { details }),
      },
    };

    return formatGraphQLResponse(undefined, [error], {
      requestId,
    });
  }

  /**
   * Update schema dynamically (for hot-reloading in development)
   */
  updateSchema(schema: GraphQLSchema): void {
    this.schema = schema;
    logger.info('GraphQL schema updated');
  }

  /**
   * Update resolvers dynamically (for hot-reloading in development)
   */
  updateResolvers(resolvers: any): void {
    this.resolvers = resolvers;
    logger.info('GraphQL resolvers updated');
  }
}

