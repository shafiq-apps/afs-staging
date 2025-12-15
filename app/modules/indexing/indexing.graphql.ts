/**
 * GraphQL Queries and Mutations for Bulk Indexing
*/

export const BULK_PRODUCTS_MUTATION = `
mutation {
  bulkOperationRunQuery(
    query: """
    {
      products {
        edges {
          node {
            id
            title
            handle
            category {
              name
            }
            createdAt
            updatedAt
            publishedAt
            tags
            vendor
            productType
            status
            templateSuffix
            totalInventory
            tracksInventory
            priceRangeV2 {
              maxVariantPrice {
                amount
                currencyCode
              }
              minVariantPrice {
                amount
                currencyCode
              }
            }
            options {
              id
              name
              values
            }

            media {
              edges {
                node {
                  id
                  alt
                  preview {
                    image {
                      url
                      altText
                    }
                  }
                  status
                }
              }
            }

            variants {
              edges {
                node {
                  id
                  title
                  displayName
                  sku
                  barcode
                  price
                  compareAtPrice
                  availableForSale
                  inventoryQuantity
                  position
                  sellableOnlineQuantity
                  taxable
                  createdAt
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
            collections {
              edges {
                node {
                  id
                }
              }
            }
          }
        }
      }
    }
    """
  ) {
    bulkOperation {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}
`;

export const POLL_QUERY = `
query BulkOperationStatus($id: ID!) {
  node(id: $id) {
    ... on BulkOperation {
      id
      status
      errorCode
      createdAt
      completedAt
      objectCount
      partialDataUrl
      type
      url
    }
  }
}
`;

