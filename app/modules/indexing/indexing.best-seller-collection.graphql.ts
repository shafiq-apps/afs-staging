/**
 * GraphQL Queries and Mutations for Best Seller Collection
 */

export const GET_COLLECTION_BY_HANDLE_QUERY = `
query GetCollectionByHandle($handle: String!) {
  collectionByHandle(handle: $handle) {
    id
    title
    handle
    productsCount {
      count
      precision
    }
  }
}
`;

export const CREATE_BEST_SELLER_COLLECTION_MUTATION = `
mutation CreateBestSellerCollection($handle: String!, $title: String!) {
  collectionCreate(
    input: {
      title: $title
      handle: $handle
      ruleSet: {
        appliedDisjunctively: false
        rules: [
          {
            column: VARIANT_PRICE
            relation: GREATER_THAN
            condition: "-1"
          }
        ]
      }
    }
  ) {
    collection {
      id
      title
      handle
      productsCount {
        count
        precision
      }
    }
    userErrors {
      field
      message
    }
  }
}
`;

export const UPDATE_COLLECTION_SORT_ORDER_MUTATION = `
mutation UpdateCollectionSortOrder($id: ID!) {
  collectionUpdate(
    input: {
      id: $id
      sortOrder: BEST_SELLING
    }
  ) {
    collection {
      id
      sortOrder
    }
    userErrors {
      field
      message
    }
  }
}
`;

export const GET_COLLECTION_PRODUCTS_QUERY = `
query GetCollectionProducts($id: ID!, $first: Int = 250, $cursor: String) {
  collection(id: $id) {
    id
    productsCount {
      count
      precision
    }
    products(first: $first, after: $cursor, sortKey: BEST_SELLING) {
      edges {
        node {
          id
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
`;

export const BULK_COLLECTION_PRODUCTS_QUERY = `
mutation BulkGetCollectionProducts {
  bulkOperationRunQuery(
    query: """
    {
      collection(id: "COLLECTION_ID_PLACEHOLDER") {
        id
        products {
          edges {
            node {
              id
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

export const DELETE_COLLECTION_MUTATION = `
mutation DeleteCollection($id: ID!) {
  collectionDelete(id: $id) {
    deletedCollectionId
    userErrors {
      field
      message
    }
  }
}
`;

