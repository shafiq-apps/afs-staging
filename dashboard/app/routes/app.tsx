import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, useLocation, useNavigate, isRouteErrorResponse, useActionData, useNavigation, Form } from "react-router";
import { useEffect, useState } from "react";
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
import AppNavBar from "app/components/AppNavBar";
import { ActionData, LegacyShop } from "app/types";
import { SUPPORT_CONFIG } from "app/config/support.config";
import { sendMigrationEmail } from "app/utils/email.service";
import { getCachedShopData } from "app/utils/get-cached-shop-data";
import { setCachedShopData } from "app/utils/set-cached-hop-data";
import { CONFIG } from "app/config";
import { g } from "node_modules/@react-router/dev/dist/routes-CZR-bKRt";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const LEGACY_APP_URL = process.env.LEGACY_APP_URL || "https://fdstaging.digitalcoo.com";

  if (session && session.shop && session.onlineAccessInfo?.associated_user.id) {
    await shopSessionStorage.storeSession(session);
  }

  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const shop = session?.shop ?? "";
  let shopData: ShopLocaleData | null = null;
  let isNewInstallation = false;
  let isLegacyShop = false;
  let legacyShops: LegacyShop | null = null;

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
          query GetShopData($shop: String!) {
            shop(domain: $shop) {
              installedAt
            }
            isLegacyShop(shop: $shop)
            legacyShops(where: {shop: $shop}) {
              shop
              isUpgradeAllowed
              hasUpgradeRequest
              status
            }
          }
        `;
      const response = await graphqlRequest(gquery, { shop }).catch(e => {
        // If it's a server/network error, we should know but not fail
        if (e instanceof GraphQLError && (e.isServerError || e.isNetworkError)) {
          console.warn('Server unavailable for installation check:', e.message);
        }
        return {
          shop: null,
          isLegacyShop: false,
          legacyShops: null,
        };
      });
      const installedAt = response?.shop?.installedAt;
      isNewInstallation = !installedAt || new Date(installedAt).getTime() > Date.now() - 60000;
      isLegacyShop = response?.isLegacyShop || false;
      legacyShops = response?.legacyShops || null;
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
    isLegacyShop,
    LEGACY_APP_URL,
    legacyShops
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const instructions = formData.get("instructions") as string;

  // Validation
  if (!instructions) {
    return {
      success: false,
      error: "Please provide migration instructions or notes",
    } as ActionData;
  }

  await graphqlRequest(`
    mutation CreateOrUpdateLegacyShop($input: LegacyShopInput!) {
      createOrUpdateLegacyShop(input: $input) {
        shop
        hasUpgradeRequest
        status
        statusMessage
      }
    }
  `, {
    input: {
      shop: session?.shop || "",
      hasUpgradeRequest: true,
      status: "IN_PROGRESS",
      statusMessage: "Upgrade requested, pending review",
    },
    shop: session?.shop || "",
  });

  try {
    await sendMigrationEmail({
      shop: session?.shop || "",
      name: session?.shop || "",
      email: CONFIG.supportEmail,
      subject: "Migration Instructions",
      priority: "high",
      message: instructions,
    });

    return {
      success: true,
      message: SUPPORT_CONFIG.messages.success,
    } as ActionData;
  } catch (error: any) {
    // Check if it's a server/network error
    if (error instanceof GraphQLError && (error.isServerError || error.isNetworkError)) {
      // Return a specific error message for server downtime
      return {
        success: false,
        error: "Our support system is currently unavailable. Please try again later or email us directly at " + SUPPORT_CONFIG.contact.email,
      } as ActionData;
    }

    return {
      success: false,
      error: error.message || SUPPORT_CONFIG.messages.error,
    } as ActionData;
  }
};

export default function App() {
  const { apiKey, shop, shopData, subscription, activeSubscriptions, isLegacyShop, LEGACY_APP_URL, legacyShops } = useLoaderData<typeof loader>();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [migrationInstructions, setMigrationInstructions] = useState("");
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  /* ---------------- SUBSCRIPTION HELPERS ---------------- */
  const hasActiveShopifySubscription = activeSubscriptions.some(sub => sub.status === AppSubscriptionStatus.ACTIVE);
  const isOnPricingPage = location.pathname === "/app/pricing";

  /* ---------------- CLIENT-SIDE SHOP DATA CACHE ---------------- */
  useEffect(() => {
    if (shopData) {
      setCachedShopData(shopData);
    }
  }, [shopData]);

  // Reset form on successful submission
  if (actionData?.success && !isSubmitting) {
    setTimeout(() => {
      setMigrationInstructions("");
    }, 100);
  }

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

  const handleLoadLegacyApp = () => {
    window.open(`${LEGACY_APP_URL}/shopapp?shop=${shop}`, "_new");
  };

  if (isLegacyShop) {
    return (
      <AppProvider apiKey={apiKey} embedded={true}>
        <ShopProvider
          shopData={effectiveShopData}
          isLoading={!effectiveShopData}
        >
          <s-page heading={t("app.pageTitle")}>
            <div style={{ height: '20vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <s-stack direction="inline" alignItems="center" justifyContent="center">
                <s-button
                  onClick={handleLoadLegacyApp}
                  accessibilityLabel="Load app"
                  type="button"
                  variant="primary"
                  icon="external"
                >
                  Load App
                </s-button>
              </s-stack>
            </div>
            {
              legacyShops && legacyShops.isUpgradeAllowed === true && legacyShops.hasUpgradeRequest !== true && (
                <>
                  <s-divider />
                  <s-banner tone="warning" heading={t("app.legacyshop.description")}></s-banner>
                  <s-section heading={t("app.legacyshop.heading")} >
                    <s-stack gap="base" rowGap="base">
                      {/* Success/Error Messages */}
                      {actionData?.success && (
                        <s-banner tone="success">
                          <s-text>{actionData.message}</s-text>
                        </s-banner>
                      )}

                      {actionData?.error && (
                        <s-banner tone="critical">
                          <s-text>{actionData.error}</s-text>
                        </s-banner>
                      )}
                      <Form method="post">
                        <s-stack direction="block" gap="base">
                          <s-text-area
                            labelAccessibilityVisibility="visible"
                            label={t("app.legacyshop.inputfield.label")}
                            name="instructions"
                            id="instructions"
                            value={migrationInstructions}
                            onChange={(e: any) => setMigrationInstructions(e.target.value)}
                            rows={7}
                          />
                          <s-text color="subdued">{t("app.legacyshop.inputfield.placeholder")}</s-text>
                          <s-button
                            type="submit"
                            variant="primary"
                            accessibilityLabel="Submit legacy shop info"
                            icon="send"
                          >
                            {
                              t("app.legacyshop.migrateButton")
                            }
                          </s-button>
                        </s-stack>
                      </Form>
                      <s-text color="subdued">{t("app.legacyshop.learnMore")}: <a href="https://fstaging.digitalcoo.com/auth/login" target="_blank" rel="noopener noreferrer">https://fstaging.digitalcoo.com/auth/login</a></s-text>
                    </s-stack>
                  </s-section>
                </>
              )
            }
            {
              legacyShops && legacyShops.hasUpgradeRequest === true && (
                <>
                  <s-divider />
                  <s-banner tone="success" heading={t("app.legacyshop.upgradeRequestedHeading")}>
                    <s-text>{t("app.legacyshop.upgradeRequested")}</s-text>
                  </s-banner>
                </>
              )
            }
          </s-page>
        </ShopProvider>
      </AppProvider>
    )
  }

  return (
    <AppProvider apiKey={apiKey} embedded={true}>
      <ShopProvider
        shopData={effectiveShopData}
        isLoading={!effectiveShopData}
      >
        <AppNavBar hasActiveShopifySubscription />
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
