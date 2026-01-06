import { useState, useEffect, useRef } from "react";
import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigate, useLocation } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "../utils/translations";
import { useShop } from "../contexts/ShopContext";
import { graphqlRequest } from "app/graphql.server";

interface IndexingFailedItem {
  id: string;
  line: number;
  error: string;
  retryCount: number;
}

interface IndexingStatus {
  shop: string;
  status: "in_progress" | "success" | "failed" | "not_started";
  startedAt?: string | null;
  completedAt?: string | null;
  totalLines?: number | null;
  totalIndexed: number;
  totalFailed: number;
  progress: number;
  failedItems: IndexingFailedItem[];
  error?: string | null;
  duration?: number | null;
  lastUpdatedAt?: string | null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    // Get shop from session
    const shop = session?.shop || "";

    // GraphQL query to fetch indexing status
    const query = `
      query GetIndexingStatus($shop: String!) {
        indexingStatus(shop: $shop) {
          shop
          status
          startedAt
          completedAt
          totalLines
          totalIndexed
          totalFailed
          progress
          failedItems {
            id
            line
            error
            retryCount
          }
          error
          duration
          lastUpdatedAt
        }
      }
    `;

    const result = await graphqlRequest(query,{ shop });

    if (result.errors) {
      // Return default status if query fails
      return {
        indexingStatus: {
          shop,
          status: "not_started" as const,
          totalIndexed: 0,
          totalFailed: 0,
          progress: 0,
          failedItems: [],
        } as IndexingStatus,
        error: result.errors[0]?.message,
      };
    }

    return {
      indexingStatus: {
        ...result?.indexingStatus,
        shop: result?.indexingStatus?.shop || shop,
      } as IndexingStatus,
      error: undefined,
    };
  } catch (error: any) {
    // Return default status on error
    return {
      indexingStatus: {
        shop: "",
        status: "not_started" as const,
        totalIndexed: 0,
        totalFailed: 0,
        progress: 0,
        failedItems: [],
      } as IndexingStatus,
      error: error.message || "Failed to fetch indexing status",
    };
  }
};

