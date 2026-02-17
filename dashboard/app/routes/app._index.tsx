import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigate, useLocation, useRouteError, isRouteErrorResponse } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useShop } from "../contexts/ShopContext";
import { graphqlRequest } from "app/graphql.server";
import { GraphQLErrorBoundary } from "../components/GraphQLErrorBoundary";
import { useTranslation } from "app/utils/translations";

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
  const { session } = await authenticate.admin(request);
  const shop = session?.shop || "";

  const gquery = `
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

  // This is critical data for the home page
  // If the server is down, we want to show the downtime screen
  // The GraphQLError will be caught by the ErrorBoundary
  const response = await graphqlRequest(gquery, { shop });

  const filters = response?.filters?.filters || [];
  const totalFilters = filters?.total || filters.length;
  const publishedFilters = filters.filter((f: Filter) => f.status === "published").length;
  const draftFilters = filters?.filter((f: Filter) => f.status === "draft").length;

  const indexingStatus: IndexingStatus = response?.indexingStatus || {
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
    error: undefined,
  } as HomePageData;
};

export default function Index() {
  const {
    filters,
    totalFilters,
    publishedFilters,
    draftFilters,
    indexingStatus,
    error,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const location = useLocation();
  const { formatDate: formatShopDate } = useShop();
  const { t } = useTranslation();

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return t("common.never");
    return formatShopDate(dateString, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "success":
        return <s-badge tone="success">{t("common.success")}</s-badge>;
      case "failed":
        return <s-badge tone="critical">{t("common.failed")}</s-badge>;
      case "in_progress":
        return <s-badge tone="warning">{t("indexing.status.inProgress")}</s-badge>;
      case "not_started":
        return <s-badge tone="neutral">{t("indexing.status.notStarted")}</s-badge>;
      default:
        return <s-badge tone="neutral">{t("common.unknown")}</s-badge>;
    }
  };


  return (
    <s-page key={`home-${location.pathname}`} heading={t("home.pageTitle")} data-page-id="home">
      {error && (
        <s-section>
          <s-banner tone="critical">
            <s-text>{t("common.error")}: {error}</s-text>
          </s-banner>
        </s-section>
      )}

      {/* Overview Stats */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>{t("home.overview.title")}</s-heading>
          <s-grid gap="base" gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))">
            <s-grid-item>
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="base"
              >
                <s-stack direction="block" gap="small">
                  <s-text tone="auto">{t("home.overview.totalFilters")}</s-text>
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
                  <s-text tone="auto">{t("home.overview.published")}</s-text>
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
                  <s-text tone="auto">{t("home.overview.draft")}</s-text>
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
                  <s-text tone="auto">{t("home.overview.productsIndexed")}</s-text>
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
          <s-heading>{t("home.quickActions.title")}</s-heading>
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
                    <s-heading>{t("home.quickActions.createFilter.title")}</s-heading>
                    <s-text tone="auto">
                      {t("home.quickActions.createFilter.description")}
                    </s-text>
                  </s-stack>
                  <s-button
                    variant="primary"
                    onClick={() => navigate("/app/filter/create")}
                    icon="plus"
                    accessibilityLabel={t("home.quickActions.createFilter.accessibilityLabel")}
                  >
                    {t("home.quickActions.createFilter.button")}
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
                    <s-heading>{t("home.quickActions.manageFilters.title")}</s-heading>
                    <s-text tone="auto">
                      {t("home.quickActions.manageFilters.description")}
                    </s-text>
                  </s-stack>
                  <s-button
                    variant="secondary"
                    onClick={() => navigate("/app/filters")}
                  >
                    {t("home.quickActions.manageFilters.button")}
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
                    <s-heading>{t("home.quickActions.productSync.title")}</s-heading>
                    <s-text tone="auto">
                      {t("home.quickActions.productSync.description")}
                    </s-text>
                  </s-stack>
                  <s-button
                    variant="secondary"
                    onClick={() => navigate("/app/indexing")}
                  >
                    {t("home.quickActions.productSync.button")}
                  </s-button>
                </s-stack>
              </s-box>
            </s-grid-item>
          </s-grid>
        </s-stack>
      </s-section>

      {/* Recent Filters and Indexing Status */}
      <div style={{ marginBottom: 16 }}>
        <s-grid gap="base" gridTemplateColumns="repeat(auto-fit, minmax(400px, 1fr))">
          <s-grid-item>
            <s-section>
              <s-stack direction="block" gap="base">
                <s-heading>{t("home.recentFilters.title")}</s-heading>
                {filters.length === 0 ? (
                  <s-box
                    padding="base"
                    borderWidth="base"
                    borderRadius="base"
                    background="subdued"
                  >
                    <s-stack direction="block" gap="small" alignItems="center">
                      <s-text tone="auto">{t("home.recentFilters.noFilters")}</s-text>
                      <s-button
                        variant="primary"
                        onClick={() => navigate("/app/filter/create")}
                        icon="plus"
                        accessibilityLabel={t("home.recentFilters.createFirst")}
                      >
                        {t("home.recentFilters.createFirst")}
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
                          {t("home.recentFilters.viewAll", { count: totalFilters.toString() })}
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
                <s-heading>{t("home.syncStatus.title")}</s-heading>
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background="base"
                >
                  <s-stack direction="block" gap="base">
                    <s-stack direction="inline" gap="base" alignItems="center">
                      <s-text type="strong">{t("home.syncStatus.status")}:</s-text>
                      {getStatusBadge(indexingStatus.status)}
                    </s-stack>
                    <s-stack direction="block" gap="small">
                      <s-text tone="auto">
                        {t("home.syncStatus.productsIndexed")}: <s-text type="strong">{indexingStatus.totalIndexed.toLocaleString()}</s-text>
                      </s-text>
                      {indexingStatus.totalFailed > 0 && (
                        <s-text tone="critical">
                          {t("home.syncStatus.failed")}: <s-text type="strong">{indexingStatus.totalFailed}</s-text>
                        </s-text>
                      )}
                      {indexingStatus.status === "in_progress" && (
                        <s-text tone="auto">
                          {t("home.syncStatus.progress")}: <s-text type="strong">{indexingStatus.progress}%</s-text>
                        </s-text>
                      )}
                      {indexingStatus.completedAt && (
                        <s-text tone="auto">
                          {t("home.syncStatus.lastSync")}: {formatDate(indexingStatus.completedAt)}
                        </s-text>
                      )}
                    </s-stack>
                    <s-button
                      variant="secondary"
                      onClick={() => navigate("/app/indexing")}
                      icon="arrow-right"
                      accessibilityLabel={t("home.syncStatus.accessibilityLabel")}
                    >
                      {t("home.syncStatus.button")}
                    </s-button>
                  </s-stack>
                </s-box>
              </s-stack>
            </s-section>
          </s-grid-item>
        </s-grid>
      </div>

      {/* Getting Started / Help Section */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>{t("home.gettingStarted.title")}</s-heading>
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="base">
              <s-stack direction="block" gap="small">
                <s-text type="strong">{t("home.gettingStarted.whatIs.title")}</s-text>
                <s-text tone="auto">
                  {t("home.gettingStarted.whatIs.description")}
                </s-text>
              </s-stack>
              <s-divider />
              <s-stack direction="block" gap="small">
                <s-text type="strong">{t("home.gettingStarted.quickStart.title")}</s-text>
                <s-unordered-list>
                  <s-list-item>
                    <s-text tone="auto">
                      <s-link href="/app/indexing">{t("home.gettingStarted.quickStart.step1")}</s-link>
                    </s-text>
                  </s-list-item>
                  <s-list-item>
                    <s-text tone="auto">
                      <s-link href="/app/filter/create">{t("home.gettingStarted.quickStart.step2")}</s-link>
                    </s-text>
                  </s-list-item>
                  <s-list-item>
                    <s-text tone="auto">
                      {t("home.gettingStarted.quickStart.step3")}
                    </s-text>
                  </s-list-item>
                  <s-list-item>
                    <s-text tone="auto">
                      {t("home.gettingStarted.quickStart.step4")}
                    </s-text>
                  </s-list-item>
                </s-unordered-list>
              </s-stack>
              <s-divider />
              <s-stack direction="block" gap="small">
                <s-text type="strong">{t("home.gettingStarted.features.title")}</s-text>
                <s-grid gap="small" gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))">
                  <s-grid-item>
                    <s-stack direction="block" gap="small">
                      <s-text type="strong">{t("home.gettingStarted.features.customFilters.title")}</s-text>
                      <s-text tone="auto">
                        {t("home.gettingStarted.features.customFilters.description")}
                      </s-text>
                    </s-stack>
                  </s-grid-item>
                  <s-grid-item>
                    <s-stack direction="block" gap="small">
                      <s-text type="strong">{t("home.gettingStarted.features.flexibleDisplay.title")}</s-text>
                      <s-text tone="auto">
                        {t("home.gettingStarted.features.flexibleDisplay.description")}
                      </s-text>
                    </s-stack>
                  </s-grid-item>
                  <s-grid-item>
                    <s-stack direction="block" gap="small">
                      <s-text type="strong">{t("home.gettingStarted.features.collectionTargeting.title")}</s-text>
                      <s-text tone="auto">
                        {t("home.gettingStarted.features.collectionTargeting.description")}
                      </s-text>
                    </s-stack>
                  </s-grid-item>
                  <s-grid-item>
                    <s-stack direction="block" gap="small">
                      <s-text type="strong">{t("home.gettingStarted.features.dragAndDrop.title")}</s-text>
                      <s-text tone="auto">
                        {t("home.gettingStarted.features.dragAndDrop.description")}
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

export function ErrorBoundary() {
  const error = useRouteError();

  // Check if it's a Remix route error response (from json() throw)
  if (isRouteErrorResponse(error)) {
    if (error.data && typeof error.data === "object" &&
      ("isGraphQLError" in error.data || "code" in error.data || "endpoint" in error.data)) {
      return <GraphQLErrorBoundary />;
    }
  }

  // Check if it's a direct GraphQL error
  const isGraphQLErr = error &&
    typeof error === "object" &&
    (
      "isGraphQLError" in error ||
      "code" in error ||
      "isNetworkError" in error ||
      "isServerError" in error ||
      "endpoint" in error ||
      (error as any).name === "GraphQLError"
    );

  if (isGraphQLErr) {
    return <GraphQLErrorBoundary />;
  }

  // Fallback to Shopify's error boundary for other errors
  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
