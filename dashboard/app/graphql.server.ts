import { buildGraphQLEndpoint } from "./utils/build-graphQL-endpoint";
import { createModuleLogger } from "./utils/logger";
import { authenticatedFetch, shouldAuthenticate } from "./utils/auth.server";

const logger = createModuleLogger("graphql.server");

export async function graphqlRequest<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  const endpoint = buildGraphQLEndpoint({ shop: variables?.shop });

  logger.info("endpoint",endpoint);
  logger.info("variables",variables);
  logger.info("query",query);

  // Use authenticated fetch if authentication is configured and endpoint requires it
  const useAuth = shouldAuthenticate(endpoint);
  const requestBodyObj = { query, variables };
  const requestBody = JSON.stringify(requestBodyObj);
  
  const response = useAuth
    ? await authenticatedFetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: requestBody,
        // Pass the parsed object for authentication (will be hashed with sorted keys)
        bodyForAuth: requestBodyObj,
      })
    : await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

  const result = await response.json().catch(() => ({}));

  logger.info("result",result);

  if (result.errors?.length) {
    throw new Error(result.errors[0].message || "GraphQL error");
  }

  return result.data as T;
}
