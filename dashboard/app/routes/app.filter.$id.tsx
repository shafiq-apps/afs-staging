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
import { PaginationType, SortOrder } from "app/utils/filter.enums";

/* ======================================================
   LOADER
====================================================== */

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const GRAPHQL_ENDPOINT =
    process.env.GRAPHQL_ENDPOINT ?? "http://localhost:3554/graphql";

  const filterId = params.id;
  if (!filterId) {
    throw new Response("Filter ID is required", { status: 400 });
  }

  const shop = session.shop;

  const filterQuery = `
    query GetFilter($shop: String!, $id: String!) {
      filter(shop: $shop, id: $id) {
        id
        title
        description
        status
        targetScope
        allowedCollections {
          id
          label
          value
        }
        options {
          handle
          position
          label
          optionType
          displayType
          selectionType
          allowedOptions
          collapsed
          searchable
          tooltipContent
          showTooltip
          showMenu
          status
          optionSettings {
            baseOptionType
            removeSuffix
            replaceText { from to }
            variantOptionKey
            valueNormalization
            groupBySimilarValues
            removePrefix
            filterByPrefix
            sortBy
            manualSortedValues
            groups
            menus
            textTransform
            paginationType
          }
        }
        settings {
          defaultView
          filterOrientation
          displayQuickView
          displayItemsCount
          displayVariantInsteadOfProduct
          displayCollectionImage
          hideOutOfStockItems
          onLaptop
          onTablet
          onMobile
          productDisplay {
            gridColumns
            showProductCount
            showSortOptions
            defaultSort
          }
          pagination {
            type
            itemsPerPage
            showPageInfo
            pageInfoFormat
          }
          showFilterCount
          showActiveFilters
          showResetButton
          showClearAllButton
        }
      }
    }
  `;

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

  const [filterRes, storefrontRes] = await Promise.all([
    fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: filterQuery, variables: { shop, id: filterId } }),
    }),
    fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: storefrontQuery, variables: { shop } }),
    }),
  ]);

  const filterJson = await filterRes.json();
  const storefrontJson = await storefrontRes.json();

  if (filterJson.errors) {
    throw new Response(filterJson.errors[0].message, { status: 500 });
  }

  const filter = filterJson.data.filter;

  // Normalize option settings (single responsibility here)
  filter.options = filter.options.map((option: any) => {
    const s = option.optionSettings ?? {};
    return {
      ...option,
      tooltipContent: option.tooltipContent ?? "",
      allowedOptions: option.allowedOptions ?? [],
      groups: s.groups ?? [],
      removePrefix: s.removePrefix ?? [],
      filterByPrefix: s.filterByPrefix ?? [],
      manualSortedValues: s.manualSortedValues ?? [],
      menus: s.menus ?? [],
      removeSuffix: s.removeSuffix ?? [],
      replaceText: s.replaceText ?? [],
      sortBy: s.sortBy ?? SortOrder.COUNT,
      textTransform: s.textTransform ?? "NONE",
      paginationType: s.paginationType ?? PaginationType.PAGES,
      groupBySimilarValues: s.groupBySimilarValues ?? false,
      valueNormalization: s.valueNormalization ?? {},
      baseOptionType: s.baseOptionType,
      variantOptionKey: s.variantOptionKey,
      optionSettings: s,
    };
  });

  return {
    filter,
    shop,
    graphqlEndpoint: GRAPHQL_ENDPOINT,
    storefrontFilters: storefrontJson.data?.storefrontFilters ?? null,
  };
};

/* ======================================================
   PAGE
====================================================== */

export default function EditFilterPage() {
  const { filter, shop, graphqlEndpoint, storefrontFilters } =
    useLoaderData<typeof loader>();

  const { t } = useTranslation();
  const location = useLocation();

  const formRef = useRef<FilterFormHandle>(null);
  const [isSaving, setIsSaving] = useState(false);

  const pageId = `filter-edit-${filter.id}`;

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
      heading={`${t("filterForm.edit.pageTitle")}: ${filter.title}`}
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
        mode={PageMode.EDIT}
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

export const headers: HeadersFunction = (args) =>
  boundary.headers(args);
