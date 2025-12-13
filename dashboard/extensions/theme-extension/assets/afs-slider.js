/**
 * AFS Lightweight Image Slider
 * Pure JavaScript/CSS slider with zoom, navigation, and keyboard controls
 */

(function() {
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
        enableZoom: options.enableZoom !== false,
        enableClickToZoom: options.enableClickToZoom !== false, // Click image to zoom
        enableKeyboard: options.enableKeyboard !== false,
        enableAutoHeight: options.enableAutoHeight !== false,
        maxHeight: options.maxHeight || null, // Fixed max height in pixels
        animationDuration: options.animationDuration || 300,
        ...options
      };

      this.currentIndex = 0;
      this.isZoomed = false;
      this.images = [];
      this.thumbnails = [];
      this.isInitialized = false;

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
      this.buildSlider();
      
      // Setup event listeners
      this.setupEvents();

      // Show first image
      this.goToSlide(0);

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

      // Add zoom controls if zoom is enabled
      if (this.options.enableZoom && !this.mainContainer.querySelector('.afs-slider__zoom-controls')) {
        const zoomControls = document.createElement('div');
        zoomControls.className = 'afs-slider__zoom-controls';
        zoomControls.innerHTML = `
          <button type="button" class="afs-slider__zoom-in" aria-label="Zoom in">+</button>
          <button type="button" class="afs-slider__zoom-out" aria-label="Zoom out">-</button>
          <button type="button" class="afs-slider__zoom-reset" aria-label="Reset zoom">Reset</button>
        `;
        this.mainContainer.appendChild(zoomControls);
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

      // Setup zoom controls
      if (this.options.enableZoom) {
        const zoomIn = this.mainContainer.querySelector('.afs-slider__zoom-in');
        const zoomOut = this.mainContainer.querySelector('.afs-slider__zoom-out');
        const zoomReset = this.mainContainer.querySelector('.afs-slider__zoom-reset');

        if (zoomIn) zoomIn.addEventListener('click', () => this.zoomIn());
        if (zoomOut) zoomOut.addEventListener('click', () => this.zoomOut());
        if (zoomReset) zoomReset.addEventListener('click', () => this.resetZoom());
      }

      // Setup click-to-zoom on images
      if (this.options.enableClickToZoom && this.options.enableZoom) {
        this.images.forEach(img => {
          img.addEventListener('click', (e) => {
            // Don't zoom if clicking on navigation buttons or zoom controls
            if (e.target.closest('.afs-slider__prev') || 
                e.target.closest('.afs-slider__next') ||
                e.target.closest('.afs-slider__zoom-controls')) {
              return;
            }
            
            // Prevent event bubbling
            e.stopPropagation();
            
            // Toggle zoom on click
            if (this.isZoomed) {
              this.resetZoom();
            } else {
              this.zoomIn();
            }
          });
        });
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

          switch(e.key) {
            case 'ArrowLeft':
              e.preventDefault();
              this.prevSlide();
              break;
            case 'ArrowRight':
              e.preventDefault();
              this.nextSlide();
              break;
            case 'Escape':
              if (this.isZoomed) {
                e.preventDefault();
                this.resetZoom();
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

      // Update thumbnails
      this.thumbnails.forEach((thumb, i) => {
        thumb.classList.toggle('afs-slider__thumbnail--active', i === index);
      });

      // Adjust height if enabled
      if (this.options.enableAutoHeight) {
        this.adjustHeight();
      }

      // Reset zoom when changing slides
      if (this.isZoomed) {
        this.resetZoom();
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

    zoomIn() {
      const activeImage = this.images[this.currentIndex];
      if (!activeImage) return;

      const currentZoom = parseFloat(activeImage.style.transform.match(/scale\(([\d.]+)\)/) ? 
        activeImage.style.transform.match(/scale\(([\d.]+)\)/)[1] : '1') || 1;

      const newZoom = Math.min(currentZoom + 0.5, 3);
      activeImage.style.transform = `scale(${newZoom})`;
      activeImage.style.cursor = 'move';
      this.isZoomed = newZoom > 1;

      // Enable panning
      this.enablePanning(activeImage);
    }

    zoomOut() {
      const activeImage = this.images[this.currentIndex];
      if (!activeImage) return;

      const currentZoom = parseFloat(activeImage.style.transform.match(/scale\(([\d.]+)\)/) ? 
        activeImage.style.transform.match(/scale\(([\d.]+)\)/)[1] : '1') || 1;

      const newZoom = Math.max(currentZoom - 0.5, 1);
      activeImage.style.transform = `scale(${newZoom})`;
      this.isZoomed = newZoom > 1;

      if (newZoom === 1) {
        activeImage.style.cursor = '';
        activeImage.style.transform = '';
        this.disablePanning(activeImage);
      } else {
        this.enablePanning(activeImage);
      }
    }

    resetZoom() {
      const activeImage = this.images[this.currentIndex];
      if (!activeImage) return;

      activeImage.style.transform = '';
      activeImage.style.cursor = '';
      activeImage.style.left = '';
      activeImage.style.top = '';
      this.isZoomed = false;
      this.disablePanning(activeImage);
    }

    enablePanning(image) {
      let isPanning = false;
      let startX = 0;
      let startY = 0;
      let currentX = 0;
      let currentY = 0;

      const startPan = (e) => {
        isPanning = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        startX = clientX - currentX;
        startY = clientY - currentY;
      };

      const pan = (e) => {
        if (!isPanning) return;
        e.preventDefault();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        currentX = clientX - startX;
        currentY = clientY - startY;

        image.style.left = `${currentX}px`;
        image.style.top = `${currentY}px`;
      };

      const endPan = () => {
        isPanning = false;
      };

      image.addEventListener('mousedown', startPan);
      image.addEventListener('touchstart', startPan, { passive: false });
      document.addEventListener('mousemove', pan);
      document.addEventListener('touchmove', pan, { passive: false });
      document.addEventListener('mouseup', endPan);
      document.addEventListener('touchend', endPan);

      // Store handlers for cleanup
      image._panHandlers = { startPan, pan, endPan };
    }

    disablePanning(image) {
      if (!image._panHandlers) return;

      const { startPan, pan, endPan } = image._panHandlers;
      image.removeEventListener('mousedown', startPan);
      image.removeEventListener('touchstart', startPan);
      document.removeEventListener('mousemove', pan);
      document.removeEventListener('touchmove', pan);
      document.removeEventListener('mouseup', endPan);
      document.removeEventListener('touchend', endPan);

      delete image._panHandlers;
    }

    destroy() {
      // Remove keyboard listener
      if (this.keyboardHandler) {
        document.removeEventListener('keydown', this.keyboardHandler);
      }

      // Disable panning on all images
      this.images.forEach(img => {
        if (img._panHandlers) {
          this.disablePanning(img);
        }
      });

      this.isInitialized = false;
    }
  }

  // Export to global scope
  window.AFSSlider = AFSSlider;

})();

