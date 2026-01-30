import { ProductType } from "../type";

/**
 * Is product available ? Boolean
 * @param product - Product object with variants property
 * @returns Returns true if all variants are soldout, false otherwise
*/
export function isProductAvailable(product: ProductType): boolean {
    if (!product) return false;

    return product.variants.some((v) => v.availableForSale === true);
}