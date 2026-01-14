import { GraphQLError } from "../graphql.server";

/**
 * Properly throw a GraphQL error in a Remix loader/action
 * This ensures the error is serialized correctly and can be caught by ErrorBoundary
 */
export function throwGraphQLError(error: GraphQLError): never {
  // Create a Response with JSON data and throw it
  // This is the React Router v7 way of throwing data responses
  throw new Response(
    JSON.stringify({
      message: error.message,
      code: error.code,
      endpoint: error.endpoint,
      timestamp: error.timestamp,
      statusCode: error.statusCode,
      isNetworkError: error.isNetworkError,
      isServerError: error.isServerError,
      isGraphQLError: true,
      stack: error.stack,
      serverMessage: error.serverMessage, // Original server message
      serverResponse: error.serverResponse, // Full server response
    }),
    {
      status: error.statusCode || 500,
      statusText: error.message,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

