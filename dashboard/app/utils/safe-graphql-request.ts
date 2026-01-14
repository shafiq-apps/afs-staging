import { graphqlRequest, GraphQLError } from "../graphql.server";

/**
 * Safe wrapper around graphqlRequest that catches errors and returns them
 * instead of throwing. Useful for non-critical queries where you want to 
 * handle errors inline instead of showing a full error page.
 */
export async function safeGraphqlRequest<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<{ data: T | null; error: GraphQLError | null }> {
  try {
    const data = await graphqlRequest<T>(query, variables);
    return { data, error: null };
  } catch (error: any) {
    if (error instanceof GraphQLError) {
      return { data: null, error };
    }
    
    // Wrap non-GraphQL errors
    const gqlError = new GraphQLError(
      error.message || "An unexpected error occurred",
      {
        code: "UNKNOWN_ERROR",
        endpoint: "unknown",
        originalError: error,
      }
    );
    
    return { data: null, error: gqlError };
  }
}

/**
 * Execute multiple GraphQL requests in parallel with error handling
 */
export async function safeGraphqlBatch<T extends any[]>(
  requests: Array<{ query: string; variables?: Record<string, any> }>
): Promise<Array<{ data: any; error: GraphQLError | null }>> {
  const promises = requests.map(({ query, variables }) =>
    safeGraphqlRequest(query, variables)
  );
  
  return Promise.all(promises);
}

