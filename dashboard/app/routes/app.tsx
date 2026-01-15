import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, useLocation, useNavigate, isRouteErrorResponse } from "react-router";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate, sessionStorage as shopSessionStorage } from "../shopify.server";
import { ShopProvider, type ShopLocaleData } from "../contexts/ShopContext";
import { useTranslation } from "app/utils/translations";
import { graphqlRequest, GraphQLError } from "app/graphql.server";
import { throwGraphQLError } from "../utils/throw-graphql-error";
import { AppSubscriptionStatus, ShopifyActiveSubscriptions, Subscription } from "app/types/Subscriptions";
import { FETCH_CURRENT_SUBSCRIPTION } from "app/graphql/subscriptions.query";
import { UPDATE_SUBSCRIPTION_STATUS_MUTATION } from "app/graphql/subscriptions.mutation";
import { GraphQLErrorBoundary } from "../components/GraphQLErrorBoundary";

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

  if(session && session.shop && session.onlineAccessInfo?.associated_user.id){
    await shopSessionStorage.storeSession(session);
  }

  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const shop = session?.shop ?? "";
  let shopData: ShopLocaleData | null = null;
  let isNewInstallation = false;

  /* ---------------- SHOP LOCALE DATA (Non-Critical) ---------------- */
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
          email
          contactEmail
          customerEmail
          plan {
            displayName
          }
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
      const primaryLocale = result.data.shopLocales?.find((l: any) => l.primary)?.locale ?? "en";

      shopData = {
        ianaTimezone: result.data.shop?.ianaTimezone ?? "UTC",
        timezoneAbbreviation: result.data.shop?.timezoneAbbreviation ?? "UTC",
        currencyCode: result.data.shop?.currencyCode ?? "USD",
        currencyFormats: result.data.shop?.currencyFormats ?? {},
        primaryLocale,
        locales: result.data.shopLocales ?? [],
        shopName: result.data.shop?.name,
        myshopifyDomain: result.data.shop?.myshopifyDomain,
        email: result.data.shop?.email,
        contactEmail: result.data.shop?.contactEmail,
        customerEmail: result.data.shop?.customerEmail,
        plan: result.data.shop?.plan?.displayName,
      };
    }
  } catch {
    // Fail silently — defaults will be used (non-critical)
  }

  /* ---------------- INSTALLATION CHECK (Non-Critical) ---------------- */
  if (shop) {
    try {
      const gquery = `
        query GetShop($shop: String!) {
          shop(domain: $shop) {
            installedAt
          }
        }
      `;
      const response = await graphqlRequest(gquery, { shop }).catch(e => { 
        // If it's a server/network error, we should know but not fail
        if (e instanceof GraphQLError && (e.isServerError || e.isNetworkError)) {
          console.warn('Server unavailable for installation check:', e.message);
        }
        return null;
      });
      const installedAt = response?.shop?.installedAt;
      isNewInstallation = !installedAt || new Date(installedAt).getTime() > Date.now() - 60000;
    } catch {
      isNewInstallation = false;
    }
  }

  /* ---------------- SHOPIFY SUBSCRIPTIONS (Critical) ---------------- */
  // This uses Shopify's API directly, not our Node.js server
  // If this fails, it's a Shopify issue, not our server being down
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

  /* ---------------- DB SUBSCRIPTION (Critical if server is needed) ---------------- */
  // If our Node.js backend is down, this will throw a GraphQLError
  // We want to catch it and check if it's a server/network error
  // If so, we should show the downtime screen, not redirect to pricing
  let subscriptionResult: { subscription: Subscription | null } = { subscription: null };
  
  try {
    subscriptionResult = await graphqlRequest<{ subscription: Subscription; }>(FETCH_CURRENT_SUBSCRIPTION, { shop });
  } catch (error: any) {
    // Check if it's a critical error that should show downtime screen
    // Include: server errors (500+), network errors, and auth errors (401, 403)
    if (error instanceof GraphQLError) {
      const isCriticalError = error.isServerError || 
                              error.isNetworkError || 
                              error.statusCode === 401 || 
                              error.statusCode === 403;
      
      if (isCriticalError) {
        // Show downtime screen for critical errors
        throwGraphQLError(error);
      }
    }
    // Other errors (like query errors) - we can continue with null subscription
    console.warn('Subscription fetch failed (non-critical):', error.message);
  }

  const isSubscriptionActiveInDB = subscriptionResult?.subscription?.status === AppSubscriptionStatus.ACTIVE;

  /* ---------------- SYNC DB WITH SHOPIFY ---------------- */
  if (hasActiveSubscription && !isSubscriptionActiveInDB) {
    const activeChargeId = activeSubscriptions.find(
      sub => sub.status === AppSubscriptionStatus.ACTIVE
    )?.id;

    if (activeChargeId) {
      try {
        await graphqlRequest(UPDATE_SUBSCRIPTION_STATUS_MUTATION, {
          id: activeChargeId,
          shop,
        });

        // Refetch subscription
        subscriptionResult = await graphqlRequest<{ subscription: Subscription; }>(FETCH_CURRENT_SUBSCRIPTION, { shop });
      } catch (error: any) {
        // Check if it's a critical error
        if (error instanceof GraphQLError) {
          const isCriticalError = error.isServerError || 
                                  error.isNetworkError || 
                                  error.statusCode === 401 || 
                                  error.statusCode === 403;
          
          if (isCriticalError) {
            // Show downtime screen for critical errors
            throwGraphQLError(error);
          }
        }
        // Other errors - log and continue
        console.warn('Subscription sync failed:', error.message);
      }
    }
  }

  /* ---------------- RETURN ---------------- */
  return {
    apiKey,
    shop,
    shopData,
    isNewInstallation,
    subscription: subscriptionResult?.subscription ?? null,
    activeSubscriptions,
  };
};

