import { useState, useEffect } from "react";
import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useLocation } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { graphqlRequest } from "app/graphql.server";
import { useTranslation, t as translate } from "app/utils/translations";

// Types - Keep in sync with app/shared/search/types.ts
// Note: Dashboard is a separate app, so we define types locally
interface SearchField {
  field: string;
  weight: number;
}

interface SearchConfig {
  id: string;
  shop: string;
  fields: SearchField[];
  updatedAt?: string | null;
  createdAt: string;
}

interface SearchPageData {
  searchConfig: SearchConfig;
  error?: string;
  shop?: string;
}

// Master list of all available ES searchable fields with default weights
const ALL_AVAILABLE_FIELDS: Array<{ field: string; defaultWeight: number }> = [
  // Default fields
  { field: "title", defaultWeight: 5 },
  { field: "vendor", defaultWeight: 1 },
  { field: "productType", defaultWeight: 1 },
  { field: "tags", defaultWeight: 3 },
  // Additional fields
  { field: "variants.title", defaultWeight: 2 },
  { field: "variants.displayName", defaultWeight: 3 },
  { field: "variants.sku", defaultWeight: 4 },
  { field: "variants.barcode", defaultWeight: 4 }
];

// Weight options keys for translation
const WEIGHT_KEYS = [
  { value: 0, key: "search.weights.disabled" },
  { value: 1, key: "search.weights.veryLow" },
  { value: 2, key: "search.weights.low" },
  { value: 3, key: "search.weights.medium" },
  { value: 4, key: "search.weights.high" },
  { value: 5, key: "search.weights.maximum" },
];

// Default fields that should be initialized
const DEFAULT_FIELDS: SearchField[] = [
  { field: "title", weight: 5 },
  { field: "variants.displayName", weight: 4 },
  { field: "variants.sku", weight: 4 },
  { field: "tags", weight: 3 },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    const shop = session?.shop || "";

    const query = `
      query GetSearchConfig($shop: String!) {
        searchConfig(shop: $shop) {
          id
          shop
          fields {
            field
            weight
          }
          updatedAt
          createdAt
        }
      }
    `;

    const result = await graphqlRequest(query, { shop });

    // Check for GraphQL errors first
    if (result.errors && result.errors.length > 0) {
      return {
        searchConfig: {
          id: "",
          shop,
          fields: [...DEFAULT_FIELDS],
          createdAt: new Date().toISOString(),
        } as SearchConfig,
        error: result.errors[0]?.message || translate("search.messages.fetchFailed"),
        shop,
      } as SearchPageData;
    }

    // Check if data exists and is valid
    if (!result || !result.searchConfig) {
      return {
        searchConfig: {
          id: "",
          shop,
          fields: [...DEFAULT_FIELDS],
          createdAt: new Date().toISOString(),
        } as SearchConfig,
        error: undefined,
        shop,
      } as SearchPageData;
    }

    // If no config exists, initialize with default fields
    const config = result.searchConfig;
    if (!config.fields || config.fields.length === 0) {
      return {
        searchConfig: {
          id: "",
          shop,
          fields: [...DEFAULT_FIELDS],
          createdAt: new Date().toISOString(),
        } as SearchConfig,
        error: undefined,
        shop,
      } as SearchPageData;
    }

    return {
      searchConfig: config,
      error: undefined,
      shop,
    } as SearchPageData;
  } catch (error: any) {
    return {
      searchConfig: {
        id: "",
        shop: session?.shop || "",
        fields: [...DEFAULT_FIELDS],
        createdAt: new Date().toISOString(),
      } as SearchConfig,
      error: error.message || translate("search.messages.fetchFailed"),
      shop: session?.shop || "",
    } as SearchPageData;
  }
};

