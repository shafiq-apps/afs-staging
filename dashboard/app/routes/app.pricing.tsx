import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useLocation, useFetcher, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { graphqlRequest } from "app/graphql.server";
import { useEffect } from "react";
import { isTrue } from "app/utils/equal";

interface Money {
  amount: number;
  currencyCode: string;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  handle: string;
  description: string;
  productLimit: number;
  price: Money;
  interval: "EVERY_30_DAYS" | "ANNUAL";
}

interface ProductsCount {
  count: number;
  precision: string;
}

interface PricingLoaderData {
  plans: SubscriptionPlan[];
  error: string | null;
  productsCount: ProductsCount;
  subscriptionPlan: SubscriptionPlan
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session?.shop || "";

  const response = await admin.graphql(
    `
      query {
        productsCount(query: "limit:null") {
          count
          precision
        }
      }
    `
  );

  const { data: { productsCount } } = await response.json().catch(() => ({
    data: { productsCount: { count: 0, precision: "EXACT" } },
  }));

  const query = `
    query {
      subscriptionPlans {
        id
        name
        handle
        description
        productLimit
        price {
          amount
          currencyCode
        }
        interval
      }
      subscription {
        id
        name
        test
      }
    }
  `;

  const res = await graphqlRequest<{
    subscriptionPlans: SubscriptionPlan[];
    subscription: SubscriptionPlan;
  }>(query, { shop });

  return {
    plans: res.subscriptionPlans,
    subscriptionPlan: res.subscription,
    error: null,
    productsCount
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
    const response = await graphqlRequest(`
      mutation AppSubscriptionCreate(
        $planId: String!
      ){
        appSubscriptionCreate(
          planId: $planId
        ) {
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }`,
      {
        planId, shop
      });


    if (response?.appSubscriptionCreate?.confirmationUrl) {
      return { confirmationUrl: response?.appSubscriptionCreate?.confirmationUrl };
    }

    return { error: "Unable to create subscription" };
  } catch (error: any) {
    return { error: error?.message || "Unknown error" };
  }
};

export default function PricingPage() {
  const { error, plans, productsCount, subscriptionPlan } = useLoaderData<PricingLoaderData>();
  const location = useLocation();
  const fetcher = useFetcher();

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
    fetcher.submit(
      { planId },
      { method: "post" }
    );
  };


  return (
    <s-page
      key={`pricing-${location.pathname}`}
      heading="Choose your plan"
      data-page-id="pricing"
    >
      <s-section>
        <s-stack direction="block" gap="large">
          <s-stack direction="block" gap="small">
            <s-text tone="auto">
              Pick a plan that grows with your store. Upgrade or cancel anytime.
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
            {plans.map((plan: SubscriptionPlan) => {
              const isPopular = plan.handle === "premium-25";
              const isCurrent = isTrue(plan?.name, "equals", subscriptionPlan?.name);
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
                        disabled={fetcher.state !== "idle" || isCurrent}
                      >
                        {isCurrent ?'Already subscribed':fetcher.state !== "idle" ? "Processing..." : `Get started with ${plan.name}`}
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
