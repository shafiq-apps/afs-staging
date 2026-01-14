import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { graphqlRequest } from "app/graphql.server";
import { UPDATE_SUBSCRIPTION_STATUS_MUTATION } from "app/graphql/subscriptions.mutation";
import { useTranslation } from "app/utils/translations";

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
    return { success: false, error: "subscription.thankYou.error.shopNotFound" } satisfies LoaderData;
  }

  if (!chargeId) {
    return { success: false, error: "subscription.thankYou.error.missingChargeId" } satisfies LoaderData;
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
      error: error.message || "subscription.thankYou.error.updateFailed",
    } satisfies LoaderData;
  }
};

export default function SubscriptionThankYou() {
  const { success, error } = useLoaderData<typeof loader>();
  const { t } = useTranslation();

  return (
    <s-page heading={t("subscription.thankYou.pageTitle")} data-page-id="subscription-thankyou">
      <s-section>
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background="subdued"
        >
          {success ? (
            <s-stack direction="block" gap="base">
              <s-heading>{t("subscription.thankYou.success.title")}</s-heading>
              <s-text>
                {t("subscription.thankYou.success.message")}
              </s-text>
            </s-stack>
          ) : (
            <s-stack direction="block" gap="base">
              <s-heading>{t("subscription.thankYou.error.title")}</s-heading>
              <s-text tone="critical">
                {error || t("subscription.thankYou.error.defaultMessage")}
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
