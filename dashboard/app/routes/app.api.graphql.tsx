import type { ActionFunctionArgs } from "react-router";
import { graphqlRequest } from "app/graphql.server";

export const action = async ({ request }: ActionFunctionArgs) => {
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
  const result = await graphqlRequest(mutation, variables);
  return new Response(
    JSON.stringify(result),
    {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }
  );
};