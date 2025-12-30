import type {
  ActionFunction,
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useLocation } from "react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import FilterForm from "../components/FilterForm";
import { useTranslation } from "app/utils/translations";
import { FilterFormHandle, PageMode } from "app/utils/filter.enums";
import { graphqlRequest } from "app/graphql.server";

/* ======================================================
   LOADER
====================================================== */

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT ?? "http://localhost:3554/graphql";

  const shop = session.shop;

  const storefrontQuery = `
    query GetStorefrontFilters($shop: String!) {
      storefrontFilters(shop: $shop) {
        vendors { value count }
        productTypes { value count }
        tags { value count }
        collections { value count }
        options
        priceRange { min max }
      }
    }
  `;

  const [storefrontRes] = await Promise.all([
    fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: storefrontQuery, variables: { shop } }),
    }),
  ]);

  const storefrontJson = await storefrontRes.json();

  return {
    filter: null,
    shop,
    graphqlEndpoint: GRAPHQL_ENDPOINT,
    storefrontFilters: storefrontJson.data?.storefrontFilters ?? null,
  };
};

export const action: ActionFunction = async ({ request }) => {
  const { payload } = await request.json();
  
  const { mode, id, mutation, variables, shop } = payload;

  try {
    const result = await graphqlRequest(mutation, {...variables, shop});

    return { success: true, data: result }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
};

/* ======================================================
   PAGE
====================================================== */

export default function CreateFilterPage() {
  const { filter, shop, graphqlEndpoint, storefrontFilters } = useLoaderData<typeof loader>();

  const { t } = useTranslation();
  const location = useLocation();

  const formRef = useRef<FilterFormHandle>(null);
  const [isSaving, setIsSaving] = useState(false);

  const pageId = `filter-create-page`;

  /* ---------------- Save ---------------- */

  const handleSaveClick = useCallback(async (e?: any) => {
    if (e) {
      e.preventDefault?.();
      e.stopPropagation?.();
    }
    
    if (!formRef.current) {
      return;
    }
    
    try {
      await formRef.current.save();
    } catch (error) {
      // Error handled by FilterForm component
    }
  }, []);

  const handleSavingChange = useCallback((saving: boolean) => {
    setIsSaving(saving);
  }, []);

  /* ---------------- Slot cleanup ---------------- */

  useEffect(() => {
    // Only run cleanup if we are NOT on this page anymore
    const currentPath = `/app/filter/create`;
    if (location.pathname === currentPath) return;

    const cleanupSlots = () => {
      document
        .querySelectorAll('[slot="primary-action"], [slot="breadcrumb-actions"]')
        .forEach((el) => {
          const page = el.closest("s-page");
          const pageIdAttr = page?.getAttribute("data-page-id");

          // Only remove slots from other pages
          if (pageIdAttr && pageIdAttr !== pageId) {
            el.remove();
          }
        });
    };

    // Delay slightly to allow navigation rendering
    const timeoutId = setTimeout(cleanupSlots, 50);

    return () => clearTimeout(timeoutId);
  }, [location.pathname, pageId]);

  /* ---------------- Render ---------------- */

  return (
    <s-page
      key={`${pageId}-${location.pathname}`}
      data-page-id={pageId}
      heading={`${t("filterForm.create.pageTitle")}`}
    >
      <s-link slot="breadcrumb-actions" href="/app/filters">
        Filters
      </s-link>

      <FilterForm
        ref={formRef}
        mode={PageMode.CREATE}
        initialFilter={filter}
        shop={shop}
        graphqlEndpoint={graphqlEndpoint}
        storefrontFilters={storefrontFilters}
        onSavingChange={handleSavingChange}
      />
    </s-page>
  );
}

/* ======================================================
   HEADERS
====================================================== */

export const headers: HeadersFunction = (args) => boundary.headers(args);
