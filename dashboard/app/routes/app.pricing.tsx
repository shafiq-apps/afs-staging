import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigate, useLocation } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { graphqlRequest } from "app/graphql.server";

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
    subscriptionPlan: SubscriptionPlan;
  }>(query, { shop });

  console.log("res.subscriptionPlan", res.subscriptionPlan);

  return {
    plans: res.subscriptionPlans,
    subscriptionPlan: res.subscriptionPlan,
    error: null,
    productsCount
  };
  
};

export default function PricingPage() {
  const { error, plans, productsCount, subscriptionPlan } = useLoaderData<PricingLoaderData>();
  const navigate = useNavigate();
  const location = useLocation();

  const formatPrice = (price: Money) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: price.currencyCode,
    }).format(price.amount);
  };

  const intervalLabel = (interval: string) => interval === "EVERY_30_DAYS" ? "month" : "year";

  return (
    <s-page
      key={`pricing-${location.pathname}`}
      heading="Choose your plan"
      data-page-id="pricing"
    >
      <s-section>
        <s-stack direction="block" gap="large">
          <s-stack direction="block" gap="small">
            <s-heading>Simple, transparent pricing {subscriptionPlan?.name}</s-heading>
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
              const isPopular = plan.handle === "premium-25"; // mark your best plan
              const isCurrent = subscriptionPlan &&  plan?.name?.toLowerCase() === subscriptionPlan?.name?.toLowerCase();

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
                          {isPopular && (
                            <s-badge tone="success">Most popular</s-badge>
                          )}
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
                        onClick={() =>
                          navigate(`/app/subscribe?plan=${plan.handle}`)
                        }
                      >
                        Get started with {plan.name}
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
