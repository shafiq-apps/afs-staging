/**
 * Advanced Filter Search - Quick View & Slider Module
 * 
 * Handles product quick view modal functionality and image slider
 * Exports reusable functions for use in advanced-filter-search.ts
 */

import { $, AFSW, Icons, Lang, Log, Product, ProductModalElement, ProductVariant, QuickAdd, SpecialValue, State } from './collections-main';
import { waitForElement, waitForElements } from './utils/dom-ready';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface SliderOptions {
  thumbnailsPosition?: 'top' | 'left' | 'right' | 'bottom';
  enableKeyboard?: boolean;
  enableAutoHeight?: boolean;
  maxHeight?: number | null;
  animationDuration?: number;
  enableMagnifier?: boolean;
  magnifierZoom?: number;
}

interface SliderSlideChangeEventDetail {
  index: number;
  total: number;
}

// ============================================================================
// SLIDER CLASS
// ============================================================================

class AFSSlider {
  private container: HTMLElement;
  private options: Required<Omit<SliderOptions, 'maxHeight'>> & { maxHeight: number | null };
  private _currentIndex: number = 0;

  // Public getter for currentIndex to match SliderInstance interface
  get currentIndex(): number {
    return this._currentIndex;
  }
  private images: HTMLImageElement[] = [];
  private thumbnails: HTMLElement[] = [];
  private isInitialized: boolean = false;
  private magnifierEnabled: boolean = false;
  private magnifierZoom: number = 3;
  private isTouchDevice: boolean = false;
  private mainContainer: HTMLElement | null = null;
  private thumbnailContainer: HTMLElement | null = null;
  private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(container: string | HTMLElement, options: SliderOptions = {}) {
    const containerElement = typeof container === 'string' ? document.querySelector<HTMLElement>(container) : container;

    if (!containerElement) {
      console.error('AFSSlider: Container not found');
      throw new Error('AFSSlider: Container not found');
    }

    this.container = containerElement;

    this.options = {
      thumbnailsPosition: options.thumbnailsPosition || 'left',
      enableKeyboard: options.enableKeyboard !== false,
      enableAutoHeight: options.enableAutoHeight !== false,
      maxHeight: options.maxHeight || null,
      animationDuration: options.animationDuration || 300,
      enableMagnifier: options.enableMagnifier !== false,
      magnifierZoom: options.magnifierZoom || 3,
      ...options
    } as Required<Omit<SliderOptions, 'maxHeight'>> & { maxHeight: number | null };

    this.magnifierEnabled = this.options.enableMagnifier;
    this.magnifierZoom = this.options.magnifierZoom;
    this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    this.init();
  }

  private init(): void {
    // Find main image container
    this.mainContainer = this.container.querySelector<HTMLElement>('.afs-slider__main');
    if (!this.mainContainer) {
      console.error('AFSSlider: Main container (.afs-slider__main) not found');
      return;
    }

    // Find thumbnail container
    this.thumbnailContainer = this.container.querySelector<HTMLElement>('.afs-slider__thumbnails');
    if (!this.thumbnailContainer) {
      console.error('AFSSlider: Thumbnail container (.afs-slider__thumbnails) not found');
      return;
    }

    // Get all images
    const imageElements = this.mainContainer.querySelectorAll<HTMLImageElement>('.afs-slider__image');
    this.images = Array.from(imageElements);
    if (this.images.length === 0) {
      console.error('AFSSlider: No images found');
      return;
    }

    // Get all thumbnails
    const thumbnailElements = this.thumbnailContainer.querySelectorAll<HTMLElement>('.afs-slider__thumbnail');
    this.thumbnails = Array.from(thumbnailElements);

    // Set thumbnail position
    this.container.setAttribute('data-thumbnails-position', this.options.thumbnailsPosition);

    // Build slider structure
    try {
      this.buildSlider();
    } catch (e) {
      console.error('AFSSlider: Error building slider structure', e);
      return;
    }

    // Setup event listeners
    try {
      this.setupEvents();
    } catch (e) {
      console.error('AFSSlider: Error setting up events', e);
      // Continue anyway - basic functionality should still work
    }

    // Setup pan-zoom magnifier if enabled and not touch device
    if (this.magnifierEnabled && !this.isTouchDevice) {
      try {
        this.setupPanZoom();
      } catch (e) {
        console.error('AFSSlider: Error setting up pan-zoom', e);
        // Continue anyway - magnifier is optional
      }
    }

    // Setup pinch-to-zoom for touch devices
    if (this.isTouchDevice) {
      try {
        this.setupPinchZoom();
      } catch (e) {
        console.error('AFSSlider: Error setting up pinch-zoom', e);
        // Continue anyway - zoom is optional
      }
    }

    // Show first image
    try {
      this.goToSlide(0);
    } catch (e) {
      console.error('AFSSlider: Error showing first slide', e);
      // Continue anyway
    }

    this.isInitialized = true;
  }

