# Storefront Script & Flow Audit Report

## Executive Summary

**Status**: 🟡 **FUNCTIONAL WITH ISSUES**

The storefront script is mostly functional, but several bugs and issues were identified that affect user experience. Critical issues need to be fixed before production deployment.

---

## 🔴 Critical Issues Found

### 1. **Filter Collapse Not Working - CSS Selector Issue**

**Location**: `storefront/src/scss/_filters.scss:113`

**Problem**: 
The CSS selector for collapsed filter groups has a specificity issue. The selector `&[data-afs-collapsed="true"] &__content` may not properly override the default `max-height: 1000px` when the filter group is collapsed.

**Current Code**:
```scss
&__content {
  overflow: hidden;
  transition: max-height $transition-slow, opacity $transition-base, padding $transition-slow, margin $transition-slow;
  max-height: 1000px;  // Default: expanded
  opacity: 1;
}

&[data-afs-collapsed="true"] &__content {
  max-height: 0 !important;
  opacity: 0;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden;
  display: block;
}
```

**Issue**: The `!important` on `max-height: 0` should work, but the transition might be interfering. Also, `display: block` conflicts with `max-height: 0`.

**Fix Required**:
```scss
&[data-afs-collapsed="true"] &__content {
  max-height: 0 !important;
  opacity: 0;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden;
  // Remove display: block - let it collapse naturally
}
```

**Impact**: Filter groups cannot be collapsed/expanded, affecting UX.

---

### 2. **Slider Image Display Issue - Missing Initial Active State**

**Location**: `storefront/src/quickview.ts:447-461`

**Problem**: 
When the slider initializes, images are set to `display: none` by default, and only the active image gets `display: block`. However, if `goToSlide(0)` is called before images are fully loaded, the first image might not display.

**Current Code**:
```typescript
goToSlide(index: number): void {
  // ...
  this.images.forEach((img, i) => {
    if (i === index) {
      img.classList.add('afs-slider__image--active');
      img.style.display = 'block';
    } else {
      img.classList.remove('afs-slider__image--active');
      img.style.display = 'none';
    }
  });
}
```

**Issue**: The CSS class `.afs-slider__image--active` is used, but the CSS might not have the proper rule, or the inline `style.display` might conflict.

**CSS Check**: In `_quickview.scss:647-662`, the CSS uses:
```scss
&__image {
  display: none;
  // ...
  
  &--active {
    display: block;
  }
}
```

**Potential Issue**: If JavaScript sets `style.display = 'none'` inline, it will override the CSS class `--active` which sets `display: block`.

**Fix Required**: Use CSS classes only, remove inline `style.display`:
```typescript
goToSlide(index: number): void {
  // ...
  this.images.forEach((img, i) => {
    if (i === index) {
      img.classList.add('afs-slider__image--active');
      // Remove: img.style.display = 'block';
    } else {
      img.classList.remove('afs-slider__image--active');
      // Remove: img.style.display = 'none';
    }
  });
}
```

**Impact**: Slider images may not display correctly, especially on initial load.

---

### 3. **Zoom/Magnifier Not Working on Touch Devices**

**Location**: `storefront/src/quickview.ts:236-242`

**Problem**: 
The magnifier is disabled on touch devices, but there's no alternative zoom mechanism for mobile users.

**Current Code**:
```typescript
// Setup pan-zoom magnifier if enabled and not touch device
if (this.magnifierEnabled && !this.isTouchDevice) {
  try {
    this.setupPanZoom();
  } catch (e) {
    console.error('AFSSlider: Error setting up pan-zoom', e);
  }
}
```

**Issue**: Mobile users cannot zoom images, which is a common requirement for product images.

**Fix Required**: Add pinch-to-zoom support for touch devices or provide a zoom button.

**Impact**: Poor mobile UX - users cannot zoom product images.

---

### 4. **Quick View Modal - Potential Race Condition**

**Location**: `storefront/src/quickview.ts:1029-1042`

**Problem**: 
The slider is initialized with a `setTimeout` of 100ms, which might not be enough if the DOM isn't ready or if images are still loading.

