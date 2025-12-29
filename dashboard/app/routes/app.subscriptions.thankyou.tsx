import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { graphqlRequest } from "app/graphql.server";
import { UPDATE_SUBSCRIPTION_STATUS_MUTATION } from "app/graphql/subscriptions.mutation";

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

  try {
  
    await graphqlRequest(UPDATE_SUBSCRIPTION_STATUS_MUTATION, { id: `gid://shopify/AppSubscription/${chargeId}`, shop: session.shop });

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
  const { success, error } = useLoaderData<typeof loader>();

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
              <s-heading>Subscription successful!</s-heading>
              <s-text>
                Your plan has been upgraded.
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
