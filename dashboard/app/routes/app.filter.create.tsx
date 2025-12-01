import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useLocation } from "react-router";
import { useEffect, useRef, useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import FilterForm, { type FilterFormHandle } from "../components/FilterForm";
import { useTranslation } from "app/utils/translations";


export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const GRAPHQL_ENDPOINT =
    process.env.GRAPHQL_ENDPOINT || "http://localhost:3554/graphql";

  try {
    const { session } = await authenticate.admin(request);
    const shop = session?.shop || "";

    // Fetch storefront filters for available values (no filter ID needed for create)
    const storefrontQuery = `
      query GetStorefrontFilters($shop: String!) {
        storefrontFilters(shop: $shop) {
          vendors {
            value
            count
          }
          productTypes {
            value
            count
          }
          tags {
            value
            count
          }
          collections {
            value
            count
          }
          options
          priceRange {
            min
            max
          }
        }
      }
    `;

    const storefrontResponse = await fetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: storefrontQuery,
          variables: { shop },
        }),
    });

    const storefrontResult = await storefrontResponse.json();
    const storefrontFilters = storefrontResult.data?.storefrontFilters || null;

    return {
      filter: null, // No filter for create page
      error: undefined,
      shop: shop || "",
      graphqlEndpoint: GRAPHQL_ENDPOINT,
      storefrontFilters,
    };
  } catch (error: any) {
    return {
      filter: null,
      error: error.message || "Failed to fetch storefront filters",
      graphqlEndpoint: GRAPHQL_ENDPOINT,
      storefrontFilters: null,
    };
  }
};

export default function CreateFilterPage() {
  const {
    filter: initialFilter, 
    error: loadError, 
    shop, 
    graphqlEndpoint,
    storefrontFilters,
  } = useLoaderData<typeof loader>();
  
  const { t } = useTranslation();
  const location = useLocation();
  const pageId = "create-filter";

  // Cleanup slots from other pages when navigating away
  useEffect(() => {
    // Only cleanup if we're NOT on the create page anymore
    if (location.pathname === '/app/filter/create') {
      return;
    }

    const cleanupSlots = () => {
      // Find all slot elements that might be from the create page
      const allPrimaryActions = document.querySelectorAll('[slot="primary-action"]');
      const allBreadcrumbs = document.querySelectorAll('[slot="breadcrumb-actions"]');
      
      // Remove slots that are inside a page with the create page ID
      allPrimaryActions.forEach(el => {
        const parentPage = el.closest('s-page');
        if (parentPage && parentPage.getAttribute('data-page-id') === pageId) {
          el.remove();
        }
      });
      
      allBreadcrumbs.forEach(el => {
        const parentPage = el.closest('s-page');
        if (parentPage && parentPage.getAttribute('data-page-id') === pageId) {
          el.remove();
        }
      });
    };

    // Cleanup after a short delay
    const timeoutId = setTimeout(cleanupSlots, 100);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [location.pathname, pageId]);

  if (loadError) {
    return (
      <s-page heading="Create Filter">
        <s-section>
          <s-banner tone="critical">
            <s-text>Error: {loadError}</s-text>
          </s-banner>
        </s-section>
      </s-page>
    );
  }

  const formRef = useRef<FilterFormHandle>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveClick = async () => {
    if (formRef.current && !isSaving) {
      await formRef.current.save();
    }
  };

  const handleSavingChange = (saving: boolean) => {
    setIsSaving(saving);
  };

  return (
    <s-page key={`${pageId}-${location.pathname}`} heading={t("filterForm.create.pageTitle")} data-page-id={pageId}>
      <s-link slot="breadcrumb-actions" href="/app/filters">
        Filters
      </s-link>
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleSaveClick}
        loading={isSaving}
        disabled={isSaving}
      >
        Save
      </s-button>
      <FilterForm
        ref={formRef}
        mode="create"
        initialFilter={null}
        shop={shop || ""}
        graphqlEndpoint={graphqlEndpoint}
        storefrontFilters={storefrontFilters}
        onSavingChange={handleSavingChange}
      />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
