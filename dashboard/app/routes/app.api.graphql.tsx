import type { ActionFunctionArgs } from "react-router";
import { buildGraphQLEndpoint } from "../utils/build-graphQL-endpoint";
import { createModuleLogger } from "../utils/logger";
import { authenticatedFetch, shouldAuthenticate } from "../utils/auth.server";

const logger = createModuleLogger("graphql-api-route");

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const body = await request.json();
    // Support both 'query' and 'mutation' keys (GraphQL standard uses 'query' for both)
    const query = body.query || body.mutation;
    const variables = body.variables;

    if (!query) {
      return new Response(
        JSON.stringify({ 
          errors: [{ message: "Query or mutation is required" }] 
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Extract shop from variables to build endpoint
    const shop = variables?.shop;
    const endpoint = buildGraphQLEndpoint({ shop });

    logger.info("GraphQL request", { 
      endpoint, 
      hasVariables: !!variables,
      operationType: query.trim().startsWith("mutation") ? "mutation" : "query"
    });

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

    if (!response.ok) {
      logger.error("GraphQL endpoint error", {
        status: response.status,
        statusText: response.statusText,
      });
      return new Response(
        JSON.stringify({
          errors: [{ message: `GraphQL endpoint returned ${response.status}: ${response.statusText}` }]
        }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const result = await response.json().catch((error) => {
      logger.error("Failed to parse GraphQL response", { error: error?.message || error });
      return {
        errors: [{ message: "Failed to parse GraphQL response" }]
      };
    });

    logger.info("GraphQL response", {
      hasData: !!result.data,
      hasErrors: !!result.errors && result.errors.length > 0,
      dataKeys: result.data ? Object.keys(result.data) : [],
    });

    // Return GraphQL standard response format: { data, errors }
    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error: any) {
    logger.error("GraphQL API route error", { error: error?.message || error });
    return new Response(
      JSON.stringify({
        errors: [{ message: error?.message || "Internal server error" }]
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};