  private buildSlider(): void {
    if (!this.mainContainer) return;

    // Wrap main images in a viewport
    if (!this.mainContainer.querySelector('.afs-slider__viewport')) {
      const viewport = document.createElement('div');
      viewport.className = 'afs-slider__viewport';

      // Move images into viewport
      this.images.forEach(img => {
        viewport.appendChild(img);
      });

      this.mainContainer.appendChild(viewport);
    }

    // Add navigation buttons if not present
    if (!this.mainContainer.querySelector('.afs-slider__prev')) {
      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'afs-slider__prev';
      prevBtn.setAttribute('aria-label', 'Previous image');
      prevBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';
      this.mainContainer.appendChild(prevBtn);
    }

    if (!this.mainContainer.querySelector('.afs-slider__next')) {
      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'afs-slider__next';
      nextBtn.setAttribute('aria-label', 'Next image');
      nextBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';
      this.mainContainer.appendChild(nextBtn);
    }

    // Setup thumbnail click handlers
    this.thumbnails.forEach((thumb, index) => {
      thumb.addEventListener('click', () => {
        this.goToSlide(index);
      });
    });

    // Setup navigation buttons
    const prevBtn = this.mainContainer.querySelector<HTMLButtonElement>('.afs-slider__prev');
    const nextBtn = this.mainContainer.querySelector<HTMLButtonElement>('.afs-slider__next');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.prevSlide());
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.nextSlide());
    }
  }

  private setupEvents(): void {
    // Keyboard navigation
    if (this.options.enableKeyboard) {
      this.keyboardHandler = (e: KeyboardEvent) => {
        if (!this.isInitialized) return;

        // Only handle if slider is visible (check if container is in viewport)
        const rect = this.container.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        switch (e.key) {
          case 'ArrowLeft':
            e.preventDefault();
            this.prevSlide();
            break;
          case 'ArrowRight':
            e.preventDefault();
            this.nextSlide();
            break;
          case 'Escape':
            // Reset zoom on escape using CSS class
            const activeImage = this.images[this.currentIndex];
            if (activeImage) {
              activeImage.classList.remove('afs-slider__image--zoomed');
              activeImage.classList.add('afs-slider__image--zoom-reset');
              setTimeout(() => {
                activeImage.classList.remove('afs-slider__image--zoom-reset');
              }, 200);
            }
            break;
        }
      };

      document.addEventListener('keydown', this.keyboardHandler);
    }

    // Touch/swipe support for mobile
    this.setupTouchEvents();

    // Auto-adjust height
    if (this.options.enableAutoHeight) {
      this.adjustHeight();
      window.addEventListener('resize', () => this.adjustHeight());
    }
  }

  private setupTouchEvents(): void {
    if (!this.mainContainer) return;

    let startX = 0;
    let startY = 0;
    let isDragging = false;

    const viewport = this.mainContainer.querySelector<HTMLElement>('.afs-slider__viewport');
    if (!viewport) return;

    viewport.addEventListener('touchstart', (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isDragging = true;
    }, { passive: true });

    viewport.addEventListener('touchmove', (e: TouchEvent) => {
      if (!isDragging) return;
      e.preventDefault();
    }, { passive: false });

    viewport.addEventListener('touchend', (e: TouchEvent) => {
      if (!isDragging) return;
      isDragging = false;

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = startX - endX;
      const diffY = startY - endY;

      // Only handle horizontal swipes (ignore if vertical swipe is larger)
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
        if (diffX > 0) {
          this.nextSlide();
        } else {
          this.prevSlide();
        }
      }
    }, { passive: true });
  }

  private setupPanZoom(): void {
    if (!this.mainContainer) return;

    const viewport = this.mainContainer.querySelector<HTMLElement>('.afs-slider__viewport');
    if (!viewport) return;

    // Add zoom class to viewport for cursor styling
    viewport.classList.add('afs-slider__viewport--zoomable');

    const SCALE = this.magnifierZoom || 3;

    // Mouse move: pan image
    viewport.addEventListener('mousemove', (e: MouseEvent) => {
      const activeImage = this.images[this._currentIndex];
      if (!activeImage) return;

      const rect = viewport.getBoundingClientRect();

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const xPercent = x / rect.width;
      const yPercent = y / rect.height;

      const translateX = -xPercent * (activeImage.offsetWidth * SCALE - rect.width);
      const translateY = -yPercent * (activeImage.offsetHeight * SCALE - rect.height);

      // Use inline transform for zoom (necessary for dynamic pan-zoom)
      // But use CSS class for transition control
      activeImage.style.transform = `
        scale(${SCALE})
        translate(${translateX / SCALE}px, ${translateY / SCALE}px)
      `;
      activeImage.classList.add('afs-slider__image--zoomed');
    });

    // Mouse enter: enable smooth transition
    viewport.addEventListener('mouseenter', () => {
      const activeImage = this.images[this._currentIndex];
      if (activeImage) {
        activeImage.classList.add('afs-slider__image--zoomed');
      }
    });

    // Mouse leave: reset zoom
    viewport.addEventListener('mouseleave', () => {
      const activeImage = this.images[this._currentIndex];
      if (activeImage) {
        // Reset transform to scale(1) and remove translate
        activeImage.style.transform = 'scale(1) translate(0, 0)';
        activeImage.classList.remove('afs-slider__image--zoomed');
        activeImage.classList.add('afs-slider__image--zoom-reset');
        // Remove reset class after transition
        setTimeout(() => {
          activeImage.classList.remove('afs-slider__image--zoom-reset');
        }, 200);
      }
    });
  }

  /**
   * Setup pinch-to-zoom for touch devices
   */
  private setupPinchZoom(): void {
    if (!this.mainContainer || !this.isTouchDevice) return;

    const viewport = this.mainContainer.querySelector<HTMLElement>('.afs-slider__viewport');
    if (!viewport) return;

    let initialDistance = 0;
    let currentScale = 1;
    let lastTouchTime = 0;
    let doubleTapTimeout: ReturnType<typeof setTimeout> | null = null;

    viewport.addEventListener('touchstart', (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Pinch gesture
        e.preventDefault();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        initialDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
        const activeImage = this.images[this._currentIndex];
        if (activeImage) {
          // Get current scale from transform
          const transform = activeImage.style.transform || '';
          const scaleMatch = transform.match(/scale\(([\d.]+)\)/);
          currentScale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
        }
      } else if (e.touches.length === 1) {
        // Single touch - check for double tap
        const now = Date.now();
        if (now - lastTouchTime < 300) {
          // Double tap detected
          e.preventDefault();
          if (doubleTapTimeout) clearTimeout(doubleTapTimeout);

          const activeImage = this.images[this._currentIndex];
          if (activeImage) {
            const transform = activeImage.style.transform || '';
            const scaleMatch = transform.match(/scale\(([\d.]+)\)/);
            let currentScale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;

            if (currentScale > 1) {
              // Reset zoom
              activeImage.style.transform = 'scale(1) translate(0, 0)';
              currentScale = 1;
            } else {
              // Zoom in
              const rect = viewport.getBoundingClientRect();
              const touch = e.touches[0];
              const x = touch.clientX - rect.left;
              const y = touch.clientY - rect.top;
              const zoomScale = 2.5;

              activeImage.style.transform = `scale(${zoomScale}) translate(${(rect.width / 2 - x) / zoomScale}px, ${(rect.height / 2 - y) / zoomScale}px)`;
              currentScale = zoomScale;
            }
          }
        } else {
          lastTouchTime = now;
        }
      }
    }, { passive: false });

    viewport.addEventListener('touchmove', (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Pinch gesture
        e.preventDefault();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );

        const scale = Math.max(1, Math.min(4, currentScale * (distance / initialDistance)));
        const activeImage = this.images[this._currentIndex];

        if (activeImage) {
          const rect = viewport.getBoundingClientRect();
          const centerX = (touch1.clientX + touch2.clientX) / 2 - rect.left;
          const centerY = (touch1.clientY + touch2.clientY) / 2 - rect.top;

          const translateX = (rect.width / 2 - centerX) / scale;
          const translateY = (rect.height / 2 - centerY) / scale;

          activeImage.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
        }
      }
    }, { passive: false });

    viewport.addEventListener('touchend', () => {
      initialDistance = 0;
    });
  }

  goToSlide(index: number): void {
    if (index < 0 || index >= this.images.length) return;

    this._currentIndex = index;

    // Update images visibility - use CSS classes only (inline styles override CSS)
    this.images.forEach((img, i) => {
      if (i === index) {
        img.classList.add('afs-slider__image--active');
        // Removed inline style.display - let CSS handle it via --active class
      } else {
        img.classList.remove('afs-slider__image--active');
        // Removed inline style.display - let CSS handle it via --active class
      }
    });

    // Reset zoom when slide changes using CSS class
    const activeImage = this.images[this._currentIndex];
    if (activeImage) {
      activeImage.classList.remove('afs-slider__image--zoomed');
      activeImage.classList.add('afs-slider__image--zoom-reset');
      setTimeout(() => {
        activeImage.classList.remove('afs-slider__image--zoom-reset');
      }, 200);
    }

    // Update thumbnails
    this.thumbnails.forEach((thumb, i) => {
      thumb.classList.toggle('afs-slider__thumbnail--active', i === index);
    });

    // Adjust height if enabled
    if (this.options.enableAutoHeight) {
      this.adjustHeight();
    }

    // Trigger custom event
    this.container.dispatchEvent(new CustomEvent<SliderSlideChangeEventDetail>('afs-slider:slide-change', {
      detail: { index, total: this.images.length }
    }));
  }

  prevSlide(): void {
    const newIndex = this._currentIndex > 0
      ? this._currentIndex - 1
      : this.images.length - 1;
    this.goToSlide(newIndex);
  }

  nextSlide(): void {
    const newIndex = this._currentIndex < this.images.length - 1
      ? this._currentIndex + 1
      : 0;
    this.goToSlide(newIndex);
  }

  private adjustHeight(): void {
    const activeImage = this.images[this._currentIndex];
    if (!activeImage) return;

    // Wait for image to load
    if (activeImage.complete) {
      this.setHeight(activeImage);
    } else {
      activeImage.addEventListener('load', () => {
        this.setHeight(activeImage);
      }, { once: true });
    }
  }

  private setHeight(image: HTMLImageElement): void {
    if (!this.mainContainer) return;

    const viewport = this.mainContainer.querySelector<HTMLElement>('.afs-slider__viewport');
    if (!viewport) return;

    // If maxHeight is set, use fixed height
    if (this.options.maxHeight) {
      viewport.style.height = `${this.options.maxHeight}px`;
      viewport.style.minHeight = `${this.options.maxHeight}px`;
      viewport.style.maxHeight = `${this.options.maxHeight}px`;
      return;
    }

    const imgHeight = image.naturalHeight || image.offsetHeight;
    const imgWidth = image.naturalWidth || image.offsetWidth;
    const containerWidth = this.mainContainer.offsetWidth;
    // Calculate aspect ratio
    const aspectRatio = imgHeight / imgWidth;
    const calculatedHeight = containerWidth * aspectRatio;

    viewport.style.height = `${calculatedHeight}px`;
    viewport.style.minHeight = `${calculatedHeight}px`;
  }

  /**
   * Update slider to show variant's image
   * @param variant - Variant object with image property
   * @param productImages - Array of product image URLs
   * @param allVariants - Optional: Array of all product variants for variant_ids optimization
   * @returns Returns true if image was found and updated, false otherwise
   */
  updateVariantImage(variant: ProductVariant, productImages: string[], allVariants?: ProductVariant[]): boolean {
    if (!variant || !productImages || !Array.isArray(productImages) || productImages.length === 0) {
      return false;
    }

    const currentVariantId = variant.id;

    // OPTIMIZATION: Quick check using variant_ids array if allVariants is provided
    if (allVariants && Array.isArray(allVariants)) {
      // Check if current variant has featured_image with variant_ids
      if (variant.featured_image && typeof variant.featured_image === 'object' && variant.featured_image.variant_ids) {
        const variantImagePosition = variant.featured_image.position;
        if (variantImagePosition !== null && variantImagePosition !== undefined) {
          const positionIndex = variantImagePosition - 1; // Convert from 1-based to 0-based
          if (positionIndex >= 0 && positionIndex < this.images.length && positionIndex < productImages.length) {
            // Check if current slide is different from this variant's image
            if (this._currentIndex !== positionIndex) {
              this.goToSlide(positionIndex);
              return true;
            }
            // Already on correct image
            return true;
          }
        }
      }

      // Variant doesn't have featured_image, but check if any other variant's image is assigned to this variant
      for (const v of allVariants) {
        if (v.featured_image && typeof v.featured_image === 'object' && v.featured_image.variant_ids) {
          // Check if current variant ID is in this image's variant_ids array
          if (v.featured_image.variant_ids.includes(Number(currentVariantId))) {
            const variantImagePosition = v.featured_image.position;
            if (variantImagePosition !== null && variantImagePosition !== undefined) {
              const positionIndex = variantImagePosition - 1; // Convert from 1-based to 0-based
              if (positionIndex >= 0 && positionIndex < this.images.length && positionIndex < productImages.length) {
                // Check if current slide is different from this variant's image
                if (this._currentIndex !== positionIndex) {
                  this.goToSlide(positionIndex);
                  return true;
                }
                // Already on correct image
                return true;
              }
            }
          }
        }
      }
    }

    // Fallback: Extract variant image URL from various possible structures
    let variantImageUrl: string | null = null;
    let variantImagePosition: number | null = null;

    // Handle featured_image as object (Shopify format: { src: "...", position: 5, ... })
    if (variant.featured_image) {
      if (typeof variant.featured_image === 'object') {
        variantImageUrl = variant.featured_image.src || variant.featured_image.url || null;
        variantImagePosition = variant.featured_image.position ?? null;
      } else if (typeof variant.featured_image === 'string') {
        variantImageUrl = variant.featured_image;
      }
    }

    // Fallback to other image properties
    if (!variantImageUrl) {
      if (typeof variant.image === 'string') {
        variantImageUrl = variant.image;
      } else if (variant.image && typeof variant.image === 'object') {
        variantImageUrl = variant.image.url || variant.image.src || null;
      } else if (variant.imageUrl) {
        variantImageUrl = variant.imageUrl;
      } else if (variant.featuredImage && typeof variant.featuredImage === 'object') {
        variantImageUrl = variant.featuredImage.url || variant.featuredImage.src || null;
      }
    }

    if (!variantImageUrl) {
      return false;
    }

    // Normalize image URL for comparison (remove protocol, query params, etc.)
    const normalizeUrl = (url: string | { url?: string; src?: string } | null | undefined): string => {
      if (!url) return '';
      // Handle both string URLs and object URLs
      const urlString = typeof url === 'string' ? url : (url?.url || url?.src || '');
      // Remove protocol, normalize to https, remove query params
      return urlString
        .replace(/^https?:\/\//, '')
        .replace(/^\/\//, '')
        .split('?')[0]
        .toLowerCase()
        .trim();
    };

    const normalizedVariantImage = normalizeUrl(variantImageUrl);

    // First, try to use position if available (1-based, convert to 0-based index)
    if (variantImagePosition !== null && variantImagePosition !== undefined) {
      const positionIndex = variantImagePosition - 1; // Convert from 1-based to 0-based
      if (positionIndex >= 0 && positionIndex < this.images.length && positionIndex < productImages.length) {
        // Check if current slide is different
        if (this._currentIndex !== positionIndex) {
          this.goToSlide(positionIndex);
          return true;
        }
        return true;
      }
    }

    // Find matching image in product images array by URL
    let variantImageIndex = productImages.findIndex(img => {
      const normalizedImg = normalizeUrl(img);
      // Compare normalized URLs
      return normalizedImg === normalizedVariantImage ||
        normalizedImg.includes(normalizedVariantImage) ||
        normalizedVariantImage.includes(normalizedImg);
    });

    // If exact match not found, try to find by filename
    if (variantImageIndex === -1) {
      const variantImageFilename = normalizedVariantImage.split('/').pop();
      variantImageIndex = productImages.findIndex(img => {
        const imgFilename = normalizeUrl(img).split('/').pop();
        return imgFilename === variantImageFilename;
      });
    }

    if (variantImageIndex !== -1 && variantImageIndex < this.images.length) {
      // Check if current slide is different
      if (this._currentIndex !== variantImageIndex) {
        this.goToSlide(variantImageIndex);
        return true;
      }
      return true;
    }

    return false;
  }

  destroy(): void {
    // Remove keyboard listener
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }

    // Reset zoom state using CSS classes
    this.images.forEach(img => {
      img.classList.remove('afs-slider__image--zoomed');
      img.classList.add('afs-slider__image--zoom-reset');
      setTimeout(() => {
        img.classList.remove('afs-slider__image--zoom-reset');
      }, 200);
    });

    this.isInitialized = false;
  }
}

