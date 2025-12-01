/**
 * GraphQL Types
 * TypeScript types for GraphQL module
 */

import { Request } from 'express';

export interface GraphQLRequest {
  query: string;
  variables?: Record<string, any>;
  operationName?: string;
}

export interface GraphQLResponse {
  data?: any;
  errors?: GraphQLError[];
  extensions?: Record<string, any>;
}

export interface GraphQLError {
  message: string;
  locations?: Array<{
    line: number;
    column: number;
  }>;
  path?: Array<string | number>;
  extensions?: {
    code?: string;
    field?: string;
    details?: any;
    timestamp?: string;
    requestId?: string;
  };
}

export interface GraphQLContext {
  req: Request & {
    [key: string]: any; // For injected services
  };
  user?: {
    id: string;
    shop: string;
    role?: string;
    [key: string]: any;
  };
}

export interface GraphQLServiceDependencies {
  [serviceName: string]: any;
}

export interface GraphQLModule {
  service: any; // GraphQLService - using any to avoid circular dependency
  schema: any; // GraphQLSchema type from graphql package
  resolvers: any;
}

export interface GraphQLExecutionResult {
  data?: any;
  errors?: GraphQLError[];
}

