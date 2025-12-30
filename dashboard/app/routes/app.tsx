import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, useLocation, useNavigate } from "react-router";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { ShopProvider, type ShopLocaleData } from "../contexts/ShopContext";
import { useTranslation } from "app/utils/translations";
import { graphqlRequest } from "app/graphql.server";
import { AppSubscriptionStatus, ShopifyActiveSubscriptions, Subscription } from "app/types/Subscriptions";
import { FETCH_CURRENT_SUBSCRIPTION } from "app/graphql/subscriptions.query";
import { isTrue } from "app/utils/equal";
import { UPDATE_SUBSCRIPTION_STATUS_MUTATION } from "app/graphql/subscriptions.mutation";

const SHOP_DATA_CACHE_KEY = "shop_locale_data";
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

interface CachedShopData {
  data: ShopLocaleData;
  timestamp: number;
}

function getCachedShopData(): ShopLocaleData | null {
  if (typeof window === "undefined") return null;

  try {
    const cached = sessionStorage.getItem(SHOP_DATA_CACHE_KEY);
    if (!cached) return null;

    const parsed: CachedShopData = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is still valid (1 hour)
    if (now - parsed.timestamp < CACHE_DURATION) {
      return parsed.data;
    }

    // Cache expired, remove it
    sessionStorage.removeItem(SHOP_DATA_CACHE_KEY);
    return null;
  } catch (error) {
    return null;
  }
}