// ============================================================================
// QUICK VIEW FUNCTIONS
// ============================================================================


// Create Product Modal using Ajax API
export async function createProductModal(handle: string, modalId: string): Promise<ProductModalElement> {

  const dialog = $.el('dialog', 'afs-product-modal', { 'id': modalId }) as ProductModalElement;

  // Show loading state
  dialog.innerHTML = `
      <div class="afs-product-modal__container">
        <div class="afs-product-modal__close-container">
          <button class="afs-product-modal__close" type="button">${Icons.close}</button>
        </div>
        <div class="afs-product-modal__content">
          <div class="afs-product-modal__loading" style="padding: 2rem; text-align: center;">
            ${Lang.labels.loadingProduct}
          </div>
        </div>
      </div>
    `;

  // Get locale-aware URL using Shopify routes
  const routesRoot = (AFSW.Shopify && AFSW.Shopify.routes && AFSW.Shopify.routes.root) || '/';
  const productUrl = `${routesRoot}products/${handle}.js`;

  try {
    // Fetch product data using Ajax API
    const response = await fetch(productUrl);
    if (!response.ok) {
      throw new Error('Failed to load product');
    }
    const productData = await response.json() as Product;

    // Ajax API returns product directly (not wrapped in {product: ...})
    // Verify it has the expected structure
    if (!productData.variants || !Array.isArray(productData.variants)) {
      throw new Error('Invalid product data structure');
    }

    // Find first available variant or first variant
    const selectedVariant = productData.variants.find(v => v.available) || productData.variants[0];
    let currentVariantId: number | string | null = selectedVariant ? selectedVariant.id : null;

    // Build variant selector HTML
    const buildVariantSelector = (): string => {
      if (!productData.variants || productData.variants.length === 0) return '';

      // Don't render variant selector if product has only one variant with "Default Title"
      // This is Shopify's default single variant (not a real variant)
      if (productData.variants.length === 1) {
        const firstVariant = productData.variants[0];
        const variantTitle = (firstVariant as { title?: string }).title;
        if (variantTitle && $.equals(variantTitle, SpecialValue.DEFAULT_TITLE)) {
          return '';
        }
      }

      if (!productData.options || productData.options.length === 0) return '';

      let html = '<div class="afs-product-modal__variant-selector">';
      productData.options.forEach((option, optionIndex) => {
        html += `<div class="afs-product-modal__option-group">`;
        html += `<label class="afs-product-modal__option-label">${option.name}</label>`;
        html += `<div class="afs-product-modal__option-values">`;

        // Get unique values for this option
        const uniqueValues = [...new Set(productData.variants!.map(v => {
          if (optionIndex === 0) return v.option1;
          if (optionIndex === 1) return v.option2;
          return v.option3;
        }).filter(Boolean))];

        uniqueValues.forEach(value => {
          const variant = productData.variants!.find(v => {
            if (optionIndex === 0) return v.option1 === value;
            if (optionIndex === 1) return v.option2 === value;
            return v.option3 === value;
          });
          const isAvailable = variant && variant.available;
          const isSelected = variant && variant.id === currentVariantId;

          html += `<button 
              class="afs-product-modal__option-value ${isSelected ? 'afs-product-modal__option-value--selected' : ''} ${!isAvailable ? 'afs-product-modal__option-value--unavailable' : ''}"
              data-option-index="${optionIndex}"
              data-option-value="${value}"
              data-variant-id="${variant ? variant.id : ''}"
              ${!isAvailable ? 'disabled' : ''}
              type="button"
            >${value}</button>`;
        });

        html += `</div></div>`;
      });
      html += '</div>';
      return html;
    };

    // Build images HTML using slider structure with full optimization
    const buildImagesHTML = (): { thumbnails: string; mainImages: string } => {
      if (!productData.images || productData.images.length === 0) {
        // Return empty structure if no images
        return {
          thumbnails: '',
          mainImages: '<div class="afs-slider__main"><div style="padding: 2rem; text-align: center;">No images available</div></div>'
        };
      }

      // Build thumbnails with optimized/cropped images and srcset
      let thumbnailsHTML = '<div class="afs-slider__thumbnails">';
      productData.images.forEach((image, index) => {
        const isActive = index === 0 ? 'afs-slider__thumbnail--active' : '';

        // Optimize thumbnail: small square cropped image
        const thumbnailUrl = $.optimizeImageUrl(image, {
          width: 100,
          height: 100,
          crop: 'center',
          format: 'webp',
          quality: 75
        });

        // Build srcset for thumbnails (responsive sizes with crop)
        const thumbnailSizes = [80, 100, 120];
        const thumbnailSrcset = thumbnailSizes.map(size => {
          const optimized = $.optimizeImageUrl(image, {
            width: size,
            height: size,
            crop: 'center',
            format: 'webp',
            quality: 75
          });
          return `${optimized} ${size}w`;
        }).join(', ');

        thumbnailsHTML += `
            <div class="afs-slider__thumbnail ${isActive}" data-slide-index="${index}">
              <img 
                src="${thumbnailUrl}" 
                srcset="${thumbnailSrcset}"
                sizes="100px"
                alt="${productData.title} - Thumbnail ${index + 1}" 
                loading="lazy"
                width="100"
                height="100"
              />
            </div>
          `;
      });
      thumbnailsHTML += '</div>';

      // Build main images with optimized full images (no cropping) and srcset
      let mainImagesHTML = '<div class="afs-slider__main">';
      productData.images.forEach((image, index) => {
        // Optimize main image: larger size, no cropping, maintain aspect ratio
        const mainImageUrl = $.optimizeImageUrl(image, {
          width: 800,
          height: 800, // Max height, will maintain aspect ratio
          format: 'webp',
          quality: 85
          // No crop parameter = maintains aspect ratio
        });

        // Build srcset for main images (responsive sizes for different screen sizes, no crop)
        const mainImageSizes = [400, 600, 800, 1000, 1200];
        const mainImageSrcset = mainImageSizes.map(size => {
          const optimized = $.optimizeImageUrl(image, {
            width: size,
            height: size,
            format: 'webp',
            quality: size <= 600 ? 80 : 85
            // No crop = maintains aspect ratio
          });
          return `${optimized} ${size}w`;
        }).join(', ');

        mainImagesHTML += `
            <img 
              class="afs-slider__image" 
              src="${mainImageUrl}" 
              srcset="${mainImageSrcset}"
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 600px"
              alt="${productData.title} - Image ${index + 1}" 
              loading="${index === 0 ? 'eager' : 'lazy'}"
            />
          `;
      });
      mainImagesHTML += '</div>';

      return {
        thumbnails: thumbnailsHTML,
        mainImages: mainImagesHTML
      };
    };

    const imagesHTML = buildImagesHTML();
    const variantSelectorHTML = buildVariantSelector();

    // Format price
    const formatPrice = (price: number | string): string => {
      return $.formatMoney(price, State.moneyFormat || '{{amount}}', State.currency || '');
    };

    const currentVariant = productData.variants.find(v => v.id === currentVariantId) || selectedVariant;
    const priceHTML = formatPrice(currentVariant.price);
    const comparePriceHTML = currentVariant.compare_at_price && currentVariant.compare_at_price > currentVariant.price
      ? `<span class="afs-product-modal__compare-price">${formatPrice(currentVariant.compare_at_price)}</span>`
      : '';

    // Build full modal HTML
    dialog.innerHTML = `
        <div class="afs-product-modal__container">
          <div class="afs-product-modal__close-container">
            <button class="afs-product-modal__close" type="button">${Icons.close}</button>
          </div>
          <div class="afs-product-modal__content">
            <div class="afs-product-modal__layout">
              <div class="afs-product-modal__media">
                <div class="afs-slider" id="${modalId}-slider">
                  ${imagesHTML.mainImages}
                  ${imagesHTML.thumbnails}
                </div>
              </div>
              <div class="afs-product-modal__details">
                <div class="afs-product-modal__header">
                  <div>
                    <span class="afs-product-modal__vendor">${productData.vendor || ''}</span>
                  </div>
                  <h1 class="afs-product-modal__title">${productData.title || ''}</h1>
                  <div class="afs-product-modal__price-container">
                    <span class="afs-product-modal__price">${priceHTML}</span>
                    ${comparePriceHTML}
                  </div>
                </div>
                ${variantSelectorHTML}
                <div class="afs-product-modal__buttons">
                  <div class="afs-product-modal__add-to-cart">
                    <div class="afs-product-modal__incrementor">
                      <button class="afs-product-modal__decrease" type="button">${Icons.minus}</button>
                      <span class="afs-product-modal__count" id="${modalId}-count">1</span>
                      <button class="afs-product-modal__increase" type="button">${Icons.plus}</button>
                    </div>
                    <button
                      class="afs-product-modal__add-button"
                      id="${modalId}-add-button"
                      data-variant-id="${currentVariantId}"
                      ${!currentVariant.available ? 'disabled' : ''}
                      type="button"
                    >
                      ${Lang.buttons.addToCart}
                    </button>
                  </div>
                  <button
                    class="afs-product-modal__buy-button"
                    id="${modalId}-buy-button"
                    data-variant-id="${currentVariantId}"
                    ${!currentVariant.available ? 'disabled' : ''}
                    type="button"
                  >
                    ${Lang.buttons.buyNow}
                  </button>
                </div>
                <div class="afs-product-modal__description">
                  <span class="afs-product-modal__description-text">
                    ${productData.description || ''}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

    // Store product data on dialog element
    dialog._productData = productData;
    dialog._currentVariantId = currentVariantId || undefined;

    // Initialize slider after DOM is ready - use proper DOM ready check
    (async () => {
      try {
        // Wait for slider container to be in DOM
        const sliderContainer = await waitForElement(`#${modalId}-slider`, dialog, 3000);

        // Wait for images to be in DOM
        const images = await waitForElements(
          Array.from({ length: 10 }, (_, i) => `.afs-slider__image:nth-child(${i + 1})`),
          sliderContainer,
          2000
        ).catch(() => {
          // Fallback: get whatever images exist
          return Array.from(sliderContainer.querySelectorAll<HTMLImageElement>('.afs-slider__image'));
        });

        if (images.length > 0) {
          dialog._slider = new AFSSlider(sliderContainer, {
            thumbnailsPosition: 'left', // Can be 'top', 'left', 'right', 'bottom'
            enableKeyboard: true,
            enableAutoHeight: false, // Disable auto height to prevent shrinking
            maxHeight: 600, // Fixed max height in pixels
            enableMagnifier: true, // Enable image magnifier on hover
            magnifierZoom: 2 // 2x zoom level for magnifier
          });
        } else {
          Log.warn('No images found for slider', { modalId });
        }
      } catch (error) {
        Log.error('Failed to initialize slider', {
          error: error instanceof Error ? error.message : String(error),
          modalId
        });
      }
    })();

    // Setup event handlers
    setupModalHandlers(dialog, modalId, productData, formatPrice);

  } catch (error) {
    Log.error('Failed to load product for modal', { error: error instanceof Error ? error.message : String(error), handle });
    dialog.innerHTML = `
        <div class="afs-product-modal__container">
          <div class="afs-product-modal__close-container">
            <button class="afs-product-modal__close" type="button">${Icons.close}</button>
          </div>
          <div class="afs-product-modal__content">
            <div style="padding: 2rem; text-align: center;">
              <p>${Lang.messages.failedToLoadProductModal}</p>
            </div>
          </div>
        </div>
      `;
    setupCloseHandler(dialog);
  }

  return dialog;
}

