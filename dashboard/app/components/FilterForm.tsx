import { useState, useEffect, useCallback, forwardRef } from "react";
import { useNavigate, useLocation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "../utils/translations";
import { generateFilterHandle } from "../utils/id-generator";
import { deepEqual, isTrue } from "../utils/equal";
import { DisplayType, SelectionType, FilterOptionStatus, FilterStatus, PaginationType, DeploymentChannel, TargetScope, FilterOrientation, DefaultView, toDisplayType, toSelectionType, toSortOrder, toFilterOptionStatus, toFilterStatus, toPaginationType, toTextTransform, toDeploymentChannel, toTargetScope, toFilterOrientation, toDefaultView, PageMode, FilterFormHandle, FilterState, FilterFormProps, CollectionReference, FilterOption } from "../utils/filter.enums";
import { DEFAULT_FILTER_OPTION, DEFAULT_FILTER, PRICE_FILTER_DEFAULTS, getBaseOptionType, getOptionType, getAvailableSelectionTypes, getAvailableDisplayTypes, SORT_TYPES_MAPPINGS, OPTION_TYPES } from "../utils/filter.constants";
import { normalizeShopifyId } from "app/utils/normalize-shopify-id";
import { MenuTreeBuilder } from "./MenuTreeBuilder";
import { AllowedOptionsSelector } from "./AllowedOptionsSelector";

const FilterForm = forwardRef<FilterFormHandle, FilterFormProps>(function FilterForm({
  mode,
  initialFilter,
  shop,
  storefrontFilters
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
    description: "",
    status: FilterStatus.PUBLISHED,
    filterType: "",
    targetScope: TargetScope.ALL,
    allowedCollections: [],
    filterOptions: [],
    deploymentChannel: DeploymentChannel.APP,
    tags: [],
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
    description,
    status,
    filterType,
    targetScope,
    allowedCollections,
    filterOptions,
    deploymentChannel,
    tags,
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
      // Normalize IDs for preselection - use gid if available, otherwise reconstruct from normalized id
      const preselected = allowedCollections
        .map((c) => {
          // If gid exists and is in GID format, use it
          if (c.gid && c.gid.startsWith('gid://')) {
            return { id: c.gid };
          }
          // Otherwise, reconstruct GID from normalized id
          if (c.id) {
            return { id: `gid://shopify/Collection/${c.id}` };
          }
          return null;
        })
        .filter((item): item is { id: string } => item !== null);

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
          id: normalizeShopifyId(collection.id),
          gid: collection.id || "",
          label: collection.title || "",
          value: collection.handle || collection.id || "",
        }));
        updateFilterState({ allowedCollections: newCollections });
        // Clear collections error when collections are selected
        if (collectionsError) setCollectionsError("");
      }
    } catch (error) {
      shopify.toast.show('Failed to open collection picker', { isError: true });
    }
  }, [shopify, allowedCollections]);

  useEffect(() => {
    if (mode === PageMode.EDIT && initialFilter) {
      const normalizedOptions = (initialFilter.options || []).map((option: FilterOption) => ({
        ...option,
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

      // Normalize allowedCollections IDs and ensure gid is set
      const normalizedAllowedCollections = (initialFilter.allowedCollections || []).map((collection: any) => {
        // Normalize the id field (handle both GID and numeric formats)
        const normalizedId = normalizeShopifyId(collection.id);
        // Use gid if available, otherwise try to reconstruct from id
        const gid = collection.gid || (collection.id?.startsWith('gid://') ? collection.id : `gid://shopify/Collection/${normalizedId}`);

        return {
          id: normalizedId, // Always use normalized ID for storage/comparison
          gid: gid, // Keep GID format for Shopify picker
          label: collection.label || "",
          value: collection.value || collection.handle || normalizedId,
        };
      });

      const initState: FilterState = {
        title: initialFilter.title || "",
        description: initialFilter.description || "",
        status: toFilterStatus(initialFilter.status),
        filterType: initialFilter.filterType || "",
        targetScope: toTargetScope(initialFilter.targetScope) || TargetScope.ALL,
        allowedCollections: normalizedAllowedCollections,
        filterOptions: JSON.parse(JSON.stringify(normalizedOptions)),
        deploymentChannel: toDeploymentChannel(initialFilter.deploymentChannel) || DeploymentChannel.APP,
        tags: initialFilter.tags || [],
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
        const storefrontPriceRange = storefrontFilters.price || (storefrontFilters as any).priceRange;
        if (storefrontPriceRange) {
          autoOptions.push({
            handle: generateFilterHandle('price'),
            position: position++,
            label: "Price",
            optionType: getOptionType("Price"),
            displayType: PRICE_FILTER_DEFAULTS.displayType,
            selectionType: PRICE_FILTER_DEFAULTS.selectionType,
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
            minPrice: storefrontPriceRange.min,
            maxPrice: storefrontPriceRange.max,
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
            displayType: DEFAULT_FILTER_OPTION.displayType,
            selectionType: DEFAULT_FILTER_OPTION.selectionType,
            allowedOptions: [...DEFAULT_FILTER_OPTION.allowedOptions],
            groups: [...DEFAULT_FILTER_OPTION.groups],
            collapsed: DEFAULT_FILTER_OPTION.collapsed,
            searchable: DEFAULT_FILTER_OPTION.searchable,
            showTooltip: DEFAULT_FILTER_OPTION.showTooltip,
            tooltipContent: DEFAULT_FILTER_OPTION.tooltipContent,
            showCount: DEFAULT_FILTER_OPTION.showCount,
            removePrefix: [...DEFAULT_FILTER_OPTION.removePrefix],
            removeSuffix: [...DEFAULT_FILTER_OPTION.removeSuffix],
            replaceText: [...DEFAULT_FILTER_OPTION.replaceText],
            filterByPrefix: [...DEFAULT_FILTER_OPTION.filterByPrefix],
            sortBy: DEFAULT_FILTER_OPTION.sortBy,
            manualSortedValues: [...DEFAULT_FILTER_OPTION.manualSortedValues],
            valueNormalization: { ...DEFAULT_FILTER_OPTION.valueNormalization },
            menus: [...DEFAULT_FILTER_OPTION.menus],
            showMenu: DEFAULT_FILTER_OPTION.showMenu,
            textTransform: DEFAULT_FILTER_OPTION.textTransform,
            paginationType: DEFAULT_FILTER_OPTION.paginationType,
            groupBySimilarValues: DEFAULT_FILTER_OPTION.groupBySimilarValues,
            status: DEFAULT_FILTER_OPTION.status,
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
            displayType: DEFAULT_FILTER_OPTION.displayType,
            selectionType: DEFAULT_FILTER_OPTION.selectionType,
            allowedOptions: [...DEFAULT_FILTER_OPTION.allowedOptions],
            groups: [...DEFAULT_FILTER_OPTION.groups],
            collapsed: DEFAULT_FILTER_OPTION.collapsed,
            searchable: DEFAULT_FILTER_OPTION.searchable,
            showTooltip: DEFAULT_FILTER_OPTION.showTooltip,
            tooltipContent: DEFAULT_FILTER_OPTION.tooltipContent,
            showCount: DEFAULT_FILTER_OPTION.showCount,
            removePrefix: [...DEFAULT_FILTER_OPTION.removePrefix],
            removeSuffix: [...DEFAULT_FILTER_OPTION.removeSuffix],
            replaceText: [...DEFAULT_FILTER_OPTION.replaceText],
            filterByPrefix: [...DEFAULT_FILTER_OPTION.filterByPrefix],
            sortBy: DEFAULT_FILTER_OPTION.sortBy,
            manualSortedValues: [...DEFAULT_FILTER_OPTION.manualSortedValues],
            valueNormalization: { ...DEFAULT_FILTER_OPTION.valueNormalization },
            menus: [...DEFAULT_FILTER_OPTION.menus],
            showMenu: DEFAULT_FILTER_OPTION.showMenu,
            textTransform: DEFAULT_FILTER_OPTION.textTransform,
            paginationType: DEFAULT_FILTER_OPTION.paginationType,
            groupBySimilarValues: DEFAULT_FILTER_OPTION.groupBySimilarValues,
            status: DEFAULT_FILTER_OPTION.status,
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
            displayType: DEFAULT_FILTER_OPTION.displayType,
            selectionType: DEFAULT_FILTER_OPTION.selectionType,
            allowedOptions: [...DEFAULT_FILTER_OPTION.allowedOptions],
            groups: [...DEFAULT_FILTER_OPTION.groups],
            collapsed: DEFAULT_FILTER_OPTION.collapsed,
            searchable: DEFAULT_FILTER_OPTION.searchable,
            showTooltip: DEFAULT_FILTER_OPTION.showTooltip,
            tooltipContent: DEFAULT_FILTER_OPTION.tooltipContent,
            showCount: DEFAULT_FILTER_OPTION.showCount,
            removePrefix: [...DEFAULT_FILTER_OPTION.removePrefix],
            removeSuffix: [...DEFAULT_FILTER_OPTION.removeSuffix],
            replaceText: [...DEFAULT_FILTER_OPTION.replaceText],
            filterByPrefix: [...DEFAULT_FILTER_OPTION.filterByPrefix],
            sortBy: DEFAULT_FILTER_OPTION.sortBy,
            manualSortedValues: [...DEFAULT_FILTER_OPTION.manualSortedValues],
            valueNormalization: { ...DEFAULT_FILTER_OPTION.valueNormalization },
            menus: [...DEFAULT_FILTER_OPTION.menus],
            showMenu: DEFAULT_FILTER_OPTION.showMenu,
            textTransform: DEFAULT_FILTER_OPTION.textTransform,
            paginationType: DEFAULT_FILTER_OPTION.paginationType,
            groupBySimilarValues: DEFAULT_FILTER_OPTION.groupBySimilarValues,
            status: DEFAULT_FILTER_OPTION.status,
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
            displayType: DEFAULT_FILTER_OPTION.displayType,
            selectionType: DEFAULT_FILTER_OPTION.selectionType,
            allowedOptions: [...DEFAULT_FILTER_OPTION.allowedOptions],
            groups: [...DEFAULT_FILTER_OPTION.groups],
            collapsed: DEFAULT_FILTER_OPTION.collapsed,
            searchable: DEFAULT_FILTER_OPTION.searchable,
            showTooltip: DEFAULT_FILTER_OPTION.showTooltip,
            tooltipContent: DEFAULT_FILTER_OPTION.tooltipContent,
            showCount: DEFAULT_FILTER_OPTION.showCount,
            removePrefix: [...DEFAULT_FILTER_OPTION.removePrefix],
            removeSuffix: [...DEFAULT_FILTER_OPTION.removeSuffix],
            replaceText: [...DEFAULT_FILTER_OPTION.replaceText],
            filterByPrefix: [...DEFAULT_FILTER_OPTION.filterByPrefix],
            sortBy: DEFAULT_FILTER_OPTION.sortBy,
            manualSortedValues: [...DEFAULT_FILTER_OPTION.manualSortedValues],
            valueNormalization: { ...DEFAULT_FILTER_OPTION.valueNormalization },
            menus: [...DEFAULT_FILTER_OPTION.menus],
            showMenu: DEFAULT_FILTER_OPTION.showMenu,
            textTransform: DEFAULT_FILTER_OPTION.textTransform,
            paginationType: DEFAULT_FILTER_OPTION.paginationType,
            groupBySimilarValues: DEFAULT_FILTER_OPTION.groupBySimilarValues,
            status: DEFAULT_FILTER_OPTION.status,
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
      } else if (mode === PageMode.CREATE) {
        // Create mode without auto-population - set empty initial state
        const createInitState: FilterState = {
          title: "",
          description: "",
          status: DEFAULT_FILTER.status,
          filterType: "",
          targetScope: DEFAULT_FILTER.targetScope,
          allowedCollections: [],
          filterOptions: [],
          deploymentChannel: DeploymentChannel.APP,
          tags: [],
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
    if (mode === PageMode.CREATE) {
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
      if (newScope !== TargetScope.ENTITLED || allowedCollections.length > 0) {
        setCollectionsError("");
      }
    }
  }, [allowedCollections.length, collectionsError, updateFilterState]);

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
      displayType: DEFAULT_FILTER_OPTION.displayType,
      selectionType: DEFAULT_FILTER_OPTION.selectionType,
      allowedOptions: [...DEFAULT_FILTER_OPTION.allowedOptions],
      groups: [...DEFAULT_FILTER_OPTION.groups],
      collapsed: DEFAULT_FILTER_OPTION.collapsed,
      searchable: DEFAULT_FILTER_OPTION.searchable,
      showTooltip: DEFAULT_FILTER_OPTION.showTooltip,
      tooltipContent: DEFAULT_FILTER_OPTION.tooltipContent,
      showCount: DEFAULT_FILTER_OPTION.showCount,
      removePrefix: [...DEFAULT_FILTER_OPTION.removePrefix],
      removeSuffix: [...DEFAULT_FILTER_OPTION.removeSuffix],
      replaceText: [...DEFAULT_FILTER_OPTION.replaceText],
      filterByPrefix: [...DEFAULT_FILTER_OPTION.filterByPrefix],
      sortBy: DEFAULT_FILTER_OPTION.sortBy,
      manualSortedValues: [...DEFAULT_FILTER_OPTION.manualSortedValues],
      valueNormalization: { ...DEFAULT_FILTER_OPTION.valueNormalization },
      menus: [...DEFAULT_FILTER_OPTION.menus],
      showMenu: DEFAULT_FILTER_OPTION.showMenu,
      textTransform: DEFAULT_FILTER_OPTION.textTransform,
      paginationType: DEFAULT_FILTER_OPTION.paginationType,
      groupBySimilarValues: DEFAULT_FILTER_OPTION.groupBySimilarValues,
      status: DEFAULT_FILTER_OPTION.status,
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
                updated.displayType = DisplayType.CHECKBOX;
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

          if (field === "selectionType") {
            // If changing selectionType or displayType from/to RANGE, ensure consistency
            if (opt.selectionType === SelectionType.SINGLE && opt.displayType === DisplayType.RADIO) {
              updated.displayType = DisplayType.CHECKBOX;
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
    const types = [...OPTION_TYPES];
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

  // Build payload object synchronously from current state
  const buildPayload = () => {
    const normalizedOptions = normalizeFilterOptions(filterOptions);

    const mutation = mode === PageMode.CREATE
      ? `
          mutation CreateFilter($shop: String!, $input: CreateFilterInput!) {
            createFilter(shop: $shop, input: $input) {
              id
              title
              status
              filterType
              targetScope
              allowedCollections {
                id
                gid
                label
                value
              }
              deploymentChannel
              isActive
              createdAt
              updatedAt
            }
          }
        `
      : `
          mutation UpdateFilter($shop: String!, $id: String!, $input: CreateFilterInput!) {
            updateFilter(shop: $shop, id: $id, input: $input) {
              id
              title
              status
              filterType
              targetScope
              allowedCollections {
                id
                gid
                label
                value
              }
              deploymentChannel
              isActive
              version
              updatedAt
            }
          }
        `;

    const input: any = {
      title: title.trim(),
      description: description.trim() || undefined,
      status: toFilterStatus(status),
      filterType: filterType.trim() || undefined,
      targetScope: targetScope,
      allowedCollections: targetScope === TargetScope.ENTITLED ? allowedCollections : [],
      options: normalizedOptions,
      deploymentChannel: deploymentChannel,
      tags: tags.length > 0 ? tags : undefined,
      settings: {
        displayQuickView,
        displayItemsCount,
        displayVariantInsteadOfProduct,
        defaultView: defaultView,
        filterOrientation: filterOrientation,
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

    const variables: any = mode === PageMode.CREATE ? { input } : { id: initialFilter?.id, input };

    return { mutation, variables };
  };

  // Called when the HTML form is submitted; synchronously populate hidden payload and allow the browser to post
  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // Always prevent default upfront

    // Reset previous errors
    setTitleError("");
    setOptionsError("");
    setCollectionsError("");

    let hasError = false;

    // Client-side validation
    if (!title.trim()) {
      setTitleError("Filter title is required");
      hasError = true;
    }

    if (targetScope === TargetScope.ENTITLED && allowedCollections.length === 0) {
      setCollectionsError("At least one collection must be selected when using specific collections");
      hasError = true;
    }

    const activeOptions = filterOptions.filter(
      (opt) => toFilterOptionStatus(opt.status) === FilterOptionStatus.PUBLISHED
    );
    if (activeOptions.length === 0) {
      setOptionsError("At least one filter option must be active");
      hasError = true;
    }

    if (hasError) {
      shopify.toast.show("Please fix the following errors", { isError: true });
      return;
    }

    // Build payload
    const { mutation, variables } = buildPayload();
    const payload = {
      mode: mode,
      id: initialFilter?.id || null,
      mutation,
      variables,
      shop: shop
    };

    setIsSaving(true);

    try {
      // POST to Remix action
      const response = await fetch(window.location.pathname, {
        method: "POST",
        headers: {
          "Content-Type": "application/json", // Send JSON so action can parse it
          Accept: "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ payload }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.success === false) {
        const message = data?.error || data?.message || `Failed to ${mode === PageMode.CREATE ? "create" : "update"} filter`;
        shopify.toast.show(message, { isError: true });
        return;
      }

      shopify.toast.show(`Filter ${mode === PageMode.CREATE ? "created" : "updated"} successfully`);
      if (isTrue(mode, "equals", PageMode.CREATE)) {
        navigate(`/app/filters?shop=${shop}`);
      }
    } catch (err: any) {
      shopify.toast.show(err?.message || "Failed to submit filter", { isError: true });
    } finally {
      setIsSaving(false);
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

  const saveButton = (
    <s-stack alignItems="end">
      <s-button
        loading={isSaving}
        disabled={isSaving}
        type="submit"
        variant="primary"
      >
        Save Filter
      </s-button>
    </s-stack>
  );

  return (
    <form id="filter-form" onSubmit={handleFormSubmit}>

      {saveButton}

      <s-stack direction="block" gap="base" padding="base none large none">
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
                    accessibilityLabel="Add collection"
                  >
                    {t("filterForm.collectionDisplay.selectCollections")}
                  </s-button>
                  {allowedCollections.length > 0 && (
                    <s-stack direction="block" gap="small">
                      <s-text tone="auto">{t("filterForm.collectionDisplay.allowedCollections")}</s-text>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {allowedCollections.map((collection) => (
                          <s-badge key={collection.id}>
                            {collection.label}
                            <button
                              type="button"
                              onClick={() => {
                                updateFilterState({ allowedCollections: allowedCollections.filter(c => c.id !== collection.id) });
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
        <s-section heading="Filter Options">
          <s-stack direction="block" gap="base">
            {optionsError && (
              <s-banner tone="critical">
                <s-text>{optionsError}</s-text>
              </s-banner>
            )}

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
                                accessibilityLabel="Delete"
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
                                            <s-choice-list
                                              label="Selection Type"
                                              values={[option.selectionType]}
                                              onChange={(e: any) => {
                                                const value = e.currentTarget?.values?.[0];
                                                if (value) handleUpdateOption(option.handle, "selectionType", value);
                                              }}
                                              name="selectionType"
                                            >
                                              {selectionTypes.map((type: string) => (
                                                <s-choice
                                                  key={type}
                                                  value={type}
                                                  selected={option.selectionType === type}
                                                >
                                                  {type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()}
                                                </s-choice>
                                              ))}
                                            </s-choice-list>

                                            <s-choice-list
                                              label="Display Style"
                                              values={[option.displayType]}
                                              onChange={(e: any) => {
                                                const value = e.currentTarget?.values?.[0];
                                                if (value) handleUpdateOption(option.handle, "displayType", value);
                                              }}
                                              name="displayType"
                                            >
                                              {displayTypes.map((type: string) => (
                                                <s-choice
                                                  key={type}
                                                  value={type}
                                                  selected={option.displayType === type}
                                                  disabled={option.selectionType !== SelectionType.SINGLE && DisplayType.RADIO === type}
                                                >
                                                  {type.charAt(0).toUpperCase() + type.slice(1).toLowerCase().replace('_', ' ')}
                                                </s-choice>
                                              ))}
                                            </s-choice-list>
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

                                      </s-stack>
                                    </s-stack>
                                  </s-box>

                                  {/* Section 2: Display & Behavior */}
                                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                                    <s-stack direction="block" gap="base">
                                      <s-heading>Display & Behavior</s-heading>
                                      <s-stack direction="block" gap="base">
                                        <s-switch
                                          label="Enable this filter"
                                          checked={toFilterOptionStatus(option.status) === FilterOptionStatus.PUBLISHED}
                                          onChange={() => handleToggleVisibility(option.handle)}
                                        />
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
                                            {/* <s-switch
                                              label="Show as hierarchical menu"
                                              checked={option.showMenu}
                                              onChange={(e: any) => handleUpdateOption(option.handle, "showMenu", e.target.checked)}
                                            /> */}
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
                                          <s-choice-list
                                            label="Sort Order By"
                                            values={[option.sortBy]}
                                            onChange={(e: any) => {
                                              const value = e.currentTarget?.values?.[0];
                                              if (value) handleUpdateOption(option.handle, "sortBy", value);
                                            }}
                                            name="sortBy"
                                          >
                                            {SORT_TYPES_MAPPINGS.map((type: any) => (
                                              <s-choice
                                                key={type.value}
                                                value={type.value}
                                                selected={option.sortBy === type.value}
                                              >
                                                {type.label}
                                              </s-choice>
                                            ))}
                                          </s-choice-list>
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
                                  {isPriceFilter(option.optionType) && (storefrontFilters?.price || (storefrontFilters as any)?.priceRange) && (
                                    <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                                      <s-stack direction="block" gap="base">
                                        <s-heading>Price Range Information</s-heading>
                                        <s-stack direction="block" gap="small">
                                          <s-text tone="auto">
                                            The price filter will display as a range slider with the following price range:
                                          </s-text>
                                          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                                            <div style={{ fontSize: '18px', fontWeight: '600' }}>
                                              ${((storefrontFilters?.price || (storefrontFilters as any)?.priceRange) as any).min.toLocaleString()} - ${((storefrontFilters?.price || (storefrontFilters as any)?.priceRange) as any).max.toLocaleString()}
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

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <s-button
                variant="primary"
                onClick={handleAddFilterOption}
                icon="plus"
                accessibilityLabel="Add filter option"
              >
                Add filter option
              </s-button>
            </div>
          </s-stack>
        </s-section>

        {/* General Settings - Collapsed by Default */}
        {false && (
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
                            name="FilterPosition"
                          >
                            <s-choice value={FilterOrientation.VERTICAL} selected={filterOrientation === FilterOrientation.VERTICAL}>
                              Vertical (Sidebar)
                            </s-choice>
                            <s-choice disabled value={FilterOrientation.HORIZONTAL} selected={filterOrientation === FilterOrientation.HORIZONTAL}>
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
                            name="DefaultProductView"
                          >
                            <s-choice disabled value={DefaultView.GRID} selected={defaultView === DefaultView.GRID}>
                              Grid View
                            </s-choice>
                            <s-choice disabled value={DefaultView.LIST} selected={defaultView === DefaultView.LIST}>
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
                              name="ProductsPerRow"
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
                    {/* <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
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
                  </s-box> */}

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
                            name="PaginationType"
                          >
                            <s-choice value={PaginationType.PAGES} selected={paginationType === PaginationType.PAGES}>Pages (1, 2, 3...)</s-choice>
                            <s-choice value={PaginationType.LOAD_MORE} selected={paginationType === PaginationType.LOAD_MORE}>Load More Button</s-choice>
                            <s-choice value={PaginationType.INFINITE_SCROLL} selected={paginationType === PaginationType.INFINITE_SCROLL}>Infinite Scroll</s-choice>
                          </s-choice-list>
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
        )}

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

      {saveButton}
    </form>
  );
});

export default FilterForm;

