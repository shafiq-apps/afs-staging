/**
 * Shops GraphQL Schema
 * Defines GraphQL types and operations for shop data
 * Note: Sensitive fields (accessToken, refreshToken) are excluded
 * 
 * Index Configuration (optional - uses defaults if not specified):
 * @index shops idField=shop sensitiveFields=accessToken,refreshToken
 */

export const shopsSchema = `
  type ShopMetadata {
    shopId: String
    currencyCode: String
    email: String
  }
  type ShopLocals {
    ip: String
    userAgent: String
  }
  # Shop type (public fields only, no sensitive data)
  # Includes session fields from Prisma Session model
  type Shop {
    # @index shops idField=shop sensitiveFields=isDeleted
    shop: String!
    installedAt: String
    isActive: Boolean
    scopes: [String!]
    lastAccessed: String
    updatedAt: String
    isDeleted: String
    uninstalledAt: String
    reinstalledAt: String
    reinstalled: String
    metadata: ShopMetadata
    locals: ShopLocals
    sessionId: String
    state: String
    isOnline: Boolean
    scope: String
    expires: String
    userId: String
    firstName: String
    lastName: String
    email: String
    accountOwner: Boolean
    locale: String
    collaborator: Boolean
    emailVerified: Boolean
  }

  # Input types for mutations
  # They will be saved to ES but filtered from query responses
  input CreateShopInput {
    shop: String!
    accessToken: String
    refreshToken: String
    installedAt: String
    isActive: Boolean
    scopes: [String!]
    lastAccessed: String
    updatedAt: String
    metadata: JSON
    locals: JSON
    sessionId: String
    state: String
    isOnline: Boolean
    scope: String
    expires: String
    userId: String
    firstName: String
    lastName: String
    email: String
    accountOwner: Boolean
    locale: String
    collaborator: Boolean
    emailVerified: Boolean
  }

  input UpdateShopInput {
    shop: String
    accessToken: String
    refreshToken: String
    installedAt: String
    isActive: Boolean
    scopes: [String!]
    lastAccessed: String
    uninstalledAt: String
    reinstalledAt: String
    updatedAt: String
    metadata: JSON
    locals: JSON
    sessionId: String
    state: String
    isOnline: Boolean
    scope: String
    expires: String
    userId: String
    firstName: String
    lastName: String
    email: String
    accountOwner: Boolean
    locale: String
    collaborator: Boolean
    emailVerified: Boolean
  }

  # Reindex Result
  type ReindexResult {
    success: Boolean!
    message: String!
  }

  # Failed Item in Indexing
  type IndexingFailedItem {
    id: String!
    line: Int!
    error: String
    retryCount: Int
  }

  # Indexing Status
  type IndexingStatus {
    shop: String!
    status: String!                    # "in_progress" | "success" | "failed" | "not_started"
    startedAt: String                  # When indexing started (ISO timestamp)
    completedAt: String                 # When indexing completed (ISO timestamp)
    totalLines: Int                     # Total lines in bulk operation file
    totalIndexed: Int!                  # Number of products successfully indexed
    totalFailed: Int!                   # Number of products that failed to index
    progress: Int!                      # Progress percentage (0-100)
    failedItems: [IndexingFailedItem!]! # List of failed items with details
    error: String                       # Error message if indexing failed
    lastShopifyUpdatedAt: String        # Last updatedAt from Shopify when checkpoint was created
    indexExists: Boolean!               # Whether the ES index exists
    lastUpdatedAt: String               # Last time the status was updated (ISO timestamp)
    duration: Int                       # Duration in milliseconds (null if not completed)
  }

  # Query operations
  type Query {
    # Get shop by domain
    shop(domain: String!): Shop
    
    # Check if shop exists
    shopExists(domain: String!): Boolean
    
    # Get indexing status for a shop
    # Returns current indexing status including progress, errors, and timestamps
    indexingStatus(shop: String!): IndexingStatus!
  }

  # Mutation operations
  type Mutation {
    # Create or update shop (upsert) - uses shop domain as ID
    createShop(input: CreateShopInput!): Shop!
    
    # Update shop by domain
    updateShop(domain: String!, input: UpdateShopInput!): Shop
    
    # Delete shop by domain
    deleteShop(domain: String!): Boolean!
    
    # Reindex products for a shop
    # Triggers bulk indexing of products from Shopify to Elasticsearch
    # Returns immediately with success status while indexing runs in background
    reindexProducts(shop: String!): ReindexResult!
  }

  # JSON scalar type for nested objects
  scalar JSON
`;

