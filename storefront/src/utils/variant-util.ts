import { ProductType as Product, ProductVariantType as ProductVariant } from "../type";

export function getSelectedOptions(
    dialog: HTMLElement,
    optionsCount: number
): (string | null)[] {
    return Array.from({ length: optionsCount }, (_, i) => {
        const btn = dialog.querySelector<HTMLButtonElement>(
            `.afs-product-modal__option-value[data-option-index="${i}"].afs-product-modal__option-value--selected`
        );
        return btn?.dataset.optionValue ?? null;
    });
}

export function findMatchingVariants(
    variants: ProductVariant[],
    selected: (string | null)[]
): ProductVariant[] {
    return variants.filter(v =>
        selected.every((val, idx) => {
            if (!val) return true;
            if (idx === 0) return v.option1 === val;
            if (idx === 1) return v.option2 === val;
            return v.option3 === val;
        })
    );
}

// Helper to check if variant is available (checks both available and availableForSale)
export function isVariantAvailable(variant: ProductVariant): boolean {
    // Check both available and availableForSale (Shopify uses different properties)
    // Default to true if not specified (assume available unless explicitly marked as unavailable)
    return variant.available !== false && (variant.availableForSale !== false);
}

export function isOptionValueAvailable(
    product: Product,
    optionIndex: number,
    optionValue: string,
    selected: (string | null)[]
): boolean {
    return product.variants!.some(v => {
        // Check both available and availableForSale (Shopify uses different properties)
        const isAvailable = v.available !== false && (v.availableForSale !== false);
        if (!isAvailable) return false;

        // Check this option value
        if (
            (optionIndex === 0 && v.option1 !== optionValue) ||
            (optionIndex === 1 && v.option2 !== optionValue) ||
            (optionIndex === 2 && v.option3 !== optionValue)
        ) {
            return false;
        }

        // Check other selected options
        return selected.every((val, idx) => {
            if (idx === optionIndex || !val) return true;
            if (idx === 0) return v.option1 === val;
            if (idx === 1) return v.option2 === val;
            return v.option3 === val;
        });
    });
}
