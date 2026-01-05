// utils/index.ts

import { $, API, DOM, FallbackMode, Lang, Log, SortField, SortOrder, State } from "../collections-main";

export function handleLoadError(e: unknown) {
    DOM.hideLoading();
    Log.error('Load failed', {
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
        shop: State.shop,
        apiBaseURL: API.baseURL
    });
    // Try to use fallback products if available
    if (State.fallbackProducts && State.fallbackProducts.length > 0) {
        Log.warn('Initial load failed, using fallback products from Liquid', {
            error: e instanceof Error ? e.message : String(e),
            fallbackCount: State.fallbackProducts.length
        });

        State.usingFallback = true; // Set fallback flag
        State.products = State.fallbackProducts;
        // Use pagination from URL params and Liquid data
        State.pagination = FallbackMode.getPagination();

        // Hide filters section when using fallback
        State.availableFilters = [];
        DOM.hideFilters();

        // Update sort select value based on URL params or current sort state
        if (DOM.sortSelect) {
            if ($.isBestSelling(State.sort.field)) {
                DOM.sortSelect.value = SortField.BEST_SELLING;
            } else {
                const direction = $.equals(State.sort.order, SortOrder.ASC) ? SortOrder.ASCENDING : SortOrder.DESCENDING;
                DOM.sortSelect.value = `${State.sort.field}-${direction}`;
            }
        }

        DOM.renderProducts(State.products);
        DOM.renderInfo(State.pagination, State.pagination.total);
        DOM.renderPagination(State.pagination);
        DOM.renderApplied(State.filters);

    } else {
        DOM.showError(`${Lang.messages.failedToLoad}: ${e instanceof Error ? e.message : Lang.messages.unknownError}. ${Lang.messages.checkConsole}`);
    }
}

export function fallbackProducts(e: unknown){
    // Try to use fallback products if available
    if (State.fallbackProducts && State.fallbackProducts.length > 0) {
        Log.warn('Initial load failed, using fallback products from Liquid', {
            error: e instanceof Error ? e.message : String(e),
            fallbackCount: State.fallbackProducts.length
        });

        State.usingFallback = true; // Set fallback flag
        State.products = State.fallbackProducts;
        // Use pagination from URL params and Liquid data
        State.pagination = FallbackMode.getPagination();

        // Hide filters section when using fallback
        State.availableFilters = [];
        DOM.hideFilters();

        // Update sort select value based on URL params or current sort state
        if (DOM.sortSelect) {
            if ($.isBestSelling(State.sort.field)) {
                DOM.sortSelect.value = SortField.BEST_SELLING;
            } else {
                const direction = $.equals(State.sort.order, SortOrder.ASC) ? SortOrder.ASCENDING : SortOrder.DESCENDING;
                DOM.sortSelect.value = `${State.sort.field}-${direction}`;
            }
        }

        DOM.renderProducts(State.products);
        DOM.renderInfo(State.pagination, State.pagination.total);
        DOM.renderPagination(State.pagination);
        DOM.renderApplied(State.filters);

    } else {
        DOM.showError(`${Lang.messages.failedToLoad}: ${e instanceof Error ? e.message : Lang.messages.unknownError}. ${Lang.messages.checkConsole}`);
    }
}