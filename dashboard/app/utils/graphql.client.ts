/**
 * GraphQL Client Utility
 * Helper for making GraphQL requests from dashboard routes
 */

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT || "http://localhost:3554/graphql";

/**
 * Make GraphQL request
 */
export async function graphqlRequest(query: string, variables?: any): Promise<any> {
  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors && result.errors.length > 0) {
      throw new Error(result.errors[0].message || 'GraphQL error');
    }

    return result.data;
  } catch (error: any) {
    throw error;
  }
}