**Current Code**:
```typescript
// Initialize slider after DOM is ready
setTimeout(() => {
  const sliderContainer = dialog.querySelector<HTMLElement>(`#${modalId}-slider`);
  if (sliderContainer) {
    dialog._slider = new AFSSlider(sliderContainer, {
      // ...
    });
  }
}, 100);
```

**Issue**: 
- Fixed timeout (100ms) is unreliable
- No check if images are loaded
- No error handling if slider initialization fails

**Fix Required**: Use `MutationObserver` or check for image load:
```typescript
// Wait for images to be in DOM
const initSlider = () => {
  const sliderContainer = dialog.querySelector<HTMLElement>(`#${modalId}-slider`);
  const images = sliderContainer?.querySelectorAll('.afs-slider__image');
  if (sliderContainer && images && images.length > 0) {
    dialog._slider = new AFSSlider(sliderContainer, { /* ... */ });
  } else {
    // Retry after a short delay
    setTimeout(initSlider, 50);
  }
};
initSlider();
```

**Impact**: Slider might not initialize, causing broken quick view.

---

## 🟡 Medium Priority Issues

### 5. **Filter Toggle State Not Persisted**

**Location**: `storefront/src/advanced-filter-search.ts:3242-3262`

**Problem**: 
When a filter group is toggled (collapsed/expanded), the state is only stored in the DOM attribute but not persisted in the `FilterGroupState` object, so it's lost on page refresh or filter update.

**Current Code**:
```typescript
const collapsed = group.getAttribute('data-afs-collapsed') === 'true';
const collapsedState = !collapsed;
group.setAttribute('data-afs-collapsed', collapsedState ? 'true' : 'false');
// Missing: Update states Map
```

**Fix Required**: Update the `states` Map to persist collapse state:
```typescript
const stateKey = group.getAttribute('data-afs-filter-key');
if (stateKey && states.has(stateKey)) {
  const state = states.get(stateKey)!;
  state.collapsed = collapsedState;
  states.set(stateKey, state);
}
```

**Impact**: Filter collapse state resets on filter updates.

---

### 6. **SCSS Syntax - Potential Issue with Display Property**

**Location**: `storefront/src/scss/_filters.scss:119`

**Problem**: 
In the collapsed state, `display: block` is set, which conflicts with `max-height: 0`. This might prevent proper collapsing.

**Current Code**:
```scss
&[data-afs-collapsed="true"] &__content {
  max-height: 0 !important;
  opacity: 0;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden;
  display: block;  // ❌ This prevents collapse
}
```

**Fix Required**: Remove `display: block` or change to `display: none`:
```scss
&[data-afs-collapsed="true"] &__content {
  max-height: 0 !important;
  opacity: 0;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden;
  // Remove display: block - let CSS handle it naturally
}
```

**Impact**: Filter groups may not collapse properly.

---

### 7. **Slider Image Transform Reset Issue**

**Location**: `storefront/src/quickview.ts:463-468`

**Problem**: 
When changing slides, the zoom transform is reset, but if the user is zoomed in, the reset might be jarring.

**Current Code**:
```typescript
// Reset zoom when slide changes
const activeImage = this.images[this._currentIndex];
if (activeImage) {
  activeImage.style.transform = 'scale(1) translate(0, 0)';
  activeImage.style.transition = 'transform 0.2s ease-out';
}
```

**Issue**: The transition is set, but if the user is actively zooming, the reset might conflict.

**Fix Required**: Check if zoom is active before resetting, or add a smoother transition.

**Impact**: Minor UX issue - zoom reset might be abrupt.

---

## 🟢 Low Priority Issues / Improvements

### 8. **Missing Error Handling in Quick View**

**Location**: `storefront/src/quickview.ts:1451-1498`

**Problem**: 
If `createProductModal` fails, the error is logged but the user might not see a clear error message.

**Fix**: Add user-facing error message or retry mechanism.

---

### 9. **SCSS Variable Usage - Inconsistent**

**Location**: Multiple SCSS files

**Problem**: 
Some places use CSS variables (`var(--afs-text-color)`), others use SCSS variables (`$font-size-md`). This is fine, but could be more consistent.

**Impact**: Minor - no functional issue.

---

### 10. **Slider Keyboard Navigation - Only Works When Visible**

**Location**: `storefront/src/quickview.ts:317-319`

**Problem**: 
Keyboard navigation only works if the slider container is visible (has width/height > 0). This is correct behavior, but might be confusing if the modal is open but slider isn't visible yet.

**Current Code**:
```typescript
// Only handle if slider is visible (check if container is in viewport)
const rect = this.container.getBoundingClientRect();
if (rect.width === 0 || rect.height === 0) return;
```

**Impact**: Minor - keyboard navigation might not work immediately after modal opens.

---

## ✅ Working Features

1. **Quick View Modal**: Opens correctly, fetches product data via Ajax API
2. **Slider Navigation**: Prev/Next buttons work
3. **Thumbnail Click**: Changes slide correctly
4. **Variant Selection**: Updates price and images
5. **Add to Cart**: Works from quick view
6. **Filter Toggle Logic**: JavaScript logic is correct (CSS issue prevents it from working)
7. **Touch Swipe**: Works for slider navigation
8. **Image Optimization**: Properly uses Shopify image optimization

---

## 🔧 Recommended Fixes (Priority Order)

### Priority 1 (Critical - Fix Immediately)
1. ✅ Fix filter collapse CSS - remove `display: block` from collapsed state
2. ✅ Fix slider image display - use CSS classes only, remove inline styles
3. ✅ Fix quick view slider initialization - use proper DOM ready check

### Priority 2 (High - Fix Soon)
4. ✅ Persist filter collapse state in `states` Map
5. ✅ Add mobile zoom alternative (pinch-to-zoom or zoom button)

### Priority 3 (Medium - Fix When Possible)
6. ✅ Improve error handling in quick view
7. ✅ Smooth zoom reset on slide change
8. ✅ Add retry mechanism for slider initialization

---

## 📋 Testing Checklist

### Filter Collapse
- [ ] Click filter group toggle - should collapse/expand
- [ ] Collapsed state should persist after filter update
- [ ] Multiple filter groups can be collapsed independently

### Slider
- [ ] Images display on initial load
- [ ] Prev/Next buttons work
- [ ] Thumbnail clicks change slide
- [ ] Keyboard arrows work (when modal is open)
- [ ] Touch swipe works on mobile

### Zoom/Magnifier
- [ ] Hover zoom works on desktop (non-touch)
- [ ] Zoom resets on mouse leave
- [ ] Zoom resets on slide change
- [ ] Mobile has alternative zoom (if implemented)

### Quick View
- [ ] Modal opens on quick view button click
- [ ] Product data loads correctly
- [ ] Variant selection updates price and images
- [ ] Add to cart works
- [ ] Modal closes on backdrop click or ESC
- [ ] Slider initializes correctly

---

## 🐛 Bug Summary

| Bug | Severity | Status | Location |
|-----|----------|--------|----------|
| Filter collapse not working | 🔴 Critical | Needs Fix | `_filters.scss:119` |
| Slider images not displaying | 🔴 Critical | Needs Fix | `quickview.ts:447-461` |
| Zoom not working on mobile | 🟡 Medium | Needs Fix | `quickview.ts:236` |
| Quick view race condition | 🟡 Medium | Needs Fix | `quickview.ts:1029` |
| Filter state not persisted | 🟡 Medium | Needs Fix | `advanced-filter-search.ts:3242` |
| SCSS display conflict | 🟡 Medium | Needs Fix | `_filters.scss:119` |

---

## 📝 Code Quality Notes

### Good Practices Found
- ✅ Proper TypeScript types
- ✅ Error handling with try-catch
- ✅ Accessibility attributes (aria-expanded, aria-label)
- ✅ Responsive design considerations
- ✅ Image optimization
- ✅ Debouncing where appropriate

### Areas for Improvement
- ⚠️ Inline styles conflict with CSS classes
- ⚠️ Fixed timeouts instead of proper DOM ready checks
- ⚠️ State management could be more robust
- ⚠️ Missing mobile zoom alternative

---

## 🎯 Conclusion

The storefront script is **mostly functional** but has **critical CSS and JavaScript issues** that prevent filter collapse and may cause slider display problems. These should be fixed before production deployment.

**Estimated Fix Time**: 2-4 hours for critical issues, 4-6 hours for all issues.

**Recommendation**: Fix Priority 1 issues immediately, then test thoroughly before deployment.

