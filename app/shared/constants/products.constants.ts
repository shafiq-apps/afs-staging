/**
 * Product Constants
 * Constants used for product filtering and searching
*/

import { normalizeShopName } from "@shared/utils/shop.util";

export const PRODUCT_OPTION_PAIR_SEPARATOR = '::';

export const PRODUCT_INDEX_SUFFIX = '-products'; //suffix 

export const PRODUCT_INDEX_NAME = (shop: string) => `${normalizeShopName(shop)}${PRODUCT_INDEX_SUFFIX}`;

// just for reference object structure to understand the product
export const DUMMY_PRODUCT_OBJECT = {
    "id": "gid://shopify/Product/4836337713245",
    "productId": "4836337713245",
    "title": "Jacket Down Female Woman Hooded Long",
    "handle": "jacket-down-female-woman-hooded-long-2020-pink-winter-coat-women-racoon-fur-collar-korean-fashion-chaqueta-mujer-kj533",
    "status": "ACTIVE",
    "tags": [
        "jacket"
    ],
    "productType": "",
    "vendor": "digitalcoo-filter-demo-10",
    "category": null,
    "createdAt": "2021-01-21T07:23:36Z",
    "updatedAt": "2024-09-13T06:57:09Z",
    "publishedAt": "2021-01-21T07:23:36Z",
    "templateSuffix": null,
    "totalInventory": 7326,
    "variantsCount": {
        "count": 12,
        "precision": "EXACT"
    },
    "priceRangeV2": {
        "maxVariantPrice": {
            "amount": "3260.84",
            "currencyCode": "USD"
        },
        "minVariantPrice": {
            "amount": "3260.84",
            "currencyCode": "USD"
        }
    },
    "options": [
        {
            "id": "gid://shopify/ProductOption/6277475729501",
            "name": "Color",
            "values": [
                "White",
                "pink",
                "Navy Blue"
            ]
        },
        {
            "id": "gid://shopify/ProductOption/6277475762269",
            "name": "Size",
            "values": [
                "XS",
                "M",
                "S",
                "L"
            ]
        }
    ],
    "collections": [
        "174251016285",
        "174251081821",
        "306458427485",
        "306458951773",
        "306461966429"
    ],
    "collectionSortOrder": {},
    "bestSellerRank": null,
    "variants": [
        {
            "id": "gid://shopify/ProductVariant/32984648122461",
            "title": "White / XS",
            "displayName": "Jacket Down Female Woman Hooded Long - White / XS",
            "sku": "42890729-white-xs",
            "barcode": null,
            "price": "3260.84",
            "compareAtPrice": null,
            "availableForSale": true,
            "inventoryQuantity": 666,
            "position": 1,
            "sellableOnlineQuantity": 666,
            "taxable": false,
            "createdAt": "2021-01-21T07:23:36Z",
            "selectedOptions": [
                {
                    "name": "Color",
                    "value": "White"
                },
                {
                    "name": "Size",
                    "value": "XS"
                }
            ],
            "__parentId": "gid://shopify/Product/4836337713245",
            "options": [
                {
                    "name": "Color",
                    "value": "White"
                },
                {
                    "name": "Size",
                    "value": "XS"
                }
            ],
            "optionPairs": [
                "Color::White",
                "Size::XS"
            ],
            "optionKey": "Color:White|Size:XS"
        },
        {
            "id": "gid://shopify/ProductVariant/32984648187997",
            "title": "White / M",
            "displayName": "Jacket Down Female Woman Hooded Long - White / M",
            "sku": "42890729-white-m",
            "barcode": null,
            "price": "3260.84",
            "compareAtPrice": null,
            "availableForSale": true,
            "inventoryQuantity": 666,
            "position": 2,
            "sellableOnlineQuantity": 666,
            "taxable": false,
            "createdAt": "2021-01-21T07:23:36Z",
            "selectedOptions": [
                {
                    "name": "Color",
                    "value": "White"
                },
                {
                    "name": "Size",
                    "value": "M"
                }
            ],
            "__parentId": "gid://shopify/Product/4836337713245",
            "options": [
                {
                    "name": "Color",
                    "value": "White"
                },
                {
                    "name": "Size",
                    "value": "M"
                }
            ],
            "optionPairs": [
                "Color::White",
                "Size::M"
            ],
            "optionKey": "Color:White|Size:M"
        },
        {
            "id": "gid://shopify/ProductVariant/32984648351837",
            "title": "White / S",
            "displayName": "Jacket Down Female Woman Hooded Long - White / S",
            "sku": "42890729-white-s",
            "barcode": null,
            "price": "3260.84",
            "compareAtPrice": null,
            "availableForSale": true,
            "inventoryQuantity": 666,
            "position": 3,
            "sellableOnlineQuantity": 666,
            "taxable": false,
            "createdAt": "2021-01-21T07:23:36Z",
            "selectedOptions": [
                {
                    "name": "Color",
                    "value": "White"
                },
                {
                    "name": "Size",
                    "value": "S"
                }
            ],
            "__parentId": "gid://shopify/Product/4836337713245",
            "options": [
                {
                    "name": "Color",
                    "value": "White"
                },
                {
                    "name": "Size",
                    "value": "S"
                }
            ],
            "optionPairs": [
                "Color::White",
                "Size::S"
            ],
            "optionKey": "Color:White|Size:S"
        },
        {
            "id": "gid://shopify/ProductVariant/32984648515677",
            "title": "White / L",
            "displayName": "Jacket Down Female Woman Hooded Long - White / L",
            "sku": "42890729-white-l",
            "barcode": null,
            "price": "3260.84",
            "compareAtPrice": null,
            "availableForSale": true,
            "inventoryQuantity": 666,
            "position": 4,
            "sellableOnlineQuantity": 666,
            "taxable": false,
            "createdAt": "2021-01-21T07:23:36Z",
            "selectedOptions": [
                {
                    "name": "Color",
                    "value": "White"
                },
                {
                    "name": "Size",
                    "value": "L"
                }
            ],
            "__parentId": "gid://shopify/Product/4836337713245",
            "options": [
                {
                    "name": "Color",
                    "value": "White"
                },
                {
                    "name": "Size",
                    "value": "L"
                }
            ],
            "optionPairs": [
                "Color::White",
                "Size::L"
            ],
            "optionKey": "Color:White|Size:L"
        },
        {
            "id": "gid://shopify/ProductVariant/32984648810589",
            "title": "pink / XS",
            "displayName": "Jacket Down Female Woman Hooded Long - pink / XS",
            "sku": "42890729-pink-xs",
            "barcode": null,
            "price": "3260.84",
            "compareAtPrice": null,
            "availableForSale": true,
            "inventoryQuantity": 666,
            "position": 5,
            "sellableOnlineQuantity": 666,
            "taxable": false,
            "createdAt": "2021-01-21T07:23:36Z",
            "selectedOptions": [
                {
                    "name": "Color",
                    "value": "pink"
                },
                {
                    "name": "Size",
                    "value": "XS"
                }
            ],
            "__parentId": "gid://shopify/Product/4836337713245",
            "options": [
                {
                    "name": "Color",
                    "value": "pink"
                },
                {
                    "name": "Size",
                    "value": "XS"
                }
            ],
            "optionPairs": [
                "Color::pink",
                "Size::XS"
            ],
            "optionKey": "Color:pink|Size:XS"
        },
        {
            "id": "gid://shopify/ProductVariant/32984649007197",
            "title": "pink / M",
            "displayName": "Jacket Down Female Woman Hooded Long - pink / M",
            "sku": "42890729-pink-m",
            "barcode": null,
            "price": "3260.84",
            "compareAtPrice": null,
            "availableForSale": true,
            "inventoryQuantity": 666,
            "position": 6,
            "sellableOnlineQuantity": 666,
            "taxable": false,
            "createdAt": "2021-01-21T07:23:36Z",
            "selectedOptions": [
                {
                    "name": "Color",
                    "value": "pink"
                },
                {
                    "name": "Size",
                    "value": "M"
                }
            ],
            "__parentId": "gid://shopify/Product/4836337713245",
            "options": [
                {
                    "name": "Color",
                    "value": "pink"
                },
                {
                    "name": "Size",
                    "value": "M"
                }
            ],
            "optionPairs": [
                "Color::pink",
                "Size::M"
            ],
            "optionKey": "Color:pink|Size:M"
        },
        {
            "id": "gid://shopify/ProductVariant/32984649138269",
            "title": "pink / S",
            "displayName": "Jacket Down Female Woman Hooded Long - pink / S",
            "sku": "42890729-pink-s",
            "barcode": null,
            "price": "3260.84",
            "compareAtPrice": null,
            "availableForSale": true,
            "inventoryQuantity": 666,
            "position": 7,
            "sellableOnlineQuantity": 666,
            "taxable": false,
            "createdAt": "2021-01-21T07:23:36Z",
            "selectedOptions": [
                {
                    "name": "Color",
                    "value": "pink"
                },
                {
                    "name": "Size",
                    "value": "S"
                }
            ],
            "__parentId": "gid://shopify/Product/4836337713245",
            "options": [
                {
                    "name": "Color",
                    "value": "pink"
                },
                {
                    "name": "Size",
                    "value": "S"
                }
            ],
            "optionPairs": [
                "Color::pink",
                "Size::S"
            ],
            "optionKey": "Color:pink|Size:S"
        },
        {
            "id": "gid://shopify/ProductVariant/32984649334877",
            "title": "pink / L",
            "displayName": "Jacket Down Female Woman Hooded Long - pink / L",
            "sku": "42890729-pink-l",
            "barcode": null,
            "price": "3260.84",
            "compareAtPrice": null,
            "availableForSale": true,
            "inventoryQuantity": 666,
            "position": 8,
            "sellableOnlineQuantity": 666,
            "taxable": false,
            "createdAt": "2021-01-21T07:23:36Z",
            "selectedOptions": [
                {
                    "name": "Color",
                    "value": "pink"
                },
                {
                    "name": "Size",
                    "value": "L"
                }
            ],
            "__parentId": "gid://shopify/Product/4836337713245",
            "options": [
                {
                    "name": "Color",
                    "value": "pink"
                },
                {
                    "name": "Size",
                    "value": "L"
                }
            ],
            "optionPairs": [
                "Color::pink",
                "Size::L"
            ],
            "optionKey": "Color:pink|Size:L"
        },
        {
            "id": "gid://shopify/ProductVariant/32984649531485",
            "title": "Navy Blue / XS",
            "displayName": "Jacket Down Female Woman Hooded Long - Navy Blue / XS",
            "sku": "42890729-navy-blue-xs",
            "barcode": null,
            "price": "3260.84",
            "compareAtPrice": null,
            "availableForSale": false,
            "inventoryQuantity": 0,
            "position": 9,
            "sellableOnlineQuantity": 0,
            "taxable": false,
            "createdAt": "2021-01-21T07:23:36Z",
            "selectedOptions": [
                {
                    "name": "Color",
                    "value": "Navy Blue"
                },
                {
                    "name": "Size",
                    "value": "XS"
                }
            ],
            "__parentId": "gid://shopify/Product/4836337713245",
            "options": [
                {
                    "name": "Color",
                    "value": "Navy Blue"
                },
                {
                    "name": "Size",
                    "value": "XS"
                }
            ],
            "optionPairs": [
                "Color::Navy Blue",
                "Size::XS"
            ],
            "optionKey": "Color:Navy Blue|Size:XS"
        },
        {
            "id": "gid://shopify/ProductVariant/32984649695325",
            "title": "Navy Blue / M",
            "displayName": "Jacket Down Female Woman Hooded Long - Navy Blue / M",
            "sku": "42890729-navy-blue-m",
            "barcode": null,
            "price": "3260.84",
            "compareAtPrice": null,
            "availableForSale": true,
            "inventoryQuantity": 666,
            "position": 10,
            "sellableOnlineQuantity": 666,
            "taxable": false,
            "createdAt": "2021-01-21T07:23:36Z",
            "selectedOptions": [
                {
                    "name": "Color",
                    "value": "Navy Blue"
                },
                {
                    "name": "Size",
                    "value": "M"
                }
            ],
            "__parentId": "gid://shopify/Product/4836337713245",
            "options": [
                {
                    "name": "Color",
                    "value": "Navy Blue"
                },
                {
                    "name": "Size",
                    "value": "M"
                }
            ],
            "optionPairs": [
                "Color::Navy Blue",
                "Size::M"
            ],
            "optionKey": "Color:Navy Blue|Size:M"
        },
        {
            "id": "gid://shopify/ProductVariant/32984649859165",
            "title": "Navy Blue / S",
            "displayName": "Jacket Down Female Woman Hooded Long - Navy Blue / S",
            "sku": "42890729-navy-blue-s",
            "barcode": null,
            "price": "3260.84",
            "compareAtPrice": null,
            "availableForSale": true,
            "inventoryQuantity": 666,
            "position": 11,
            "sellableOnlineQuantity": 666,
            "taxable": false,
            "createdAt": "2021-01-21T07:23:36Z",
            "selectedOptions": [
                {
                    "name": "Color",
                    "value": "Navy Blue"
                },
                {
                    "name": "Size",
                    "value": "S"
                }
            ],
            "__parentId": "gid://shopify/Product/4836337713245",
            "options": [
                {
                    "name": "Color",
                    "value": "Navy Blue"
                },
                {
                    "name": "Size",
                    "value": "S"
                }
            ],
            "optionPairs": [
                "Color::Navy Blue",
                "Size::S"
            ],
            "optionKey": "Color:Navy Blue|Size:S"
        },
        {
            "id": "gid://shopify/ProductVariant/32984649990237",
            "title": "Navy Blue / L",
            "displayName": "Jacket Down Female Woman Hooded Long - Navy Blue / L",
            "sku": "42890729-navy-blue-l",
            "barcode": null,
            "price": "3260.84",
            "compareAtPrice": null,
            "availableForSale": true,
            "inventoryQuantity": 666,
            "position": 12,
            "sellableOnlineQuantity": 666,
            "taxable": false,
            "createdAt": "2021-01-21T07:23:36Z",
            "selectedOptions": [
                {
                    "name": "Color",
                    "value": "Navy Blue"
                },
                {
                    "name": "Size",
                    "value": "L"
                }
            ],
            "__parentId": "gid://shopify/Product/4836337713245",
            "options": [
                {
                    "name": "Color",
                    "value": "Navy Blue"
                },
                {
                    "name": "Size",
                    "value": "L"
                }
            ],
            "optionPairs": [
                "Color::Navy Blue",
                "Size::L"
            ],
            "optionKey": "Color:Navy Blue|Size:L"
        }
    ],
    "metafields": [],
    "media": [
        {},
        {},
        {},
        {}
    ],
    "imageUrl": "https://cdn.shopify.com/s/files/1/0280/6497/2893/products/product-image-1665528756.jpg?v=1611213843",
    "imagesUrls": [
        "https://cdn.shopify.com/s/files/1/0280/6497/2893/products/product-image-1665528756.jpg?v=1611213843",
        "https://cdn.shopify.com/s/files/1/0280/6497/2893/products/product-image-1665528762.jpg?v=1611213847",
        "https://cdn.shopify.com/s/files/1/0280/6497/2893/products/product-image-1665528761.jpg?v=1611213860",
        "https://cdn.shopify.com/s/files/1/0280/6497/2893/products/product-image-1665528763.jpg?v=1611213868"
    ],
    "optionPairs": [
        "Color::White",
        "Color::pink",
        "Color::Navy Blue",
        "Size::XS",
        "Size::M",
        "Size::S",
        "Size::L"
    ],
    "variantOptionKeys": [
        "Color:White|Size:XS",
        "Color:White|Size:M",
        "Color:White|Size:S",
        "Color:White|Size:L",
        "Color:pink|Size:XS",
        "Color:pink|Size:M",
        "Color:pink|Size:S",
        "Color:pink|Size:L",
        "Color:Navy Blue|Size:XS",
        "Color:Navy Blue|Size:M",
        "Color:Navy Blue|Size:S",
        "Color:Navy Blue|Size:L"
    ],
    "variantOptionLookup": {},
    "documentType": "product",
    "minPrice": 3260.84,
    "maxPrice": 3260.84
};