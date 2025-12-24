/**
 * DOM Ready Utilities
 * Proper DOM ready checks instead of fixed timeouts
 */

/**
 * Wait for an element to be in the DOM
 */
export function waitForElement(
  selector: string,
  container: Document | HTMLElement = document,
  timeout: number = 5000
): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    // Check if element already exists
    const existing = container.querySelector<HTMLElement>(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    // Use MutationObserver to watch for element
    const observer = new MutationObserver((mutations, obs) => {
      const element = container.querySelector<HTMLElement>(selector);
      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });

    observer.observe(container.body || container, {
      childList: true,
      subtree: true,
    });

    // Timeout fallback
    const timeoutId = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);

    // Clean up timeout if element is found
    const originalResolve = resolve;
    resolve = (element: HTMLElement) => {
      clearTimeout(timeoutId);
      originalResolve(element);
    };
  });
}

/**
 * Wait for multiple elements to be in the DOM
 */
export function waitForElements(
  selectors: string[],
  container: Document | HTMLElement = document,
  timeout: number = 5000
): Promise<HTMLElement[]> {
  return Promise.all(
    selectors.map(selector => waitForElement(selector, container, timeout))
  );
}

/**
 * Wait for images to load
 */
export function waitForImages(
  container: HTMLElement,
  selector: string = 'img',
  timeout: number = 10000
): Promise<HTMLImageElement[]> {
  return new Promise((resolve, reject) => {
    const images = Array.from(container.querySelectorAll<HTMLImageElement>(selector));
    
    if (images.length === 0) {
      resolve([]);
      return;
    }

    let loadedCount = 0;
    const totalImages = images.length;

    const checkComplete = () => {
      loadedCount++;
      if (loadedCount === totalImages) {
        resolve(images);
      }
    };

    images.forEach(img => {
      if (img.complete) {
        checkComplete();
      } else {
        img.addEventListener('load', checkComplete, { once: true });
        img.addEventListener('error', checkComplete, { once: true });
      }
    });

    // Timeout fallback
    setTimeout(() => {
      if (loadedCount < totalImages) {
        resolve(images); // Resolve with whatever loaded
      }
    }, timeout);
  });
}

/**
 * Wait for DOM to be ready (alternative to DOMContentLoaded)
 */
export function domReady(): Promise<void> {
  return new Promise(resolve => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
    } else {
      resolve();
    }
  });
}

/**
 * Wait for element and ensure it has content
 */
export function waitForElementWithContent(
  selector: string,
  container: Document | HTMLElement = document,
  timeout: number = 5000
): Promise<HTMLElement> {
  return waitForElement(selector, container, timeout).then(element => {
    // Check if element has meaningful content
    if (element.children.length > 0 || element.textContent?.trim()) {
      return element;
    }
    
    // Wait a bit more for content
    return new Promise<HTMLElement>((resolve, reject) => {
      const observer = new MutationObserver((mutations, obs) => {
        if (element.children.length > 0 || element.textContent?.trim()) {
          obs.disconnect();
          resolve(element);
        }
      });

      observer.observe(element, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      setTimeout(() => {
        observer.disconnect();
        if (element.children.length > 0 || element.textContent?.trim()) {
          resolve(element);
        } else {
          reject(new Error(`Element ${selector} has no content`));
        }
      }, 1000);
    });
  });
}

