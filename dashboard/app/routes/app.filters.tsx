import { useState, useEffect, useRef } from "react";
import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigate, useLocation, useRevalidator } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "../utils/translations";
import { TargetScope } from "../utils/filter.enums";
import { graphqlRequest } from "app/graphql.server";

interface CollectionReference {
  label: string;
  value: string;
  id: string;
}

interface Filter {
  id: string;
  title: string;
  description?: string;
  status?: string;
  targetScope?: string;
  allowedCollections?: CollectionReference[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

interface FiltersData {
  filters: Filter[];
  total?: number;
  error?: string;
  shop?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    // Get shop from session or request
    const shop = session?.shop || "";

    // GraphQL query to fetch all filters
    const query = `
      query GetFilters($shop: String!) {
        filters(shop: $shop) {
          filters {
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
            createdAt
            updatedAt
          }
          total
        }
      }
    `;

    const result = await graphqlRequest(query, { shop });

    if (result.errors) {
      return {
        filters: [],
        error: result.errors[0]?.message || "Failed to fetch filters",
      } as FiltersData;
    }

    return {
      filters: result?.filters?.filters || [],
      total: result?.filters?.total || 0,
      error: undefined,
      shop,
    } as FiltersData;
  } catch (error: any) {
    return {
      filters: [],
      error: error.message || "Failed to fetch filters",
    } as FiltersData;
  }
};

export default function FiltersPage() {
  const { filters: initialFilters, error, shop } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const location = useLocation();
  const { t } = useTranslation();
  const revalidator = useRevalidator();

  const [filters, setFilters] = useState<Filter[]>(initialFilters);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [filterToDelete, setFilterToDelete] = useState<Filter | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Update filters when loader data changes
  useEffect(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  // Revalidate when navigating to this page to ensure fresh data
  // This ensures that when coming back from create/edit, we have the latest data
  // Use location.key to track actual navigation events and prevent infinite loops
  const prevLocationKey = useRef<string | undefined>(location.key);

  useEffect(() => {
    // Only revalidate if we actually navigated to this page (location.key changed)
    // This prevents infinite loops from revalidator being in dependencies
    if (location.pathname === '/app/filters' && location.key && location.key !== prevLocationKey.current) {
      prevLocationKey.current = location.key;
      // Small delay to ensure navigation is complete
      const timeoutId = setTimeout(() => {
        revalidator.revalidate();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [location.pathname, location.key]); // Removed revalidator from deps to prevent infinite loop

  // Clear slots only on unmount - key prop handles remounting
  useEffect(() => {
    return () => {
      // Clear slots when component unmounts
      const pageElement = document.querySelector('s-page[data-page-id="filters"]');
      if (pageElement) {
        const primaryAction = pageElement.querySelector('[slot="primary-action"]');
        const breadcrumbActions = pageElement.querySelectorAll('[slot="breadcrumb-actions"]');
        if (primaryAction) primaryAction.remove();
        breadcrumbActions.forEach(el => el.remove());
      }
    };
  }, []);

  // Show modal when filterToDelete is set
  useEffect(() => {
    if (filterToDelete && deleteModalOpen) {
      // Small delay to ensure DOM is updated with the filter data
      const timer = setTimeout(() => {
        const modal = document.getElementById("delete-modal") as any;
        if (modal) {
          // Use the showOverlay method if available
          if (modal.showOverlay && typeof modal.showOverlay === 'function') {
            modal.showOverlay();
          } else if (typeof modal.show === 'function') {
            modal.show();
          } else {
            // Fallback: trigger command programmatically
            const event = new CustomEvent('command', {
              bubbles: true,
              detail: { command: '--show' }
            });
            modal.dispatchEvent(event);
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    } else if (!filterToDelete && !deleteModalOpen) {
      // Hide modal when filterToDelete is cleared
      const modal = document.getElementById("delete-modal") as any;
      if (modal) {
        if (modal.hideOverlay && typeof modal.hideOverlay === 'function') {
          modal.hideOverlay();
        } else if (typeof modal.hide === 'function') {
          modal.hide();
        }
      }
    }
  }, [filterToDelete, deleteModalOpen]);

  const handleCreateClick = () => {
    navigate("/app/filter/create");
  };

  const handleEditClick = (filterId: string) => {
    navigate(`/app/filter/${filterId}`);
  };

  const handleDeleteClick = (filter: Filter) => {
    setFilterToDelete(filter);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!filterToDelete) return;

    setIsDeleting(true);
    try {
      if (!shop) {
        shopify.toast.show("Shop information is missing", { isError: true });
        setIsDeleting(false);
        return;
      }

      const mutation = `
        mutation DeleteFilter($shop: String!, $id: String!) {
          deleteFilter(shop: $shop, id: $id)
        }
      `;

      const response = await fetch("/app/api/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mutation,
          variables: { id: filterToDelete.id, shop },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        shopify.toast.show(errorData.error || "Failed to delete filter", { isError: true });
      } else {
        const result = await response.json();
        if (result.error || (result.errors && result.errors.length > 0)) {
          shopify.toast.show(result.error || result.errors?.[0]?.message || "Failed to delete filter", { isError: true });
        } else {
          shopify.toast.show("Filter deleted successfully");
          // Remove filter from list
          setFilters(filters.filter(f => f.id !== filterToDelete.id));
          // Close modal
          const modal = document.getElementById("delete-modal") as any;
          if (modal && typeof modal.hide === 'function') {
            modal.hide();
          }
          setDeleteModalOpen(false);
          setFilterToDelete(null);
        }
      }
    } catch (error: any) {
      shopify.toast.show(error.message || "Failed to delete filter", { isError: true });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setFilterToDelete(null);
  };

  const getCollectionDisplay = (filter: Filter): string => {
    // Use enum values for comparison (also handle legacy "specific" value)
    if (filter.targetScope === TargetScope.ALL || filter.targetScope === "all") {
      return t("filters.collectionDisplay.all");
    }
    else if (filter.targetScope === TargetScope.ENTITLED) {
      // Show collection count when targetScope is entitled/specific
      if (filter.allowedCollections && filter.allowedCollections.length > 0) {
        if (filter.allowedCollections.length === 1) {
          return filter.allowedCollections[0].label || t("filters.collectionDisplay.specific", { count: "1" });
        }
        return t("filters.collectionDisplay.specific", { count: filter.allowedCollections.length.toString() });
      }
      // If no collections selected, show "No Collections"
      return t("filters.collectionDisplay.none");
    }
    return t("filters.collectionDisplay.none");
  };

  const actionButton = (
    <s-stack alignItems="end">
      <s-button
        key="create-filter-button"
        variant="primary"
        onClick={handleCreateClick}
        icon="plus"
        accessibilityLabel={t("filters.createFilter")}
      >
        {t("filters.createFilter")}
      </s-button>
    </s-stack>
  )

  return (
    <s-page key={`filters-${location.pathname}`} heading={t("filters.pageTitle")} data-page-id="filters">
      

      {error && (
        <s-section>
          <s-banner tone="critical">
            <s-text>Error: {error}</s-text>
          </s-banner>
        </s-section>
      )}

      {filters.length === 0 && !error ? (
        <s-section>
          <s-grid gap="base" justifyItems="center" paddingBlock="large-400">
            <s-grid justifyItems="center" maxBlockSize="600px" maxInlineSize="600px">
              <s-stack direction="block" gap="base" alignItems="center">
                <s-box
                  padding="large"
                  background="subdued"
                  borderRadius="base"
                  inlineSize="120px"
                  blockSize="120px"
                >
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%"
                  }}>
                    <s-icon type="filter" />
                  </div>
                </s-box>
                <s-stack direction="block" gap="small" alignItems="center">
                  <s-heading>{t("filters.noFilters.title")}</s-heading>
                  <div style={{ textAlign: "center", maxWidth: "500px" }}>
                    <s-text tone="auto">
                      {t("filters.noFilters.description")}
                    </s-text>
                  </div>
                </s-stack>
                <s-button
                  variant="primary"
                  onClick={handleCreateClick}
                  icon="plus"
                  accessibilityLabel={t("filters.noFilters.createFirst")}
                >
                  {t("filters.noFilters.createFirst")}
                </s-button>
              </s-stack>
            </s-grid>
          </s-grid>
        </s-section>
      ) : (
        <s-stack rowGap="base">
          {actionButton}
        <s-section padding="none">
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">{t("filters.table.title")}</s-table-header>
              <s-table-header>{t("filters.table.status")}</s-table-header>
              <s-table-header>{t("filters.table.collectionDisplay")}</s-table-header>
              <s-table-header>{t("filters.table.actions")}</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {filters.map((filter) => (
                <s-table-row key={filter.id}>
                  <s-table-cell>
                    <strong>{filter.title}</strong>
                  </s-table-cell>
                  <s-table-cell>
                    {filter.status && (
                      <s-badge
                        tone={filter.status === "PUBLISHED" ? "success" : "warning"}
                      >
                        {filter.status === "PUBLISHED" ? "Published" : "Unpublished"}
                      </s-badge>
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    <s-text tone="auto">{getCollectionDisplay(filter)}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small">
                      <s-button
                        variant="secondary"
                        onClick={() => handleEditClick(filter.id)}
                        icon="edit"
                        accessibilityLabel={t("filters.table.edit")}
                      >
                        {t("filters.table.edit")}
                      </s-button>
                      <s-button
                        variant="secondary"
                        tone="critical"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteClick(filter);
                        }}
                        icon="delete"
                        accessibilityLabel={t("filters.table.delete")}
                      >
                        {t("filters.table.delete")}
                      </s-button>
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
        </s-stack>
      )}

      {/* Delete Confirmation Modal */}
      <s-modal id="delete-modal" heading={t("filters.deleteModal.title")}>
        {filterToDelete && (
          <s-stack direction="block" gap="base">
            <s-text>
              {t("filters.deleteModal.message", { title: filterToDelete.title })}
            </s-text>
          </s-stack>
        )}
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          onClick={async (e) => {
            e.preventDefault();
            await handleDeleteConfirm();
          }}
          commandFor="delete-modal"
          command="--hide"
          loading={isDeleting}
        >
          {t("filters.deleteModal.confirm")}
        </s-button>
        <s-button
          slot="secondary-actions"
          variant="secondary"
          commandFor="delete-modal"
          command="--hide"
          onClick={(e) => {
            e.preventDefault();
            handleDeleteCancel();
          }}
          disabled={isDeleting}
        >
          {t("filters.deleteModal.cancel")}
        </s-button>
      </s-modal>

    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
