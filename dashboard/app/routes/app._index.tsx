import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigate, useLocation } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useShop } from "../contexts/ShopContext";

interface Filter {
  id: string;
  title: string;
  status: string;
  targetScope: string;
  createdAt?: string;
  updatedAt?: string;
}

interface IndexingStatus {
  shop: string;
  status: "in_progress" | "success" | "failed" | "not_started";
  startedAt?: string | null;
  completedAt?: string | null;
  totalIndexed: number;
  totalFailed: number;
  progress: number;
  lastUpdatedAt?: string | null;
}


interface HomePageData {
  filters: Filter[];
  totalFilters: number;
  publishedFilters: number;
  draftFilters: number;
  indexingStatus: IndexingStatus;
  shopInfo?: { shop: string };
  apiKey?: string;
  error?: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  const GRAPHQL_ENDPOINT =
    process.env.GRAPHQL_ENDPOINT || "http://localhost:3554/graphql";

  try {
    const shop = session?.shop || "";
    const apiKey = process.env.SHOPIFY_API_KEY || "";

    // Fetch filters
    const filtersQuery = `
      query GetFilters($shop: String!) {
        filters(shop: $shop) {
          filters {
            id
            title
            status
            targetScope
            createdAt
            updatedAt
          }
          total
        }
      }
    `;

    // Fetch indexing status
    const indexingQuery = `
      query GetIndexingStatus($shop: String!) {
        indexingStatus(shop: $shop) {
          shop
          status
          startedAt
          completedAt
          totalIndexed
          totalFailed
          progress
          lastUpdatedAt
        }
      }
    `;

    // Fetch both in parallel
    const [filtersResponse, indexingResponse] = await Promise.all([
      fetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: filtersQuery,
          variables: { shop },
        }),
      }),
      fetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: indexingQuery,
          variables: { shop },
        }),
      }),
    ]);

    const filtersResult = await filtersResponse.json();
    const indexingResult = await indexingResponse.json();

    const filters = filtersResult.data?.filters?.filters || [];
    const totalFilters = filtersResult.data?.filters?.total || filters.length;
    const publishedFilters = filters.filter((f: Filter) => f.status === "published").length;
    const draftFilters = filters.filter((f: Filter) => f.status === "draft").length;

    const indexingStatus: IndexingStatus = indexingResult.data?.indexingStatus || {
      shop,
      status: "not_started",
      totalIndexed: 0,
      totalFailed: 0,
      progress: 0,
    };

    return {
      filters: filters.slice(0, 5), // Show only recent 5
      totalFilters,
      publishedFilters,
      draftFilters,
      indexingStatus,
      shopInfo: { shop },
      apiKey,
      error: undefined,
    } as HomePageData;
  } catch (error: any) {
    return {
      filters: [],
      totalFilters: 0,
      publishedFilters: 0,
      draftFilters: 0,
      indexingStatus: {
        shop: "",
        status: "not_started",
        totalIndexed: 0,
        totalFailed: 0,
        progress: 0,
      },
      apiKey: process.env.SHOPIFY_API_KEY || "",
      error: error.message || "Failed to fetch data",
    } as HomePageData;
  }
};

