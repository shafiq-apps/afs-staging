import { createModuleLogger } from "./utils/logger";

const logger = createModuleLogger("graphql.server");

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT || "/graphql";

export async function graphqlRequest<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  let endpoint = (process.env.SHOPIFY_APP_URL && process.env.SHOPIFY_APP_URL + GRAPHQL_ENDPOINT) || "https://fstaging.digitalcoo.com/graphql";

  if (variables?.shop) {
    endpoint += `?shop=${variables.shop}`;
  }

  logger.info("fetching data from graphql endpoint",endpoint);
  logger.info("variables",variables);
  logger.info("query",query);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json().catch(() => ({}));

  logger.info("result",result);

  if (result.errors?.length) {
    throw new Error(result.errors[0].message || "GraphQL error");
  }

  return result.data as T;
}
