import { buildGraphQLEndpoint } from "./utils/build-graphQL-endpoint";
import { createModuleLogger } from "./utils/logger";
import { authenticatedFetch, shouldAuthenticate } from "./utils/auth.server";

const logger = createModuleLogger("graphql.server");

export class GraphQLError extends Error {
  code: string;
  endpoint: string;
  timestamp: string;
  statusCode?: number;
  isNetworkError: boolean;
  isServerError: boolean;
  originalError?: any;
  isGraphQLError: boolean;
  serverMessage?: string; // Original server error message
  serverResponse?: any; // Full server response for debugging
  query?: string; // GraphQL query
  variables?: Record<string, any>; // GraphQL variables
  requestHeaders?: Record<string, string>; // Request headers
  responseHeaders?: Record<string, string>; // Response headers
  method?: string; // HTTP method

  constructor(message: string, options: {
    code?: string;
    endpoint: string;
    statusCode?: number;
    isNetworkError?: boolean;
    isServerError?: boolean;
    originalError?: any;
    serverMessage?: string;
    serverResponse?: any;
    query?: string;
    variables?: Record<string, any>;
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
    method?: string;
  }) {
    super(message);
    this.name = "GraphQLError";
    this.code = options.code || "GRAPHQL_ERROR";
    this.endpoint = options.endpoint;
    this.timestamp = new Date().toISOString();
    this.statusCode = options.statusCode;
    this.isNetworkError = options.isNetworkError || false;
    this.isServerError = options.isServerError || false;
    this.originalError = options.originalError;
    this.serverMessage = options.serverMessage; // Keep original server message
    this.serverResponse = options.serverResponse; // Keep full response
    this.query = options.query; // Keep GraphQL query
    this.variables = options.variables; // Keep variables
    this.requestHeaders = options.requestHeaders; // Keep request headers
    this.responseHeaders = options.responseHeaders; // Keep response headers
    this.method = options.method || 'POST'; // HTTP method
    this.isGraphQLError = true;
  }

  // Make sure the error serializes properly for Remix
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      endpoint: this.endpoint,
      timestamp: this.timestamp,
      statusCode: this.statusCode,
      isNetworkError: this.isNetworkError,
      isServerError: this.isServerError,
      isGraphQLError: this.isGraphQLError,
      stack: this.stack,
      serverMessage: this.serverMessage,
      serverResponse: this.serverResponse,
      query: this.query,
      variables: this.variables,
      requestHeaders: this.requestHeaders,
      responseHeaders: this.responseHeaders,
      method: this.method,
    };
  }
}

export async function graphqlRequest<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  const endpoint = buildGraphQLEndpoint({ shop: variables?.shop });

  logger.info("endpoint", endpoint);
  logger.info("variables", variables);
  logger.info("query", query);

  try {
    // Use authenticated fetch if authentication is configured and endpoint requires it
    const useAuth = shouldAuthenticate(endpoint);
    const requestBodyObj = { query, variables };
    const requestBody = JSON.stringify(requestBodyObj);
    
    let response: Response;
    
    try {
      response = useAuth
        ? await authenticatedFetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: requestBody,
            bodyForAuth: requestBodyObj,
          })
        : await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: requestBody,
          });
    } catch (fetchError: any) {
      logger.error("Network error during GraphQL request", {
        error: fetchError.message,
        endpoint,
      });
      
      throw new GraphQLError(
        "Unable to connect to the server. Please check your internet connection and try again.",
        {
          code: "NETWORK_ERROR",
          endpoint,
          isNetworkError: true,
          originalError: fetchError,
          query,
          variables,
          method: 'POST',
          requestHeaders: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Check if response is ok
    if (!response.ok) {
      // Try to get the response body for more details
      let responseBody: any = null;
      let serverMessage = response.statusText;
      
      try {
        const text = await response.text();
        try {
          responseBody = JSON.parse(text);
          // Extract error message from response if available
          serverMessage = responseBody?.message || 
                         responseBody?.error || 
                         responseBody?.errors?.[0]?.message ||
                         response.statusText;
        } catch {
          // If not JSON, use text as message
          serverMessage = text || response.statusText;
        }
      } catch (readError) {
        logger.warn("Could not read error response body", { error: readError });
      }

      logger.error("GraphQL HTTP error", {
        status: response.status,
        statusText: response.statusText,
        serverMessage,
        responseBody,
        endpoint,
      });

      const isServerError = response.status >= 500;
      const userMessage = isServerError
        ? "The server is currently experiencing issues. Please try again later."
        : `Request failed with status ${response.status}: ${serverMessage}`;

      // Extract response headers
      const responseHeadersObj: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeadersObj[key] = value;
      });

      throw new GraphQLError(userMessage, {
        code: isServerError ? "SERVER_ERROR" : "HTTP_ERROR",
        endpoint,
        statusCode: response.status,
        isServerError,
        serverMessage, // Original server error message
        serverResponse: responseBody, // Full response for debugging
        query,
        variables,
        method: 'POST',
        requestHeaders: {
          'Content-Type': 'application/json',
        },
        responseHeaders: responseHeadersObj,
      });
    }

    let result: any;
    
    try {
      result = await response.json();
    } catch (parseError: any) {
      logger.error("Failed to parse GraphQL response", {
        error: parseError.message,
        endpoint,
      });
      
      throw new GraphQLError(
        "Received an invalid response from the server.",
        {
          code: "PARSE_ERROR",
          endpoint,
          isServerError: true,
          originalError: parseError,
          query,
          variables,
          method: 'POST',
          requestHeaders: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    logger.info("result", result);

    // Check for GraphQL errors
    if (result.errors?.length) {
      const gqlError = result.errors[0];
      const allErrors = result.errors.map((e: any) => e.message).join("; ");
      
      logger.error("GraphQL query error", {
        error: gqlError,
        allErrors,
        endpoint,
      });

      throw new GraphQLError(
        gqlError.message || "GraphQL query failed",
        {
          code: "QUERY_ERROR",
          endpoint,
          originalError: result.errors,
          serverMessage: allErrors, // All error messages from server
          serverResponse: result.errors, // Full error details
          query,
          variables,
          method: 'POST',
          requestHeaders: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return result.data as T;
  } catch (error: any) {
    // If it's already a GraphQLError, rethrow it
    if (error instanceof GraphQLError) {
      throw error;
    }

    // Otherwise, wrap it in a GraphQLError
    logger.error("Unexpected error during GraphQL request", {
      error: error.message,
      stack: error.stack,
      endpoint,
    });

    throw new GraphQLError(
      "An unexpected error occurred. Please try again.",
      {
        code: "UNKNOWN_ERROR",
        endpoint,
        isServerError: true,
        originalError: error,
        query,
        variables,
        method: 'POST',
        requestHeaders: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
