/**
 * GraphQL Helpers
 * Utility functions for GraphQL operations
 */

import { GraphQLError } from './graphql.type';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('graphql-helper');

/**
 * Generate unique request ID for tracing
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if query is valid GraphQL syntax (basic check)
 */
export function isValidGraphQLQuery(query: string): boolean {
  if (!query || typeof query !== 'string') {
    return false;
  }

  const trimmed = query.trim();
  
  // Must start with query or mutation
  if (!trimmed.match(/^(query|mutation|subscription)\s+/i) && !trimmed.startsWith('{')) {
    return false;
  }

  // Basic bracket matching
  const openBraces = (trimmed.match(/{/g) || []).length;
  const closeBraces = (trimmed.match(/}/g) || []).length;
  
  return openBraces === closeBraces && openBraces > 0;
}

/**
 * Extract operation name from query
 */
export function extractOperationName(query: string): string | null {
  const match = query.match(/(?:query|mutation|subscription)\s+(\w+)/i);
  return match ? match[1] : null;
}

/**
 * Check query complexity (simple depth check)
 */
export function checkQueryComplexity(query: string, maxDepth: number = 10): {
  valid: boolean;
  depth: number;
  error?: string;
} {
  let depth = 0;
  let maxDepthFound = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < query.length; i++) {
    const char = query[i];
    const prevChar = i > 0 ? query[i - 1] : '';

    // Handle string literals
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = '';
      }
      continue;
    }

    if (inString) continue;

    // Track depth
    if (char === '{') {
      depth++;
      maxDepthFound = Math.max(maxDepthFound, depth);
    } else if (char === '}') {
      depth--;
    }
  }

  if (maxDepthFound > maxDepth) {
    return {
      valid: false,
      depth: maxDepthFound,
      error: `Query depth ${maxDepthFound} exceeds maximum allowed depth of ${maxDepth}`,
    };
  }

  return {
    valid: true,
    depth: maxDepthFound,
  };
}

/**
 * Sanitize GraphQL query (remove comments, normalize whitespace)
 */
export function sanitizeQuery(query: string): string {
  if (!query || typeof query !== 'string') {
    return '';
  }

  // Remove comments (both # and /* */ style)
  let sanitized = query
    .replace(/#[^\n]*/g, '') // Remove # comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove /* */ comments

  // Normalize whitespace
  sanitized = sanitized
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized;
}

/**
 * Create user-friendly error message
 */
export function createUserFriendlyError(error: any, requestId?: string): GraphQLError {
  const requestIdExt = requestId ? { requestId } : {};

  // GraphQL validation errors
  if (error.message && error.locations) {
    return {
      message: error.message,
      locations: error.locations,
      extensions: {
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
        ...requestIdExt,
      },
    };
  }

  // Business logic errors
  if (error.code && error.message) {
    return {
      message: error.message,
      extensions: {
        code: error.code,
        details: error.details,
        timestamp: new Date().toISOString(),
        ...requestIdExt,
      },
    };
  }

  // Syntax errors
  if (error.message && error.message.includes('Syntax Error')) {
    return {
      message: 'Invalid GraphQL query syntax. Please check your query and try again.',
      extensions: {
        code: 'SYNTAX_ERROR',
        details: process.env.NODE_ENV === 'development' ? { originalError: error.message } : undefined,
        timestamp: new Date().toISOString(),
        ...requestIdExt,
      },
    };
  }

  // Unknown errors
  logger.error('Unhandled GraphQL error', {
    error: error?.message || error,
    stack: error?.stack,
    requestId,
  });

  return {
    message: process.env.NODE_ENV === 'development' 
      ? (error?.message || 'An unexpected error occurred')
      : 'An error occurred while processing your request. Please try again.',
    extensions: {
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
      ...requestIdExt,
      ...(process.env.NODE_ENV === 'development' && {
        originalError: error?.message,
        stack: error?.stack,
      }),
    },
  };
}

/**
 * Validate GraphQL request body
 */
export function validateGraphQLRequest(body: any): {
  valid: boolean;
  error?: string;
  request?: {
    query: string;
    variables?: Record<string, any>;
    operationName?: string;
  };
} {
  if (!body) {
    return {
      valid: false,
      error: 'Request body is required',
    };
  }

  // Support both single query and batch queries
  const requests = Array.isArray(body) ? body : [body];

  for (const req of requests) {
    if (!req.query || typeof req.query !== 'string') {
      return {
        valid: false,
        error: 'Query is required and must be a string',
      };
    }

    if (req.variables && typeof req.variables !== 'object') {
      return {
        valid: false,
        error: 'Variables must be an object',
      };
    }

    if (req.operationName && typeof req.operationName !== 'string') {
      return {
        valid: false,
        error: 'Operation name must be a string',
      };
    }
  }

  return {
    valid: true,
    request: Array.isArray(body) ? body[0] : body,
  };
}

/**
 * Format GraphQL response
 */
export function formatGraphQLResponse(
  data: any,
  errors?: GraphQLError[],
  extensions?: Record<string, any>
): {
  data?: any;
  errors?: GraphQLError[];
  extensions?: Record<string, any>;
} {
  const response: {
    data?: any;
    errors?: GraphQLError[];
    extensions?: Record<string, any>;
  } = {};

  if (data !== undefined) {
    response.data = data;
  }

  if (errors && errors.length > 0) {
    response.errors = errors;
  }

  if (extensions) {
    response.extensions = extensions;
  }

  return response;
}

