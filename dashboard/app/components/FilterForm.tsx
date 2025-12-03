import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from "react";
import { useNavigate, useRevalidator, useLocation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "../utils/translations";
import { generateFilterHandle, generateOptionId } from "../utils/id-generator";

interface FilterOption {
  // Identification
  handle: string;
  position: number;
  optionId: string;
  
  // Basic Configuration
  label: string;
  optionType: string;
  status: string;
  
  // Display Configuration
  displayType: string;
  selectionType: string;
  
  // Value Selection & Filtering
  baseOptionType?: string;
  selectedValues: string[];
  allowedOptions: string[];
  filterByPrefix: string[];
  removePrefix: string[];
  removeSuffix: string[];
  replaceText: Array<{ from: string; to: string }>;
  
  // Value Grouping & Normalization
  groupBySimilarValues: boolean;
  valueNormalization: Record<string, string>;
  
  // Display Options
  collapsed: boolean;
  searchable: boolean;
  showTooltip: boolean;
  tooltipContent: string;
  showCount: boolean;
  
  // Sorting
  sortBy: string;
  manualSortedValues: string[];
  
  // Advanced
  targetScope: string;
  textTransform: string;
  paginationType: string;
  groups: string[];
  menus: string[];
  showMenu: boolean;
  
  // Price-specific
  minPrice?: number;
  maxPrice?: number;
  
  // Performance Optimization: Pre-computed variant option keys
  variantOptionKey?: string;
}

interface CollectionReference {
  label: string;
  value: string;
  id: string;
}

interface StorefrontFilterData {
  vendors: Array<{ value: string; count: number }>;
  productTypes: Array<{ value: string; count: number }>;
  tags: Array<{ value: string; count: number }>;
  collections: Array<{ value: string; count: number }>;
  options: Record<string, Array<{ value: string; count: number }>>;
  priceRange: {
    min: number;
    max: number;
  };
}

interface MenuTreeNode {
  id: string;
  label: string;
  children?: MenuTreeNode[];
}

interface FilterFormProps {
  mode: "create" | "edit";
  initialFilter?: {
    id?: string;
    title: string;
    description?: string;
    status: string;
    targetScope: string;
    allowedCollections: CollectionReference[];
    options: FilterOption[];
    settings?: {
      defaultView?: string;
      filterOrientation?: string;
    };
  } | null;
  shop: string;
  graphqlEndpoint: string;
  storefrontFilters: StorefrontFilterData | null;
  onSave?: () => void;
  onSavingChange?: (isSaving: boolean) => void;
}

const BASE_FILTER_TYPES = [
  "Collection",
  "Product Type",
  "Vendor",
  "Tags",
  "Price",
  "Availability",
  "Metafield",
];

const SELECTION_TYPES = {
  all: ["multiple", "single"],
  price: ["range"],
};

const DISPLAY_TYPES = {
  list: ["list", "dropdown", "grid"],
  price: ["range"],
};

// Menu Tree Builder Component
function MenuTreeBuilder({ 
  value, 
  onChange, 
  availableValues 
}: { 
  value: string[]; 
  onChange: (value: string[]) => void;
  availableValues: Array<{ value: string; count: number }>;
}) {
  const [tree, setTree] = useState<MenuTreeNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const buildTree = (items: string[]): MenuTreeNode[] => {
      const treeMap: Record<string, MenuTreeNode> = {};
      
      items.forEach(item => {
        const parts = item.split(' > ');
        let currentPath = '';
        
        parts.forEach((part, index) => {
          const path = currentPath ? `${currentPath} > ${part}` : part;
          
          if (!treeMap[path]) {
            treeMap[path] = {
              id: path,
              label: part,
              children: [],
            };
            
            if (currentPath && treeMap[currentPath]) {
              if (!treeMap[currentPath].children) {
                treeMap[currentPath].children = [];
              }
              treeMap[currentPath].children!.push(treeMap[path]);
            }
          }
          
          currentPath = path;
        });
      });
      
      return Object.values(treeMap).filter(node => !node.id.includes(' > '));
    };
    
    if (value.length > 0) {
      setTree(buildTree(value));
    }
  }, [value]);

  const addRootNode = () => {
    const label = prompt("Enter menu item name:");
    if (label && label.trim()) {
      const newValue = [...value, label.trim()];
      onChange(newValue);
    }
  };

  const addChildNode = (parentPath: string) => {
    const label = prompt("Enter submenu item name:");
    if (label && label.trim()) {
      const newPath = `${parentPath} > ${label.trim()}`;
      const newValue = [...value, newPath];
      onChange(newValue);
    }
  };

  const removeNode = (path: string) => {
    const newValue = value.filter(v => v !== path && !v.startsWith(path + ' > '));
    onChange(newValue);
  };

  const toggleExpand = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const renderNode = (node: MenuTreeNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    
    return (
      <div key={node.id} style={{ marginLeft: `${level * 24}px`, marginTop: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {hasChildren && (
            <button
              type="button"
              onClick={() => toggleExpand(node.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                fontSize: '12px'
              }}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
          {!hasChildren && <span style={{ width: '20px' }} />}
          <span style={{ flex: 1 }}>{node.label}</span>
          <s-button
            variant="tertiary"
            onClick={() => addChildNode(node.id)}
            icon="plus"
          />
          <s-button
            variant="tertiary"
            tone="critical"
            onClick={() => removeNode(node.id)}
            icon="delete"
          />
        </div>
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
      <s-stack direction="block" gap="small">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: '600', fontSize: '14px' }}>Menu Structure</span>
          <s-button variant="secondary" onClick={addRootNode} icon="plus">
            Add Category
          </s-button>
        </div>
        {tree.length === 0 ? (
          <span style={{ color: 'var(--p-color-text-subdued)', fontSize: '14px' }}>
            No menu items yet. Click "Add Category" to create a menu structure.
          </span>
        ) : (
          <div>
            {tree.map(node => renderNode(node))}
          </div>
        )}
        {value.length > 0 && (
          <div style={{ marginTop: '12px', padding: '8px', backgroundColor: 'var(--p-color-bg-surface)', borderRadius: '4px' }}>
            <span style={{ fontSize: '12px', color: 'var(--p-color-text-subdued)' }}>
              Menu paths: {value.join(', ')}
            </span>
          </div>
        )}
      </s-stack>
    </s-box>
  );
}

// Multi-Select Component for Allowed Options
function AllowedOptionsSelector({
  value,
  onChange,
  availableValues
}: {
  value: string[];
  onChange: (value: string[]) => void;
  availableValues: Array<{ value: string; count: number }>;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const filteredValues = availableValues.filter(item => 
    item.value.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleValue = (val: string) => {
    if (value.includes(val)) {
      onChange(value.filter(v => v !== val));
    } else {
      onChange([...value, val]);
    }
  };

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
      <s-stack direction="block" gap="small">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: '600', fontSize: '14px' }}>Select Allowed Values</span>
          <span style={{ fontSize: '12px', color: 'var(--p-color-text-subdued)' }}>
            {value.length} selected
          </span>
        </div>
        <s-text-field
          placeholder="Search values..."
          value={searchTerm}
          onChange={(e: any) => setSearchTerm(e.target.value)}
        />
        <div style={{ 
          maxHeight: '200px', 
          overflowY: 'auto', 
          border: '1px solid var(--p-color-border-subdued)',
          borderRadius: '4px',
          padding: '8px'
        }}>
          {filteredValues.length === 0 ? (
            <span style={{ color: 'var(--p-color-text-subdued)' }}>No values found</span>
          ) : (
            <s-stack direction="block" gap="small">
              {filteredValues.slice(0, 50).map((item) => (
                <label key={item.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={value.includes(item.value)}
                    onChange={() => toggleValue(item.value)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>{item.value}</span>
                  <span style={{ color: 'var(--p-color-text-subdued)', fontSize: '12px' }}>
                    ({item.count})
                  </span>
                </label>
              ))}
            </s-stack>
          )}
        </div>
        {value.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <s-button
              variant="tertiary"
              onClick={() => onChange([])}
            >
              Clear Selection
            </s-button>
          </div>
        )}
      </s-stack>
    </s-box>
  );
}

export interface FilterFormHandle {
  save: () => Promise<void>;
  isSaving: boolean;
}

const FilterForm = forwardRef<FilterFormHandle, FilterFormProps>(function FilterForm({
  mode,
  initialFilter,
  shop,
  graphqlEndpoint,
  storefrontFilters,
  onSave,
  onSavingChange
}, ref) {
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();
  const location = useLocation();
  const { t } = useTranslation();

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("published"); // "published" = active, "draft" = inactive
  const [titleError, setTitleError] = useState("");
  const [optionsError, setOptionsError] = useState("");
  const [collectionsError, setCollectionsError] = useState("");
  const titleInputId = `title-input-${mode}`;
  const [targetScope, setTargetScope] = useState("all");
  const [selectedCollections, setSelectedCollections] = useState<CollectionReference[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOption[]>([]);
  const [expandedOptions, setExpandedOptions] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [generalSettingsExpanded, setGeneralSettingsExpanded] = useState<boolean>(false);
  
  // General/Global Settings
  const [filterOrientation, setFilterOrientation] = useState<string>("vertical");
  const [defaultView, setDefaultView] = useState<string>("grid");
  const [showFilterCount, setShowFilterCount] = useState<boolean>(true);
  const [showActiveFilters, setShowActiveFilters] = useState<boolean>(true);
  const [gridColumns, setGridColumns] = useState<number>(3);
  const [showProductCount, setShowProductCount] = useState<boolean>(true);
  const [showSortOptions, setShowSortOptions] = useState<boolean>(true);

  // Store initial state for revert functionality
  const [initialState, setInitialState] = useState<{
    title: string;
    status: string;
    targetScope: string;
    selectedCollections: CollectionReference[];
    filterOptions: FilterOption[];
    filterOrientation: string;
    defaultView: string;
    showFilterCount: boolean;
    showActiveFilters: boolean;
    gridColumns: number;
    showProductCount: boolean;
    showSortOptions: boolean;
  } | null>(null);

  /**
   * Map optionType to the correct baseOptionType category name
   * baseOptionType should be one of: "Price", "Vendor", "Product Type", "Tags", "Collection", "Option"
   */
  const getBaseOptionType = useCallback((optionType: string): string => {
    const normalizedType = optionType?.toLowerCase().trim();
    
    // Standard filter types
    if (normalizedType === "price") return "Price";
    if (normalizedType === "vendor") return "Vendor";
    if (normalizedType === "product type" || normalizedType === "producttype") return "Product Type";
    if (normalizedType === "tags" || normalizedType === "tag") return "Tags";
    if (normalizedType === "collection" || normalizedType === "collections") return "Collection";
    
    // Variant options (color, size, material, etc.) use "Option"
    // These are dynamic variant options that come from product data
    return "Option";
  }, []);

  const handleOpenCollectionPicker = useCallback(async () => {
    if (!shopify) return;

    try {
      const preselected = selectedCollections
        .filter((c) => c.id)
        .map((c) => ({ id: c.id }));

      const result = await shopify.resourcePicker({
        type: 'collection',
        multiple: true,
        action: 'select',
        selectionIds: preselected,
        filter: {
          hidden: false,
          archived: false
        }
      });

      if (result && Array.isArray(result)) {
        const newCollections: CollectionReference[] = result.map((collection: any) => ({
          id: collection.id || "",
          label: collection.title || "",
          value: collection.handle || collection.id || "",
        }));
        setSelectedCollections(newCollections);
        // Clear collections error when collections are selected
        if (collectionsError) setCollectionsError("");
      }
    } catch (error) {
      shopify.toast.show('Failed to open collection picker', { isError: true });
    }
  }, [shopify, selectedCollections]);

  useEffect(() => {
    if (mode === "edit" && initialFilter) {
      const normalizedOptions = (initialFilter.options || []).map((option: FilterOption) => ({
        ...option,
        selectedValues: option.selectedValues ?? [],
        allowedOptions: option.allowedOptions ?? [],
        groups: option.groups ?? [],
        removePrefix: option.removePrefix ?? [],
        removeSuffix: option.removeSuffix ?? [],
        replaceText: option.replaceText ?? [],
        filterByPrefix: option.filterByPrefix ?? [],
        manualSortedValues: option.manualSortedValues ?? [],
        valueNormalization: option.valueNormalization ?? {},
        tooltipContent: option.tooltipContent ?? "",
        menus: option.menus ?? [],
        showTooltip: option.showTooltip ?? false,
        showCount: option.showCount ?? true,
        // Ensure baseOptionType is set correctly, fallback to mapping from optionType
        baseOptionType: option.baseOptionType || getBaseOptionType(option.optionType),
      }));

      const initState = {
        title: initialFilter.title || "",
        status: initialFilter.status || "published",
        targetScope: initialFilter.targetScope || "all",
        selectedCollections: JSON.parse(JSON.stringify(initialFilter.allowedCollections || [])),
        filterOptions: JSON.parse(JSON.stringify(normalizedOptions)),
        filterOrientation: initialFilter.settings?.filterOrientation || "vertical",
        defaultView: initialFilter.settings?.defaultView || "grid",
        showFilterCount: true,
        showActiveFilters: true,
        gridColumns: 3,
        showProductCount: true,
        showSortOptions: true,
      };
      setInitialState(initState);
      
      setTitle(initState.title);
      setStatus(initState.status);
      setTargetScope(initState.targetScope);
      setSelectedCollections(initState.selectedCollections);
      setFilterOptions(initState.filterOptions);
      
      // Load general settings
      setFilterOrientation(initState.filterOrientation);
      setDefaultView(initState.defaultView);
      setShowFilterCount(initState.showFilterCount);
      setShowActiveFilters(initState.showActiveFilters);
      setGridColumns(initState.gridColumns);
      setShowProductCount(initState.showProductCount);
      setShowSortOptions(initState.showSortOptions);
    } else {
      // Create mode - set defaults and auto-populate filter options
      setFilterOrientation("vertical");
      setDefaultView("grid");
      setShowFilterCount(true);
      setShowActiveFilters(true);
      setGridColumns(3);
      setShowProductCount(true);
      setShowSortOptions(true);
      
      // Auto-populate filter options from storefrontFilters
      if (storefrontFilters && filterOptions.length === 0) {
        const autoOptions: FilterOption[] = [];
        let position = 0;

        // Add Price filter
        if (storefrontFilters.priceRange) {
          autoOptions.push({
            handle: generateFilterHandle('price'),
            position: position++,
            optionId: generateOptionId(),
            label: "Price",
            optionType: "Price",
            displayType: "range",
            selectionType: "range",
            targetScope: "all",
            selectedValues: [],
            allowedOptions: [],
            groups: [],
            collapsed: false,
            searchable: false,
            showTooltip: false,
            tooltipContent: "",
            showCount: false,
            removePrefix: [],
            removeSuffix: [],
            replaceText: [],
            filterByPrefix: [],
            sortBy: "ascending",
            manualSortedValues: [],
            valueNormalization: {},
            menus: [],
            showMenu: false,
            textTransform: "none",
            paginationType: "scroll",
            groupBySimilarValues: false,
            status: "published",
            minPrice: storefrontFilters.priceRange.min,
            maxPrice: storefrontFilters.priceRange.max,
            baseOptionType: "Price",
          });
        }

        // Add Vendor filter
        if (storefrontFilters.vendors && storefrontFilters.vendors.length > 0) {
          autoOptions.push({
            handle: generateFilterHandle('vendor'),
            position: position++,
            optionId: generateOptionId(),
            label: "Vendor",
            optionType: "Vendor",
            displayType: "list",
            selectionType: "multiple",
            targetScope: "all",
            selectedValues: [],
            allowedOptions: [],
            groups: [],
            collapsed: false,
            searchable: true,
            showTooltip: false,
            tooltipContent: "",
            showCount: true,
            removePrefix: [],
            removeSuffix: [],
            replaceText: [],
            filterByPrefix: [],
            sortBy: "ascending",
            manualSortedValues: [],
            valueNormalization: {},
            menus: [],
            showMenu: false,
            textTransform: "none",
            paginationType: "scroll",
            groupBySimilarValues: false,
            status: "published",
            baseOptionType: "Vendor",
          });
        }

        // Add Product Type filter
        if (storefrontFilters.productTypes && storefrontFilters.productTypes.length > 0) {
          autoOptions.push({
            handle: generateFilterHandle('product-type'),
            position: position++,
            optionId: generateOptionId(),
            label: "Product Type",
            optionType: "Product Type",
            displayType: "list",
            selectionType: "multiple",
            targetScope: "all",
            selectedValues: [],
            allowedOptions: [],
            groups: [],
            collapsed: false,
            searchable: true,
            showTooltip: false,
            tooltipContent: "",
            showCount: true,
            removePrefix: [],
            removeSuffix: [],
            replaceText: [],
            filterByPrefix: [],
            sortBy: "ascending",
            manualSortedValues: [],
            valueNormalization: {},
            menus: [],
            showMenu: false,
            textTransform: "none",
            paginationType: "scroll",
            groupBySimilarValues: false,
            status: "published",
            baseOptionType: "Product Type",
          });
        }

        // Add Tags filter
        if (storefrontFilters.tags && storefrontFilters.tags.length > 0) {
          autoOptions.push({
            handle: generateFilterHandle('tags'),
            position: position++,
            optionId: generateOptionId(),
            label: "Tags",
            optionType: "Tags",
            displayType: "list",
            selectionType: "multiple",
            targetScope: "all",
            selectedValues: [],
            allowedOptions: [],
            groups: [],
            collapsed: false,
            searchable: true,
            showTooltip: false,
            tooltipContent: "",
            showCount: true,
            removePrefix: [],
            removeSuffix: [],
            replaceText: [],
            filterByPrefix: [],
            sortBy: "ascending",
            manualSortedValues: [],
            valueNormalization: {},
            menus: [],
            showMenu: false,
            textTransform: "none",
            paginationType: "scroll",
            groupBySimilarValues: false,
            status: "published",
            baseOptionType: "Tags",
          });
        }

        // Add Collection filter
        if (storefrontFilters.collections && storefrontFilters.collections.length > 0) {
          autoOptions.push({
            handle: generateFilterHandle('collection'),
            position: position++,
            optionId: generateOptionId(),
            label: "Collection",
            optionType: "Collection",
            displayType: "list",
            selectionType: "multiple",
            targetScope: "all",
            selectedValues: [],
            allowedOptions: [],
            groups: [],
            collapsed: false,
            searchable: true,
            showTooltip: false,
            tooltipContent: "",
            showCount: true,
            removePrefix: [],
            removeSuffix: [],
            replaceText: [],
            filterByPrefix: [],
            sortBy: "ascending",
            manualSortedValues: [],
            valueNormalization: {},
            menus: [],
            showMenu: false,
            textTransform: "none",
            paginationType: "scroll",
            groupBySimilarValues: false,
            status: "published",
            baseOptionType: "Collection",
          });
        }

        // Add dynamic variant options
        if (storefrontFilters.options) {
          Object.keys(storefrontFilters.options).forEach((optionKey) => {
            const optionValues = storefrontFilters.options[optionKey];
            if (optionValues && optionValues.length > 0) {
              // Normalize variant option key to lowercase for consistent comparison
              // This ensures variantOptionKey matches the format used in aggregation filtering
              const normalizedOptionKey = optionKey.toLowerCase().trim();
              
              autoOptions.push({
                handle: generateFilterHandle(optionKey),
                position: position++,
                optionId: generateOptionId(),
                label: optionKey.charAt(0).toUpperCase() + optionKey.slice(1),
                optionType: optionKey,
                displayType: "list",
                selectionType: "multiple",
                targetScope: "all",
                selectedValues: [],
                allowedOptions: [],
                groups: [],
                collapsed: false,
                searchable: true,
                showTooltip: false,
                tooltipContent: "",
                showCount: true,
                removePrefix: [],
                removeSuffix: [],
                replaceText: [],
                filterByPrefix: [],
                sortBy: "ascending",
                manualSortedValues: [],
                valueNormalization: {},
                menus: [],
                showMenu: false,
                textTransform: "none",
                paginationType: "scroll",
                groupBySimilarValues: false,
                status: "published",
                // baseOptionType should be the actual category name, not the variant option key
                // For variant options (color, size, etc.), use "Option" as the base type
                baseOptionType: "Option",
                // Performance Optimization: Store normalized variant option key for faster aggregations
                // Key is normalized to lowercase to match the format used in aggregation filtering
                variantOptionKey: normalizedOptionKey,
              });
            }
          });
        }

        setFilterOptions(autoOptions);
        
        // Set initial state with auto-populated options for create mode
        const createInitState = {
          title: "",
          status: "published",
          targetScope: "all",
          selectedCollections: [],
          filterOptions: JSON.parse(JSON.stringify(autoOptions)),
          filterOrientation: "vertical",
          defaultView: "grid",
          showFilterCount: true,
          showActiveFilters: true,
          gridColumns: 3,
          showProductCount: true,
          showSortOptions: true,
        };
        setInitialState(createInitState);
      } else if (mode === "create") {
        // Create mode without auto-population - set empty initial state
        const createInitState = {
          title: "",
          status: "published",
          targetScope: "all",
          selectedCollections: [],
          filterOptions: [],
          filterOrientation: "vertical",
          defaultView: "grid",
          showFilterCount: true,
          showActiveFilters: true,
          gridColumns: 3,
          showProductCount: true,
          showSortOptions: true,
        };
        setInitialState(createInitState);
      }
    }
  }, [mode, initialFilter, storefrontFilters]);

  // Focus title input on mount for create mode
  useEffect(() => {
    if (mode === "create") {
      setTimeout(() => {
        const titleInput = document.getElementById(titleInputId) as HTMLInputElement;
        if (titleInput) {
          titleInput.focus();
        }
      }, 100);
    }
  }, [mode, titleInputId]);

  const handleTargetScope = useCallback((event: any) => {
    if (event.currentTarget?.values?.[0]) {
      const newScope = event.currentTarget?.values?.[0];
      setTargetScope(newScope);
      // Clear collections error when switching away from "entitled" or when collections are already selected
      if (newScope !== "entitled" || selectedCollections.length > 0) {
        setCollectionsError("");
      }
    }
  }, [selectedCollections.length, collectionsError]);

  useEffect(() => {
    if (!initialState) return;
    
    const changed = 
      title !== initialState.title ||
      status !== initialState.status ||
      targetScope !== initialState.targetScope ||
      JSON.stringify(selectedCollections) !== JSON.stringify(initialState.selectedCollections) ||
      JSON.stringify(filterOptions) !== JSON.stringify(initialState.filterOptions) ||
      filterOrientation !== initialState.filterOrientation ||
      defaultView !== initialState.defaultView ||
      showFilterCount !== initialState.showFilterCount ||
      showActiveFilters !== initialState.showActiveFilters ||
      gridColumns !== initialState.gridColumns ||
      showProductCount !== initialState.showProductCount ||
      showSortOptions !== initialState.showSortOptions;
    
    setHasChanges(changed);
    
    // Show/hide save bar based on changes
    // Use a small delay to ensure the form element is in the DOM
    const timeoutId = setTimeout(() => {
      // Find the form by ID
      const form = document.getElementById('filter-form') as HTMLFormElement;
      if (form) {
        if (changed) {
          form.setAttribute('data-save-bar', '');
          form.setAttribute('data-discard-confirmation', '');
        } else {
          form.removeAttribute('data-save-bar');
          form.removeAttribute('data-discard-confirmation');
          // Dispatch dismiss event
          const dismissEvent = new CustomEvent('shopify:save-bar:dismiss', { bubbles: true });
          form.dispatchEvent(dismissEvent);
        }
      }
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [title, status, targetScope, selectedCollections, filterOptions, filterOrientation, defaultView, showFilterCount, showActiveFilters, gridColumns, showProductCount, showSortOptions, initialState]);

  // Dismiss save bar on unmount to prevent it from persisting on other pages
  useEffect(() => {
    return () => {
      // Cleanup: dismiss save bar when component unmounts (e.g., when navigating away)
      const form = document.querySelector('form[data-save-bar]') as HTMLFormElement;
      if (form) {
        // Try to find and hide the save bar element
        const saveBar = document.querySelector('s-save-bar');
        if (saveBar) {
          (saveBar as any).style.display = 'none';
        }
        // Dispatch dismiss event
        const dismissEvent = new CustomEvent('shopify:save-bar:dismiss', { bubbles: true });
        form.dispatchEvent(dismissEvent);
      }
    };
  }, []);

  // Function to revert all changes to initial state
  const revertToInitialState = useCallback(() => {
    if (!initialState) return;
    
    setTitle(initialState.title);
    setStatus(initialState.status);
    setTargetScope(initialState.targetScope);
    setSelectedCollections(JSON.parse(JSON.stringify(initialState.selectedCollections)));
    setFilterOptions(JSON.parse(JSON.stringify(initialState.filterOptions)));
    setFilterOrientation(initialState.filterOrientation);
    setDefaultView(initialState.defaultView);
    setShowFilterCount(initialState.showFilterCount);
    setShowActiveFilters(initialState.showActiveFilters);
    setGridColumns(initialState.gridColumns);
    setShowProductCount(initialState.showProductCount);
    setShowSortOptions(initialState.showSortOptions);
    setHasChanges(false);
    
    // Remove data-save-bar to hide the save bar
    const form = document.querySelector('form[data-save-bar]') as HTMLFormElement;
    if (form) {
      form.removeAttribute('data-save-bar');
      form.removeAttribute('data-discard-confirmation');
      // Dispatch dismiss event
      const dismissEvent = new CustomEvent('shopify:save-bar:dismiss', { bubbles: true });
      form.dispatchEvent(dismissEvent);
    }
  }, [initialState]);

  const handleAddFilterOption = () => {
    const newOption: FilterOption = {
      handle: generateFilterHandle('filter'),
      position: filterOptions.length,
      optionId: generateOptionId(),
      label: "New Filter",
      optionType: "Collection",
      displayType: "list",
      selectionType: "multiple",
      targetScope: "all",
      selectedValues: [],
      allowedOptions: [],
      groups: [],
      collapsed: false,
      searchable: false,
      showTooltip: false,
      tooltipContent: "",
      showCount: true,
      removePrefix: [],
      removeSuffix: [],
      replaceText: [],
      filterByPrefix: [],
      sortBy: "ascending",
      manualSortedValues: [],
      valueNormalization: {},
      menus: [],
      showMenu: false,
      textTransform: "none",
      paginationType: "scroll",
      groupBySimilarValues: false,
      status: "published",
      baseOptionType: "Collection",
    };
    setFilterOptions([...filterOptions, newOption]);
    setExpandedOptions(new Set([...expandedOptions, newOption.optionId]));
  };

  const handleDeleteOption = (optionId: string) => {
    setFilterOptions(filterOptions.filter((opt) => opt.optionId !== optionId));
    const newExpanded = new Set(expandedOptions);
    newExpanded.delete(optionId);
    setExpandedOptions(newExpanded);
  };

  const handleUpdateOption = (
    optionId: string,
    field: keyof FilterOption,
    value: string | boolean | number | string[]
  ) => {
    setFilterOptions(
      filterOptions.map((opt) => {
        if (opt.optionId === optionId) {
          const updated = { ...opt, [field]: value };
          
          // When optionType changes, update handle, optionId, baseOptionType and related fields
          if (field === "optionType") {
            // Check if option was expanded before regenerating ID
            const wasExpanded = expandedOptions.has(optionId);
            
            // Regenerate handle based on new optionType
            updated.handle = generateFilterHandle(value as string);
            
            // Regenerate optionId to ensure uniqueness
            const newOptionId = generateOptionId();
            updated.optionId = newOptionId;
            
            // Update expandedOptions set with new optionId if it was expanded
            if (wasExpanded) {
              setExpandedOptions((prev) => {
                const newSet = new Set(prev);
                newSet.delete(optionId); // Remove old ID
                newSet.add(newOptionId); // Add new ID
                return newSet;
              });
            }
            
            // Update baseOptionType based on new optionType
            updated.baseOptionType = getBaseOptionType(value as string);
            
            // Price-specific updates
            if (value === "Price") {
              updated.selectionType = "range";
              updated.displayType = "range";
            } else if (opt.optionType === "Price" && value !== "Price") {
              // Changing from Price to something else
              if (updated.selectionType === "range") {
                updated.selectionType = "multiple";
              }
              if (updated.displayType === "range") {
                updated.displayType = "list";
              }
            }
            
            // Update variantOptionKey for variant options
            // For standard types (Price, Vendor, etc.), variantOptionKey should be undefined
            // For variant options (Color, Size, etc.), variantOptionKey should be the normalized optionType
            const normalizedType = (value as string).toLowerCase().trim();
            const isStandardType = ['price', 'vendor', 'product type', 'producttype', 'tags', 'tag', 'collection', 'collections'].includes(normalizedType);
            
            if (isStandardType) {
              // Standard types don't need variantOptionKey
              updated.variantOptionKey = undefined;
            } else {
              // Variant options: store normalized optionType as variantOptionKey
              updated.variantOptionKey = normalizedType;
            }
          }
          
          return updated;
        }
        return opt;
      })
    );
  };

  const handleToggleExpand = (optionId: string) => {
    const newExpanded = new Set(expandedOptions);
    if (newExpanded.has(optionId)) {
      newExpanded.delete(optionId);
    } else {
      newExpanded.add(optionId);
    }
    setExpandedOptions(newExpanded);
  };

  const handleToggleVisibility = (optionId: string) => {
    const option = filterOptions.find((opt) => opt.optionId === optionId);
    if (option) {
      handleUpdateOption(optionId, "status", option.status === "published" ? "draft" : "published");
    }
  };

  const getAvailableValues = (optionType: string): Array<{ value: string; count: number }> => {
    if (!storefrontFilters) return [];
    
    switch (optionType) {
      case "Vendor":
        return storefrontFilters.vendors || [];
      case "Product Type":
        return storefrontFilters.productTypes || [];
      case "Tags":
        return storefrontFilters.tags || [];
      case "Collection":
        return storefrontFilters.collections || [];
      default:
        if (storefrontFilters.options && storefrontFilters.options[optionType]) {
          return storefrontFilters.options[optionType];
        }
        return [];
    }
  };

  const getFilterTypes = (): string[] => {
    const types = [...BASE_FILTER_TYPES];
    if (storefrontFilters?.options) {
      const variantOptionKeys = Object.keys(storefrontFilters.options);
      types.push(...variantOptionKeys);
    }
    return types;
  };

  const getDropIndicatorPosition = (): 'above' | 'below' | null => {
    if (draggedIndex === null || dragOverIndex === null) return null;
    return draggedIndex < dragOverIndex ? 'below' : 'above';
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newOptions = [...filterOptions];
    const draggedItem = newOptions[draggedIndex];
    
    newOptions.splice(draggedIndex, 1);
    newOptions.splice(dropIndex, 0, draggedItem);
    
    const updatedOptions = newOptions.map((option, index) => ({
      ...option,
      position: index,
    }));
    
    setFilterOptions(updatedOptions);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const normalizeFilterOptions = (options: FilterOption[]): any[] => {
    return options.map((option) => {
      // Create a clean option object without fields that aren't in the GraphQL schema
      const {
        minPrice,
        maxPrice,
        ...cleanOption
      } = option;
      
      // Ensure baseOptionType is set correctly based on optionType
      const baseOptionType = option.baseOptionType || getBaseOptionType(option.optionType);
      
      return {
        ...cleanOption,
        tooltipContent: option.tooltipContent ?? "",
        selectedValues: option.selectedValues ?? [],
        allowedOptions: option.allowedOptions ?? [],
        groups: option.groups ?? [],
        removePrefix: option.removePrefix ?? [],
        removeSuffix: option.removeSuffix ?? [],
        replaceText: option.replaceText ?? [],
        filterByPrefix: option.filterByPrefix ?? [],
        manualSortedValues: option.manualSortedValues ?? [],
        valueNormalization: option.valueNormalization ?? {},
        menus: option.menus ?? [],
        showTooltip: option.showTooltip ?? false,
        showCount: option.showCount ?? true,
        baseOptionType: baseOptionType,
        // Performance Optimization: Preserve variant option key for faster aggregations
        variantOptionKey: option.variantOptionKey,
      };
    });
  };

  // Expose save function and state via ref
  useImperativeHandle(ref, () => ({
    save: async () => {
      await handleSaveInternal();
    },
    isSaving
  }));

  const handleSaveInternal = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Validation
    let hasError = false;
    setTitleError("");
    setOptionsError("");
    setCollectionsError("");

    if (!title.trim()) {
      setTitleError("Filter title is required");
      hasError = true;
    }

    // Validate collections when targetScope is "entitled" (specific collections)
    if (targetScope === "entitled" && selectedCollections.length === 0) {
      setCollectionsError("At least one collection must be selected when using specific collections");
      hasError = true;
    }

    const activeOptions = filterOptions.filter(opt => opt.status === "published");
    if (activeOptions.length === 0) {
      setOptionsError("At least one filter option must be active");
      hasError = true;
    }

    if (hasError) {
      return;
    }

    setIsSaving(true);
    onSavingChange?.(true);
    try {
      if (!shop) {
        shopify.toast.show("Shop information is missing", { isError: true });
        setIsSaving(false);
        onSavingChange?.(false);
        return;
      }

      if (!graphqlEndpoint) {
        shopify.toast.show("GraphQL endpoint is not configured", { isError: true });
        setIsSaving(false);
        onSavingChange?.(false);
        return;
      }

      const normalizedOptions = normalizeFilterOptions(filterOptions);

      const mutation = mode === "create" 
        ? `
          mutation CreateFilter($shop: String!, $input: CreateFilterInput!) {
            createFilter(shop: $shop, input: $input) {
              id
              title
              description
              status
              version
              createdAt
              options {
                handle
                label
                position
              }
              settings {
                defaultView
                filterOrientation
              }
            }
          }
        `
        : `
          mutation UpdateFilter($shop: String!, $id: String!, $input: UpdateFilterInput!) {
            updateFilter(shop: $shop, id: $id, input: $input) {
              id
              title
              description
              status
              version
              updatedAt
              options {
                handle
                label
                position
              }
              settings {
                defaultView
                filterOrientation
              }
            }
          }
        `;

      const input: any = {
        title: title.trim(),
        status,
        targetScope,
        allowedCollections: selectedCollections,
        options: normalizedOptions,
        settings: {
          defaultView,
          filterOrientation,
        },
      };

      const variables: any = mode === "create" 
        ? { input }
        : { id: initialFilter?.id, input };

      // Use server-side API route instead of direct GraphQL endpoint
      const response = await fetch("/app/api/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mutation,
          variables,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || `Failed to ${mode} filter`;
        shopify.toast.show(errorMessage, { isError: true });
        setIsSaving(false);
        onSavingChange?.(false);
        return;
      }

      const result = await response.json();

      if (result.error || (result.errors && result.errors.length > 0)) {
        const errorMessage = result.error || result.errors?.[0]?.message || `Failed to ${mode} filter`;
        shopify.toast.show(errorMessage, { isError: true });
      } else if (result.createFilter || result.updateFilter) {
        shopify.toast.show(`Filter ${mode === "create" ? "created" : "updated"} successfully`);
        
        // Dismiss the save bar by resetting form state
        setHasChanges(false);
        
        // Programmatically dismiss the save bar
        const dismissSaveBar = () => {
          // Try to find and hide the save bar element directly
          const saveBar = document.querySelector('s-save-bar');
          if (saveBar) {
            (saveBar as any).style.display = 'none';
            (saveBar as any).hidden = true;
            // Try to call dismiss method if it exists
            if (typeof (saveBar as any).dismiss === 'function') {
              (saveBar as any).dismiss();
            }
          }
          
          const form = document.querySelector('form[data-save-bar]') as HTMLFormElement;
          if (form) {
            // Remove data-save-bar attribute to dismiss the save bar
            form.removeAttribute('data-save-bar');
            
            // Dispatch dismiss event
            const dismissEvent = new CustomEvent('shopify:save-bar:dismiss', { bubbles: true });
            form.dispatchEvent(dismissEvent);
          }
        };
        
        // Dismiss save bar immediately
        dismissSaveBar();
        
        // Use a small delay to ensure toast is shown and save bar is dismissed before navigation
        setTimeout(() => {
          // Dismiss save bar again before navigation to ensure it's gone
          dismissSaveBar();
          
          if (onSave) {
            onSave();
          } else {
            // Navigate to filters page - use replace: false to ensure loader runs
            // The filters page will revalidate on mount to get fresh data
            navigate("/app/filters");
          }
        }, 100);
      } else {
        shopify.toast.show(`Failed to ${mode} filter: Unexpected response`, { isError: true });
      }
    } catch (error: any) {
      shopify.toast.show(error.message || `Failed to ${mode} filter`, { isError: true });
    } finally {
      setIsSaving(false);
      onSavingChange?.(false);
    }
  };

  const handleCancel = () => {
    if (hasChanges) {
      setCancelModalOpen(true);
    } else {
      navigate("/app/filters", { replace: true });
    }
  };

  const handleCancelConfirm = () => {
    setCancelModalOpen(false);
    revertToInitialState();
  };

  const handleCancelClose = () => {
    setCancelModalOpen(false);
  };

  const isPriceFilter = (optionType: string) => optionType === "Price";
  const getSelectionTypes = (optionType: string) => {
    return isPriceFilter(optionType) 
      ? SELECTION_TYPES.price 
      : SELECTION_TYPES.all;
  };
  const getDisplayTypes = (optionType: string) => {
    return isPriceFilter(optionType)
      ? DISPLAY_TYPES.price
      : DISPLAY_TYPES.list;
  };

  const pageId = mode === "create" ? "filter-create" : `filter-edit-${initialFilter?.id || "new"}`;
  const pageKey = `${pageId}-${location.pathname}`;

  const handleSave = async (e?: React.FormEvent) => {
    await handleSaveInternal(e);
  };

  return (
    <form 
      id="filter-form"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleSave(e);
      }}
    >
      <s-stack direction="block" gap="base">
        {/* Basic Information */}
        <s-section>
          <s-stack direction="block" gap="base">
            <s-heading>Basic Information</s-heading>
            <s-stack direction="block" gap="small">
              <s-text-field
                id={titleInputId}
                label="Title"
                value={title}
                onChange={(e: any) => {
                  setTitle(e.target.value);
                  if (titleError) setTitleError("");
                }}
                maxLength={60}
                placeholder="Enter filter title"
                error={titleError}
              />
            </s-stack>
            <s-stack direction="block" gap="small">
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-switch
                  label="Filter Status"
                  checked={status === "published"}
                  onChange={(e: any) => setStatus(e.target.checked ? "published" : "draft")}
                />
              </s-stack>
            </s-stack>
          </s-stack>
        </s-section>

        {/* Collection Display Options */}
        <s-section>
          <s-stack direction="block" gap="base">
            <s-heading>{t("filterForm.collectionDisplay.title")}</s-heading>
            <s-choice-list
              label={t("filterForm.collectionDisplay.question")}
              onChange={handleTargetScope}
              name="Collection Display Options"
              values={[targetScope]}
            >
              <s-choice selected={targetScope === "all"} value="all">
                {t("filterForm.collectionDisplay.all")}
              </s-choice>
              <s-choice selected={targetScope === "entitled"} value="entitled">
                {t("filterForm.collectionDisplay.specific")}
              </s-choice>
            </s-choice-list>
            {targetScope === "entitled" && (
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <s-stack direction="block" gap="small">
                  <s-button
                    variant="secondary"
                    onClick={handleOpenCollectionPicker}
                    icon="plus"
                  >
                    {t("filterForm.collectionDisplay.selectCollections")}
                  </s-button>
                  {selectedCollections.length > 0 && (
                    <s-stack direction="block" gap="small">
                      <s-text tone="auto">{t("filterForm.collectionDisplay.selectedCollections")}</s-text>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {selectedCollections.map((collection) => (
                          <s-badge key={collection.id}>
                            {collection.label}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCollections(selectedCollections.filter(c => c.id !== collection.id));
                                if (collectionsError) setCollectionsError("");
                              }}
                              style={{ 
                                marginLeft: "8px", 
                                background: "none", 
                                border: "none", 
                                cursor: "pointer", 
                                padding: "0", 
                                fontSize: "16px",
                                lineHeight: "1"
                              }}
                            >
                              ×
                            </button>
                          </s-badge>
                        ))}
                      </div>
                    </s-stack>
                  )}
                  {collectionsError && (
                    <s-text tone="critical">{collectionsError}</s-text>
                  )}
                </s-stack>
              </s-box>
            )}
          </s-stack>
        </s-section>

        {/* Filter Options */}
        <s-section>
          <s-stack direction="block" gap="base">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <s-heading>Filter Options</s-heading>
              <s-button
                variant="primary"
                onClick={handleAddFilterOption}
                icon="plus"
              >
                Add filter option
              </s-button>
            </div>
            {optionsError && (
              <s-banner tone="critical">
                <s-text>{optionsError}</s-text>
              </s-banner>
            )}
          </s-stack>

          {filterOptions.length === 0 ? (
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="small">
                <s-text tone="auto">No filter options yet. Add your first filter option to get started.</s-text>
              </s-stack>
            </s-box>
          ) : (
            <s-stack direction="block" gap="base">
              {filterOptions.map((option, index) => {
                const isExpanded = expandedOptions.has(option.optionId);
                const availableValues = getAvailableValues(option.optionType);
                const selectionTypes = getSelectionTypes(option.optionType);
                const displayTypes = getDisplayTypes(option.optionType);
                const isDragging = draggedIndex === index;
                const isDragOver = dragOverIndex === index;
                const dropPosition = getDropIndicatorPosition();
                const showDropAbove = isDragOver && dropPosition === 'above';
                const showDropBelow = isDragOver && dropPosition === 'below';

                return (
                  <div key={option.optionId} style={{ position: 'relative' }}>
                    {/* Drop Indicator Above */}
                    {showDropAbove && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '-2px',
                          left: 0,
                          right: 0,
                          height: '3px',
                          backgroundColor: 'var(--p-color-border-info)',
                          zIndex: 10,
                        }}
                      />
                    )}
                    
                    <div
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e: any) => handleDragOver(e, index)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e: any) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      style={{
                        opacity: isDragging ? 0.7 : 1,
                        cursor: isDragging ? 'grabbing' : 'grab',
                        transition: isDragging ? 'none' : 'all 0.2s ease',
                        position: 'relative',
                        zIndex: isDragging ? 1000 : 1,
                        border: isDragging ? '2px solid var(--p-color-border-info)' : 'none',
                        backgroundColor: isDragging ? 'var(--p-color-bg-surface-selected)' : 'transparent',
                      }}
                    >
                      <s-box
                        padding="base"
                        borderWidth={isDragOver ? "large" : isDragging ? "large" : "base"}
                        borderRadius="base"
                        background="subdued"
                      >
                        <s-stack direction="block" gap="base">
                          {/* Option Header - Single Row */}
                          <div 
                            style={{ 
                              display: "flex", 
                              alignItems: "center", 
                              gap: "12px",
                              cursor: isDragging ? 'grabbing' : 'grab',
                              userSelect: 'none',
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <s-icon 
                              type="drag-handle" 
                              color="subdued"
                              size="small"
                            />
                            <div style={{ flex: 1 }}>
                              <s-text-field
                                value={option.label}
                                onChange={(e: any) => handleUpdateOption(option.optionId, "label", e.target.value)}
                                placeholder="Filter label"
                              />
                            </div>
                            <div style={{ flex: 1, minWidth: "200px" }}>
                              <s-select
                                value={option.optionType}
                                onChange={(e: any) => handleUpdateOption(option.optionId, "optionType", e.target.value)}
                              >
                                {getFilterTypes().map((type) => (
                                  <s-option key={type} value={type}>
                                    {type}
                                  </s-option>
                                ))}
                              </s-select>
                            </div>
                            <s-badge tone={option.status === "published" ? "success" : "warning"}>
                              {option.status === "published" ? "Active" : "Draft"}
                            </s-badge>
                            <s-button
                              variant="tertiary"
                              onClick={() => handleToggleExpand(option.optionId)}
                              icon={isExpanded ? "chevron-up" : "chevron-down"}
                            >
                              {isExpanded ? "Hide settings" : "Show settings"}
                            </s-button>
                            <s-button
                              variant="tertiary"
                              tone="critical"
                              onClick={() => handleDeleteOption(option.optionId)}
                              icon="delete"
                            />
                          </div>

                          {/* Settings - Expandable */}
                          {isExpanded && (
                            <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                              <s-stack direction="block" gap="base">
                                
                                {/* Section 1: Basic Settings */}
                                <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                                  <s-stack direction="block" gap="base">
                                    <s-heading>Basic Settings</s-heading>
                                    <s-stack direction="block" gap="base">
                                      {!isPriceFilter(option.optionType) && (
                                        <>
                                          {selectionTypes.length === 2 ? (
                                            <s-choice-list
                                              label="Selection Type"
                                              values={[option.selectionType]}
                                              onChange={(e: any) => {
                                                const value = e.currentTarget?.values?.[0];
                                                if (value) handleUpdateOption(option.optionId, "selectionType", value);
                                              }}
                                            >
                                              {selectionTypes.map((type) => (
                                                <s-choice 
                                                  key={type} 
                                                  value={type} 
                                                  selected={option.selectionType === type}
                                                >
                                                  {type.charAt(0).toUpperCase() + type.slice(1)}
                                                </s-choice>
                                              ))}
                                            </s-choice-list>
                                          ) : (
                                            <s-select
                                              label="Selection Type"
                                              value={option.selectionType}
                                              onChange={(e: any) => handleUpdateOption(option.optionId, "selectionType", e.target.value)}
                                            >
                                              {selectionTypes.map((type) => (
                                                <s-option key={type} value={type}>
                                                  {type.charAt(0).toUpperCase() + type.slice(1)}
                                                </s-option>
                                              ))}
                                            </s-select>
                                          )}

                                          <s-select
                                            label="Display Style"
                                            value={option.displayType}
                                            onChange={(e: any) => handleUpdateOption(option.optionId, "displayType", e.target.value)}
                                          >
                                            {displayTypes.map((type) => (
                                              <s-option key={type} value={type}>
                                                {type.charAt(0).toUpperCase() + type.slice(1)}
                                              </s-option>
                                            ))}
                                          </s-select>
                                        </>
                                      )}

                                      {isPriceFilter(option.optionType) && (
                                        <>
                                          <s-select
                                            label="Display Style"
                                            value="range"
                                            disabled
                                          >
                                            <s-option value="range">Range (Price Slider)</s-option>
                                          </s-select>
                                          <span style={{ fontSize: '12px', color: 'var(--p-color-text-subdued)' }}>
                                            Price filters use a range slider. Display style is automatically set to "Range".
                                          </span>
                                        </>
                                      )}

                                      <s-switch
                                        label="Enable this filter"
                                        checked={option.status === "published"}
                                        onChange={() => handleToggleVisibility(option.optionId)}
                                      />
                                    </s-stack>
                                  </s-stack>
                                </s-box>

                                {/* Section 2: Display & Behavior */}
                                <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                                  <s-stack direction="block" gap="base">
                                    <s-heading>Display & Behavior</s-heading>
                                    <s-stack direction="block" gap="base">
                                      <s-switch
                                        label="Start collapsed"
                                        checked={option.collapsed}
                                        onChange={(e: any) => handleUpdateOption(option.optionId, "collapsed", e.target.checked)}
                                      />
                                      {!isPriceFilter(option.optionType) && (
                                        <>
                                          <s-switch
                                            label="Enable search bar"
                                            checked={option.searchable}
                                            onChange={(e: any) => handleUpdateOption(option.optionId, "searchable", e.target.checked)}
                                          />
                                          <s-switch
                                            label="Group similar values together"
                                            checked={option.groupBySimilarValues}
                                            onChange={(e: any) => handleUpdateOption(option.optionId, "groupBySimilarValues", e.target.checked)}
                                          />
                                          <s-switch
                                            label="Show as hierarchical menu"
                                            checked={option.showMenu}
                                            onChange={(e: any) => handleUpdateOption(option.optionId, "showMenu", e.target.checked)}
                                          />
                                        </>
                                      )}
                                      {isPriceFilter(option.optionType) && (
                                        <span style={{ fontSize: '12px', color: 'var(--p-color-text-subdued)' }}>
                                          Price filters display as a range slider. Search, grouping, and menu options are not applicable.
                                        </span>
                                      )}
                                    </s-stack>
                                  </s-stack>
                                </s-box>

                                {/* Section 3: Value Selection & Filtering */}
                                {!isPriceFilter(option.optionType) && availableValues.length > 0 && (
                                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                                    <s-stack direction="block" gap="base">
                                      <s-heading>Value Selection & Filtering</s-heading>
                                      <s-stack direction="block" gap="base">
                                        <AllowedOptionsSelector
                                          value={option.allowedOptions}
                                          onChange={(values) => handleUpdateOption(option.optionId, "allowedOptions", values)}
                                          availableValues={availableValues}
                                        />
                                        <span style={{ fontSize: '12px', color: 'var(--p-color-text-subdued)' }}>
                                          {option.allowedOptions.length === 0 
                                            ? "All values will be shown" 
                                            : `Only ${option.allowedOptions.length} selected value(s) will be shown`}
                                        </span>
                                      </s-stack>
                                    </s-stack>
                                  </s-box>
                                )}

                                {/* Section 4: Sorting & Organization - Only for non-price filters */}
                                {!isPriceFilter(option.optionType) && (
                                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                                    <s-stack direction="block" gap="base">
                                      <s-heading>Sorting & Organization</s-heading>
                                      <s-stack direction="block" gap="base">
                                        <s-select
                                          label="Sort Order"
                                          value={option.sortBy}
                                          onChange={(e: any) => handleUpdateOption(option.optionId, "sortBy", e.target.value)}
                                        >
                                          <s-option value="ascending">A to Z (Ascending)</s-option>
                                          <s-option value="descending">Z to A (Descending)</s-option>
                                          <s-option value="count">By Popularity (Count)</s-option>
                                          <s-option value="manual">Custom Order</s-option>
                                        </s-select>
                                        {option.sortBy === "manual" && (
                                          <s-text-field
                                            label="Custom Sort Order"
                                            value={option.manualSortedValues.join(', ')}
                                            onChange={(e: any) => {
                                              const values = e.target.value.split(',').map((v: string) => v.trim()).filter((v: string) => v);
                                              handleUpdateOption(option.optionId, "manualSortedValues", values);
                                            }}
                                            placeholder="Enter values in desired order, separated by commas"
                                          />
                                        )}
                                      </s-stack>
                                    </s-stack>
                                  </s-box>
                                )}

                                {/* Section 5: Text Formatting - Only for non-price filters */}
                                {!isPriceFilter(option.optionType) && (
                                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                                    <s-stack direction="block" gap="base">
                                      <s-heading>Text Formatting</s-heading>
                                      <s-stack direction="block" gap="base">
                                        <s-select
                                          label="Text Case"
                                          value={option.textTransform}
                                          onChange={(e: any) => handleUpdateOption(option.optionId, "textTransform", e.target.value)}
                                        >
                                          <s-option value="none">Normal (No change)</s-option>
                                          <s-option value="uppercase">UPPERCASE</s-option>
                                          <s-option value="lowercase">lowercase</s-option>
                                          <s-option value="capitalize">Capitalize First Letter</s-option>
                                        </s-select>
                                        <s-switch
                                          label="Show tooltip"
                                          checked={option.showTooltip ?? false}
                                          onChange={(e: any) => handleUpdateOption(option.optionId, "showTooltip", e.target.checked)}
                                        />
                                        {option.showTooltip && (
                                          <s-text-field
                                            label="Tooltip Content"
                                            value={option.tooltipContent}
                                            onChange={(e: any) => handleUpdateOption(option.optionId, "tooltipContent", e.target.value)}
                                            placeholder="Help text shown when users hover over this filter"
                                          />
                                        )}
                                      </s-stack>
                                    </s-stack>
                                  </s-box>
                                )}

                                {/* Section 6: Advanced Options - Only for non-price filters */}
                                {!isPriceFilter(option.optionType) && (
                                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                                    <s-stack direction="block" gap="base">
                                      <s-heading>Advanced Options</s-heading>
                                      <s-stack direction="block" gap="base">
                                        {option.showMenu && (
                                          <MenuTreeBuilder
                                            value={option.menus}
                                            onChange={(values) => handleUpdateOption(option.optionId, "menus", values)}
                                            availableValues={availableValues}
                                          />
                                        )}

                                        <s-text-field
                                          label="Filter by Prefix (Show only values starting with)"
                                          value={option.filterByPrefix.join(', ')}
                                          onChange={(e: any) => {
                                            const values = e.target.value.split(',').map((v: string) => v.trim()).filter((v: string) => v);
                                            handleUpdateOption(option.optionId, "filterByPrefix", values);
                                          }}
                                          placeholder="e.g., Size-, Color- (comma-separated)"
                                        />
                                        <s-text-field
                                          label="Remove Prefix from Display"
                                          value={option.removePrefix.join(', ')}
                                          onChange={(e: any) => {
                                            const values = e.target.value.split(',').map((v: string) => v.trim()).filter((v: string) => v);
                                            handleUpdateOption(option.optionId, "removePrefix", values);
                                          }}
                                          placeholder="e.g., Size-, Color- (comma-separated)"
                                        />
                                        <span style={{ fontSize: '12px', color: 'var(--p-color-text-subdued)' }}>
                                          Note: Original values are preserved for filtering. Only display text is modified.
                                        </span>
                                      </s-stack>
                                    </s-stack>
                                  </s-box>
                                )}

                                {/* Section 7: Data Preview */}
                                {!isPriceFilter(option.optionType) && availableValues.length > 0 && (
                                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                                    <s-stack direction="block" gap="base">
                                      <s-heading>Available Values Preview</s-heading>
                                      <s-stack direction="block" gap="small">
                                        <s-text tone="auto">
                                          Total available values: <strong>{availableValues.length.toLocaleString()}</strong>
                                        </s-text>
                                        <div 
                                          style={{ 
                                            display: "flex", 
                                            flexWrap: "wrap", 
                                            gap: "6px", 
                                            padding: "12px",
                                            border: "1px solid var(--p-color-border-subdued)",
                                            borderRadius: "4px",
                                            backgroundColor: "var(--p-color-bg-surface)",
                                            maxHeight: "200px",
                                            overflowY: "auto"
                                          }}
                                        >
                                          {availableValues.slice(0, 10).map((item, idx) => (
                                            <s-badge key={idx} tone="info">
                                              {item.value} <span style={{ opacity: 0.7 }}>({item.count})</span>
                                            </s-badge>
                                          ))}
                                          {availableValues.length > 10 && (
                                            <s-badge tone="neutral">
                                              +{availableValues.length - 10} more
                                            </s-badge>
                                          )}
                                        </div>
                                      </s-stack>
                                    </s-stack>
                                  </s-box>
                                )}

                                {/* Price Range - Only for price filters */}
                                {isPriceFilter(option.optionType) && storefrontFilters?.priceRange && (
                                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                                    <s-stack direction="block" gap="base">
                                      <s-heading>Price Range Information</s-heading>
                                      <s-stack direction="block" gap="small">
                                        <s-text tone="auto">
                                          The price filter will display as a range slider with the following price range:
                                        </s-text>
                                        <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                                          <div style={{ fontSize: '18px', fontWeight: '600' }}>
                                            ${storefrontFilters.priceRange.min.toLocaleString()} - ${storefrontFilters.priceRange.max.toLocaleString()}
                                          </div>
                                        </s-box>
                                        <span style={{ fontSize: '12px', color: 'var(--p-color-text-subdued)' }}>
                                          Customers can drag the slider handles to select their desired price range.
                                        </span>
                                      </s-stack>
                                    </s-stack>
                                  </s-box>
                                )}

                                {/* Section 8: System Information */}
                                <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                                  <s-stack direction="block" gap="base">
                                    <s-heading>System Information</s-heading>
                                    <s-stack direction="block" gap="base">
                                      <s-text-field
                                        label="Filter ID"
                                        value={option.optionId}
                                        disabled
                                      />
                                      <s-text-field
                                        label="Handle (URL identifier)"
                                        value={option.handle}
                                        disabled
                                      />
                                      <span style={{ fontSize: '12px', color: 'var(--p-color-text-subdued)' }}>
                                        These fields are automatically generated and used for system identification. They cannot be modified.
                                      </span>
                                    </s-stack>
                                  </s-stack>
                                </s-box>

                              </s-stack>
                            </s-box>
                          )}
                        </s-stack>
                      </s-box>
                    </div>
                    
                    {/* Drop Indicator Below */}
                    {showDropBelow && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '-2px',
                          left: 0,
                          right: 0,
                          height: '3px',
                          backgroundColor: 'var(--p-color-border-info)',
                          zIndex: 10,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </s-stack>
          )}
        </s-section>

        {/* General Settings - Collapsed by Default */}
        <s-section>
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <div 
              style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                cursor: "pointer"
              }}
              onClick={() => setGeneralSettingsExpanded(!generalSettingsExpanded)}
            >
              <s-heading>General Settings</s-heading>
              <s-button
                variant="tertiary"
                icon={generalSettingsExpanded ? "chevron-up" : "chevron-down"}
                onClick={(e: any) => {
                  e.stopPropagation();
                  setGeneralSettingsExpanded(!generalSettingsExpanded);
                }}
              >
                {generalSettingsExpanded ? "Hide" : "Show"}
              </s-button>
            </div>
            
            {generalSettingsExpanded && (
              <div style={{ marginTop: "16px" }}>
                <s-stack direction="block" gap="base">
                  
                  {/* Section 1: Layout & Position */}
                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                    <s-stack direction="block" gap="base">
                      <s-heading>Layout & Position</s-heading>
                      <s-stack direction="block" gap="base">
                        <s-choice-list
                          label="Filter Position"
                          values={[filterOrientation]}
                          onChange={(e: any) => {
                            const value = e.currentTarget?.values?.[0];
                            if (value) setFilterOrientation(value);
                          }}
                        >
                          <s-choice value="vertical" selected={filterOrientation === "vertical"}>
                            Vertical (Sidebar)
                          </s-choice>
                          <s-choice value="horizontal" selected={filterOrientation === "horizontal"}>
                            Horizontal (Top Bar)
                          </s-choice>
                        </s-choice-list>

                        <s-choice-list
                          label="Default Product View"
                          values={[defaultView]}
                          onChange={(e: any) => {
                            const value = e.currentTarget?.values?.[0];
                            if (value) setDefaultView(value);
                          }}
                        >
                          <s-choice value="grid" selected={defaultView === "grid"}>
                            Grid View
                          </s-choice>
                          <s-choice value="list" selected={defaultView === "list"}>
                            List View
                          </s-choice>
                        </s-choice-list>

                        {defaultView === "grid" && (
                          <s-choice-list
                            label="Products per Row"
                            values={[gridColumns.toString()]}
                            onChange={(e: any) => {
                              const value = e.currentTarget?.values?.[0];
                              if (value) setGridColumns(parseInt(value));
                            }}
                          >
                            <s-choice value="2" selected={gridColumns === 2}>2 columns</s-choice>
                            <s-choice value="3" selected={gridColumns === 3}>3 columns</s-choice>
                            <s-choice value="4" selected={gridColumns === 4}>4 columns</s-choice>
                            <s-choice value="5" selected={gridColumns === 5}>5 columns</s-choice>
                          </s-choice-list>
                        )}
                      </s-stack>
                    </s-stack>
                  </s-box>

                  {/* Section 2: Product Display */}
                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                    <s-stack direction="block" gap="base">
                      <s-heading>Product Display</s-heading>
                      <s-stack direction="block" gap="base">
                        <s-select
                          label="Default Sort Order"
                          value="relevance"
                          onChange={(e: any) => {
                            // This will be stored in settings.productDisplay.defaultSort
                          }}
                        >
                          <s-option value="relevance">Relevance</s-option>
                          <s-option value="price-asc">Price: Low to High</s-option>
                          <s-option value="price-desc">Price: High to Low</s-option>
                          <s-option value="name-asc">Name: A to Z</s-option>
                          <s-option value="name-desc">Name: Z to A</s-option>
                          <s-option value="newest">Newest First</s-option>
                        </s-select>
                        <s-switch
                          label="Show product count"
                          checked={showProductCount}
                          onChange={(e: any) => setShowProductCount(e.target.checked)}
                        />
                        <s-switch
                          label="Show sort options dropdown"
                          checked={showSortOptions}
                          onChange={(e: any) => setShowSortOptions(e.target.checked)}
                        />
                      </s-stack>
                    </s-stack>
                  </s-box>

                  {/* Section 3: Pagination */}
                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                    <s-stack direction="block" gap="base">
                      <s-heading>Pagination</s-heading>
                      <s-stack direction="block" gap="base">
                        <s-choice-list
                          label="Pagination Type"
                          values={["pages"]}
                          onChange={(e: any) => {
                            // This will be stored in settings.pagination.type
                          }}
                        >
                          <s-choice value="pages" selected={true}>Pages (1, 2, 3...)</s-choice>
                          <s-choice value="load-more" selected={false}>Load More Button</s-choice>
                          <s-choice value="infinite-scroll" selected={false}>Infinite Scroll</s-choice>
                        </s-choice-list>
                        <s-text-field
                          label="Items per Page"
                          value="24"
                          onChange={(e: any) => {
                            // This will be stored in settings.pagination.itemsPerPage
                          }}
                        />
                        <s-switch
                          label="Show page info (e.g., 'Showing 1-24 of 120 products')"
                          checked={true}
                          onChange={(e: any) => {
                            // This will be stored in settings.pagination.showPageInfo
                          }}
                        />
                      </s-stack>
                    </s-stack>
                  </s-box>

                  {/* Section 4: Filter UI Options */}
                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                    <s-stack direction="block" gap="base">
                      <s-heading>Filter UI Options</s-heading>
                      <s-stack direction="block" gap="base">
                        <s-switch
                          label="Show filter count badges"
                          checked={showFilterCount}
                          onChange={(e: any) => setShowFilterCount(e.target.checked)}
                        />
                        <s-switch
                          label="Show active filters summary"
                          checked={showActiveFilters}
                          onChange={(e: any) => setShowActiveFilters(e.target.checked)}
                        />
                        <s-switch
                          label="Show 'Reset Filters' button"
                          checked={true}
                          onChange={(e: any) => {
                            // This will be stored in settings.showResetButton
                          }}
                        />
                        <s-switch
                          label="Show 'Clear All' button"
                          checked={true}
                          onChange={(e: any) => {
                            // This will be stored in settings.showClearAllButton
                          }}
                        />
                      </s-stack>
                    </s-stack>
                  </s-box>

                </s-stack>
              </div>
            )}
          </s-box>
        </s-section>

      </s-stack>

      {/* Cancel Confirmation Modal */}
      {cancelModalOpen && (
        <s-modal>
          <s-box padding="base">
            <s-stack direction="block" gap="base">
              <s-heading>Discard Changes?</s-heading>
              <s-text>
                You have unsaved changes. Are you sure you want to leave this page?
              </s-text>
              <s-stack direction="inline" gap="base">
                <s-button
                  variant="primary"
                  tone="critical"
                  onClick={handleCancelConfirm}
                >
                  Discard
                </s-button>
                <s-button
                  variant="secondary"
                  onClick={handleCancelClose}
                >
                  Continue Editing
                </s-button>
              </s-stack>
            </s-stack>
          </s-box>
        </s-modal>
      )}
    </form>
  );
});

export default FilterForm;

