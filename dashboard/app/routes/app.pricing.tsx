import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useLocation, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { graphqlRequest } from "app/graphql.server";
import { useEffect, useState } from "react";
import { isTrue } from "app/utils/equal";
import { CREATE_APP_SUBSCRIPTION_MUTATION } from "app/graphql/subscriptions.mutation";
import { FETCH_BILLING_PLANS_AND_SUBSCRIPTION } from "app/graphql/subscriptions.query";
import { AppSubscriptionStatus, Money, ShopifyActiveSubscriptions, Subscription } from "app/types/Subscriptions";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session?.shop || "";

  const graphql_response = await admin.graphql(
    `query GetRecurringApplicationCharges {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
        }
      }
    }`
  );

  const { data: { currentAppInstallation: { activeSubscriptions } } } = await graphql_response.json().catch(e => {
    return {
      data: {
        currentAppInstallation: {
          activeSubscriptions: []
        }
      }
    }
  });

  const response = await admin.graphql(
    `query TotalProductsCount {
      productsCount(limit: null) {
        count
        precision
      }
    }`
  );

  const { data: { productsCount } } = await response.json().catch(() => ({
    data: { productsCount: { count: 0, precision: "EXACT" } },
  }));

  const res = await graphqlRequest<{
    subscriptionPlans: Subscription[];
    subscription: Subscription;
  }>(FETCH_BILLING_PLANS_AND_SUBSCRIPTION, { shop }).catch(e => {
    return {
      subscriptionPlans: [], subscription: null
    }
  });

  return {
    subscriptionPlans: res.subscriptionPlans,
    subscription: res.subscription,
    error: null,
    productsCount,
    activeSubscriptions
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session?.shop || "";

  const formData = await request.formData();
  const planId = formData.get("planId") as string;

  if (!planId) {
    return { error: "planId is required" };
  }

  try {
    // Subscribe the user (server-side)
    const response = await graphqlRequest(CREATE_APP_SUBSCRIPTION_MUTATION, { planId, shop });
    if (response?.appSubscriptionCreate?.confirmationUrl) {
      return { confirmationUrl: response?.appSubscriptionCreate?.confirmationUrl };
    }

    return { error: "Unable to create subscription" };
  } catch (error: any) {
    return { error: error?.message || "Unknown error" };
  }
};

export default function PricingPage() {
  const { error, subscriptionPlans, productsCount, subscription, activeSubscriptions } = useLoaderData<typeof loader>();
  const location = useLocation();
  const fetcher = useFetcher();
  const [selectedplan, setSelectedPlan] = useState<String | null>(null);

  useEffect(() => {
    if (fetcher.data?.confirmationUrl) {
      const url = fetcher.data.confirmationUrl;
      if (window.top !== window.self) {
        (window.top as Window).location.href = url;
      } else {
        window.location.href = url;
      }
    }
  }, [fetcher.data])

  const formatPrice = (price: Money) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: price.currencyCode,
    }).format(price.amount);
  };

  const intervalLabel = (interval: string) => interval === "EVERY_30_DAYS" ? "month" : "year";

  const handleSubscribePlan = (planId: string) => {
    setSelectedPlan(planId);
    fetcher.submit(
      { planId },
      { method: "post" }
    );
  };

  const isActuallySubscribed = (activeSubscriptions: ShopifyActiveSubscriptions[]): boolean => {
    return activeSubscriptions.some(sub =>
      isTrue(sub.status, "equals", AppSubscriptionStatus.ACTIVE)
    );
  };

  return (
    <s-page
      key={`pricing-${location.pathname}`}
      heading="Choose your plan"
      data-page-id="pricing"
    >
      <s-section heading={`Your store has ${productsCount.count.toLocaleString()} products`}>
        <s-stack direction="block" gap="large">
          <s-stack direction="block" gap="small">
            <s-text tone="auto">
              Choose a plan that grows with your business. Upgrade or cancel anytime.
            </s-text>
          </s-stack>

          {error && (
            <s-banner tone="critical">
              <s-text>Error: {error}</s-text>
            </s-banner>
          )}

          <s-grid
            gridTemplateColumns="repeat(auto-fit, minmax(280px, 1fr))"
            gap="base"
          >
            {subscriptionPlans.map((plan: Subscription) => {
              const isPopular = plan.handle === "premium-25";
              const isCurrent = isActuallySubscribed(activeSubscriptions) && isTrue(plan?.name, "equals", subscription?.name);
              const ineligiblePlan = isTrue(productsCount.count, "greaterThan", plan.productLimit);
              return (
                <s-grid-item key={plan.id}>
                  <s-box
                    padding="large"
                    borderWidth="base"
                    borderRadius="large"
                    background={isCurrent ? "subdued" : isPopular ? "subdued" : "base"}
                  >
                    <s-stack direction="block" gap="base">
                      {/* Header */}
                      <s-stack direction="block" gap="small">
                        <s-stack direction="inline" gap="small" alignItems="center">
                          <s-heading>{plan.name}</s-heading>
                          {isPopular && !isCurrent && (
                            <s-badge tone="success">Most popular</s-badge>
                          )}
                          {
                            isCurrent && (
                              <s-badge tone="success">Your Plan</s-badge>
                            )
                          }
                        </s-stack>

                        <s-text tone="auto">
                          Up to{" "}
                          <strong>
                            {plan.productLimit.toLocaleString()}
                          </strong>{" "}
                          products
                        </s-text>
                      </s-stack>

                      {/* Price */}
                      <s-stack direction="block" >
                        <s-text type="strong">
                          {formatPrice(plan.price)}/<s-text tone="auto">per {intervalLabel(plan.interval)} </s-text>
                        </s-text>

                      </s-stack>

                      {/* Divider */}
                      <s-divider />

                      {/* Features */}
                      {plan.description && (
                        <s-stack direction="block" gap="small">
                          {plan.description.split("\n").map((line, i) => (
                            <s-stack
                              key={i}
                              direction="inline"
                              gap="small"
                              alignItems="center"
                            >
                              <s-icon tone="success" />
                              <s-text tone="auto">{line}</s-text>
                            </s-stack>
                          ))}
                        </s-stack>
                      )}

                      {/* CTA */}
                      <s-button
                        variant={isPopular ? "primary" : "secondary"}
                        onClick={() => handleSubscribePlan(plan.id)}
                        disabled={fetcher.state !== "idle" || isCurrent || ineligiblePlan}
                      >
                        {ineligiblePlan ? 'This plan is unsupported' : isCurrent ? 'Already subscribed' : fetcher.state !== "idle" && selectedplan === plan.id ? "Processing..." : `Get started with ${plan.name}`}
                      </s-button>
                    </s-stack>
                  </s-box>
                </s-grid-item>
              );
            })}
          </s-grid>
        </s-stack>
      </s-section>
    </s-page>
  );

}

export const headers: HeadersFunction = headersArgs => {
  return boundary.headers(headersArgs);
};