export default function App() {
  const { apiKey, shop, shopData, subscription, activeSubscriptions } = useLoaderData<typeof loader>();
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
  // Make API key and shop details available globally for error boundary and crash reports
  if (typeof window !== "undefined") {
    (window as any).__SHOPIFY_API_KEY = apiKey;
    (window as any).__SHOP = shop;
    (window as any).__SHOP_DETAILS = effectiveShopData ? {
      domain: shop,
      name: effectiveShopData.shopName,
      email: (effectiveShopData as any).email,
      contactEmail: (effectiveShopData as any).contactEmail,
      customerEmail: (effectiveShopData as any).customerEmail,
      myshopifyDomain: effectiveShopData.myshopifyDomain,
      plan: (effectiveShopData as any).plan,
      owner: shop,
    } : null;
  }

  return (
    <AppProvider apiKey={apiKey} embedded={true}>
      <ShopProvider
        shopData={effectiveShopData}
        isLoading={!effectiveShopData}
      >
        <s-app-nav>
          {hasActiveShopifySubscription && (
            <>
              <s-link href="/app">{t("navigation.home")}</s-link>
              <s-link href="/app/filters">{t("navigation.filters")}</s-link>
              <s-link href="/app/search">{t("navigation.search")}</s-link>
              <s-link href="/app/indexing">{t("navigation.indexing")}</s-link>
            </>
          )}
          <s-link href="/app/pricing">{t("navigation.pricing")}</s-link>
          <s-link href="/app/support">{t("navigation.support")}</s-link>
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


// Error boundary that handles GraphQL and network errors gracefully
export function ErrorBoundary() {
  const error = useRouteError();
  
  // Check if it's a Remix route error response (from json() throw)
  if (isRouteErrorResponse(error)) {
    // Check if the data contains GraphQL error markers
    if (error.data && typeof error.data === "object" && ("isGraphQLError" in error.data || "code" in error.data || "endpoint" in error.data)) {
      return <GraphQLErrorBoundary />;
    }
  }
  
  // Check if it's a direct GraphQL error object
  const isGraphQLErr = error && 
    typeof error === "object" && 
    (
      "isGraphQLError" in error ||
      "code" in error || 
      "isNetworkError" in error || 
      "isServerError" in error ||
      "endpoint" in error ||
      (error as any).name === "GraphQLError"
    );
  
  if (isGraphQLErr) {
    return <GraphQLErrorBoundary />;
  }
  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
