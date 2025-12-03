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
    
    // Get settings from block data attribute or use defaults
    const blockData = container.getAttribute('data-afs-block-settings');
    let settings = {
      shop: container.getAttribute('data-shop') || '',
      container: '[data-afs-container]',
      filtersContainer: '.afs-filters-container',
      productsContainer: '.afs-products-container',
      apiBaseUrl: 'https://fstaging.digitalcoo.com',
      pageSize: 20
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