export default function IndexingPage() {
  const { indexingStatus: initialIndexingStatus, error: initialError } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { formatDate: formatShopDate, formatNumber: formatShopNumber } = useShop();
  const [isReindexing, setIsReindexing] = useState(false);
  const [indexingStatus, setIndexingStatus] = useState<IndexingStatus | null>(initialIndexingStatus);
  const [error, setError] = useState<string | undefined>(initialError);
  const [isPolling, setIsPolling] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialStatusRef = useRef(initialIndexingStatus);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollingAttemptsRef = useRef<number>(0);
  const maxPollingAttempts = 3;
  const [expandedFaqItems, setExpandedFaqItems] = useState<Set<number>>(new Set());

  const fetchIndexingStatus = async (shop: string): Promise<IndexingStatus | null> => {
    try {
      // Create new AbortController for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const query = `
        query GetIndexingStatus($shop: String!) {
          indexingStatus(shop: $shop) {
            shop
            status
            startedAt
            completedAt
            totalLines
            totalIndexed
            totalFailed
            progress
            failedItems {
              id
              line
              error
              retryCount
            }
            error
            duration
            lastUpdatedAt
          }
        }
      `;

      const response = await fetch("/app/api/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        signal: abortController.signal,
        body: JSON.stringify({
          mutation: query,
          variables: {
            shop
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || "Failed to fetch indexing status");
        return null;
      }

      const result = await response.json();
      if (result.error || (result.errors && result.errors.length > 0)) {
        setError(result.error || result.errors?.[0]?.message || "Failed to fetch indexing status");
        return null;
      }

      if (result.indexingStatus) {
        setError(undefined);
        return result.indexingStatus as IndexingStatus;
      }

      return null;
    } catch (error: any) {
      // Ignore abort errors
      if (error.name === 'AbortError') {
        return null;
      }
      setError(error.message || "Failed to fetch indexing status");
      return null;
    }
  };

  const startPolling = (shop: string, delay: number = 3000) => {
    if (isPolling) return; // Already polling

    // Reset polling attempts counter
    pollingAttemptsRef.current = 0;

    const poll = async () => {
      setIsPolling(true);
      
      const performPoll = async () => {
        const status = await fetchIndexingStatus(shop);
        if (status) {
          setIndexingStatus(status);
          pollingAttemptsRef.current++;
          
          // If status is in_progress, continue polling until finished
          if (status.status === "in_progress") {
            // Continue polling every 2 seconds until finished
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
            }
            pollingIntervalRef.current = setInterval(async () => {
              const pollStatus = await fetchIndexingStatus(shop);
              if (pollStatus) {
                setIndexingStatus(pollStatus);
                
                // Stop polling if indexing is completed (success or failed)
                if (pollStatus.status === "success" || pollStatus.status === "failed") {
                  stopPolling();
                  setIsReindexing(false);
                  if (pollStatus.status === "success") {
                    shopify.toast.show("Product sync completed successfully!");
                  } else {
                    shopify.toast.show("Product sync failed. Check the error details below.", { isError: true });
                  }
                }
              }
            }, 2000);
          } else {
            // Status is not in_progress (success, failed, or not_started)
            // Clear any existing interval since we're not in progress
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            
            // If completed, stop polling
            if (status.status === "success" || status.status === "failed") {
              stopPolling();
              setIsReindexing(false);
              if (status.status === "success") {
                shopify.toast.show("Product sync completed successfully!");
              } else {
                shopify.toast.show("Product sync failed. Check the error details below.", { isError: true });
              }
              return;
            }
            
            // Status is not_started - poll up to max 3 times
            if (pollingAttemptsRef.current < maxPollingAttempts) {
              // Schedule next poll after 2 seconds
              if (pollingTimeoutRef.current) {
                clearTimeout(pollingTimeoutRef.current);
              }
              pollingTimeoutRef.current = setTimeout(() => {
                performPoll();
              }, 2000);
            } else {
              // Max attempts reached, stop polling
              stopPolling();
              setIsReindexing(false);
              shopify.toast.show("Sync request received. Status will update shortly.", { isError: false });
            }
          }
        } else {
          // Failed to fetch status, retry if under max attempts
          if (pollingAttemptsRef.current < maxPollingAttempts) {
            if (pollingTimeoutRef.current) {
              clearTimeout(pollingTimeoutRef.current);
            }
            pollingTimeoutRef.current = setTimeout(() => {
              performPoll();
            }, 2000);
          } else {
            stopPolling();
            setIsReindexing(false);
          }
        }
      };

      // Start polling
      performPoll();
    };

    if (delay > 0) {
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
      }
      pollingTimeoutRef.current = setTimeout(poll, delay);
    } else {
      poll();
    }
  };

  const stopPolling = () => {
    // Clear interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    // Clear timeout
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
    // Abort any ongoing fetch requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsPolling(false);
    pollingAttemptsRef.current = 0;
  };

  // Update local state when loader data changes (e.g., after navigation)
  useEffect(() => {
    setIndexingStatus(initialIndexingStatus);
    setError(initialError);
    initialStatusRef.current = initialIndexingStatus;
  }, [initialIndexingStatus, initialError]);

  // Auto-start polling if indexing is already in progress when page loads
  useEffect(() => {
    const status = initialStatusRef.current;
    if (status?.status === "in_progress" && status?.shop && !isPolling) {
      startPolling(status.shop);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  const handleReindex = async (e?: any) => {
    if (e) {
      e.preventDefault?.();
      e.stopPropagation?.();
    }

    if (isReindexing || isPolling) return; // Prevent multiple clicks

    setIsReindexing(true);
    setError(undefined);
    
    try {
      const mutation = `
        mutation ReindexProducts($shop: String!) {
          reindexProducts(shop: $shop) {
            success
            message
          }
        }
      `;

      const shop = indexingStatus?.shop || "";

      const response = await fetch("/app/api/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          mutation,
          variables: {
            shop
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        shopify.toast.show(errorData.error || "Failed to start reindexing", { isError: true });
        setIsReindexing(false);
        return;
      }

      const result = await response.json();
      if (result.error || (result.errors && result.errors.length > 0)) {
        shopify.toast.show(result.error || result.errors?.[0]?.message || "Failed to start reindexing", { isError: true });
        setIsReindexing(false);
        return;
      }

      if (result.reindexProducts) {
        if (result.reindexProducts.success) {
          shopify.toast.show(result.reindexProducts.message || "Reindexing started successfully. Monitoring progress...");
          // Start polling after 5 seconds delay
          if (shop) {
            startPolling(shop, 5000); // 5 seconds delay
          } else {
            // If no shop, try to get it from the current status or reload
            setTimeout(() => {
              navigate("/app/indexing", { replace: true });
            }, 1000);
          }
        } else {
          shopify.toast.show(result.reindexProducts.message || "Failed to start reindexing", { isError: true });
          setIsReindexing(false);
        }
      } else {
        shopify.toast.show("Reindexing started successfully. Monitoring progress...");
        // Start polling after 5 seconds delay
        if (shop) {
          startPolling(shop, 5000); // 5 seconds delay
        } else {
          setTimeout(() => {
            navigate("/app/indexing", { replace: true });
          }, 1000);
        }
      }
    } catch (error: any) {
      shopify.toast.show(error.message || "Failed to start reindexing", { isError: true });
      setIsReindexing(false);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "Never";
    return formatShopDate(dateString, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (milliseconds: number | null | undefined) => {
    if (!milliseconds) return "N/A";
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "success":
        return <s-badge tone="success">{t("indexing.status.success")}</s-badge>;
      case "failed":
        return <s-badge tone="critical">{t("indexing.status.failed")}</s-badge>;
      case "in_progress":
        return <s-badge tone="warning">{t("indexing.status.inProgress")}</s-badge>;
      case "not_started":
        return <s-badge tone="neutral">{t("indexing.status.notStarted")}</s-badge>;
      default:
        return <s-badge tone="neutral">{t("indexing.status.unknown")}</s-badge>;
    }
  };

  // Clear slots only on unmount - key prop handles remounting
  useEffect(() => {
    return () => {
      // Clear slots when component unmounts
      const pageElement = document.querySelector('s-page[data-page-id="indexing"]');
      if (pageElement) {
        const primaryAction = pageElement.querySelector('[slot="primary-action"]');
        const breadcrumbActions = pageElement.querySelectorAll('[slot="breadcrumb-actions"]');
        if (primaryAction) primaryAction.remove();
        breadcrumbActions.forEach(el => el.remove());
      }
    };
  }, []);

  return (
    <s-page key={`indexing-${location.pathname}`} heading={t("indexing.pageTitle")} data-page-id="indexing">
      {/* Indexing Status */}
      <s-section>
      <s-stack direction="block" gap="base">
        <s-heading>{t("indexing.syncStatus.title")}</s-heading>
        {error && (
          <s-banner tone="critical">
            <s-text>Error: {error}</s-text>
          </s-banner>
        )}
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
          <s-grid-item>
            <s-stack direction="block" gap="small">
              <s-text tone="auto">{t("indexing.syncStatus.status")}</s-text>
              {getStatusBadge(indexingStatus?.status)}
            </s-stack>
          </s-grid-item>
          <s-grid-item>
            <s-stack direction="block" gap="small">
              <s-text tone="auto">{t("indexing.syncStatus.progress")}</s-text>
              <s-text type="strong">
                {indexingStatus?.progress || 0}%
              </s-text>
            </s-stack>
          </s-grid-item>
          <s-grid-item>
            <s-stack direction="block" gap="small">
              <s-text tone="auto">{t("indexing.syncStatus.productsIndexed")}</s-text>
              <s-text type="strong">
                {formatShopNumber(indexingStatus?.totalIndexed || 0)}
              </s-text>
            </s-stack>
          </s-grid-item>
          <s-grid-item>
            <s-stack direction="block" gap="small">
              <s-text tone="auto">{t("indexing.syncStatus.failed")}</s-text>
              <s-text type="strong">
                {formatShopNumber(indexingStatus?.totalFailed || 0)}
              </s-text>
            </s-stack>
          </s-grid-item>
          <s-grid-item>
            <s-stack direction="block" gap="small">
              <s-text tone="auto">{t("indexing.syncStatus.startedAt")}</s-text>
              <s-text type="strong">
                {formatDate(indexingStatus?.startedAt)}
              </s-text>
            </s-stack>
          </s-grid-item>
          <s-grid-item>
            <s-stack direction="block" gap="small">
              <s-text tone="auto">{t("indexing.syncStatus.completedAt")}</s-text>
              <s-text type="strong">
                {formatDate(indexingStatus?.completedAt)}
              </s-text>
            </s-stack>
          </s-grid-item>
          {indexingStatus?.duration && (
            <s-grid-item>
              <s-stack direction="block" gap="small">
                <s-text tone="auto">{t("indexing.syncStatus.duration")}</s-text>
                <s-text type="strong">
                  {formatDuration(indexingStatus.duration)}
                </s-text>
              </s-stack>
            </s-grid-item>
          )}
        </s-grid>
        {indexingStatus?.error && (
          <s-banner tone="critical">
            <s-text>Error: {indexingStatus.error}</s-text>
          </s-banner>
        )}
        {indexingStatus?.failedItems && indexingStatus.failedItems.length > 0 && (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="small">
              <s-heading>{t("indexing.syncStatus.failedItems")} ({indexingStatus.failedItems.length})</s-heading>
              <s-table>
                <s-table-header-row>
                  <s-table-header>ID</s-table-header>
                  <s-table-header>Line</s-table-header>
                  <s-table-header>Error</s-table-header>
                  <s-table-header>Retry Count</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {indexingStatus.failedItems.map((item, index) => (
                    <s-table-row key={index}>
                      <s-table-cell>{item.id}</s-table-cell>
                      <s-table-cell>{item.line}</s-table-cell>
                      <s-table-cell>
                        <s-text tone="critical">{item.error}</s-text>
                      </s-table-cell>
                      <s-table-cell>{item.retryCount}</s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            </s-stack>
          </s-box>
        )}
        <s-button
          variant="primary"
          onClick={handleReindex}
          loading={isReindexing || isPolling || indexingStatus?.status === "in_progress"}
          disabled={isReindexing || isPolling || indexingStatus?.status === "in_progress"}
        >
          {isReindexing || isPolling || indexingStatus?.status === "in_progress" 
            ? t("indexing.syncStatus.syncing", { progress: (indexingStatus?.progress || 0).toString() }) 
            : t("indexing.syncStatus.syncButton")}
        </s-button>
      </s-stack>
      </s-section>

      {/* Documentation */}
      <s-section>
      <s-stack direction="block" gap="base">
        <s-heading>{t("indexing.documentation.title")}</s-heading>
        <s-stack direction="block" gap="small">
          <s-text>
            <strong>{t("indexing.documentation.whyRequired.question")}</strong>
          </s-text>
          <s-text tone="auto">
            {t("indexing.documentation.whyRequired.answer")}
          </s-text>
        </s-stack>
        <s-stack direction="block" gap="small">
          <s-text>
            <strong>{t("indexing.documentation.howOften.question")}</strong>
          </s-text>
          <s-text tone="auto">
            {t("indexing.documentation.howOften.answer")}
          </s-text>
        </s-stack>
      </s-stack>
      </s-section>

      {/* FAQ Section */}
        <s-stack direction="block" gap="base">
          <s-heading>{t("indexing.faq.title")}</s-heading>
          <s-stack direction="block" gap="base">
            {[
              {
                question: t("indexing.faq.items.duration.question"),
                answer: t("indexing.faq.items.duration.answer")
              },
              {
                question: t("indexing.faq.items.performance.question"),
                answer: t("indexing.faq.items.performance.answer")
              },
              {
                question: t("indexing.faq.items.failure.question"),
                answer: t("indexing.faq.items.failure.answer")
              },
              {
                question: t("indexing.faq.items.newFilter.question"),
                answer: t("indexing.faq.items.newFilter.answer")
              },
              {
                question: t("indexing.faq.items.automatic.question"),
                answer: t("indexing.faq.items.automatic.answer")
              }
            ].map((faq, index) => {
              const isExpanded = expandedFaqItems.has(index);
              return (
                <div key={index}>
                  <s-box
                    padding="base"
                    borderWidth="base"
                    borderRadius="base"
                    background={isExpanded ? "subdued" : "base"}
                  >
                    <s-stack direction="block" gap="small">
                      <s-stack direction="inline" gap="base" alignItems="center">
                        <s-button
                          variant="tertiary"
                          icon={isExpanded ? "chevron-up" : "chevron-down"}
                          onClick={() => {
                            setExpandedFaqItems(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(index)) {
                                newSet.delete(index);
                              } else {
                                newSet.add(index);
                              }
                              return newSet;
                            });
                          }}
                        />
                        <div style={{ flexGrow: 1, cursor: 'pointer' }}
                          onClick={() => {
                            setExpandedFaqItems(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(index)) {
                                newSet.delete(index);
                              } else {
                                newSet.add(index);
                              }
                              return newSet;
                            });
                          }}
                        >
                          <s-text type="strong">
                            {faq.question}
                          </s-text>
                        </div>
                      </s-stack>
                      {isExpanded && (
                        <div style={{ marginLeft: '40px' }}>
                          <s-text tone="auto">
                            {faq.answer}
                          </s-text>
                        </div>
                      )}
                    </s-stack>
                  </s-box>
                </div>
              );
            })}
          </s-stack>
        </s-stack>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

