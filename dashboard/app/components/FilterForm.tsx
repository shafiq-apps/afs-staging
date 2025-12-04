import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from "react";
import { useNavigate, useLocation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "../utils/translations";
import { generateFilterHandle } from "../utils/id-generator";
import { deepEqual } from "../utils/deep-equal";
import {
  DisplayType,
  SelectionType,
  FilterOptionStatus,
  FilterStatus,
  PaginationType,
  TargetScope,
  FilterOrientation,
  DefaultView,
  toDisplayType,
  toSelectionType,
  toSortOrder,
  toFilterOptionStatus,
  toFilterStatus,
  toPaginationType,
  toTextTransform,
  toTargetScope,
  toFilterOrientation,
  toDefaultView,
} from "../utils/filter.enums";
import {
  DEFAULT_FILTER_OPTION,
  DEFAULT_FILTER,
  PRICE_FILTER_DEFAULTS,
  getBaseOptionType,
  getOptionType,
  getAvailableSelectionTypes,
  getAvailableDisplayTypes,
  type StorefrontFilterData,
} from "../utils/filter.constants";

interface FilterOption {
  // Identification
  handle: string;
  position: number;
  
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

// StorefrontFilterData is imported from filter.constants.ts
// It matches the FacetAggregations structure from products.type.ts

interface MenuTreeNode {
  id: string;
  label: string;
  children?: MenuTreeNode[];
}

// Combined filter state type - all filter-related state in one object
interface FilterState {
  title: string;
  status: FilterStatus;
  targetScope: TargetScope;
  selectedCollections: CollectionReference[];
  filterOptions: FilterOption[];
  filterOrientation: FilterOrientation;
  defaultView: DefaultView;
  showFilterCount: boolean;
  showActiveFilters: boolean;
  gridColumns: number;
  showProductCount: boolean;
  showSortOptions: boolean;
  displayQuickView: boolean;
  displayItemsCount: boolean;
  displayVariantInsteadOfProduct: boolean;
  displayCollectionImage: boolean;
  hideOutOfStockItems: boolean;
  onLaptop: string;
  onTablet: string;
  onMobile: string;
  defaultSort: string;
  paginationType: PaginationType;
  itemsPerPage: number;
  showPageInfo: boolean;
  pageInfoFormat: string;
  showResetButton: boolean;
  showClearAllButton: boolean;
}

interface FilterFormProps {
  mode: "create" | "edit";
  initialFilter?: {
    id?: string;
    title: string;
    description?: string;
    status: string;
    targetScope: string | TargetScope;
    allowedCollections: CollectionReference[];
    options: FilterOption[];
    settings?: {
      displayQuickView?: boolean;
      displayItemsCount?: boolean;
      displayVariantInsteadOfProduct?: boolean;
      defaultView?: string;
      filterOrientation?: string;
      displayCollectionImage?: boolean;
      hideOutOfStockItems?: boolean;
      onLaptop?: string;
      onTablet?: string;
      onMobile?: string;
      productDisplay?: {
        gridColumns?: number;
        showProductCount?: boolean;
        showSortOptions?: boolean;
        defaultSort?: string;
      };
      pagination?: {
        type?: string;
        itemsPerPage?: number;
        showPageInfo?: boolean;
        pageInfoFormat?: string;
      };
      showFilterCount?: boolean;
      showActiveFilters?: boolean;
      showResetButton?: boolean;
      showClearAllButton?: boolean;
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
  "ProductType",
  "Vendor",
  "Tags",
  "Price",
  "Availability",
  "Metafield",
];

// Constants moved to filter.constants.ts

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
  const shopify = useAppBridge();
  const location = useLocation();
  const { t } = useTranslation();

  // UI state (not part of filter data)
  const [titleError, setTitleError] = useState("");
  const [optionsError, setOptionsError] = useState("");
  const [collectionsError, setCollectionsError] = useState("");
  const titleInputId = `title-input-${mode}`;
  const [expandedOptions, setExpandedOptions] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [generalSettingsExpanded, setGeneralSettingsExpanded] = useState<boolean>(false);
  
  // Default filter state
  const defaultFilterState: FilterState = {
    title: "",
    status: FilterStatus.PUBLISHED,
    targetScope: TargetScope.ALL,
    selectedCollections: [],
    filterOptions: [],
    filterOrientation: FilterOrientation.VERTICAL,
    defaultView: DefaultView.GRID,
    showFilterCount: true,
    showActiveFilters: true,
    gridColumns: 3,
    showProductCount: true,
    showSortOptions: true,
    displayQuickView: false,
    displayItemsCount: true,
    displayVariantInsteadOfProduct: false,
    displayCollectionImage: false,
    hideOutOfStockItems: false,
    onLaptop: "",
    onTablet: "",
    onMobile: "",
    defaultSort: "relevance",
    paginationType: PaginationType.PAGES,
    itemsPerPage: 24,
    showPageInfo: true,
    pageInfoFormat: "",
    showResetButton: true,
    showClearAllButton: true,
  };

  // Combined filter state - all filter data in one object
  const [filterState, setFilterState] = useState<FilterState>(defaultFilterState);
  const [initialFilterState, setInitialFilterState] = useState<FilterState | null>(null);

  // Helper function to update filterState safely
  const updateFilterState = useCallback(<K extends keyof FilterState>(
    updates: Partial<FilterState> | ((prev: FilterState) => FilterState)
  ) => {
    setFilterState((prev) => {
      if (typeof updates === 'function') {
        return updates(prev);
      }
      return { ...prev, ...updates };
    });
  }, []);

  // Helper to get current filter state values (for easier access)
  const {
    title,
    status,
    targetScope,
    selectedCollections,
    filterOptions,
    filterOrientation,
    defaultView,
    showFilterCount,
    showActiveFilters,
    gridColumns,
    showProductCount,
    showSortOptions,
    displayQuickView,
    displayItemsCount,
    displayVariantInsteadOfProduct,
    displayCollectionImage,
    hideOutOfStockItems,
    onLaptop,
    onTablet,
    onMobile,
    defaultSort,
    paginationType,
    itemsPerPage,
    showPageInfo,
    pageInfoFormat,
    showResetButton,
    showClearAllButton,
  } = filterState;

  // Note: getBaseOptionType is imported from filter.constants.ts
  // This local function is kept for backward compatibility but should use the imported one

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
        updateFilterState({ selectedCollections: newCollections });
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

      const settings: any = initialFilter.settings || {};
      const productDisplay: any = settings.productDisplay || {};
      const pagination: any = settings.pagination || {};
      
      const initState: FilterState = {
        title: initialFilter.title || "",
        status: toFilterStatus(initialFilter.status),
        targetScope: toTargetScope(initialFilter.targetScope) || TargetScope.ALL,
        selectedCollections: JSON.parse(JSON.stringify(initialFilter.allowedCollections || [])),
        filterOptions: JSON.parse(JSON.stringify(normalizedOptions)),
        filterOrientation: toFilterOrientation(settings.filterOrientation) || FilterOrientation.VERTICAL,
        defaultView: toDefaultView(settings.defaultView) || DefaultView.GRID,
        showFilterCount: settings.showFilterCount ?? true,
        showActiveFilters: settings.showActiveFilters ?? true,
        gridColumns: productDisplay.gridColumns || 3,
        showProductCount: productDisplay.showProductCount ?? true,
        showSortOptions: productDisplay.showSortOptions ?? true,
        displayQuickView: settings.displayQuickView ?? false,
        displayItemsCount: settings.displayItemsCount ?? true,
        displayVariantInsteadOfProduct: settings.displayVariantInsteadOfProduct ?? false,
        displayCollectionImage: settings.displayCollectionImage ?? false,
        hideOutOfStockItems: settings.hideOutOfStockItems ?? false,
        onLaptop: settings.onLaptop || "",
        onTablet: settings.onTablet || "",
        onMobile: settings.onMobile || "",
        defaultSort: productDisplay.defaultSort || "relevance",
        paginationType: toPaginationType(pagination.type) || PaginationType.PAGES,
        itemsPerPage: pagination.itemsPerPage || 24,
        showPageInfo: pagination.showPageInfo ?? true,
        pageInfoFormat: pagination.pageInfoFormat || "",
        showResetButton: settings.showResetButton ?? true,
        showClearAllButton: settings.showClearAllButton ?? true,
      };
      setInitialFilterState(initState);
      setFilterState(initState);
    } else {
      // Create mode - set defaults and auto-populate filter options
      const createState: FilterState = {
        ...defaultFilterState,
        filterOrientation: DEFAULT_FILTER.filterOrientation,
        defaultView: DEFAULT_FILTER.defaultView,
        showFilterCount: DEFAULT_FILTER.showFilterCount,
        showActiveFilters: DEFAULT_FILTER.showActiveFilters,
        gridColumns: DEFAULT_FILTER.gridColumns,
        showProductCount: DEFAULT_FILTER.showProductCount,
        showSortOptions: DEFAULT_FILTER.showSortOptions,
      };
      setFilterState(createState);
      
      // Auto-populate filter options from storefrontFilters
      if (storefrontFilters && filterOptions.length === 0) {
        const autoOptions: FilterOption[] = [];
        let position = 0;

        // Add Price filter
        if (storefrontFilters.priceRange) {
          autoOptions.push({
            handle: generateFilterHandle('price'),
            position: position++,
            label: "Price",
            optionType: getOptionType("Price"),
            displayType: PRICE_FILTER_DEFAULTS.displayType,
            selectionType: PRICE_FILTER_DEFAULTS.selectionType,
            targetScope: DEFAULT_FILTER_OPTION.targetScope,
            selectedValues: [...DEFAULT_FILTER_OPTION.selectedValues],
            allowedOptions: [...DEFAULT_FILTER_OPTION.allowedOptions],
            groups: [...DEFAULT_FILTER_OPTION.groups],
            collapsed: DEFAULT_FILTER_OPTION.collapsed,
            searchable: DEFAULT_FILTER_OPTION.searchable,
            showTooltip: DEFAULT_FILTER_OPTION.showTooltip,
            tooltipContent: DEFAULT_FILTER_OPTION.tooltipContent,
            showCount: DEFAULT_FILTER_OPTION.showCount,
            removePrefix: DEFAULT_FILTER_OPTION.removePrefix,
            removeSuffix: DEFAULT_FILTER_OPTION.removeSuffix,
            replaceText: DEFAULT_FILTER_OPTION.replaceText,
            filterByPrefix: DEFAULT_FILTER_OPTION.filterByPrefix,
            sortBy: DEFAULT_FILTER_OPTION.sortBy,
            manualSortedValues: DEFAULT_FILTER_OPTION.manualSortedValues,
            valueNormalization: DEFAULT_FILTER_OPTION.valueNormalization,
            menus: DEFAULT_FILTER_OPTION.menus,
            showMenu: DEFAULT_FILTER_OPTION.showMenu,
            textTransform: DEFAULT_FILTER_OPTION.textTransform,
            paginationType: DEFAULT_FILTER_OPTION.paginationType,
            groupBySimilarValues: DEFAULT_FILTER_OPTION.groupBySimilarValues,
            status: DEFAULT_FILTER_OPTION.status,
            minPrice: storefrontFilters.priceRange.min,
            maxPrice: storefrontFilters.priceRange.max,
            baseOptionType: getBaseOptionType("Price"),
          });
        }

        // Add Vendor filter
        if (storefrontFilters.vendors && storefrontFilters.vendors.length > 0) {
          autoOptions.push({
            handle: generateFilterHandle('vendor'),
            position: position++,
            label: "Vendor",
            optionType: getOptionType("Vendor"),
            displayType: "LIST",
            selectionType: "MULTIPLE",
            targetScope: TargetScope.ALL,
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
            sortBy: "ASCENDING",
            manualSortedValues: [],
            valueNormalization: {},
            menus: [],
            showMenu: false,
            textTransform: "NONE",
            paginationType: PaginationType.SCROLL,
            groupBySimilarValues: false,
            status: "PUBLISHED",
            baseOptionType: getBaseOptionType("Vendor"),
          });
        }

        // Add ProductType filter
        if (storefrontFilters.productTypes && storefrontFilters.productTypes.length > 0) {
          autoOptions.push({
            handle: generateFilterHandle('product-type'),
            position: position++,
            label: "ProductType",
            optionType: getOptionType("productType"),
            displayType: "LIST",
            selectionType: "MULTIPLE",
            targetScope: TargetScope.ALL,
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
            sortBy: "ASCENDING",
            manualSortedValues: [],
            valueNormalization: {},
            menus: [],
            showMenu: false,
            textTransform: "NONE",
            paginationType: PaginationType.SCROLL,
            groupBySimilarValues: false,
            status: "PUBLISHED",
            baseOptionType: getBaseOptionType("ProductType"),
          });
        }

        // Add Tags filter
        if (storefrontFilters.tags && storefrontFilters.tags.length > 0) {
          autoOptions.push({
            handle: generateFilterHandle('tags'),
            position: position++,
            label: "Tags",
            optionType: getOptionType("Tags"),
            baseOptionType: getBaseOptionType("Tags"),
            displayType: "LIST",
            selectionType: "MULTIPLE",
            targetScope: TargetScope.ALL,
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
            sortBy: "ASCENDING",
            manualSortedValues: [],
            valueNormalization: {},
            menus: [],
            showMenu: false,
            textTransform: "NONE",
            paginationType: PaginationType.SCROLL,
            groupBySimilarValues: false,
            status: "PUBLISHED"
          });
        }

        // Add Collection filter
        if (storefrontFilters.collections && storefrontFilters.collections.length > 0) {
          autoOptions.push({
            handle: generateFilterHandle('collection'),
            position: position++,
            label: "Collection",
            optionType: getOptionType("Collection"),
            baseOptionType: getBaseOptionType("Collection"),
            displayType: "LIST",
            selectionType: "MULTIPLE",
            targetScope: TargetScope.ALL,
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
            sortBy: "ASCENDING",
            manualSortedValues: [],
            valueNormalization: {},
            menus: [],
            showMenu: false,
            textTransform: "NONE",
            paginationType: PaginationType.SCROLL,
            groupBySimilarValues: false,
            status: "PUBLISHED"
          });
        }

        // Add dynamic variant options
        if (storefrontFilters.options && typeof storefrontFilters.options === 'object') {
          const options = storefrontFilters.options;
          Object.keys(options).forEach((optionKey) => {
            const optionValues = options[optionKey];
            if (optionValues && optionValues.length > 0) {
              // Keep original case for variantOptionKey
              // Backend does case-insensitive matching but expects original case for consistency
              // ES stores optionPairs in original case, so we preserve it here
              const variantOptionKey = optionKey.trim();
              
              autoOptions.push({
                handle: generateFilterHandle(optionKey),
                position: position++,
                label: optionKey.charAt(0).toUpperCase() + optionKey.slice(1),
                optionType: getOptionType(optionKey),
                baseOptionType: getBaseOptionType(optionKey),
                displayType: DEFAULT_FILTER_OPTION.displayType,
                selectionType: DEFAULT_FILTER_OPTION.selectionType,
                targetScope: DEFAULT_FILTER_OPTION.targetScope,
                selectedValues: DEFAULT_FILTER_OPTION.selectedValues,
                allowedOptions: DEFAULT_FILTER_OPTION.allowedOptions,
                groups: DEFAULT_FILTER_OPTION.groups,
                collapsed: DEFAULT_FILTER_OPTION.collapsed,
                searchable: true, // Variant options are searchable by default
                showTooltip: DEFAULT_FILTER_OPTION.showTooltip,
                tooltipContent: DEFAULT_FILTER_OPTION.tooltipContent,
                showCount: DEFAULT_FILTER_OPTION.showCount,
                removePrefix: DEFAULT_FILTER_OPTION.removePrefix,
                removeSuffix: DEFAULT_FILTER_OPTION.removeSuffix,
                replaceText: DEFAULT_FILTER_OPTION.replaceText,
                filterByPrefix: DEFAULT_FILTER_OPTION.filterByPrefix,
                sortBy: DEFAULT_FILTER_OPTION.sortBy,
                manualSortedValues: DEFAULT_FILTER_OPTION.manualSortedValues,
                valueNormalization: DEFAULT_FILTER_OPTION.valueNormalization,
                menus: DEFAULT_FILTER_OPTION.menus,
                showMenu: DEFAULT_FILTER_OPTION.showMenu,
                textTransform: DEFAULT_FILTER_OPTION.textTransform,
                paginationType: DEFAULT_FILTER_OPTION.paginationType,
                groupBySimilarValues: DEFAULT_FILTER_OPTION.groupBySimilarValues,
                status: DEFAULT_FILTER_OPTION.status,
                // Performance Optimization: Store variant option key for faster aggregations
                // Keep original case - backend does case-insensitive matching but ES stores in original case
                variantOptionKey: variantOptionKey,
              });
            }
          });
        }

        updateFilterState({ filterOptions: autoOptions });
        
        // Set initial state with auto-populated options for create mode
        const createInitState: FilterState = {
          ...defaultFilterState,
          filterOptions: JSON.parse(JSON.stringify(autoOptions)),
          status: DEFAULT_FILTER.status,
          targetScope: DEFAULT_FILTER.targetScope,
          filterOrientation: DEFAULT_FILTER.filterOrientation,
          defaultView: DEFAULT_FILTER.defaultView,
          hideOutOfStockItems: false,
          onLaptop: "",
          onTablet: "",
          onMobile: "",
          defaultSort: "relevance",
          paginationType: PaginationType.PAGES,
          itemsPerPage: 24,
          showPageInfo: true,
          pageInfoFormat: "",
          showResetButton: true,
          showClearAllButton: true,
        };
        setInitialFilterState(createInitState);
      } else if (mode === "create") {
        // Create mode without auto-population - set empty initial state
        const createInitState: FilterState = {
          title: "",
          status: DEFAULT_FILTER.status,
          targetScope: DEFAULT_FILTER.targetScope,
          selectedCollections: [],
          filterOptions: [],
          filterOrientation: DEFAULT_FILTER.filterOrientation,
          defaultView: DEFAULT_FILTER.defaultView,
          showFilterCount: true,
          showActiveFilters: true,
          gridColumns: 3,
          showProductCount: true,
          showSortOptions: true,
          displayQuickView: false,
          displayItemsCount: true,
          displayVariantInsteadOfProduct: false,
          displayCollectionImage: false,
          hideOutOfStockItems: false,
          onLaptop: "",
          onTablet: "",
          onMobile: "",
          defaultSort: "relevance",
          paginationType: PaginationType.PAGES,
          itemsPerPage: 24,
          showPageInfo: true,
          pageInfoFormat: "",
          showResetButton: true,
          showClearAllButton: true,
        };
        setInitialFilterState(createInitState);
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
      const newScope = toTargetScope(event.currentTarget?.values?.[0]);
      updateFilterState({ targetScope: newScope });
      // Clear collections error when switching away from "entitled" or when collections are already selected
      if (newScope !== TargetScope.ENTITLED || selectedCollections.length > 0) {
        setCollectionsError("");
      }
    }
  }, [selectedCollections.length, collectionsError, updateFilterState]);

  // Detect changes using deepEqual
  useEffect(() => {
    if (!initialFilterState) return;
    
    const changed = !deepEqual(filterState, initialFilterState);
    
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
  }, [filterState, initialFilterState]);

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
    if (!initialFilterState) return;
    
    setFilterState(JSON.parse(JSON.stringify(initialFilterState)));
    
    // Remove data-save-bar to hide the save bar
    const form = document.querySelector('form[data-save-bar]') as HTMLFormElement;
    if (form) {
      form.removeAttribute('data-save-bar');
      form.removeAttribute('data-discard-confirmation');
      // Dispatch dismiss event
      const dismissEvent = new CustomEvent('shopify:save-bar:dismiss', { bubbles: true });
      form.dispatchEvent(dismissEvent);
    }
  }, [initialFilterState]);

  const handleAddFilterOption = () => {
    const newOption: FilterOption = {
      handle: generateFilterHandle('filter'),
      position: filterOptions.length,
      label: "New Filter",
      optionType: getOptionType("Collection"),
      baseOptionType: getBaseOptionType("Collection"),
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
      paginationType: PaginationType.SCROLL,
      groupBySimilarValues: false,
      status: "PUBLISHED",
    };
    updateFilterState({ filterOptions: [...filterOptions, newOption] });
    setExpandedOptions(new Set([...expandedOptions, newOption.handle]));
  };

  const handleDeleteOption = (handle: string) => {
    updateFilterState({ filterOptions: filterOptions.filter((opt) => opt.handle !== handle) });
    const newExpanded = new Set(expandedOptions);
    newExpanded.delete(handle);
    setExpandedOptions(newExpanded);
  };

  const handleUpdateOption = (
    handle: string,
    field: keyof FilterOption,
    value: string | boolean | number | string[]
  ) => {
    updateFilterState({
      filterOptions: filterOptions.map((opt) => {
        if (opt.handle === handle) {
          const updated = { ...opt, [field]: value };
          
          // When optionType changes, update handle and baseOptionType
          if (field === "optionType") {
            // Check if option was expanded before regenerating handle
            const wasExpanded = expandedOptions.has(handle);
            
            // Regenerate handle based on new optionType
            const newHandle = generateFilterHandle(value as string);
            updated.handle = newHandle;
            
            // Update expandedOptions set with new handle if it was expanded
            if (wasExpanded) {
              setExpandedOptions((prev) => {
                const newSet = new Set(prev);
                newSet.delete(handle); // Remove old handle
                newSet.add(newHandle); // Add new handle
                return newSet;
              });
            }
            
            // Update baseOptionType based on new optionType
            // This uses FacetAggregations structure to map optionType to baseOptionType
            // Standard types (Price, Vendor, ProductType, Tags, Collection) map to themselves
            // All variant options (Color, Size, etc.) map to "Option"
            updated.baseOptionType = getBaseOptionType(value as string);
            
            // Price-specific updates
            // Normalize both values for comparison
            const normalizedNewValue = getOptionType(value as string);
            const normalizedOldValue = getOptionType(opt.optionType);
            
            if (normalizedNewValue === "Price") {
              updated.selectionType = SelectionType.RANGE;
              updated.displayType = DisplayType.RANGE;
            } else if (normalizedOldValue === "Price" && normalizedNewValue !== "Price") {
              // Changing from Price to something else
              if (toSelectionType(updated.selectionType) === SelectionType.RANGE) {
                updated.selectionType = SelectionType.MULTIPLE;
              }
              if (toDisplayType(updated.displayType) === DisplayType.RANGE) {
                updated.displayType = DisplayType.LIST;
              }
            }
            
            // Update variantOptionKey for variant options
            // For standard types (PRICE, VENDOR, PRODUCT_TYPE, TAGS, COLLECTION), variantOptionKey should be undefined
            // For variant options (Color, Size, etc.), variantOptionKey should be the optionType in original case
            // Use getBaseOptionType to check if it's a standard type (returns GraphQL enum values)
            const baseOptionType = getBaseOptionType(value as string);
            // Standard types are: PRICE, VENDOR, PRODUCT_TYPE, TAGS, COLLECTION
            // OPTION is for variant options (Color, Size, etc.)
            const isStandardType = baseOptionType !== "OPTION";
            
            if (isStandardType) {
              // Standard types don't need variantOptionKey
              updated.variantOptionKey = undefined;
            } else {
              // Variant options: store optionType as variantOptionKey (keep original case)
              // Backend does case-insensitive matching but ES stores in original case
              updated.variantOptionKey = (value as string).trim();
            }
          }
          
          return updated;
        }
        return opt;
      }),
    });
  };

  const handleToggleExpand = (handle: string) => {
    const newExpanded = new Set(expandedOptions);
    if (newExpanded.has(handle)) {
      newExpanded.delete(handle);
    } else {
      newExpanded.add(handle);
    }
    setExpandedOptions(newExpanded);
  };

  const handleToggleVisibility = (handle: string) => {
    const option = filterOptions.find((opt) => opt.handle === handle);
    if (option) {
      const currentStatus = toFilterOptionStatus(option.status);
      const newStatus = currentStatus === FilterOptionStatus.PUBLISHED 
        ? FilterOptionStatus.UNPUBLISHED 
        : FilterOptionStatus.PUBLISHED;
      handleUpdateOption(handle, "status", newStatus);
    }
  };

  const getAvailableValues = (optionType: string): Array<{ value: string; count: number }> => {
    if (!storefrontFilters) return [];
    
    // Normalize optionType using getOptionType to ensure consistent matching
    const normalizedOptionType = getOptionType(optionType);
    
    switch (normalizedOptionType) {
      case "Price":
        // Price doesn't have a list of values, it's a range
        return [];
      case "Vendor":
        return storefrontFilters.vendors || [];
      case "ProductType":
        return storefrontFilters.productTypes || [];
      case "Tags":
        return storefrontFilters.tags || [];
      case "Collection":
        return storefrontFilters.collections || [];
      default:
        // For variant options, use the original optionType (not normalized) to look up in options
        // because variant option keys are stored in their original case
        if (storefrontFilters.options && storefrontFilters.options[optionType]) {
          return storefrontFilters.options[optionType];
        }
        return [];
    }
  };

  const getFilterTypes = (): string[] => {
    const types = [...BASE_FILTER_TYPES];
    if (storefrontFilters?.options && typeof storefrontFilters.options === 'object') {
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
    
    updateFilterState({ filterOptions: updatedOptions });
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
        baseOptionType,
        selectedValues,
        removeSuffix,
        replaceText,
        variantOptionKey,
        valueNormalization,
        groupBySimilarValues,
        removePrefix,
        filterByPrefix,
        sortBy,
        manualSortedValues,
        groups,
        menus,
        textTransform,
        paginationType,
        ...cleanOption
      } = option;
      
      // Ensure baseOptionType is set correctly based on optionType
      const finalBaseOptionType = baseOptionType || getBaseOptionType(option.optionType);
      
      // Build optionSettings object according to new schema structure
      const optionSettings: any = {};
      
      if (finalBaseOptionType) optionSettings.baseOptionType = finalBaseOptionType;
      if (selectedValues && selectedValues.length > 0) optionSettings.selectedValues = selectedValues;
      if (removeSuffix && removeSuffix.length > 0) optionSettings.removeSuffix = removeSuffix;
      if (replaceText && replaceText.length > 0) optionSettings.replaceText = replaceText;
      if (variantOptionKey) optionSettings.variantOptionKey = variantOptionKey;
      if (valueNormalization && Object.keys(valueNormalization).length > 0) optionSettings.valueNormalization = valueNormalization;
      if (groupBySimilarValues !== undefined) optionSettings.groupBySimilarValues = groupBySimilarValues;
      if (removePrefix && removePrefix.length > 0) optionSettings.removePrefix = removePrefix;
      if (filterByPrefix && filterByPrefix.length > 0) optionSettings.filterByPrefix = filterByPrefix;
      // Convert enum values using helper functions
      if (sortBy) optionSettings.sortBy = toSortOrder(sortBy);
      if (manualSortedValues && manualSortedValues.length > 0) optionSettings.manualSortedValues = manualSortedValues;
      if (groups && groups.length > 0) optionSettings.groups = groups;
      if (menus && menus.length > 0) optionSettings.menus = menus;
      if (textTransform) optionSettings.textTransform = toTextTransform(textTransform);
      if (paginationType) optionSettings.paginationType = toPaginationType(paginationType);
      
      return {
        ...cleanOption,
        tooltipContent: option.tooltipContent ?? "",
        allowedOptions: option.allowedOptions ?? [],
        showTooltip: option.showTooltip ?? false,
        showCount: option.showCount ?? true,
        // Convert enum values using helper functions
        status: toFilterOptionStatus(option.status),
        displayType: toDisplayType(option.displayType),
        selectionType: toSelectionType(option.selectionType),
        // Include optionSettings if it has any properties
        optionSettings: Object.keys(optionSettings).length > 0 ? optionSettings : undefined,
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
    if (targetScope === TargetScope.ENTITLED && selectedCollections.length === 0) {
      setCollectionsError("At least one collection must be selected when using specific collections");
      hasError = true;
    }

    const activeOptions = filterOptions.filter(opt => toFilterOptionStatus(opt.status) === FilterOptionStatus.PUBLISHED);
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
          mutation UpdateFilter($shop: String!, $id: String!, $input: CreateFilterInput!) {
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
        status: toFilterStatus(status),
        targetScope: typeof targetScope === 'string' ? targetScope : targetScope,
        allowedCollections: selectedCollections,
        options: normalizedOptions,
        settings: {
          displayQuickView,
          displayItemsCount,
          displayVariantInsteadOfProduct,
          defaultView: typeof defaultView === 'string' ? defaultView : defaultView,
          filterOrientation: typeof filterOrientation === 'string' ? filterOrientation : filterOrientation,
          displayCollectionImage,
          hideOutOfStockItems,
          onLaptop: onLaptop || undefined,
          onTablet: onTablet || undefined,
          onMobile: onMobile || undefined,
          productDisplay: {
            gridColumns,
            showProductCount,
            showSortOptions,
            defaultSort,
          },
          pagination: {
            type: paginationType,
            itemsPerPage,
            showPageInfo,
            pageInfoFormat: pageInfoFormat || undefined,
          },
          showFilterCount,
          showActiveFilters,
          showResetButton,
          showClearAllButton,
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
    if (initialFilterState && !deepEqual(filterState, initialFilterState)) {
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

  const isPriceFilter = (optionType: string) => getOptionType(optionType) === "Price";
  const getSelectionTypes = (optionType: string) => {
    return getAvailableSelectionTypes(optionType);
  };
  const getDisplayTypes = (optionType: string) => {
    return getAvailableDisplayTypes(optionType);
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
                  updateFilterState({ title: e.target.value });
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
                  checked={toFilterStatus(status) === FilterStatus.PUBLISHED}
                  onChange={(e: any) => updateFilterState({ status: e.target.checked ? FilterStatus.PUBLISHED : FilterStatus.UNPUBLISHED })}
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
              <s-choice selected={targetScope === TargetScope.ALL} value={TargetScope.ALL}>
                {t("filterForm.collectionDisplay.all")}
              </s-choice>
              <s-choice selected={targetScope === TargetScope.ENTITLED} value={TargetScope.ENTITLED}>
                {t("filterForm.collectionDisplay.specific")}
              </s-choice>
            </s-choice-list>
            {targetScope === TargetScope.ENTITLED && (
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
                                updateFilterState({ selectedCollections: selectedCollections.filter(c => c.id !== collection.id) });
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
                const isExpanded = expandedOptions.has(option.handle);
                const availableValues = getAvailableValues(option.optionType);
                const selectionTypes = getSelectionTypes(option.optionType);
                const displayTypes = getDisplayTypes(option.optionType);
                const isDragging = draggedIndex === index;
                const isDragOver = dragOverIndex === index;
                const dropPosition = getDropIndicatorPosition();
                const showDropAbove = isDragOver && dropPosition === 'above';
                const showDropBelow = isDragOver && dropPosition === 'below';

                return (
                  <div key={option.handle} style={{ position: 'relative' }}>
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
                                onChange={(e: any) => handleUpdateOption(option.handle, "label", e.target.value)}
                                placeholder="Filter label"
                              />
                            </div>
                            <div style={{ flex: 1, minWidth: "200px" }}>
                              <s-select
                                value={option.optionType}
                                onChange={(e: any) => handleUpdateOption(option.handle, "optionType", e.target.value)}
                              >
                                {getFilterTypes().map((type) => (
                                  <s-option key={type} value={type}>
                                    {type}
                                  </s-option>
                                ))}
                              </s-select>
                            </div>
                            <s-badge tone={toFilterOptionStatus(option.status) === FilterOptionStatus.PUBLISHED ? "success" : "warning"}>
                              {toFilterOptionStatus(option.status) === FilterOptionStatus.PUBLISHED ? "Active" : "Draft"}
                            </s-badge>
                            <s-button
                              variant="tertiary"
                              onClick={() => handleToggleExpand(option.handle)}
                              icon={isExpanded ? "chevron-up" : "chevron-down"}
                            >
                              {isExpanded ? "Hide settings" : "Show settings"}
                            </s-button>
                            <s-button
                              variant="tertiary"
                              tone="critical"
                              onClick={() => handleDeleteOption(option.handle)}
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
                                                if (value) handleUpdateOption(option.handle, "selectionType", value);
                                              }}
                                            >
                                              {selectionTypes.map((type: string) => (
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
                                              onChange={(e: any) => handleUpdateOption(option.handle, "selectionType", e.target.value)}
                                            >
                                              {selectionTypes.map((type: string) => (
                                                <s-option key={type} value={type}>
                                                  {type.charAt(0).toUpperCase() + type.slice(1)}
                                                </s-option>
                                              ))}
                                            </s-select>
                                          )}

                                          <s-select
                                            label="Display Style"
                                            value={option.displayType}
                                            onChange={(e: any) => handleUpdateOption(option.handle, "displayType", e.target.value)}
                                          >
                                            {displayTypes.map((type: string) => (
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
                                        checked={toFilterOptionStatus(option.status) === FilterOptionStatus.PUBLISHED}
                                        onChange={() => handleToggleVisibility(option.handle)}
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
                                        onChange={(e: any) => handleUpdateOption(option.handle, "collapsed", e.target.checked)}
                                      />
                                      {!isPriceFilter(option.optionType) && (
                                        <>
                                          <s-switch
                                            label="Enable search bar"
                                            checked={option.searchable}
                                            onChange={(e: any) => handleUpdateOption(option.handle, "searchable", e.target.checked)}
                                          />
                                          <s-switch
                                            label="Group similar values together"
                                            checked={option.groupBySimilarValues}
                                            onChange={(e: any) => handleUpdateOption(option.handle, "groupBySimilarValues", e.target.checked)}
                                          />
                                          <s-switch
                                            label="Show as hierarchical menu"
                                            checked={option.showMenu}
                                            onChange={(e: any) => handleUpdateOption(option.handle, "showMenu", e.target.checked)}
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
                                          onChange={(values) => handleUpdateOption(option.handle, "allowedOptions", values)}
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
                                          onChange={(e: any) => handleUpdateOption(option.handle, "sortBy", e.target.value)}
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
                                              handleUpdateOption(option.handle, "manualSortedValues", values);
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
                                          onChange={(e: any) => handleUpdateOption(option.handle, "textTransform", e.target.value)}
                                        >
                                          <s-option value="none">Normal (No change)</s-option>
                                          <s-option value="uppercase">UPPERCASE</s-option>
                                          <s-option value="lowercase">lowercase</s-option>
                                          <s-option value="capitalize">Capitalize First Letter</s-option>
                                        </s-select>
                                        <s-switch
                                          label="Show tooltip"
                                          checked={option.showTooltip ?? false}
                                          onChange={(e: any) => handleUpdateOption(option.handle, "showTooltip", e.target.checked)}
                                        />
                                        {option.showTooltip && (
                                          <s-text-field
                                            label="Tooltip Content"
                                            value={option.tooltipContent}
                                            onChange={(e: any) => handleUpdateOption(option.handle, "tooltipContent", e.target.value)}
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
                                            onChange={(values) => handleUpdateOption(option.handle, "menus", values)}
                                            availableValues={availableValues}
                                          />
                                        )}

                                        <s-text-field
                                          label="Filter by Prefix (Show only values starting with)"
                                          value={option.filterByPrefix.join(', ')}
                                          onChange={(e: any) => {
                                            const values = e.target.value.split(',').map((v: string) => v.trim()).filter((v: string) => v);
                                            handleUpdateOption(option.handle, "filterByPrefix", values);
                                          }}
                                          placeholder="e.g., Size-, Color- (comma-separated)"
                                        />
                                        <s-text-field
                                          label="Remove Prefix from Display"
                                          value={option.removePrefix.join(', ')}
                                          onChange={(e: any) => {
                                            const values = e.target.value.split(',').map((v: string) => v.trim()).filter((v: string) => v);
                                            handleUpdateOption(option.handle, "removePrefix", values);
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
                                    <s-stack direction="block" gap="base">
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
                            if (value) updateFilterState({ filterOrientation: toFilterOrientation(value) });
                          }}
                        >
                          <s-choice value={FilterOrientation.VERTICAL} selected={filterOrientation === FilterOrientation.VERTICAL}>
                            Vertical (Sidebar)
                          </s-choice>
                          <s-choice value={FilterOrientation.HORIZONTAL} selected={filterOrientation === FilterOrientation.HORIZONTAL}>
                            Horizontal (Top Bar)
                          </s-choice>
                        </s-choice-list>

                        <s-choice-list
                          label="Default Product View"
                          values={[defaultView]}
                          onChange={(e: any) => {
                            const value = e.currentTarget?.values?.[0];
                            if (value) updateFilterState({ defaultView: toDefaultView(value) });
                          }}
                        >
                          <s-choice value={DefaultView.GRID} selected={defaultView === DefaultView.GRID}>
                            Grid View
                          </s-choice>
                          <s-choice value={DefaultView.LIST} selected={defaultView === DefaultView.LIST}>
                            List View
                          </s-choice>
                        </s-choice-list>

                        {defaultView === DefaultView.GRID && (
                          <s-choice-list
                            label="Products per Row"
                            values={[gridColumns.toString()]}
                            onChange={(e: any) => {
                              const value = e.currentTarget?.values?.[0];
                              if (value) updateFilterState({ gridColumns: parseInt(value) });
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
                          value={defaultSort}
                          onChange={(e: any) => updateFilterState({ defaultSort: e.target.value })}
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
                          onChange={(e: any) => updateFilterState({ showProductCount: e.target.checked })}
                        />
                        <s-switch
                          label="Show sort options dropdown"
                          checked={showSortOptions}
                          onChange={(e: any) => updateFilterState({ showSortOptions: e.target.checked })}
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
                          values={[paginationType]}
                          onChange={(e: any) => {
                            const value = e.currentTarget?.values?.[0];
                            if (value) updateFilterState({ paginationType: toPaginationType(value) });
                          }}
                        >
                          <s-choice value={PaginationType.PAGES} selected={paginationType === PaginationType.PAGES}>Pages (1, 2, 3...)</s-choice>
                          <s-choice value={PaginationType.LOAD_MORE} selected={paginationType === PaginationType.LOAD_MORE}>Load More Button</s-choice>
                          <s-choice value={PaginationType.INFINITE_SCROLL} selected={paginationType === PaginationType.INFINITE_SCROLL}>Infinite Scroll</s-choice>
                        </s-choice-list>
                        <s-text-field
                          label="Items per Page"
                          value={itemsPerPage.toString()}
                          onChange={(e: any) => updateFilterState({ itemsPerPage: parseInt(e.target.value) || 24 })}
                        />
                        <s-switch
                          label="Show page info (e.g., 'Showing 1-24 of 120 products')"
                          checked={showPageInfo}
                          onChange={(e: any) => updateFilterState({ showPageInfo: e.target.checked })}
                        />
                        {showPageInfo && (
                          <s-text-field
                            label="Page Info Format (optional)"
                            value={pageInfoFormat}
                            onChange={(e: any) => updateFilterState({ pageInfoFormat: e.target.value })}
                            placeholder="e.g., 'Showing {start}-{end} of {total}'"
                          />
                        )}
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
                          onChange={(e: any) => updateFilterState({ showFilterCount: e.target.checked })}
                        />
                        <s-switch
                          label="Show active filters summary"
                          checked={showActiveFilters}
                          onChange={(e: any) => updateFilterState({ showActiveFilters: e.target.checked })}
                        />
                        <s-switch
                          label="Show 'Reset Filters' button"
                          checked={showResetButton}
                          onChange={(e: any) => updateFilterState({ showResetButton: e.target.checked })}
                        />
                        <s-switch
                          label="Show 'Clear All' button"
                          checked={showClearAllButton}
                          onChange={(e: any) => updateFilterState({ showClearAllButton: e.target.checked })}
                        />
                      </s-stack>
                    </s-stack>
                  </s-box>

                  {/* Section 5: Product Display Options */}
                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                    <s-stack direction="block" gap="base">
                      <s-heading>Product Display Options</s-heading>
                      <s-stack direction="block" gap="base">
                        <s-switch
                          label="Display quick view"
                          checked={displayQuickView}
                          onChange={(e: any) => updateFilterState({ displayQuickView: e.target.checked })}
                        />
                        <s-switch
                          label="Display items count"
                          checked={displayItemsCount}
                          onChange={(e: any) => updateFilterState({ displayItemsCount: e.target.checked })}
                        />
                        <s-switch
                          label="Display variant instead of product"
                          checked={displayVariantInsteadOfProduct}
                          onChange={(e: any) => updateFilterState({ displayVariantInsteadOfProduct: e.target.checked })}
                        />
                        <s-switch
                          label="Display collection image"
                          checked={displayCollectionImage}
                          onChange={(e: any) => updateFilterState({ displayCollectionImage: e.target.checked })}
                        />
                        <s-switch
                          label="Hide out of stock items"
                          checked={hideOutOfStockItems}
                          onChange={(e: any) => updateFilterState({ hideOutOfStockItems: e.target.checked })}
                        />
                      </s-stack>
                    </s-stack>
                  </s-box>

                  {/* Section 6: Responsive Display Settings */}
                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                    <s-stack direction="block" gap="base">
                      <s-heading>Responsive Display Settings</s-heading>
                      <s-stack direction="block" gap="base">
                        <s-text-field
                          label="On Laptop"
                          value={onLaptop}
                          onChange={(e: any) => updateFilterState({ onLaptop: e.target.value })}
                          placeholder="e.g., sidebar, top-bar"
                        />
                        <s-text-field
                          label="On Tablet"
                          value={onTablet}
                          onChange={(e: any) => updateFilterState({ onTablet: e.target.value })}
                          placeholder="e.g., sidebar, top-bar"
                        />
                        <s-text-field
                          label="On Mobile"
                          value={onMobile}
                          onChange={(e: any) => updateFilterState({ onMobile: e.target.value })}
                          placeholder="e.g., sidebar, top-bar"
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

