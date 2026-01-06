const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT || "/graphql";

const graphqlEndpointWithShop = (shop: string) => {
  return `${GRAPHQL_ENDPOINT}?shop=${encodeURIComponent(shop)}`;
};

export async function graphqlRequest<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  let endpoint = GRAPHQL_ENDPOINT;

  if (variables?.shop) {
    endpoint = graphqlEndpointWithShop(variables.shop);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  console.log("req:data", JSON.stringify({ query, variables }, null, 4));

  const result = await response.json().catch(() => ({}));

  console.log("result", result);

  if (result.errors?.length) {
    throw new Error(result.errors[0].message || "GraphQL error");
  }

  return result.data as T;
}
