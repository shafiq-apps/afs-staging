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
  { field: "title", defaultWeight: 10 },
  { field: "vendor", defaultWeight: 2 },
  { field: "productType", defaultWeight: 1 },
  { field: "tags", defaultWeight: 5 },
  // Additional fields
  { field: "variants.title", defaultWeight: 3 },
  { field: "variants.displayName", defaultWeight: 4 },
  { field: "variants.sku", defaultWeight: 5 },
  { field: "variants.barcode", defaultWeight: 7 }
];

// Weight options for select dropdown
const WEIGHT_OPTIONS = [
  { value: 1, label: "Very Low" },
  { value: 2, label: "Low" },
  { value: 3, label: "Below Average" },
  { value: 4, label: "Average" },
  { value: 5, label: "Above Average" },
  { value: 6, label: "High" },
  { value: 7, label: "Very High" },
  { value: 8, label: "Critical" },
  { value: 9, label: "Dominant" },
  { value: 10, label: "Maximum" },
];

// Default fields that should be initialized
const DEFAULT_FIELDS: SearchField[] = [
  { field: "title", weight: 10 },
  { field: "vendor", weight: 2 },
  { field: "productType", weight: 1 },
  { field: "tags", weight: 5 },
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

    if (result.errors) {
      return {
        searchConfig: {
          id: "",
          shop,
          fields: [...DEFAULT_FIELDS],
          createdAt: new Date().toISOString(),
        } as SearchConfig,
        error: result.errors[0]?.message || "Failed to fetch search configuration",
        shop,
      } as SearchPageData;
    }

    // If no config exists, initialize with default fields
    const config = result?.searchConfig;
    if (!config || !config.fields || config.fields.length === 0) {
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
      error: error.message || "Failed to fetch search configuration",
      shop: session?.shop || "",
    } as SearchPageData;
  }
};

export default function SearchPage() {
  const { searchConfig: initialConfig, error: initialError, shop } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const location = useLocation();

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
      shopify.toast.show("Shop information is missing", { isError: true });
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

      const result = await response.json();

      if (result.errors && result.errors.length > 0) {
        const errorMessage = result.errors[0]?.message || "Failed to update search configuration";
        setError(errorMessage);
        shopify.toast.show(errorMessage, { isError: true });
      } else if (result.data?.updateSearchConfig) {
        setSearchConfig(result.data.updateSearchConfig);
        shopify.toast.show("Search configuration saved successfully");
      } else {
        throw new Error("Unexpected response format");
      }
    } catch (error: any) {
      const errorMessage = error.message || "Failed to save search configuration";
      setError(errorMessage);
      shopify.toast.show(errorMessage, { isError: true });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddField = (fieldToAdd: { field: string; defaultWeight: number }) => {
    // Check if field already exists
    if (searchConfig.fields.some(f => f.field === fieldToAdd.field)) {
      shopify.toast.show("This field is already added", { isError: true });
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
      shopify.toast.show("At least one search field is required", { isError: true });
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
    <s-page key={`search-${location.pathname}`} heading="Search Configuration" data-page-id="search">
      {error && (
        <s-section>
          <s-banner tone="critical">
            <s-text>Error: {error}</s-text>
          </s-banner>
        </s-section>
      )}

      <s-section>
        <s-stack direction="block" gap="base">
          <s-stack direction="block" gap="small">
            <s-heading>Searchable Fields</s-heading>
            <s-text tone="auto">
              Configure which fields are searchable and their relative importance (weight).
              Higher weights mean the field has more influence on search results.
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
                  Click on a field below to add it to your search configuration
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
                          accessibilityLabel="add field"
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
                  <s-table-header>Field Name</s-table-header>
                  <s-table-header>Weight</s-table-header>
                  <s-table-header>Actions</s-table-header>
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
                          label="Weight"
                          labelAccessibilityVisibility="exclusive"
                        >
                          {WEIGHT_OPTIONS.map((option) => (
                            <s-option key={option.value} value={String(option.value)}>
                              {option.label}
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
                          accessibilityLabel="Remove field"
                          disabled={searchConfig.fields.length <= 1}
                        >
                          Remove
                        </s-button>
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>

              <s-stack direction="block" gap="small">
                <s-text tone="auto">
                  {searchConfig.fields.length} active search field(s)
                </s-text>
              </s-stack>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Information</s-heading>
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="small">
              <s-text type="strong">How Search Weights Work</s-text>
              <s-text tone="auto">
                Search weights determine the relative importance of each field when matching search queries.
                Fields with higher weights will have more influence on search result rankings.
              </s-text>
              <s-unordered-list>
                <s-list-item>
                  <s-text tone="auto">
                    <s-text type="strong">Weight 5-10:</s-text> Very high priority (e.g., Product Title)
                  </s-text>
                </s-list-item>
                <s-list-item>
                  <s-text tone="auto">
                    <s-text type="strong">Weight 3-4:</s-text> High priority (e.g., Vendor, Brand)
                  </s-text>
                </s-list-item>
                <s-list-item>
                  <s-text tone="auto">
                    <s-text type="strong">Weight 1-2:</s-text> Medium priority (e.g., Product Type, Tags)
                  </s-text>
                </s-list-item>
                <s-list-item>
                  <s-text tone="auto">
                    <s-text type="strong">Weight 0.1-0.9:</s-text> Low priority (e.g., Description, Metafields)
                  </s-text>
                </s-list-item>
              </s-unordered-list>
              <s-text tone="auto">
                <s-text type="strong">Note:</s-text> Only active fields in the array will be used in search queries.
                When you remove a field, it becomes available to add again.
              </s-text>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      <s-section>
        <s-stack direction="inline" gap="base" alignItems="end">
          <s-button
            variant="primary"
            onClick={handleSave}
            loading={isSaving}
            disabled={searchConfig.fields.length === 0}
            accessibilityLabel="Save search configuration"
          >
            Save Configuration
          </s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
