import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useLocation } from "react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import FilterForm, {
  PageMode,
  type FilterFormHandle,
} from "../components/FilterForm";
import { useTranslation } from "app/utils/translations";

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

/* ======================================================
   PAGE
====================================================== */

export default function CreateFilterPage() {
  const { filter, shop, graphqlEndpoint, storefrontFilters } =
    useLoaderData<typeof loader>();

  const { t } = useTranslation();
  const location = useLocation();

  const formRef = useRef<FilterFormHandle>(null);
  const [isSaving, setIsSaving] = useState(false);

  const pageId = `filter-create-page`;

  /* ---------------- Save ---------------- */

  const handleSaveClick = useCallback(async () => {
    await formRef.current?.save();
  }, []);

  const handleSavingChange = useCallback((saving: boolean) => {
    setIsSaving(saving);
  }, []);

  /* ---------------- Slot cleanup ---------------- */

  useEffect(() => {
    const cleanup = () => {
      document
        .querySelectorAll('[slot="primary-action"], [slot="breadcrumb-actions"]')
        .forEach((el) => {
          const page = el.closest("s-page");
          if (page?.getAttribute("data-page-id") === pageId) {
            el.remove();
          }
        });
    };

    const id = setTimeout(cleanup, 100);
    return () => clearTimeout(id);
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
