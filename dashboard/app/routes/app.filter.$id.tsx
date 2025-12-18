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
import { PaginationType, SortOrder } from "app/utils/filter.enums";


export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const GRAPHQL_ENDPOINT =
    process.env.GRAPHQL_ENDPOINT || "http://localhost:3554/graphql";

  const filterId = params.id;
  if (!filterId) {
    return { 
      filter: null, 
      error: "Filter ID is required", 
      shop: "", 
      graphqlEndpoint: GRAPHQL_ENDPOINT,
      storefrontFilters: null,
    };
  }

  try {
    const { session } = await authenticate.admin(request);
    const shop = session?.shop || "";

    // Fetch filter data
    const filterQuery = `
      query GetFilter($shop: String!, $id: String!) {
        filter(shop: $shop, id: $id) {
          id
          title
          description
          status
          targetScope
          allowedCollections {
            label
            value
            id
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
              replaceText {
                from
                to
              }
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
            defaultView
            filterOrientation
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

    // Fetch storefront filters for available values
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

    const [filterResponse, storefrontResponse] = await Promise.all([
      fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
        headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
          query: filterQuery,
        variables: { shop, id: filterId },
      }),
      }),
      fetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: storefrontQuery,
          variables: { shop },
        }),
      }),
    ]);

    const [filterResult, storefrontResult] = await Promise.all([
      filterResponse.json(),
      storefrontResponse.json(),
    ]);

    if (filterResult.errors) {
      return {
        filter: null,
        error: filterResult.errors[0]?.message || "Failed to fetch filter",
        shop,
        graphqlEndpoint: GRAPHQL_ENDPOINT,
        storefrontFilters: null,
      };
    }

    const filter = filterResult.data?.filter;
    const storefrontFilters = storefrontResult.data?.storefrontFilters || null;
    
    if (filter && filter.options) {
      filter.options = filter.options.map((option: any) => {
        const optionSettings = option.optionSettings || {};
        return {
          ...option,
          tooltipContent: option.tooltipContent ?? "",
          allowedOptions: option.allowedOptions ?? [],
          // Extract fields from optionSettings to top level for backward compatibility
          groups: optionSettings.groups ?? [],
          removePrefix: optionSettings.removePrefix ?? [],
          filterByPrefix: optionSettings.filterByPrefix ?? [],
          manualSortedValues: optionSettings.manualSortedValues ?? [],
          menus: optionSettings.menus ?? [],
          removeSuffix: optionSettings.removeSuffix ?? [],
          replaceText: optionSettings.replaceText ?? [],
          sortBy: optionSettings.sortBy ?? SortOrder.COUNT,
          textTransform: optionSettings.textTransform ?? "NONE",
          paginationType: optionSettings.paginationType ?? PaginationType.PAGES,
          groupBySimilarValues: optionSettings.groupBySimilarValues ?? false,
          valueNormalization: optionSettings.valueNormalization ?? {},
          baseOptionType: optionSettings.baseOptionType,
          variantOptionKey: optionSettings.variantOptionKey,
          // Keep optionSettings for reference
          optionSettings: optionSettings,
        };
      });
    }

    return {
      filter: filter || null,
      error: undefined,
      shop: shop || "",
      graphqlEndpoint: GRAPHQL_ENDPOINT,
      storefrontFilters
    };
  } catch (error: any) {
    return {
      filter: null,
      error: error.message || "Failed to fetch filter",
      graphqlEndpoint: GRAPHQL_ENDPOINT,
      storefrontFilters: null
    };
  }
};

export default function EditFilterPage() {
  const { 
    filter: initialFilter, 
    error: loadError, 
    shop, 
    graphqlEndpoint,
    storefrontFilters,
  } = useLoaderData<typeof loader>();
  
  const location = useLocation();
  const { t } = useTranslation();

  if (loadError) {
    return (
      <s-page heading={t("filterForm.edit.pageTitle")}>
        <s-section>
          <s-banner tone="critical">
            <s-text>Error: {loadError}</s-text>
          </s-banner>
        </s-section>
      </s-page>
    );
  }

  if (!initialFilter) {
    return (
      <s-page heading={t("filterForm.edit.pageTitle")}>
        <s-section>
          <s-spinner size="large" />
          <s-text>Loading filter...</s-text>
        </s-section>
      </s-page>
    );
  }

  const pageId = `filter-edit-${initialFilter?.id || "new"}`;

  // Cleanup slots from other pages when navigating away
  useEffect(() => {
    // Only cleanup if we're NOT on this edit page anymore
    const currentPath = `/app/filter/${initialFilter?.id || ''}`;
    if (location.pathname === currentPath) {
      return;
    }

    const cleanupSlots = () => {
      // Find all slot elements that might be from this edit page
      const allPrimaryActions = document.querySelectorAll('[slot="primary-action"]');
      const allBreadcrumbs = document.querySelectorAll('[slot="breadcrumb-actions"]');
      
      // Remove slots that are inside a page with this edit page ID
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
  }, [location.pathname, pageId, initialFilter?.id]);

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
    <s-page key={`${pageId}-${location.pathname}`} heading={initialFilter ? `${t("filterForm.edit.pageTitle")}: ${initialFilter.title}` : t("filterForm.edit.pageTitle")} data-page-id={pageId}>
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
        mode="edit"
        initialFilter={initialFilter}
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
