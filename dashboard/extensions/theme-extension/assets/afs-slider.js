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
        enableMagnifier: options.enableMagnifier !== false, // Cursor-following magnifier
        magnifierZoom: options.magnifierZoom || 2, // Zoom level for magnifier (2x, 3x, etc.)
        magnifierSize: options.magnifierSize || 200, // Size of magnifier in pixels
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

      // Setup magnifier (cursor-following zoom preview)
      if (this.options.enableMagnifier && this.options.enableZoom) {
        this.setupMagnifier();
      }
    }

    setupMagnifier() {
      const viewport = this.mainContainer.querySelector('.afs-slider__viewport');
      if (!viewport) return;

      // Create magnifier element if it doesn't exist
      if (!this.magnifier) {
        const magnifier = document.createElement('div');
        magnifier.className = 'afs-slider__magnifier';
        magnifier.style.display = 'none';
        viewport.appendChild(magnifier);

        // Create magnifier image
        const magnifierImg = document.createElement('img');
        magnifierImg.className = 'afs-slider__magnifier-image';
        magnifierImg.style.display = 'block';
        magnifier.appendChild(magnifierImg);

        this.magnifier = magnifier;
        this.magnifierImg = magnifierImg;
      }

      // Setup mouse events only on the active image (will be updated on slide change)
      this.attachMagnifierEvents();
    }

    attachMagnifierEvents() {
      // Remove old event handlers if they exist
      if (this._magnifierHandlers) {
        this._magnifierHandlers.forEach(({ img, handlers }) => {
          img.removeEventListener('mouseenter', handlers.enter);
          img.removeEventListener('mousemove', handlers.move);
          img.removeEventListener('mouseleave', handlers.leave);
        });
        this._magnifierHandlers = [];
      }

      // Attach handlers to all images (they'll only work when active)
      this._magnifierHandlers = [];
      this.images.forEach(img => {
        const enterHandler = (e) => {
          // Only show magnifier on active image
          if (!img.classList.contains('afs-slider__image--active') || this.isZoomed) return;
          this.showMagnifier(e, img);
        };

        const moveHandler = (e) => {
          // Only update magnifier on active image
          if (!img.classList.contains('afs-slider__image--active') || this.isZoomed) return;
          this.updateMagnifier(e, img);
        };

        const leaveHandler = () => {
          // Hide magnifier when leaving any image
          this.hideMagnifier();
        };

        img.addEventListener('mouseenter', enterHandler);
        img.addEventListener('mousemove', moveHandler);
        img.addEventListener('mouseleave', leaveHandler);

        this._magnifierHandlers.push({
          img,
          handlers: { enter: enterHandler, move: moveHandler, leave: leaveHandler }
        });
      });
    }

    showMagnifier(e, img) {
      if (!this.magnifier || !this.magnifierImg) return;
      
      // Only show magnifier on active image
      if (!img.classList.contains('afs-slider__image--active')) {
        this.hideMagnifier();
        return;
      }
      
      // Set the source image for magnifier (use currentSrc to get the actual loaded image)
      const imageSrc = img.currentSrc || img.src || img.getAttribute('src');
      if (!imageSrc) {
        this.hideMagnifier();
        return;
      }
      
      // Only update src if it's different to avoid unnecessary reloads
      if (this.magnifierImg.src !== imageSrc) {
        // Clear previous load handlers
        this.magnifierImg.onload = null;
        this.magnifierImg.onerror = null;
        
        // Set new source
        this.magnifierImg.src = imageSrc;
        
        // Wait for image to load if not already loaded
        if (!this.magnifierImg.complete || this.magnifierImg.naturalWidth === 0) {
          this.magnifierImg.onload = () => {
            this.magnifier.style.display = 'block';
            this.updateMagnifier(e, img);
          };
          this.magnifierImg.onerror = () => {
            // If image fails to load, hide magnifier
            this.hideMagnifier();
          };
          return; // Wait for load
        }
      }
      
      // Show magnifier immediately, update will handle positioning
      this.magnifier.style.display = 'block';
      this.updateMagnifier(e, img);
    }

    updateMagnifier(e, img) {
      if (!this.magnifier || !this.magnifierImg || this.isZoomed) return;
      
      // Only work with active image
      if (!img.classList.contains('afs-slider__image--active')) {
        this.hideMagnifier();
        return;
      }

      const viewport = this.mainContainer.querySelector('.afs-slider__viewport');
      if (!viewport) return;

      // Wait for source image to load
      if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
        img.addEventListener('load', () => this.updateMagnifier(e, img), { once: true });
        return;
      }

      // Wait for magnifier image to load
      if (!this.magnifierImg.complete || this.magnifierImg.naturalWidth === 0) {
        // Set up one-time load handler
        this.magnifierImg.addEventListener('load', () => {
          this.updateMagnifier(e, img);
        }, { once: true });
        return;
      }
      
      // Verify magnifier image dimensions match source image
      if (this.magnifierImg.naturalWidth !== naturalWidth || 
          this.magnifierImg.naturalHeight !== naturalHeight) {
        // Dimensions don't match, might be wrong image - reload
        const imageSrc = img.currentSrc || img.src || img.getAttribute('src');
        if (imageSrc && this.magnifierImg.src !== imageSrc) {
          this.magnifierImg.src = imageSrc;
          return; // Will retry after load
        }
      }

      // Use absolute coordinates (like Drift.js hoverBoundingBox)
      const viewportRect = viewport.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      
      // Get natural (source) image dimensions
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      
      if (naturalWidth === 0 || naturalHeight === 0) return;
      
      // Get displayed image dimensions
      const displayedWidth = imgRect.width;
      const displayedHeight = imgRect.height;
      
      if (displayedWidth === 0 || displayedHeight === 0) return;
      
      // Calculate aspect ratios
      const naturalAspectRatio = naturalWidth / naturalHeight;
      const displayedAspectRatio = displayedWidth / displayedHeight;
      
      // Calculate actual image bounds (accounting for object-fit: contain)
      let imageBounds = {
        left: imgRect.left,
        top: imgRect.top,
        width: displayedWidth,
        height: displayedHeight
      };
      
      // Adjust for letterboxing/pillarboxing (object-fit: contain behavior)
      if (Math.abs(displayedAspectRatio - naturalAspectRatio) > 0.001) {
        if (displayedAspectRatio > naturalAspectRatio) {
          // Image is letterboxed (bars on top/bottom)
          const actualHeight = displayedWidth / naturalAspectRatio;
          const offsetY = (displayedHeight - actualHeight) / 2;
          imageBounds.top += offsetY;
          imageBounds.height = actualHeight;
        } else {
          // Image is pillarboxed (bars on left/right)
          const actualWidth = displayedHeight * naturalAspectRatio;
          const offsetX = (displayedWidth - actualWidth) / 2;
          imageBounds.left += offsetX;
          imageBounds.width = actualWidth;
        }
      }
      
      // Get mouse position in absolute coordinates
      const mouseX = e.clientX;
      const mouseY = e.clientY;
      
      // Check if mouse is within the actual image bounds (hoverBoundingBox behavior)
      const tolerance = 5;
      if (mouseX < imageBounds.left - tolerance || 
          mouseX > imageBounds.left + imageBounds.width + tolerance ||
          mouseY < imageBounds.top - tolerance || 
          mouseY > imageBounds.top + imageBounds.height + tolerance) {
        this.hideMagnifier();
        return;
      }
      
      // Calculate position relative to the actual image bounds
      const relativeX = mouseX - imageBounds.left;
      const relativeY = mouseY - imageBounds.top;
      
      // Clamp to image bounds
      const clampedX = Math.max(0, Math.min(relativeX, imageBounds.width));
      const clampedY = Math.max(0, Math.min(relativeY, imageBounds.height));
      
      // Map displayed coordinates to natural image coordinates
      // This is the critical calculation - must be accurate
      const sourceX = (clampedX / imageBounds.width) * naturalWidth;
      const sourceY = (clampedY / imageBounds.height) * naturalHeight;
      
      // Magnifier settings
      const magnifierSize = this.options.magnifierSize || 200;
      const halfSize = magnifierSize / 2;
      const zoomLevel = this.options.magnifierZoom || 2;
      
      // Calculate the visible area in the magnifier (in natural image coordinates)
      const visibleWidth = magnifierSize / zoomLevel;
      const visibleHeight = magnifierSize / zoomLevel;
      
      // Calculate offset to center the cursor position in magnifier
      // Position the zoomed image so the cursor point is centered
      let offsetX = sourceX - (visibleWidth / 2);
      let offsetY = sourceY - (visibleHeight / 2);
      
      // Clamp offsets to keep view within image bounds (like Drift.js containInline)
      const maxOffsetX = Math.max(0, naturalWidth - visibleWidth);
      const maxOffsetY = Math.max(0, naturalHeight - visibleHeight);
      offsetX = Math.max(0, Math.min(offsetX, maxOffsetX));
      offsetY = Math.max(0, Math.min(offsetY, maxOffsetY));
      
      // Position magnifier relative to viewport (centered on cursor)
      // Since magnifier is absolutely positioned within viewport, use viewport-relative coordinates
      const relativeX = mouseX - viewportRect.left;
      const relativeY = mouseY - viewportRect.top;
      
      let magnifierX = relativeX - halfSize;
      let magnifierY = relativeY - halfSize;
      
      // Keep magnifier within viewport bounds (like Drift.js hoverBoundingBox)
      const boundedX = Math.max(0, Math.min(magnifierX, viewportRect.width - magnifierSize));
      const boundedY = Math.max(0, Math.min(magnifierY, viewportRect.height - magnifierSize));
      
      this.magnifier.style.left = `${boundedX}px`;
      this.magnifier.style.top = `${boundedY}px`;
      
      // Apply transform to show the zoomed portion
      // Scale the image and position it to show the correct area
      // Set natural dimensions first
      this.magnifierImg.style.width = `${naturalWidth}px`;
      this.magnifierImg.style.height = `${naturalHeight}px`;
      
      // Position the image to show the correct area (negative offset to move image)
      this.magnifierImg.style.left = `${-offsetX}px`;
      this.magnifierImg.style.top = `${-offsetY}px`;
      
      // Scale the image by zoom level
      this.magnifierImg.style.transform = `scale(${zoomLevel})`;
      this.magnifierImg.style.transformOrigin = 'top left';
    }

    hideMagnifier() {
      if (this.magnifier) {
        this.magnifier.style.display = 'none';
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
        // Don't handle swipe if image is zoomed (let panning handle it)
        if (this.isZoomed) {
          return;
        }
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isDragging = true;
      }, { passive: true });

      viewport.addEventListener('touchmove', (e) => {
        // Don't handle swipe if image is zoomed (let panning handle it)
        if (this.isZoomed) {
          return;
        }
        if (!isDragging) return;
        e.preventDefault();
      }, { passive: false });

      viewport.addEventListener('touchend', (e) => {
        // Don't handle swipe if image is zoomed (let panning handle it)
        if (this.isZoomed) {
          isDragging = false;
          return;
        }
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

      // Reset zoom and position when changing slides
      if (this.isZoomed) {
        // Reset previous image position before changing
        this.images.forEach(img => {
          if (img.classList.contains('afs-slider__image--active') && img !== this.images[index]) {
            img.style.left = '';
            img.style.top = '';
            this.disablePanning(img);
          }
        });
        this.resetZoom();
      }

      // Hide magnifier when changing slides
      this.hideMagnifier();
      
      // Re-attach magnifier events for the new active image
      if (this.options.enableMagnifier && this.options.enableZoom && this._magnifierHandlers) {
        this.attachMagnifierEvents();
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

      // Hide magnifier when zooming in
      this.hideMagnifier();

      const currentZoom = parseFloat(activeImage.style.transform.match(/scale\(([\d.]+)\)/) ? 
        activeImage.style.transform.match(/scale\(([\d.]+)\)/)[1] : '1') || 1;

      const newZoom = Math.min(currentZoom + 0.5, 5);
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
      
      // Hide magnifier when resetting zoom
      this.hideMagnifier();
    }

    enablePanning(image) {
      // Disable panning if already enabled to prevent duplicate handlers
      if (image._panHandlers) {
        this.disablePanning(image);
      }

      let isPanning = false;
      let startX = 0;
      let startY = 0;
      let currentX = 0;
      let currentY = 0;
      let initialLeft = 0;
      let initialTop = 0;

      const startPan = (e) => {
        // Only start panning if image is actually zoomed
        if (!this.isZoomed) return;
        
        isPanning = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        // Get current position (parse from style or default to 0)
        const currentLeft = parseInt(image.style.left) || 0;
        const currentTop = parseInt(image.style.top) || 0;
        
        startX = clientX - currentLeft;
        startY = clientY - currentTop;
        
        // Stop event propagation to prevent swipe gestures
        e.stopPropagation();
      };

      const pan = (e) => {
        if (!isPanning || !this.isZoomed) return;
        
        e.preventDefault();
        e.stopPropagation(); // Prevent swipe gestures

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        currentX = clientX - startX;
        currentY = clientY - startY;

        image.style.left = `${currentX}px`;
        image.style.top = `${currentY}px`;
      };

      const endPan = (e) => {
        if (e) {
          e.stopPropagation(); // Prevent swipe gestures
        }
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

      // Remove magnifier
      this.hideMagnifier();
      
      // Remove magnifier event handlers
      if (this._magnifierHandlers) {
        this._magnifierHandlers.forEach(({ img, handlers }) => {
          img.removeEventListener('mouseenter', handlers.enter);
          img.removeEventListener('mousemove', handlers.move);
          img.removeEventListener('mouseleave', handlers.leave);
        });
        this._magnifierHandlers = null;
      }
      
      if (this.magnifier && this.magnifier.parentNode) {
        this.magnifier.parentNode.removeChild(this.magnifier);
        this.magnifier = null;
        this.magnifierImg = null;
      }

      this.isInitialized = false;
    }
  }

  // Export to global scope
  window.AFSSlider = AFSSlider;

})();