export default function SearchPage() {
  const { searchConfig: initialConfig, error: initialError, shop } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const location = useLocation();
  const { t } = useTranslation();

  const [searchConfig, setSearchConfig] = useState<SearchConfig>(initialConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(initialError);

  // Update config when loader data changes
  useEffect(() => {
    setSearchConfig(initialConfig);
    setError(initialError);
  }, [initialConfig, initialError]);

  const handleWeightChange = (fieldIndex: number, newWeight: number) => {
    const updatedFields = [...searchConfig.fields];
    updatedFields[fieldIndex] = {
      ...updatedFields[fieldIndex],
      weight: newWeight,
    };
    setSearchConfig({
      ...searchConfig,
      fields: updatedFields,
    });
  };

  const handleSave = async () => {
    if (!shop) {
      shopify.toast.show(t("search.messages.saveFailed"), { isError: true });
      return;
    }

    setIsSaving(true);
    setError(undefined);

    try {
      const mutation = `
        mutation UpdateSearchConfig($shop: String!, $input: SearchConfigInput!) {
          updateSearchConfig(shop: $shop, input: $input) {
            id
            shop
            fields {
              field
              weight
            }
            updatedAt
            createdAt
          }
        }
      `;

      const response = await fetch("/app/api/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: mutation,
          variables: {
            shop,
            input: {
              fields: searchConfig.fields,
            },
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      const result = await response.json();

      // Check for GraphQL errors
      if (result.errors && result.errors.length > 0) {
        const errorMessage = result.errors[0]?.message || t("search.messages.saveFailed");
        setError(errorMessage);
        shopify.toast.show(errorMessage, { isError: true });
        return;
      }

      // Check if data exists
      if (!result.data) {
        throw new Error("Unexpected response format: missing data field. Response: " + JSON.stringify(result));
      }

      if (!result.data.updateSearchConfig) {
        throw new Error("Unexpected response format: missing updateSearchConfig data. Available keys: " + Object.keys(result.data || {}).join(", "));
      }

      // Update state with saved config
      setSearchConfig(result.data.updateSearchConfig);
      shopify.toast.show(t("search.messages.saved"));
    } catch (error: any) {
      const errorMessage = error.message || t("search.messages.saveFailed");
      setError(errorMessage);
      shopify.toast.show(errorMessage, { isError: true });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddField = (fieldToAdd: { field: string; defaultWeight: number }) => {
    // Check if field already exists
    if (searchConfig.fields.some(f => f.field === fieldToAdd.field)) {
      shopify.toast.show(t("search.messages.fieldExists"), { isError: true });
      return;
    }

    const newField: SearchField = {
      field: fieldToAdd.field,
      weight: fieldToAdd.defaultWeight,
    };
    setSearchConfig({
      ...searchConfig,
      fields: [...searchConfig.fields, newField],
    });
  };

  const handleRemoveField = (fieldIndex: number) => {
    if (searchConfig.fields.length <= 1) {
      shopify.toast.show(t("search.messages.minOneField"), { isError: true });
      return;
    }
    const updatedFields = searchConfig.fields.filter((_, index) => index !== fieldIndex);
    setSearchConfig({
      ...searchConfig,
      fields: updatedFields,
    });
  };

  // Get fields that are not yet added (available to add)
  const addedFieldNames = new Set(searchConfig.fields.map(f => f.field));
  const availableFieldsToAdd = ALL_AVAILABLE_FIELDS.filter(
    field => !addedFieldNames.has(field.field)
  );

  return (
    <s-page key={`search-${location.pathname}`} heading={t("search.pageTitle")} data-page-id="search">
      {error && (
        <s-section>
          <s-banner tone="critical">
            <s-text>{t("common.error")}: {error}</s-text>
          </s-banner>
        </s-section>
      )}

      <s-stack alignItems="end" padding="base none base none">
        <s-button
          variant="primary"
          onClick={handleSave}
          loading={isSaving}
          disabled={searchConfig.fields.length === 0}
          accessibilityLabel={t("search.saveButton")}
        >
          {t("search.saveButton")}
        </s-button>
      </s-stack>

      <s-section>
        <s-stack direction="block" gap="base">
          <s-stack direction="block" gap="small">
            <s-heading>{t("search.searchableFields.title")}</s-heading>
            <s-text tone="auto">
              {t("search.searchableFields.description")}
            </s-text>
          </s-stack>

          {/* Available Fields to Add */}
          {availableFieldsToAdd.length > 0 && (
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <s-stack direction="block" gap="small">
                <s-text tone="auto">
                  {t("search.searchableFields.addFieldPrompt")}
                </s-text>
                <s-stack gap="base" direction="inline">
                  {availableFieldsToAdd.map((field, i) => (
                    <s-chip
                      color="strong"
                      accessibilityLabel={field.field}
                      id={String(field.field)}
                      key={`${i}${field.field}`}
                    >
                      <s-stack direction="inline" alignItems="center">
                        <s-text type="strong">{field.field}</s-text>
                        <s-button
                          icon="plus-circle"
                          accessibilityLabel={t("search.searchableFields.addButton")}
                          tone="neutral"
                          variant="tertiary"
                          onClick={() => handleAddField(field)}
                        ></s-button>
                      </s-stack>
                    </s-chip>
                  ))}
                </s-stack>
              </s-stack>
            </s-box>
          )}

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="base"
          >
            <s-stack direction="block" gap="base">
              <s-table variant="auto">
                <s-table-header-row>
                  <s-table-header>{t("search.table.fieldName")}</s-table-header>
                  <s-table-header>{t("search.table.weight")}</s-table-header>
                  <s-table-header>{t("search.table.actions")}</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {searchConfig.fields.map((field, index) => (
                    <s-table-row key={`${field.field}-${index}`}>
                      <s-table-cell>
                        <s-text type="strong">{field.field}</s-text>
                      </s-table-cell>
                      <s-table-cell>
                        <s-select
                          value={field.weight.toString()}
                          onChange={(e: any) => handleWeightChange(index, parseFloat(e.target.value))}
                          label={t("search.table.labelAccessibility")}
                          labelAccessibilityVisibility="exclusive"
                        >
                          {WEIGHT_KEYS.map((option) => (
                            <s-option key={option.value} value={String(option.value)}>
                              {t(option.key)}
                            </s-option>
                          ))}
                        </s-select>
                      </s-table-cell>
                      <s-table-cell>
                        <s-button
                          variant="secondary"
                          tone="critical"
                          onClick={() => handleRemoveField(index)}
                          icon="delete"
                          accessibilityLabel={t("search.table.removeButton")}
                          disabled={searchConfig.fields.length <= 1}
                        >
                          {t("common.remove")}
                        </s-button>
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>

              <s-stack direction="block" gap="small">
                <s-text tone="auto">
                  {t("search.searchableFields.activeFields", { count: searchConfig.fields.length.toString() })}
                </s-text>
              </s-stack>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      <s-section padding="base">
          <s-stack direction="block" gap="small">
            <s-text type="strong">{t("search.howItWorks.title")}</s-text>
            <s-text tone="auto">
              {t("search.howItWorks.description")}
            </s-text>
            <s-unordered-list>
              <s-list-item>
                <s-text tone="auto">
                  <s-text type="strong">{t("search.howItWorks.labels.weight5")}</s-text> {t("search.howItWorks.weight5")}
                </s-text>
              </s-list-item>
              <s-list-item>
                <s-text tone="auto">
                  <s-text type="strong">{t("search.howItWorks.labels.weight4")}</s-text> {t("search.howItWorks.weight4")}
                </s-text>
              </s-list-item>
              <s-list-item>
                <s-text tone="auto">
                  <s-text type="strong">{t("search.howItWorks.labels.weight3")}</s-text> {t("search.howItWorks.weight3")}
                </s-text>
              </s-list-item>
              <s-list-item>
                <s-text tone="auto">
                  <s-text type="strong">{t("search.howItWorks.labels.weight2")}</s-text> {t("search.howItWorks.weight2")}
                </s-text>
              </s-list-item>
              <s-list-item>
                <s-text tone="auto">
                  <s-text type="strong">{t("search.howItWorks.labels.weight1")}</s-text> {t("search.howItWorks.weight1")}
                </s-text>
              </s-list-item>
              <s-list-item>
                <s-text tone="auto">
                  <s-text type="strong">{t("search.howItWorks.labels.weight0")}</s-text> {t("search.howItWorks.weight0")}
                </s-text>
              </s-list-item>
            </s-unordered-list>
            <s-text tone="auto">
              <s-text type="strong">{t("search.howItWorks.labels.bestPractice")}</s-text> {t("search.howItWorks.bestPractice")}
            </s-text>
          </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
