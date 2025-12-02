import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT || "http://localhost:3554/graphql";

  try {
    const { session } = await authenticate.admin(request);
    const shop = session?.shop || "";

    if (!shop) {
      return new Response(
        JSON.stringify({ error: "Shop information is missing" }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const body = await request.json();
    const { mutation, variables } = body;

    if (!mutation || !variables) {
      return new Response(
        JSON.stringify({ error: "Mutation and variables are required" }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Ensure shop is included in variables
    const finalVariables = {
      ...variables,
      shop,
    };

    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: mutation,
        variables: finalVariables,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: `GraphQL request failed: ${response.statusText}` }),
        { 
          status: response.status,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const result = await response.json();

    if (result.errors) {
      return new Response(
        JSON.stringify({ 
          error: result.errors[0]?.message || "GraphQL mutation failed",
          errors: result.errors 
        }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    return new Response(
      JSON.stringify(result.data),
      { 
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};


