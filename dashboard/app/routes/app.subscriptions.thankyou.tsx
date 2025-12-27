import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

interface LoaderData {
  success: boolean;
  planId?: string;
  error?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");
  const planId = url.searchParams.get("pid");

  if (!session?.shop) {
    return { success: false, error: "Shop not found" } satisfies LoaderData;
  }

  if (!chargeId) {
    return { success: false, error: "Missing charge_id" } satisfies LoaderData;
  }

  const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT || "http://localhost:3554/graphql";

  try {
    const mutation = `
      mutation UpdateSubscriptionStatus($id: String!) {
        updateSubscriptionStatus(
          id: $id
        ) {
          id
          status
          updatedAt
        }
      }
    `;

    const res = await fetch(`${GRAPHQL_ENDPOINT}?shop=${session.shop}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: mutation,
        variables: {
          id: `gid://shopify/AppSubscription/${chargeId}`,
        },
      }),
    });

    const result = await res.json();

    if (result.errors) {
      throw new Error(result.errors[0]?.message || "GraphQL error");
    }

    return {
      success: true,
      planId: planId || undefined,
    } satisfies LoaderData;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to update subscription",
    } satisfies LoaderData;
  }
};

export default function SubscriptionThankYou() {
  const { success, planId, error } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Thank you" data-page-id="subscription-thankyou">
      <s-section>
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background="subdued"
        >
          {success ? (
            <s-stack direction="block" gap="base">
              <s-heading>🎉 Subscription successful!</s-heading>
              <s-text>
                Your plan{" "}
                <s-text type="strong">{planId || "selected plan"}</s-text> has
                been activated.
              </s-text>
            </s-stack>
          ) : (
            <s-stack direction="block" gap="base">
              <s-heading>Error</s-heading>
              <s-text tone="critical">
                {error || "Something went wrong while confirming your subscription."}
              </s-text>
            </s-stack>
          )}
        </s-box>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = headersArgs => {
  return boundary.headers(headersArgs);
};
