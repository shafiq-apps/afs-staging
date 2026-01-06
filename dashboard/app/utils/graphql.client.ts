/**
 * GraphQL Client Utility
 * Helper for making GraphQL requests from dashboard routes
*/

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT || "/graphql";

const graphqlEndpointWithShop = (shop: string) => {
  return `${GRAPHQL_ENDPOINT}?shop=${encodeURIComponent(shop)}`;
}

export async function graphqlRequest(query: string, variables?: any): Promise<any> {
  let endpoint = GRAPHQL_ENDPOINT;
  if (variables?.shop) {
    endpoint = graphqlEndpointWithShop(variables.shop);
  }
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    const result = await response.json().then((data) => data).catch(() => ({}));

    if (result.errors && result.errors.length > 0) {
      throw new Error(result.errors[0].message || 'GraphQL error');
    }

    return result.data;
  } catch (error: any) {
    return null;
  }
}