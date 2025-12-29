import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, useLocation } from "react-router";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { ShopProvider, type ShopLocaleData } from "../contexts/ShopContext";
import { useTranslation } from "app/utils/translations";
import { SubscriptionProvider } from "app/contexts/SubscriptionContext";
import { MasterLayout } from "app/layouts/MasterLayout";

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

    // Query shop data from GraphQL to get access token and install status
    if (shop) {
      try {
        const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT || "http://localhost:3554/graphql";
        const shopQuery = `
          query GetShop($domain: String!) {
            shop(domain: $domain) {
              shop
              isActive
              installedAt
              accessToken
              scopes
            }
          }
        `;

        const shopResponse = await fetch(GRAPHQL_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: shopQuery,
            variables: { domain: shop },
          }),
        });

        const shopResult = await shopResponse.json();
        
        if (shopResult.data?.shop) {
          const shopData = shopResult.data.shop;
          // Shop exists - check if it's a new installation (no installedAt or very recent)
          isNewInstallation = !shopData.installedAt || (new Date(shopData.installedAt).getTime() > Date.now() - 60000); // Installed less than 1 minute ago
          
          // Access token is available in shopData.accessToken (if not filtered)
          // This will be used by the session storage adapter
        } else {
          // Shop doesn't exist - it's a new installation
          isNewInstallation = true;
        }
      } catch (error: any) {
        // If we can't check, assume it's not a new installation to be safe
        isNewInstallation = false;
      }
    }
  } catch (error: any) {
    // Continue with null shopData - will use defaults
  }

  return { apiKey, shopData, shop, isNewInstallation };
};

export default function App() {
  const { apiKey, shopData, shop } = useLoaderData<typeof loader>();
  const location = useLocation();
  
  const { t } = useTranslation();

  // Cache shop data on client side
  if (typeof window !== "undefined" && shopData) {
    setCachedShopData(shopData);
  }

  // Try to get cached data if server data is not available
  const effectiveShopData = shopData || (typeof window !== "undefined" ? getCachedShopData() : null);

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
        <SubscriptionProvider>
          <MasterLayout>
            <Outlet />
          </MasterLayout>
        </SubscriptionProvider>
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
