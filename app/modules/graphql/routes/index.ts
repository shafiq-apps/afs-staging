/**
 * GraphQL Route Handler
 * POST /graphql
 * Handles all GraphQL queries and mutations
 */

import { handler } from '@core/http/http.handler';
import { HttpRequest } from '@core/http/http.types';
import { validate } from '@core/http/validation.middleware';
import { rateLimit } from '@core/security/rate-limit.middleware';
import { createModuleLogger } from '@shared/utils/logger.util';
import { GraphQLRequest, GraphQLContext } from '../graphql.type';

const logger = createModuleLogger('graphql-route');

/**
 * Middleware for GraphQL endpoint
 */
export const middleware = [
  validate({
    body: {
      query: {
        type: 'string',
        required: true,
      },
      variables: {
        type: 'object',
        required: false,
      },
      operationName: {
        type: 'string',
        required: false,
      },
    },
  }),
  rateLimit({
    windowMs: 60000, // 1 minute
    max: 1000, // 1000 requests per minute
    message: 'Too many GraphQL requests',
  }),
];

/**
 * POST /graphql
 * Execute GraphQL query or mutation
 */
export const POST = handler(async (req: HttpRequest) => {
  try {
    // Get GraphQL service from request (injected by bootstrap)
    const graphqlService = (req as any).graphqlService;

    if (!graphqlService) {
      logger.error('GraphQL service not available');
      return {
        statusCode: 500,
        body: {
          success: false,
          error: {
            message: 'GraphQL service is not available',
            extensions: {
              code: 'SERVICE_UNAVAILABLE',
            },
          },
        },
      };
    }

    // Extract GraphQL request from body
    const graphqlRequest: GraphQLRequest = {
      query: req.body.query,
      variables: req.body.variables,
      operationName: req.body.operationName,
    };

    // Build GraphQL context
    const context: GraphQLContext = {
      req: req as any,
      user: (req as any).user, // If authentication middleware sets this
    };

    // Execute GraphQL query
    logger.debug('Executing GraphQL query', {
      operationName: graphqlRequest.operationName,
      hasVariables: !!graphqlRequest.variables,
    });

    const result = await graphqlService.execute(graphqlRequest, context);

    // Return GraphQL response
    return {
      statusCode: result.errors && result.errors.length > 0 ? 200 : 200, // GraphQL always returns 200, errors are in response
      body: result,
    };
  } catch (error: any) {
    logger.error('GraphQL route error', {
      error: error?.message || error,
      stack: error?.stack,
    });

    // Return error response in GraphQL format
    return {
      statusCode: 200, // GraphQL always returns 200
      body: {
        data: null,
        errors: [
          {
            message: process.env.NODE_ENV === 'development'
              ? (error?.message || 'Internal server error')
              : 'An error occurred while processing your request',
            extensions: {
              code: 'INTERNAL_ERROR',
              timestamp: new Date().toISOString(),
              ...(process.env.NODE_ENV === 'development' && {
                originalError: error?.message,
                stack: error?.stack,
              }),
            },
          },
        ],
      },
    };
  }
});