function setCachedShopData(data: ShopLocaleData): void {
  if (typeof window === "undefined") return;

  try {
    const cache: CachedShopData = {
      data,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(SHOP_DATA_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const shop = session?.shop ?? "";

  let shopData: ShopLocaleData | null = null;
  let isNewInstallation = false;

  /* ---------------- SHOP LOCALE DATA ---------------- */
  try {
    const response = await admin.graphql(`
      query GetShopLocaleData {
        shop {
          ianaTimezone
          timezoneAbbreviation
          currencyCode
          currencyFormats {
            moneyFormat
            moneyWithCurrencyFormat
          }
          name
          myshopifyDomain
        }
        shopLocales(published: true) {
          locale
          name
          primary
          published
        }
      }
    `);

    const result = await response.json();

    if (result?.data) {
      const primaryLocale =
        result.data.shopLocales?.find((l: any) => l.primary)?.locale ?? "en";

      shopData = {
        ianaTimezone: result.data.shop?.ianaTimezone ?? "UTC",
        timezoneAbbreviation: result.data.shop?.timezoneAbbreviation ?? "UTC",
        currencyCode: result.data.shop?.currencyCode ?? "USD",
        currencyFormats: result.data.shop?.currencyFormats ?? {},
        primaryLocale,
        locales: result.data.shopLocales ?? [],
        shopName: result.data.shop?.name,
        myshopifyDomain: result.data.shop?.myshopifyDomain,
      };
    }
  } catch {
    // Fail silently — defaults will be used
  }

  /* ---------------- INSTALLATION CHECK ---------------- */
  if (shop) {
    try {
      const GRAPHQL_ENDPOINT =
        process.env.GRAPHQL_ENDPOINT ?? "http://localhost:3554/graphql";

      const response = await fetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            query GetShop($domain: String!) {
              shop(domain: $domain) {
                installedAt
              }
            }
          `,
          variables: { domain: shop },
        }),
      });

      const result = await response.json();
      const installedAt = result?.data?.shop?.installedAt;

      isNewInstallation =
        !installedAt ||
        new Date(installedAt).getTime() > Date.now() - 60_000;
    } catch {
      isNewInstallation = false;
    }
  }

  /* ---------------- SHOPIFY SUBSCRIPTIONS ---------------- */
  const shopifyResponse = await admin.graphql(`
    query GetRecurringApplicationCharges {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
        }
      }
    }
  `);

  const shopifyJson = await shopifyResponse.json();

  const activeSubscriptions: ShopifyActiveSubscriptions[] = shopifyJson?.data?.currentAppInstallation?.activeSubscriptions ?? [];

  const hasActiveSubscription = activeSubscriptions.some(sub => sub.status === AppSubscriptionStatus.ACTIVE);

  /* ---------------- DB SUBSCRIPTION ---------------- */
  let subscriptionResult = await graphqlRequest<{ subscription: Subscription; }>(FETCH_CURRENT_SUBSCRIPTION, { shop });

  const isSubscriptionActiveInDB = subscriptionResult.subscription?.status === AppSubscriptionStatus.ACTIVE;

  /* ---------------- SYNC DB WITH SHOPIFY ---------------- */
  if (hasActiveSubscription && !isSubscriptionActiveInDB) {
    const activeChargeId = activeSubscriptions.find(
      sub => sub.status === AppSubscriptionStatus.ACTIVE
    )?.id;

    if (activeChargeId) {
      await graphqlRequest(UPDATE_SUBSCRIPTION_STATUS_MUTATION, {
        id: activeChargeId,
        shop,
      });

      // Correct refetch (overwrite previous result)
      subscriptionResult = await graphqlRequest<{
        subscription: Subscription;
      }>(FETCH_CURRENT_SUBSCRIPTION, { shop });
    }
  }

  /* ---------------- RETURN ---------------- */
  return {
    apiKey,
    shop,
    shopData,
    isNewInstallation,
    subscription: subscriptionResult.subscription ?? null,
    activeSubscriptions,
  };
};

export default function App() {
  const { apiKey, shopData, subscription, activeSubscriptions } = useLoaderData<typeof loader>();

  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  /* ---------------- SUBSCRIPTION HELPERS ---------------- */
  const hasActiveShopifySubscription = activeSubscriptions.some(sub => sub.status === AppSubscriptionStatus.ACTIVE);

  const isSubscriptionActiveInDB = subscription?.status === AppSubscriptionStatus.ACTIVE;

  const isOnPricingPage = location.pathname === "/app/pricing";

  /* ---------------- CLIENT-SIDE SHOP DATA CACHE ---------------- */
  useEffect(() => {
    if (shopData) {
      setCachedShopData(shopData);
    }
  }, [shopData]);

  const effectiveShopData = shopData ?? (typeof window !== "undefined" ? getCachedShopData() : null);

  /* ---------------- GLOBAL SLOT CLEANUP ---------------- */
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const primaryActions = document.querySelectorAll(
        '[slot="primary-action"]'
      );
      const breadcrumbs = document.querySelectorAll(
        '[slot="breadcrumb-actions"]'
      );

      [...primaryActions, ...breadcrumbs].forEach(el => {
        if (!el.closest("s-page")) {
          el.remove();
        }
      });
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [location.pathname]);

  /* ---------------- SUBSCRIPTION REDIRECT LOGIC ---------------- */
  useEffect(() => {
    // If Shopify has no active subscription, force pricing page
    if (!hasActiveShopifySubscription && !isOnPricingPage) {
      navigate("/app/pricing?module=subscription&action=choose&force=true", { replace: true });
    }
  }, [
    hasActiveShopifySubscription,
    isOnPricingPage,
    navigate,
  ]);

  /* ---------------- RENDER ---------------- */
  return (
    <AppProvider embedded apiKey={apiKey}>
      <ShopProvider
        shopData={effectiveShopData}
        isLoading={!effectiveShopData}
      >
        <s-app-nav>
          {hasActiveShopifySubscription && (
            <>
              <s-link href="/app">{t("navigation.home")}</s-link>
              <s-link href="/app/filters">{t("navigation.filters")}</s-link>
              <s-link href="/app/indexing">{t("navigation.indexing")}</s-link>
            </>
          )}
          <s-link href="/app/pricing">{t("navigation.pricing")}</s-link>
        </s-app-nav>
          {
            !hasActiveShopifySubscription && (
              <s-page >
                <s-banner heading="Manage Your Subscription" tone="warning">
                    Please keep your subscription plan active to continue using the application.
                    <s-button
                      slot="secondary-actions"
                      variant="secondary"
                      href="/app/pricing"
                    >
                      View pricing
                    </s-button>
                    <s-button
                      slot="secondary-actions"
                      variant="secondary"
                      href="javascript:void(0)"
                    >
                      Read more
                    </s-button>
                  </s-banner>
              </s-page>
            )
          }
        <Outlet />
      </ShopProvider>
    </AppProvider>
  );
}


// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