// Setup modal event handlers
function setupModalHandlers(
  dialog: ProductModalElement,
  modalId: string,
  product: Product,
  formatPrice: (price: number | string) => string
): void {
  const closeBtn = dialog.querySelector<HTMLButtonElement>('.afs-product-modal__close');

  const closeModal = (): void => {
    // Destroy slider if it exists
    if (dialog._slider && typeof dialog._slider.destroy === 'function') {
      dialog._slider.destroy();
      dialog._slider = undefined;
    }

    document.body.style.overflow = '';
    document.body.style.removeProperty('overflow');
    if (dialog.close) {
      dialog.close();
    } else {
      dialog.style.display = 'none';
    }
  };

  // Close button
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeModal();
    });
  }

  // ESC key and backdrop click
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeModal();
  });

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      closeModal();
    }
  });

  // Quantity controls
  const decreaseBtn = dialog.querySelector<HTMLButtonElement>('.afs-product-modal__decrease');
  const increaseBtn = dialog.querySelector<HTMLButtonElement>('.afs-product-modal__increase');
  const countDisplay = dialog.querySelector<HTMLElement>(`#${modalId}-count`);

  if (decreaseBtn && countDisplay) {
    decreaseBtn.addEventListener('click', () => {
      const currentCount = parseInt(countDisplay.textContent || '1', 10) || 1;
      if (currentCount > 1) {
        countDisplay.textContent = String(currentCount - 1);
      }
    });
  }

  if (increaseBtn && countDisplay) {
    increaseBtn.addEventListener('click', () => {
      const currentCount = parseInt(countDisplay.textContent || '1', 10) || 1;
      countDisplay.textContent = String(currentCount + 1);
    });
  }

  // Variant selector
  const variantButtons = dialog.querySelectorAll<HTMLButtonElement>('.afs-product-modal__option-value');
  variantButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;

      // Get selected values for all options
      const selectedValues: string[] = [];
      if (product.options) {
        product.options.forEach((option, optionIndex) => {
          const selectedBtn = dialog.querySelector<HTMLButtonElement>(
            `.afs-product-modal__option-value[data-option-index="${optionIndex}"].afs-product-modal__option-value--selected`
          );
          if (selectedBtn) {
            selectedValues[optionIndex] = selectedBtn.dataset.optionValue || '';
          }
        });
      }

      // Update clicked option
      const optionIndex = parseInt(btn.dataset.optionIndex || '0', 10);
      selectedValues[optionIndex] = btn.dataset.optionValue || '';

      // Remove selected from all options in this group
      dialog.querySelectorAll<HTMLButtonElement>(`.afs-product-modal__option-value[data-option-index="${optionIndex}"]`).forEach(b => {
        b.classList.remove('afs-product-modal__option-value--selected');
      });
      btn.classList.add('afs-product-modal__option-value--selected');

      // Find matching variant
      const matchingVariant = product.variants?.find(v => {
        if (!product.options) return false;
        return product.options.every((option, idx) => {
          if (idx === 0) return v.option1 === selectedValues[idx];
          if (idx === 1) return v.option2 === selectedValues[idx];
          return v.option3 === selectedValues[idx];
        });
      });

      if (matchingVariant) {
        updateVariantInModal(dialog, modalId, matchingVariant, formatPrice);
      }
    });
  });

  // Add to cart button
  const addButton = dialog.querySelector<HTMLButtonElement>(`#${modalId}-add-button`);
  if (addButton && countDisplay) {
    addButton.addEventListener('click', async () => {
      if (addButton.disabled) return;
      const quantity = parseInt(countDisplay.textContent || '1', 10) || 1;
      const variantId = addButton.dataset.variantId;

      try {
        await QuickAdd.addVariant(parseInt(variantId || '0', 10), quantity);
        closeModal();
      } catch (error) {
        Log.error('Failed to add to cart from modal', { error: error instanceof Error ? error.message : String(error) });
        alert(Lang.messages.failedToAddToCart);
      }
    });
  }

  // Buy now button
  const buyButton = dialog.querySelector<HTMLButtonElement>(`#${modalId}-buy-button`);
  if (buyButton && countDisplay) {
    buyButton.addEventListener('click', async () => {
      if (buyButton.disabled) return;
      const quantity = parseInt(countDisplay.textContent || '1', 10) || 1;
      const variantId = buyButton.dataset.variantId;

      try {
        const routesRoot = (AFSW.Shopify && AFSW.Shopify.routes && AFSW.Shopify.routes.root) || '/';
        // Redirect to checkout
        window.location.href = `${routesRoot}cart/${variantId}:${quantity}?checkout`;
      } catch (error) {
        Log.error('Failed to buy now', { error: error instanceof Error ? error.message : String(error) });
        alert(Lang.messages.failedToProceedToCheckout);
      }
    });
  }
}

