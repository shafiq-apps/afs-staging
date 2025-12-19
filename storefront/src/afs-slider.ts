/**
 * AFS Lightweight Image Slider
 * Pure TypeScript/CSS slider with zoom, navigation, and keyboard controls
 */

'use strict';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface SliderOptions {
  thumbnailsPosition?: 'top' | 'left' | 'right' | 'bottom';
  enableKeyboard?: boolean;
  enableAutoHeight?: boolean;
  maxHeight?: number | null;
  animationDuration?: number;
  enableMagnifier?: boolean;
  magnifierZoom?: number;
}

interface ProductVariant {
  id: number | string;
  featured_image?: {
    src?: string;
    url?: string;
    position?: number | null;
    variant_ids?: number[];
  } | string;
  image?: string | {
    url?: string;
    src?: string;
  };
  imageUrl?: string;
  featuredImage?: {
    url?: string;
    src?: string;
  };
}

interface SliderSlideChangeEventDetail {
  index: number;
  total: number;
}

interface SliderSlideChangeEvent extends CustomEvent {
  detail: SliderSlideChangeEventDetail;
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
            // Reset zoom on escape
            const activeImage = this.images[this.currentIndex];
            const viewport = this.mainContainer?.querySelector<HTMLElement>('.afs-slider__viewport');
            if (activeImage && viewport) {
              activeImage.style.transform = 'scale(1) translate(0, 0)';
              activeImage.style.transition = 'transform 0.2s ease-out';
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

      activeImage.style.transform = `
        scale(${SCALE})
        translate(${translateX / SCALE}px, ${translateY / SCALE}px)
      `;
    });

    // Mouse enter: enable smooth transition
      viewport.addEventListener('mouseenter', () => {
        const activeImage = this.images[this._currentIndex];
      if (activeImage) {
        activeImage.style.transition = 'transform 0.05s ease-out';
      }
    });

    // Mouse leave: reset zoom
    viewport.addEventListener('mouseleave', () => {
      const activeImage = this.images[this.currentIndex];
      if (activeImage) {
        activeImage.style.transform = 'scale(1) translate(0, 0)';
        activeImage.style.transition = 'transform 0.2s ease-out';
      }
    });
  }

  goToSlide(index: number): void {
    if (index < 0 || index >= this.images.length) return;

    this._currentIndex = index;

      // Update images visibility
      this.images.forEach((img, i) => {
        if (i === index) {
          img.classList.add('afs-slider__image--active');
          img.style.display = 'block';
        } else {
          img.classList.remove('afs-slider__image--active');
          img.style.display = 'none';
        }
      });

      // Reset zoom when slide changes
      const activeImage = this.images[this._currentIndex];
    if (activeImage) {
      activeImage.style.transform = 'scale(1) translate(0, 0)';
      activeImage.style.transition = 'transform 0.2s ease-out';
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

    // Reset zoom state
    this.images.forEach(img => {
      img.style.transform = 'scale(1) translate(0, 0)';
      img.style.transition = 'transform 0.2s ease-out';
    });

    this.isInitialized = false;
  }

}

// ============================================================================
// EXPORT TO GLOBAL SCOPE
// ============================================================================

declare global {
  interface Window {
    AFSSlider?: new (container: string | HTMLElement, options?: SliderOptions) => SliderInstance;
  }
}

// Export AFSSlider to window, ensuring it matches SliderInstance interface
(window as Window).AFSSlider = AFSSlider as unknown as new (container: string | HTMLElement, options?: SliderOptions) => SliderInstance;

export { AFSSlider, type SliderOptions, type ProductVariant };