export default function Index() {
  const {
    filters,
    totalFilters,
    publishedFilters,
    draftFilters,
    indexingStatus,
    shopInfo,
    apiKey,
    error,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const location = useLocation();
  const { formatDate: formatShopDate } = useShop();

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "Never";
    return formatShopDate(dateString, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "success":
        return <s-badge tone="success">Success</s-badge>;
      case "failed":
        return <s-badge tone="critical">Failed</s-badge>;
      case "in_progress":
        return <s-badge tone="warning">In Progress</s-badge>;
      case "not_started":
        return <s-badge tone="neutral">Not Started</s-badge>;
      default:
        return <s-badge tone="neutral">Unknown</s-badge>;
    }
  };


  return (
    <s-page key={`home-${location.pathname}`} heading="Advanced Filters & Search" data-page-id="home">
      {error && (
        <s-section>
          <s-banner tone="critical">
            <s-text>Error: {error}</s-text>
          </s-banner>
        </s-section>
      )}

      {/* Overview Stats */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Overview</s-heading>
          <s-grid gap="base" gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))">
            <s-grid-item>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="base"
              >
                <s-stack direction="block" gap="small">
                  <s-text tone="auto">Total Filters</s-text>
                  <div style={{ fontSize: "32px" }}>
                    <s-text type="strong">{totalFilters}</s-text>
                  </div>
                </s-stack>
              </s-box>
            </s-grid-item>
            <s-grid-item>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="base"
              >
                <s-stack direction="block" gap="small">
                  <s-text tone="auto">Published</s-text>
                  <div style={{ fontSize: "32px" }}>
                    <s-text type="strong">{publishedFilters}</s-text>
                  </div>
                </s-stack>
              </s-box>
            </s-grid-item>
            <s-grid-item>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="base"
              >
                <s-stack direction="block" gap="small">
                  <s-text tone="auto">Draft</s-text>
                  <div style={{ fontSize: "32px" }}>
                    <s-text type="strong">{draftFilters}</s-text>
                  </div>
                </s-stack>
              </s-box>
            </s-grid-item>
            <s-grid-item>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="base"
              >
                <s-stack direction="block" gap="small">
                  <s-text tone="auto">Products Indexed</s-text>
                  <div style={{ fontSize: "32px" }}>
                    <s-text type="strong">{indexingStatus.totalIndexed.toLocaleString()}</s-text>
                  </div>
                </s-stack>
              </s-box>
            </s-grid-item>
          </s-grid>
        </s-stack>
      </s-section>

      {/* Quick Actions */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Quick Actions</s-heading>
          <s-grid gap="base" gridTemplateColumns="repeat(auto-fit, minmax(250px, 1fr))">
            <s-grid-item>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <s-stack direction="block" gap="base">
                  <s-stack direction="block" gap="small">
                    <s-heading>Create Filter</s-heading>
                    <s-text tone="auto">
                      Build custom filters to help customers find products quickly.
                    </s-text>
                  </s-stack>
                  <s-button
                    variant="primary"
                    onClick={() => navigate("/app/filter/create")}
                    icon="plus"
                  >
                    Create New Filter
                  </s-button>
                </s-stack>
              </s-box>
            </s-grid-item>
            <s-grid-item>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <s-stack direction="block" gap="base">
                  <s-stack direction="block" gap="small">
                    <s-heading>Manage Filters</s-heading>
                    <s-text tone="auto">
                      View, edit, and organize all your storefront filters.
                    </s-text>
                  </s-stack>
                  <s-button
                    variant="secondary"
                    onClick={() => navigate("/app/filters")}
                  >
                    View All Filters
                  </s-button>
                </s-stack>
              </s-box>
            </s-grid-item>
            <s-grid-item>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <s-stack direction="block" gap="base">
                  <s-stack direction="block" gap="small">
                    <s-heading>Product Sync</s-heading>
                    <s-text tone="auto">
                      Sync your products to keep filter options up-to-date.
                    </s-text>
                  </s-stack>
                  <s-button
                    variant="secondary"
                    onClick={() => navigate("/app/indexing")}
                  >
                    Sync Products
                  </s-button>
                </s-stack>
              </s-box>
            </s-grid-item>
          </s-grid>
        </s-stack>
      </s-section>

      {/* Recent Filters and Indexing Status */}
      <s-grid gap="base" gridTemplateColumns="repeat(auto-fit, minmax(400px, 1fr))">
        <s-grid-item>
          <s-section>
            <s-stack direction="block" gap="base">
              <s-heading>Recent Filters</s-heading>
              {filters.length === 0 ? (
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background="subdued"
                >
                  <s-stack direction="block" gap="small" alignItems="center">
                    <s-text tone="auto">No filters yet</s-text>
                    <s-button
                      variant="primary"
                      onClick={() => navigate("/app/filter/create")}
                      icon="plus"
                    >
                      Create Your First Filter
                    </s-button>
                  </s-stack>
                </s-box>
              ) : (
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background="base"
                >
                  <s-stack direction="block" gap="small">
                    {filters.map((filter) => (
                      <s-box
                        key={filter.id}
                        padding="small"
                        borderWidth="base"
                        borderRadius="base"
                        background="subdued"
                      >
                        <s-stack direction="inline" gap="base" alignItems="center">
                          <s-link href={`/app/filter/${filter.id}`}>
                            <s-text type="strong">{filter.title}</s-text>
                          </s-link>
                          {filter.status && (
                            <s-badge
                              tone={
                                filter.status === "published"
                                  ? "success"
                                  : filter.status === "draft"
                                  ? "warning"
                                  : "neutral"
                              }
                            >
                              {filter.status.charAt(0).toUpperCase() + filter.status.slice(1)}
                            </s-badge>
                          )}
                        </s-stack>
                      </s-box>
                    ))}
                    {totalFilters > filters.length && (
                      <s-button
                        variant="secondary"
                        onClick={() => navigate("/app/filters")}
                      >
                        View All {totalFilters} Filters
                      </s-button>
                    )}
                  </s-stack>
                </s-box>
              )}
            </s-stack>
          </s-section>
        </s-grid-item>

        <s-grid-item>
          <s-section>
            <s-stack direction="block" gap="base">
              <s-heading>Product Sync Status</s-heading>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="base"
              >
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base" alignItems="center">
                    <s-text type="strong">Status:</s-text>
                    {getStatusBadge(indexingStatus.status)}
                  </s-stack>
                  <s-stack direction="block" gap="small">
                    <s-text tone="auto">
                      Products Indexed: <s-text type="strong">{indexingStatus.totalIndexed.toLocaleString()}</s-text>
                    </s-text>
                    {indexingStatus.totalFailed > 0 && (
                      <s-text tone="critical">
                        Failed: <s-text type="strong">{indexingStatus.totalFailed}</s-text>
                      </s-text>
                    )}
                    {indexingStatus.status === "in_progress" && (
                      <s-text tone="auto">
                        Progress: <s-text type="strong">{indexingStatus.progress}%</s-text>
                      </s-text>
                    )}
                    {indexingStatus.completedAt && (
                      <s-text tone="auto">
                        Last Sync: {formatDate(indexingStatus.completedAt)}
                      </s-text>
                    )}
                  </s-stack>
                  <s-button
                    variant="secondary"
                    onClick={() => navigate("/app/indexing")}
                    icon="arrow-right"
                  >
                    Manage Product Sync
                  </s-button>
                </s-stack>
              </s-box>
            </s-stack>
          </s-section>
        </s-grid-item>
      </s-grid>

      {/* Getting Started / Help Section */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Getting Started</s-heading>
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="base">
              <s-stack direction="block" gap="small">
                <s-text type="strong">What is Advanced Filters & Search?</s-text>
                <s-text tone="auto">
                  This app helps you create powerful, customizable filters for your storefront.
                  Enable customers to find products quickly by filtering by price, color, size,
                  brand, tags, and more. Customize filter display types, organize filter options,
                  and control exactly how filters appear on your storefront.
                </s-text>
              </s-stack>
              <s-divider />
              <s-stack direction="block" gap="small">
                <s-text type="strong">Quick Start Guide</s-text>
                <s-unordered-list>
                  <s-list-item>
                    <s-text tone="auto">
                      <s-link href="/app/indexing">Sync your products</s-link> to index product data
                      for filtering
                    </s-text>
                  </s-list-item>
                  <s-list-item>
                    <s-text tone="auto">
                      <s-link href="/app/filter/create">Create your first filter</s-link> with
                      custom options and settings
                    </s-text>
                  </s-list-item>
                  <s-list-item>
                    <s-text tone="auto">
                      Configure filter options like price ranges, colors, sizes, and more
                    </s-text>
                  </s-list-item>
                  <s-list-item>
                    <s-text tone="auto">
                      Publish your filter to make it available on your storefront
                    </s-text>
                  </s-list-item>
                </s-unordered-list>
              </s-stack>
              <s-divider />
              <s-stack direction="block" gap="small">
                <s-text type="strong">Features</s-text>
                <s-grid gap="small" gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))">
                  <s-grid-item>
                    <s-stack direction="block" gap="small">
                      <s-text type="strong">Custom Filter Options</s-text>
                      <s-text tone="auto">
                        Create filters for price, variants, tags, collections, and more
                      </s-text>
                    </s-stack>
                  </s-grid-item>
                  <s-grid-item>
                    <s-stack direction="block" gap="small">
                      <s-text type="strong">Flexible Display Types</s-text>
                      <s-text tone="auto">
                        Choose from checkboxes, radio buttons, swatches, ranges, and more
                      </s-text>
                    </s-stack>
                  </s-grid-item>
                  <s-grid-item>
                    <s-stack direction="block" gap="small">
                      <s-text type="strong">Collection Targeting</s-text>
                      <s-text tone="auto">
                        Show filters on all collections or specific collections only
                      </s-text>
                    </s-stack>
                  </s-grid-item>
                  <s-grid-item>
                    <s-stack direction="block" gap="small">
                      <s-text type="strong">Drag & Drop Organization</s-text>
                      <s-text tone="auto">
                        Easily reorder filter options to control display priority
                      </s-text>
                    </s-stack>
                  </s-grid-item>
                </s-grid>
              </s-stack>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
