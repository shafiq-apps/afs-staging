/**
 * AFS Lightweight Image Slider
 * Pure JavaScript/CSS slider with zoom, navigation, and keyboard controls
 */

(function () {
  'use strict';

  class AFSSlider {
    constructor(container, options = {}) {
      this.container = typeof container === 'string' ? document.querySelector(container) : container;
      if (!this.container) {
        console.error('AFSSlider: Container not found');
        return;
      }

      this.options = {
        thumbnailsPosition: options.thumbnailsPosition || 'left', // 'top', 'left', 'right', 'bottom'
        enableKeyboard: options.enableKeyboard !== false,
        enableAutoHeight: options.enableAutoHeight !== false,
        maxHeight: options.maxHeight || null, // Fixed max height in pixels
        animationDuration: options.animationDuration || 300,
        ...options
      };

      this.currentIndex = 0;
      this.images = [];
      this.thumbnails = [];
      this.isInitialized = false;
      this.magnifierEnabled = options.enableMagnifier !== false; // Enable by default
      this.magnifierZoom = options.magnifierZoom || 3; // Default 3x zoom
      this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

      this.init();
    }

    init() {
      // Find main image container
      this.mainContainer = this.container.querySelector('.afs-slider__main');
      if (!this.mainContainer) {
        console.error('AFSSlider: Main container (.afs-slider__main) not found');
        return;
      }

      // Find thumbnail container
      this.thumbnailContainer = this.container.querySelector('.afs-slider__thumbnails');
      if (!this.thumbnailContainer) {
        console.error('AFSSlider: Thumbnail container (.afs-slider__thumbnails) not found');
        return;
      }

      // Get all images
      this.images = Array.from(this.mainContainer.querySelectorAll('.afs-slider__image'));
      if (this.images.length === 0) {
        console.error('AFSSlider: No images found');
        return;
      }

      // Get all thumbnails
      this.thumbnails = Array.from(this.thumbnailContainer.querySelectorAll('.afs-slider__thumbnail'));

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

    buildSlider() {
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
      const prevBtn = this.mainContainer.querySelector('.afs-slider__prev');
      const nextBtn = this.mainContainer.querySelector('.afs-slider__next');

      if (prevBtn) {
        prevBtn.addEventListener('click', () => this.prevSlide());
      }

      if (nextBtn) {
        nextBtn.addEventListener('click', () => this.nextSlide());
      }


    }


    setupEvents() {
      // Keyboard navigation
      if (this.options.enableKeyboard) {
        this.keyboardHandler = (e) => {
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
              const viewport = this.mainContainer.querySelector('.afs-slider__viewport');
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

    setupTouchEvents() {
      let startX = 0;
      let startY = 0;
      let isDragging = false;

      const viewport = this.mainContainer.querySelector('.afs-slider__viewport');
      if (!viewport) return;

      viewport.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isDragging = true;
      }, { passive: true });

      viewport.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
      }, { passive: false });

      viewport.addEventListener('touchend', (e) => {
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

    setupPanZoom() {
      const viewport = this.mainContainer.querySelector('.afs-slider__viewport');
      if (!viewport) return;

      // Add zoom class to viewport for cursor styling
      viewport.classList.add('afs-slider__viewport--zoomable');

      const SCALE = this.magnifierZoom || 3; // Use magnifierZoom option or default to 3

      // Mouse move: pan image
      viewport.addEventListener('mousemove', (e) => {
        const activeImage = this.images[this.currentIndex];
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
        const activeImage = this.images[this.currentIndex];
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

    goToSlide(index) {
      if (index < 0 || index >= this.images.length) return;

      this.currentIndex = index;

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
      const activeImage = this.images[this.currentIndex];
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
      this.container.dispatchEvent(new CustomEvent('afs-slider:slide-change', {
        detail: { index, total: this.images.length }
      }));
    }

    prevSlide() {
      const newIndex = this.currentIndex > 0
        ? this.currentIndex - 1
        : this.images.length - 1;
      this.goToSlide(newIndex);
    }

    nextSlide() {
      const newIndex = this.currentIndex < this.images.length - 1
        ? this.currentIndex + 1
        : 0;
      this.goToSlide(newIndex);
    }

    adjustHeight() {
      const activeImage = this.images[this.currentIndex];
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

    setHeight(image) {
      const viewport = this.mainContainer.querySelector('.afs-slider__viewport');
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
    destroy() {
      // Remove keyboard listener
      if (this.keyboardHandler) {
        document.removeEventListener('keydown', this.keyboardHandler);
      }

      // Reset zoom state
      this.images.forEach(img => {
        img.style.transform = 'scale(1) translate(0, 0)';
        img.style.transition = 'transform 0.2s ease-out';
      });

      this.isInitialized = false;
    }
  }

  // Export to global scope
  window.AFSSlider = AFSSlider;

})();