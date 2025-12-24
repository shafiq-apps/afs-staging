/**
 * Webhooks GraphQL Schema
 * Defines GraphQL types and operations for webhook processing
 */

export const webhooksSchema = `
  # Webhook Processing Result
  type WebhookProcessingResult {
    success: Boolean!
    message: String!
    webhookId: String
    processedAt: String
  }

  # Webhook Event Input
  input WebhookEventInput {
    topic: String!
    shop: String!
    eventType: String!
    payload: JSON!
    receivedAt: String!
    # Event-specific fields
    productId: String
    productGid: String
    productTitle: String
    productHandle: String
    collectionId: String
    collectionGid: String
    collectionHandle: String
    collectionTitle: String
    isBestSellerCollection: Boolean
    sortOrderUpdated: Boolean
  }

  # Webhook Status Query Result
  type WebhookStatus {
    webhookId: String!
    topic: String!
    shop: String!
    eventType: String!
    status: String!
    receivedAt: String!
    processedAt: String
    retryCount: Int!
    error: String
  }

  # Reconciliation Result
  type ReconciliationResult {
    shop: String!
    productsChecked: Int!
    productsMissing: Int!
    productsUpdated: Int!
    productsDeleted: Int!
    errors: [String!]!
  }

  # Query operations
  type Query {
    # Get webhook status by ID
    webhookStatus(webhookId: String!): WebhookStatus
    
    # Get pending webhooks count for a shop
    pendingWebhooksCount(shop: String!): Int!
  }

  # Mutation operations for webhook processing
  type Mutation {
    # Process webhook event
    # Routes to appropriate handler based on topic/eventType
    processWebhook(input: WebhookEventInput!): WebhookProcessingResult!
    
    # Process app uninstallation
    # Handles complete cleanup: delete index, filters, checkpoints, locks
    processAppUninstall(shop: String!): WebhookProcessingResult!
    
    # Trigger webhook reconciliation for a shop
    reconcileWebhooks(shop: String!): ReconciliationResult!
    
    # Trigger webhook reconciliation for all shops
    reconcileAllWebhooks: [ReconciliationResult!]!
  }

  # JSON scalar type for nested objects
  scalar JSON
`;

