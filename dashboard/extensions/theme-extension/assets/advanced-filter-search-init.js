/**
 * Advanced Filter Search - Initialization Script
 * This script loads all modules and initializes AFS
 * 
 * Note: Individual modules must be loaded via schema attributes or manually
 * Due to 10KB limit per file, modules are split and loaded separately
 */

(function() {
  'use strict';
  
  // Wait for DOM and all modules to be ready
  function initAFS() {
    // Check if AFS is enabled (default to true if not set for backward compatibility)
    if (window.AFS_ENABLED === false) {
      console.info('[AFS] Advanced Filter Search is disabled via theme settings');
      return;
    }
    
    // Check if all required modules are loaded
    if (!window.AFS || typeof window.AFS.init !== 'function') {
      // Retry after a short delay if modules aren't loaded yet
      setTimeout(initAFS, 100);
      return;
    }
    
    // Get block settings from data attribute or global config
    const container = document.querySelector('[data-afs-container]');
    if (!container) {
      console.warn('[AFS] Container not found');
      return;
    }
    
    // Get shop domain from global variable set by Liquid
    const shopDomain = window.AFS_SHOP_DOMAIN || '';
    
    // Get settings from block data attribute or use defaults
    const blockData = container.getAttribute('data-afs-block-settings');
    
    // Find containers within this specific block
    const filtersContainer = container.querySelector('.afs-filters-container');
    const productsContainer = container.querySelector('.afs-products-container');
    
    if (!filtersContainer || !productsContainer) {
      console.warn('[AFS] Filters or products container not found within block');
      return;
    }
    
    let settings = {
      shop: shopDomain,
      container: container,
      filtersContainer: filtersContainer,
      productsContainer: productsContainer,
      apiBaseUrl: 'https://fstaging.digitalcoo.com'
    };
    
    if (blockData) {
      try {
        const parsed = JSON.parse(blockData);
        settings = { ...settings, ...parsed };
      } catch (e) {
        console.warn('[AFS] Failed to parse block settings', e);
      }
    }
    
    // Initialize AFS
    try {
      window.AFS.init(settings);
    } catch (error) {
      console.error('[AFS] Initialization failed', error);
    }
  }
  
  // Start initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAFS);
  } else {
    initAFS();
  }
})();

