import { buildGraphQLEndpoint } from "./utils/build-graphQL-endpoint";
import { createModuleLogger } from "./utils/logger";

const logger = createModuleLogger("graphql.server");

export async function graphqlRequest<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  const endpoint = buildGraphQLEndpoint({ shop: variables?.shop });

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