// Update variant in modal (price, images, availability)
function updateVariantInModal(
  dialog: ProductModalElement,
  modalId: string,
  variant: ProductVariant,
  formatPrice: (price: number | string) => string
): void {
  dialog._currentVariantId = variant.id;

  // Update price
  const priceContainer = dialog.querySelector<HTMLElement>('.afs-product-modal__price-container');
  if (priceContainer) {
    const priceHTML = formatPrice(variant.price);
    const comparePriceHTML = variant.compare_at_price && variant.compare_at_price > variant.price
      ? `<span class="afs-product-modal__compare-price">${formatPrice(variant.compare_at_price)}</span>`
      : '';
    priceContainer.innerHTML = `
        <span class="afs-product-modal__price">${priceHTML}</span>
        ${comparePriceHTML}
      `;
  }

  // Update add to cart button
  const addButton = dialog.querySelector<HTMLButtonElement>(`#${modalId}-add-button`);
  if (addButton) {
    addButton.dataset.variantId = String(variant.id);
    addButton.disabled = !variant.available;
    addButton.innerHTML = Lang.buttons.addToCart;
  }

  // Update buy now button
  const buyButton = dialog.querySelector<HTMLButtonElement>(`#${modalId}-buy-button`);
  if (buyButton) {
    buyButton.dataset.variantId = String(variant.id);
    buyButton.disabled = !variant.available;
  }

  // Update images if variant has specific image
  // Use slider's updateVariantImage method if available, otherwise fall back to manual matching
  const product = dialog._productData;
  if (product && product.images && dialog._slider && product.variants) {
    // OPTIMIZATION: Quick check using variant_ids array
    // Find which image is assigned to this variant by checking variant_ids
    const currentVariantId = variant.id;
    let targetImageIndex: number | null = null;

    // Check if current variant has featured_image with variant_ids
    if (variant.featured_image && typeof variant.featured_image === 'object' && variant.featured_image.variant_ids) {
      // This variant is assigned to an image - check if it's different from current
      const variantImagePosition = variant.featured_image.position;
      if (variantImagePosition !== null && variantImagePosition !== undefined) {
        const positionIndex = variantImagePosition - 1; // Convert from 1-based to 0-based
        if (positionIndex >= 0 && positionIndex < product.images.length) {
          // Check if current slide is different from this variant's image
          const currentSlideIndex = dialog._slider.currentIndex || 0;
          if (currentSlideIndex !== positionIndex) {
            targetImageIndex = positionIndex;
          }
        }
      }
    } else {
      // Variant doesn't have featured_image, but check if any other variant's image is assigned to this variant
      // Iterate through all variants to find which image has this variant in its variant_ids
      for (const v of product.variants) {
        if (v.featured_image && typeof v.featured_image === 'object' && v.featured_image.variant_ids) {
          // Check if current variant ID is in this image's variant_ids array
          if (v.featured_image.variant_ids.includes(Number(currentVariantId))) {
            const variantImagePosition = v.featured_image.position;
            if (variantImagePosition !== null && variantImagePosition !== undefined) {
              const positionIndex = variantImagePosition - 1; // Convert from 1-based to 0-based
              if (positionIndex >= 0 && positionIndex < product.images.length) {
                const currentSlideIndex = dialog._slider.currentIndex || 0;
                if (currentSlideIndex !== positionIndex) {
                  targetImageIndex = positionIndex;
                  break; // Found the image, exit loop
                }
              }
            }
          }
        }
      }
    }

    // If we found a target image index using variant_ids, use it
    if (targetImageIndex !== null && dialog._slider.goToSlide) {
      dialog._slider.goToSlide(targetImageIndex);
      return; // Successfully updated using variant_ids optimization
    }

    // Try using the slider's built-in method (fallback, pass variants for optimization)
    if (dialog._slider.updateVariantImage && product.images) {
      const updated = dialog._slider.updateVariantImage(variant, product.images, product.variants);
      if (updated) return; // Successfully updated, exit early
    }

    // Fallback: manual image matching (for backwards compatibility)
    // Extract variant image URL from various possible structures
    let variantImageUrl: string | null = null;
    let variantImagePosition: number | null = null;

    // Handle featured_image as object (Shopify format: { src: "...", position: 5, ... })
    if (variant.featured_image) {
      if (typeof variant.featured_image === 'object') {
        variantImageUrl = variant.featured_image.src || variant.featured_image.url || null;
        variantImagePosition = variant.featured_image.position || null;
      } else if (typeof variant.featured_image === 'string') {
        variantImageUrl = variant.featured_image;
      }
    }

    // Fallback to other image properties
    if (!variantImageUrl) {
      variantImageUrl = (typeof variant.image === 'string' ? variant.image : null) ||
        variant.imageUrl ||
        (variant.image && typeof variant.image === 'object' ? variant.image.url || variant.image.src || null : null) ||
        (variant.featuredImage && typeof variant.featuredImage === 'object' ? variant.featuredImage.url || variant.featuredImage.src || null : null);
    }

    if (variantImageUrl && product.images && dialog._slider.goToSlide) {
      // Normalize image URL for comparison (remove protocol, query params, etc.)
      const normalizeUrl = (url: string | { url?: string; src?: string } | null | undefined): string => {
        if (!url) return '';
        // Handle both string URLs and object URLs
        const urlString = typeof url === 'string' ? url : (url && typeof url === 'object' ? (url.url || url.src || '') : '');
        // Remove protocol, normalize to https, remove query params
        return urlString
          .replace(/^https?:\/\//, '')
          .replace(/^\/\//, '')
          .split('?')[0]
          .toLowerCase()
          .trim();
      };

      // First, try to use position if available (1-based, convert to 0-based index)
      if (variantImagePosition !== null && variantImagePosition !== undefined) {
        const positionIndex = variantImagePosition - 1; // Convert from 1-based to 0-based
        if (positionIndex >= 0 && positionIndex < product.images.length) {
          dialog._slider.goToSlide(positionIndex);
          return;
        }
      }

      const normalizedVariantImage = normalizeUrl(variantImageUrl);

      // Find matching image in product images array
      const variantImageIndex = product.images.findIndex(img => {
        const normalizedImg = normalizeUrl(img);
        // Compare normalized URLs
        return normalizedImg === normalizedVariantImage ||
          normalizedImg.includes(normalizedVariantImage) ||
          normalizedVariantImage.includes(normalizedImg);
      });

      if (variantImageIndex !== -1) {
        // Use slider's goToSlide method to change to variant's image
        dialog._slider.goToSlide(variantImageIndex);
      } else {
        // If exact match not found, try to find by filename
        const variantImageFilename = normalizedVariantImage.split('/').pop();
        if (variantImageFilename) {
          const filenameMatchIndex = product.images.findIndex(img => {
            const imgFilename = normalizeUrl(img).split('/').pop();
            return imgFilename === variantImageFilename;
          });

          if (filenameMatchIndex !== -1 && dialog._slider.goToSlide) {
            dialog._slider.goToSlide(filenameMatchIndex);
          }
        }
      }
    }
  }
}

// Setup close handler only
function setupCloseHandler(dialog: ProductModalElement): void {
  const closeBtn = dialog.querySelector<HTMLButtonElement>('.afs-product-modal__close');
  const closeModal = (): void => {
    // Destroy slider if it exists
    if (dialog._slider && typeof dialog._slider.destroy === 'function') {
      dialog._slider.destroy();
      dialog._slider = undefined;
    }

    document.body.style.overflow = '';
    document.body.style.removeProperty('overflow');
    if (dialog.close) {
      dialog.close();
    } else {
      dialog.style.display = 'none';
    }
  };

  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }
  dialog.addEventListener('cancel', closeModal);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeModal();
  });
}

