import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, useLocation } from "react-router";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { ShopProvider, type ShopLocaleData } from "../contexts/ShopContext";

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
    console.error("Error reading cached shop data:", error);
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
    console.error("Error caching shop data:", error);
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const shop = session?.shop || "";

  let shopData: ShopLocaleData | null = null;
  let isNewInstallation = false;

  try {
    // Fetch shop locale data
    const shopQuery = `
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
    `;

    const response = await admin.graphql(shopQuery);
    const result = await response.json();

    if (result.data) {
      const primaryLocale = result.data.shopLocales?.find(
        (loc: any) => loc.primary
      )?.locale || "en";

      shopData = {
        ianaTimezone: result.data.shop?.ianaTimezone || "UTC",
        timezoneAbbreviation: result.data.shop?.timezoneAbbreviation || "UTC",
        currencyCode: result.data.shop?.currencyCode || "USD",
        currencyFormats: result.data.shop?.currencyFormats || {},
        primaryLocale,
        locales: result.data.shopLocales || [],
        shopName: result.data.shop?.name,
        myshopifyDomain: result.data.shop?.myshopifyDomain,
      };
    }

    // Check if shop exists in backend to determine if this is a new installation
    if (shop) {
      try {
        const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT || "http://localhost:3554/graphql";
        const shopCheckQuery = `
          query CheckShopExists($domain: String!) {
            shopExists(domain: $domain)
          }
        `;

        const shopCheckResponse = await fetch(GRAPHQL_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: shopCheckQuery,
            variables: { domain: shop },
          }),
        });

        const shopCheckResult = await shopCheckResponse.json();
        // If shop doesn't exist, it's a new installation
        isNewInstallation = !shopCheckResult.data?.shopExists;
      } catch (error: any) {
        // If we can't check, assume it's not a new installation to be safe
        console.error("Error checking shop installation status:", error);
        isNewInstallation = false;
      }
    }
  } catch (error: any) {
    console.error("Error fetching shop locale data:", error);
    // Continue with null shopData - will use defaults
  }

  return { apiKey, shopData, shop, isNewInstallation };
};

export default function App() {
  const { apiKey, shopData, shop, isNewInstallation } = useLoaderData<typeof loader>();
  const location = useLocation();

  // Cache shop data on client side
  if (typeof window !== "undefined" && shopData) {
    setCachedShopData(shopData);
  }

  // Try to get cached data if server data is not available
  const effectiveShopData = shopData || (typeof window !== "undefined" ? getCachedShopData() : null);

  // Send APP_INSTALLED event only if this is a new installation
  useEffect(() => {
    if (!shop || !isNewInstallation) return;

    const APP_INSTALLED_SENT_KEY = `app_installed_sent_${shop}`;
    const alreadySent = sessionStorage.getItem(APP_INSTALLED_SENT_KEY);
    
    if (!alreadySent) {
      // Mark as sent immediately to prevent duplicate sends
      sessionStorage.setItem(APP_INSTALLED_SENT_KEY, "true");
      
      // Get API endpoint - use relative path which nginx will route to Node.js server
      const API_ENDPOINT = "/api/app/events";
      
      // Send APP_INSTALLED event
      fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event: "APP_INSTALLED",
          shop: shop,
        }),
      })
        .then((response) => response.json())
        .then((data) => {
          console.log("APP_INSTALLED event sent:", data);
        })
        .catch((error) => {
          console.error("Error sending APP_INSTALLED event:", error);
          // Remove the flag on error so it can be retried
          sessionStorage.removeItem(APP_INSTALLED_SENT_KEY);
        });
    }
  }, [shop, isNewInstallation]);

  // Global cleanup: Clear orphaned slots on every navigation
  useEffect(() => {
    // Small delay to let the new page render first
    const timeoutId = setTimeout(() => {
      // Find all slot elements
      const allPrimaryActions = document.querySelectorAll('[slot="primary-action"]');
      const allBreadcrumbs = document.querySelectorAll('[slot="breadcrumb-actions"]');
      
      // Remove slots that are orphaned (not inside any s-page)
      // DO NOT remove slots that are inside a valid s-page
      allPrimaryActions.forEach(el => {
        const parentPage = el.closest('s-page');
        if (!parentPage) {
          // Only remove if it's truly orphaned (not inside any s-page)
          el.remove();
        }
      });
      
      allBreadcrumbs.forEach(el => {
        const parentPage = el.closest('s-page');
        if (!parentPage) {
          // Only remove if it's truly orphaned (not inside any s-page)
          el.remove();
        }
      });
    }, 200); // Increased delay to ensure buttons are rendered

    return () => clearTimeout(timeoutId);
  }, [location.pathname]);

  return (
    <AppProvider embedded apiKey={apiKey}>
      <ShopProvider shopData={effectiveShopData} isLoading={!effectiveShopData}>
        <s-app-nav>
          <s-link href="/app">Home</s-link>
          <s-link href="/app/filters">Filters</s-link>
          <s-link href="/app/indexing">Product Sync</s-link>
        </s-app-nav>
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
