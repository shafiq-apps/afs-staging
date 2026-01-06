import type {
  ActionFunction,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useLocation } from "react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import FilterForm from "../components/FilterForm";
import { useTranslation } from "app/utils/translations";
import { FilterFormHandle, PageMode, PaginationType, SortOrder } from "app/utils/filter.enums";
import { normalizeShopifyId } from "app/utils/normalize-shopify-id";
import { graphqlRequest } from "app/graphql.server";

/* ======================================================
   LOADER
====================================================== */

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT ?? "/graphql";

  const filterId = params.id;
  if (!filterId) {
    throw new Response("Filter ID is required", { status: 400 });
  }

  const shop = session.shop;

  const filterQuery = `
    query GetFilterAndStorefrontFilters($shop: String!, $id: String!) {
      filter(shop: $shop, id: $id) {
        id
        title
        description
        status
        targetScope
        allowedCollections {
          id
          gid
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

  const response = await graphqlRequest(filterQuery, { shop, id: filterId });

  const filter = response?.filter ?? {};

  // Normalize allowedCollections IDs - ensure id is normalized and gid is set
  if (filter.allowedCollections && Array.isArray(filter.allowedCollections)) {
    filter.allowedCollections = filter.allowedCollections.map((collection: any) => {
      const normalizedId = normalizeShopifyId(collection.id);
      const gid = collection.gid || (collection.id?.startsWith('gid://') ? collection.id : `gid://shopify/Collection/${normalizedId}`);
      
      return {
        ...collection,
        id: normalizedId, // Always use normalized ID
        gid: gid, // Ensure gid is set for picker preselection
      };
    });
  }

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
    storefrontFilters: response?.storefrontFilters ?? null,
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

export default function EditFilterPage() {
  const { filter, shop, graphqlEndpoint, storefrontFilters } =
    useLoaderData<typeof loader>();

  const { t } = useTranslation();
  const location = useLocation();

  const formRef = useRef<FilterFormHandle>(null);
  const [isSaving, setIsSaving] = useState(false);

  const pageId = `filter-edit-${filter.id}`;

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
    const currentPath = `/app/filter/${filter.id}`;
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
  }, [location.pathname, pageId, filter.id]);


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

      <FilterForm
        ref={formRef}
        mode={PageMode.EDIT}
        initialFilter={filter}
        shop={shop}
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