/**
 * Creates a quick view button for a product card
 * This function should be called from the main AFS module when creating product cards
 */
export function createQuickViewButton(product: Product): HTMLElement | null {
  if (!product.handle) return null;

  const quickViewBtn = $.el('button', 'afs-product-card__quick-view', {
    'data-product-handle': product.handle,
    'data-product-id': String(product.id || product.productId || product.gid || ''),
    'aria-label': Lang.buttons.quickView,
    'type': 'button'
  });
  const quickViewIcon = $.el('span', 'afs-product-card__quick-view-icon');
  quickViewIcon.innerHTML = Icons.eye;
  quickViewBtn.appendChild(quickViewIcon);
  return quickViewBtn;
}

/**
 * Handles quick view button clicks
 * This should be called from the main AFS module's event handler
 */
export function handleQuickViewClick(handle: string): void {
  if (!handle) return;

  // Open product modal using Ajax API
  const modalId = `product-modal-${handle}`;
  let modal = document.getElementById(modalId) as ProductModalElement | null;

  const openModal = async (): Promise<void> => {
    if (!modal) {
      // Create modal (async - fetches product data)
      modal = await createProductModal(handle, modalId);
      document.body.appendChild(modal);
    }

    // Show modal
    if (modal.showModal) {
      document.body.style.overflow = 'hidden';
      modal.showModal();
    } else {
      document.body.style.overflow = 'hidden';
      modal.style.display = 'block';
    }

    // Ensure overflow is restored when modal closes
    const restoreScroll = (): void => {
      document.body.style.overflow = '';
      document.body.style.removeProperty('overflow');
    };

    modal.addEventListener('close', restoreScroll, { once: true });

    const observer = new MutationObserver(() => {
      if (modal && !modal.open && !modal.hasAttribute('open')) {
        restoreScroll();
        observer.disconnect();
      }
    });
    if (modal) {
      observer.observe(modal, { attributes: true, attributeFilter: ['open'] });
    }
  };

  openModal().catch(error => {
    Log.error('Failed to open product modal', { error: error instanceof Error ? error.message : String(error), handle });
    alert(Lang.messages.failedToLoadProductModal);
  });
}

// ============================================================================
// EXPORT TO GLOBAL SCOPE (for backwards compatibility)
// ============================================================================

// Export AFSSlider to window for backwards compatibility
if (typeof window !== 'undefined') {
  (window as Window & { AFSSlider?: typeof AFSSlider }).AFSSlider = AFSSlider as unknown as typeof AFSSlider;
}

// Export functions to window for backwards compatibility
if (typeof window !== 'undefined') {
  (window as typeof window & {
    AFSQuickView?: {
      createQuickViewButton: (product: Product) => HTMLElement | null;
      handleQuickViewClick: (handle: string) => void;
      createProductModal: (handle: string, modalId: string) => Promise<ProductModalElement>;
    };
  }).AFSQuickView = {
    createQuickViewButton,
    handleQuickViewClick,
    createProductModal
  };
}