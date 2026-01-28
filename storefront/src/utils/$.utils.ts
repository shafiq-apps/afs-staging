// ============================================================================
// TINY REUSABLE UTILITIES (Smallest possible functions)
// ============================================================================

import { DisplayType, FilterKeyType, ImageAttributesType, ImageOptimizationOptionsType, OptionType, PriceRangeType, ProductImageType, SelectionType, SortFieldType } from "../type";

export const $ = {
    // Fastest debounce
    debounce: <T extends (...args: never[]) => void>(fn: T, ms: number): ((...args: Parameters<T>) => void) => {
        let t: ReturnType<typeof setTimeout> | undefined;
        return (...a: Parameters<T>) => {
            if (t !== undefined) clearTimeout(t);
            t = setTimeout(() => fn(...a), ms);
        };
    },

    toLowerCase: (s: string | number | null | undefined): string => String(s || '').toLowerCase(),

    inputDisplayType: (option: { displayType?: string } | undefined): 'radio' | 'checkbox' => {
        return $.equalsAny($.toLowerCase(option?.displayType), DisplayType.RADIO) ? 'radio' : 'checkbox';
    },

    isMultiSelect: (option: { selectionType?: string } | undefined): boolean => {
        return $.equalsAny($.toLowerCase(option?.selectionType), SelectionType.MULTIPLE) || $.equalsAny(option?.selectionType, SelectionType.MULTIPLE_UPPER);
    },

    // Fast array split
    split: (v: string | string[] | null | undefined): string[] => {
        if (!v) return [];
        if (Array.isArray(v)) return v.map(s => String(s).trim()).filter(Boolean);
        return String(v).split(',').map(s => s.trim()).filter(Boolean);
    },

    // Fast ID getter
    id: (p: { productId?: string | number; id?: string | number; gid?: string | number } | undefined | null): string | null => {
        if (!p) return null;
        const id = p.productId || p.id || p.gid;
        if (!id) return null;
        return String(id).split('/').pop() || null;
    },

    // Fast string check
    str: (v: string | number | null | undefined): string => String(v || '').trim(),

    // Fast empty check
    empty: (v: string | string[] | number | boolean | Record<string, string | string[] | number | boolean | null | undefined | PriceRangeType> | PriceRangeType | null | undefined): boolean => {
        if (!v) return true;
        if (Array.isArray(v)) return v.length === 0;
        if (typeof v === 'object') return Object.keys(v).length === 0;
        return false;
    },

    // Fast element creator
    el: (tag: string, cls: string, attrs: Record<string, string> = {}, content?: string | HTMLElement): HTMLElement => {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
        if (content !== undefined) {
            if (typeof content === 'string') {
                e.textContent = content;
            } else {
                e.appendChild(content);
            }
        }
        return e;
    },

    getAttrVal: (el: HTMLElement, attr: string): string | null => {
        return el?.getAttribute(attr);
    },

    // Fast text setter
    txt: (el: HTMLElement, text: string): HTMLElement => {
        el.textContent = text;
        return el;
    },

    // Fast clear (replaces innerHTML)
    clear: (el: HTMLElement): void => {
        while (el.firstChild) {
            const child = el.firstChild;
            if (child) el.removeChild(child);
        }
    },

    // Fast fragment append
    frag: <T>(items: T[], fn: (item: T) => Node): DocumentFragment => {
        const f = document.createDocumentFragment();
        items.forEach(item => f.appendChild(fn(item)));
        return f;
    },

    // Optimize Shopify image URL with transformations
    optimizeImageUrl: (url: string | null | undefined, options: ImageOptimizationOptionsType = {}): string => {
        if (!url || typeof url !== "string") return "";

        const {
            width = 500,
            height = width,
            quality = 80,
            format = "webp",
            crop = null
        } = options;

        // Only modify Shopify CDN URLs
        const shopifyCdnPattern = /(cdn\.shopify\.com|shopifycdn\.com)/i;
        if (!shopifyCdnPattern.test(url)) return url;

        try {
            const urlObj = new URL(url);
            const params = new URLSearchParams(urlObj.search);

            // Remove any existing Shopify image params
            params.delete("width");
            params.delete("height");
            params.delete("crop");
            params.delete("format");
            params.delete("quality");

            // Apply new optimization params
            params.set("width", String(width));
            params.set("height", String(height));

            if (crop) params.set("crop", crop);
            if (quality !== 100) params.set("quality", String(quality));

            // Avoid format for GIF (Shopify does not convert animated GIFs)
            const isGif = urlObj.pathname.toLowerCase().endsWith(".gif");
            if (!isGif && format) params.set("format", format);

            return `${urlObj.origin}${urlObj.pathname}?${params.toString()}`;
        } catch (err) {
            return url;
        }
    },

    // Build responsive srcset for Shopify images
    buildImageSrcset: (baseUrl: string | null | undefined, sizes: number[] = [200, 300, 500]): string => {
        if (!baseUrl) return '';

        return sizes.map(size => {
            const optimized = $.optimizeImageUrl(baseUrl, { width: size, format: 'webp', quality: size <= 200 ? 75 : size <= 300 ? 80 : 85 });
            return `${optimized} ${size}w`;
        }).join(', ');
    },

    // Format money using Shopify money format
    formatMoney: (cents: string | number | null | undefined, moneyFormat: string | null | undefined, currency: string = ''): string => {
        if (isNaN(Number(cents))) return '';

        // Convert cents to dollars
        const amount = parseFloat(String(cents)) / 100;

        // If no money format provided, use default format
        if (!moneyFormat || typeof moneyFormat !== 'string') {
            return `${currency || ''}${amount.toFixed(2)}`;
        }

        // Replace {{amount}} placeholder with formatted amount
        // Shopify money format examples:
        // - "${{amount}}" → "$10.00"
        // - "{{amount}} USD" → "10.00 USD"
        // - "{{amount_no_decimals}}" → "10"
        // - "{{amount_with_comma_separator}}" → "10,00"
        // - "{{amount_no_decimals_with_comma_separator}}" → "10"
        // - "{{amount_with_apostrophe_separator}}" → "10'00"

        let formattedAmount = amount.toFixed(2);

        // Handle different amount formats
        if (moneyFormat.includes('{{amount_no_decimals}}')) {
            formattedAmount = Math.round(amount).toString();
            return moneyFormat.replace('{{amount_no_decimals}}', formattedAmount);
        }

        if (moneyFormat.includes('{{amount_with_comma_separator}}')) {
            formattedAmount = amount.toFixed(2).replace('.', ',');
            return moneyFormat.replace('{{amount_with_comma_separator}}', formattedAmount);
        }

        if (moneyFormat.includes('{{amount_no_decimals_with_comma_separator}}')) {
            formattedAmount = Math.round(amount).toString();
            return moneyFormat.replace('{{amount_no_decimals_with_comma_separator}}', formattedAmount);
        }

        if (moneyFormat.includes('{{amount_with_apostrophe_separator}}')) {
            formattedAmount = amount.toFixed(2).replace('.', "'");
            return moneyFormat.replace('{{amount_with_apostrophe_separator}}', formattedAmount);
        }

        // Default: replace {{amount}} with formatted amount
        return moneyFormat.replace('{{amount}}', formattedAmount);
    },

    // Reusable comparison functions
    // Compare two values (string, number, boolean, array, or object) with case-insensitive and trimmed string comparison
    equals: (a: string | number | boolean | string[] | null | undefined, b: string | number | boolean | string[] | null | undefined): boolean => {
        if (a === b) return true;
        if (a === null || a === undefined || b === null || b === undefined) return false;

        // For arrays, convert to string representation
        if (Array.isArray(a)) {
            a = a.join(',');
        }
        if (Array.isArray(b)) {
            b = b.join(',');
        }

        // For strings, compare case-insensitively and trimmed
        if (typeof a === 'string' && typeof b === 'string') {
            return a.trim().toLowerCase() === b.trim().toLowerCase();
        }

        // For numbers, compare directly
        if (typeof a === 'number' && typeof b === 'number') {
            return a === b;
        }

        // For booleans, compare directly
        if (typeof a === 'boolean' && typeof b === 'boolean') {
            return a === b;
        }

        // Mixed types: convert both to strings and compare
        return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
    },

    // Check if value equals any of the provided enum/constant values (case-insensitive, trimmed)
    equalsAny: (value: string | number | boolean | string[] | null | undefined, ...values: (string | number | boolean)[]): boolean => {
        if (value === null || value === undefined) return false;
        return values.some(v => $.equals(value, v));
    },

    // Check if a filter key matches vendor (handles 'vendor' or 'vendors')
    isVendorKey: (key: string | null | undefined): boolean => {
        return $.equalsAny(key, FilterKeyType.VENDOR, FilterKeyType.VENDORS);
    },

    // Check if a filter key matches productType (handles 'productType' or 'productTypes')
    isProductTypeKey: (key: string | null | undefined): boolean => {
        return $.equalsAny(key, FilterKeyType.PRODUCT_TYPE, FilterKeyType.PRODUCT_TYPES);
    },

    // Check if a filter key matches tags (handles 'tag' or 'tags')
    isTagKey: (key: string | null | undefined): boolean => {
        return $.equalsAny(key, FilterKeyType.TAG, FilterKeyType.TAGS);
    },

    // Check if a filter key matches collections (handles 'collection' or 'collections')
    isCollectionKey: (key: string | null | undefined): boolean => {
        return $.equalsAny(key, FilterKeyType.COLLECTION, FilterKeyType.COLLECTIONS);
    },

    // Check if a filter key matches priceRange (handles 'priceRange' or 'price')
    isPriceRangeKey: (key: string | null | undefined): boolean => {
        return $.equalsAny(key, FilterKeyType.PRICE_RANGE, FilterKeyType.PRICE);
    },

    // Check if sort field is best-selling (handles 'best-selling' or 'bestselling')
    isBestSelling: (field: string | null | undefined): boolean => {
        return $.equalsAny(field, SortFieldType.BEST_SELLING, SortFieldType.BESTSELLING);
    },

    // Check if option type is Collection
    isCollectionOptionType: (optionType: string | null | undefined): boolean => {
        return $.equals(optionType, OptionType.COLLECTION);
    },

    // Check if option type is priceRange
    isPriceRangeOptionType: (optionType: string | null | undefined): boolean => {
        return $.equals(optionType, OptionType.PRICE_RANGE);
    },

    // Build image attributes for product images
    buildImageAttributes: (
        imageData: {
            featuredImage?: ProductImageType;
            imageUrl?: string;
        },
        options: {
            alt?: string;
            loading?: 'lazy' | 'eager';
            decoding?: 'async' | 'sync' | 'auto';
            fetchpriority?: 'high' | 'low' | 'auto';
            defaultWidth?: number;
            defaultHeight?: number;
            srcsetSizes?: number[];
            sizes?: string;
            quality?: number;
        } = {}
    ): ImageAttributesType | null => {
        const {
            alt = '',
            loading = 'lazy',
            decoding = 'async',
            fetchpriority = 'low',
            defaultWidth = 300,
            defaultHeight = 300,
            srcsetSizes = [200, 300, 500],
            sizes = '(max-width: 768px) 200px, (max-width: 1024px) 300px, 500px',
            quality = 80
        } = options;

        // Get base image URL
        const baseImageUrl = imageData.featuredImage?.url ||
            imageData.featuredImage?.urlFallback ||
            imageData.imageUrl ||
            '';

        if (!baseImageUrl) {
            return null;
        }

        // Check if we have pre-optimized URLs from featuredImage
        const hasPreOptimized = imageData.featuredImage &&
            (imageData.featuredImage.urlSmall ||
                imageData.featuredImage.urlMedium ||
                imageData.featuredImage.urlLarge);

        let src: string;
        let srcset: string | undefined;
        let fallbackUrl: string | undefined;

        if (hasPreOptimized && imageData.featuredImage) {
            // Use pre-optimized URLs from Liquid if available
            const srcsetParts: string[] = [];

            if (imageData.featuredImage.urlSmall) {
                srcsetParts.push(`${imageData.featuredImage.urlSmall} 200w`);
            }
            if (imageData.featuredImage.urlMedium) {
                srcsetParts.push(`${imageData.featuredImage.urlMedium} 300w`);
            }
            if (imageData.featuredImage.urlLarge) {
                srcsetParts.push(`${imageData.featuredImage.urlLarge} 500w`);
            }

            if (srcsetParts.length > 0) {
                srcset = srcsetParts.join(', ');
            }

            // Set src with WebP first, fallback to original
            src = imageData.featuredImage.url ||
                imageData.featuredImage.urlFallback ||
                baseImageUrl;
            fallbackUrl = imageData.featuredImage.urlFallback || baseImageUrl;
        } else {
            // Optimize image URL on-the-fly for API responses
            src = $.optimizeImageUrl(baseImageUrl, {
                width: defaultWidth,
                height: defaultHeight,
                format: 'webp',
                quality: quality
            }) || baseImageUrl;

            srcset = $.buildImageSrcset(baseImageUrl, srcsetSizes);
            fallbackUrl = baseImageUrl;
        }

        // Extract width and height from URL if available, otherwise use defaults
        let width: number | undefined = defaultWidth;
        let height: number | undefined = defaultHeight;

        // Try to extract dimensions from URL (e.g., _300x300_)
        const dimensionMatch = baseImageUrl.match(/_(\d+)x(\d+)[_.]/i);
        if (dimensionMatch) {
            width = parseInt(dimensionMatch[1], 10);
            height = parseInt(dimensionMatch[2], 10);
        }

        return {
            src,
            srcset: srcset || undefined,
            sizes: srcset ? sizes : undefined,
            width,
            height,
            alt,
            loading,
            decoding,
            fetchpriority,
            fallbackUrl
        };
    }
};