# Webhook Queue & Processing System Implementation

## Overview
Complete implementation of webhook queue, async processing, and reconciliation system.

## Components Implemented

### 1. Webhook Repository (`app/modules/webhooks/webhooks.repository.ts`)
- **Purpose**: Manages webhook events in Elasticsearch queue
- **Features**:
  - Store webhook events with status tracking (pending, processing, completed, failed)
  - Deduplication using topic + shop + entity ID
  - Retry mechanism with configurable max retries
  - Cleanup of old processed webhooks (TTL-based)
  - Get pending webhooks for processing

### 2. Webhook Worker Service (`app/modules/webhooks/webhooks.worker.service.ts`)
- **Purpose**: Asynchronously processes webhook events from the queue
- **Features**:
  - Background worker that polls for pending webhooks
  - Configurable processing interval (default: 5 seconds)
  - Concurrent processing with configurable batch size
  - Automatic retry on failure
  - Routes to appropriate handlers based on event type:
    - `products/create` / `products/update` - Index/update product in ES
    - `products/delete` - Delete product from ES
    - `collections/update` - Handle collection updates (best seller tracking)
    - `collections/delete` - Handle collection deletions

### 3. Webhook Reconciliation Service (`app/modules/webhooks/webhooks.reconciliation.service.ts`)
- **Purpose**: Periodic job to catch missed webhooks and fix discrepancies
- **Features**:
  - Reconcile products for a single shop
  - Reconcile all active shops
  - Compare Shopify products with ES index
  - Identify and fix:
    - Missing products (in Shopify but not in ES)
    - Outdated products (ES version older than Shopify)
    - Orphaned products (in ES but not in Shopify)

### 4. GraphQL Integration
- **Schema Updates** (`app/modules/graphql/schema/webhooks.schema.ts`):
  - Added `webhookStatus` query
  - Added `pendingWebhooksCount` query
  - Added `reconcileWebhooks` mutation
  - Added `reconcileAllWebhooks` mutation

- **Resolver Updates** (`app/modules/graphql/resolvers/webhooks.resolvers.ts`):
  - `processWebhook` now stores webhooks in ES queue
  - Added deduplication check
  - Added query resolvers for webhook status
  - Added mutation resolvers for reconciliation

### 5. Bootstrap Integration (`app/core/bootstrap/main.ts`)
- Webhook worker automatically starts on application bootstrap
- Configurable via `WEBHOOK_WORKER_INTERVAL_MS` environment variable (default: 5000ms)

## Architecture

```
Shopify Webhook → Remix Handler → GraphQL Mutation → Store in ES Queue → Worker Processes → Update ES
                                                                    ↓
                                                              Reconciliation Job
```

## Webhook Processing Flow

1. **Webhook Received**: Remix handler receives webhook from Shopify
2. **GraphQL Call**: Handler calls `processWebhook` GraphQL mutation
3. **Deduplication**: Check if webhook was already processed (within time window)
4. **Queue Storage**: Store webhook in ES queue with status `pending`
5. **Worker Processing**: Background worker picks up pending webhooks
6. **Status Update**: Worker updates status to `processing`, then `completed` or `failed`
7. **Retry Logic**: Failed webhooks are retried up to max retries (default: 3)
8. **Cleanup**: Old processed webhooks are cleaned up (default: 7 days TTL)

## Configuration

### Environment Variables
- `WEBHOOK_WORKER_INTERVAL_MS`: Worker polling interval in milliseconds (default: 5000)
- `GRAPHQL_ENDPOINT`: GraphQL API endpoint (default: http://localhost:3554/graphql)

### Elasticsearch Index
- **Index Name**: `webhooks_queue`
- **Auto-created**: Yes, on first webhook storage
- **TTL**: Processed webhooks cleaned up after 7 days

## GraphQL API

### Queries
```graphql
# Get webhook status
query {
  webhookStatus(webhookId: "uuid") {
    webhookId
    topic
    shop
    eventType
    status
    receivedAt
    processedAt
    retryCount
    error
  }
}

# Get pending webhooks count
query {
  pendingWebhooksCount(shop: "shop.myshopify.com")
}
```

### Mutations
```graphql
# Process webhook (called by Remix handlers)
mutation {
  processWebhook(input: {
    topic: "products/update"
    shop: "shop.myshopify.com"
    eventType: "products/update"
    payload: {...}
    receivedAt: "2024-01-01T00:00:00Z"
    productId: "123"
    productGid: "gid://shopify/Product/123"
  }) {
    success
    message
    webhookId
    processedAt
  }
}

# Reconcile webhooks for a shop
mutation {
  reconcileWebhooks(shop: "shop.myshopify.com") {
    shop
    productsChecked
    productsMissing
    productsUpdated
    productsDeleted
    errors
  }
}

# Reconcile webhooks for all shops
mutation {
  reconcileAllWebhooks {
    shop
    productsChecked
    productsMissing
    productsUpdated
    productsDeleted
    errors
  }
}
```

## Webhook Event Status

- **pending**: Webhook queued, waiting for processing
- **processing**: Webhook currently being processed
- **completed**: Webhook processed successfully
- **failed**: Webhook failed after max retries

## Retry Logic

- **Max Retries**: 3 (configurable)
- **Retry Behavior**: Failed webhooks are marked as `pending` again
- **After Max Retries**: Webhook is marked as `failed` and not retried

## Deduplication

- **Key**: `topic + shop + entityId` (productId or collectionId)
- **Time Window**: 60 seconds (configurable)
- **Check**: Only against `completed` webhooks within time window
- **Purpose**: Prevent duplicate processing of same webhook event

## Cleanup

- **TTL**: 7 days (configurable)
- **Target**: `completed` and `failed` webhooks older than TTL
- **Method**: `deleteByQuery` on ES index
- **Frequency**: Manual or scheduled (can be added to cron)

## Error Handling

- **Worker Errors**: Logged and webhook marked for retry
- **GraphQL Errors**: Logged but don't fail webhook (prevents Shopify retries)
- **Reconciliation Errors**: Collected and returned in result

## Monitoring

- **Webhook Status**: Query via GraphQL `webhookStatus` query
- **Pending Count**: Query via GraphQL `pendingWebhooksCount` query
- **Logs**: All operations logged with structured logging

## Future Enhancements

1. **Scheduled Reconciliation**: Add cron job for automatic reconciliation
2. **Webhook Metrics**: Track processing times, success rates
3. **Dead Letter Queue**: Store permanently failed webhooks for manual review
4. **Batch Processing**: Group similar webhooks for batch updates
5. **Priority Queue**: Prioritize certain webhook types
6. **Full Product Transformation**: Use ProductBulkIndexer's transformation logic for consistency

## Testing

### Manual Testing
1. Trigger a product update in Shopify
2. Check webhook is stored in ES queue
3. Verify worker processes it
4. Check product is updated in ES index
5. Query webhook status via GraphQL

### Reconciliation Testing
1. Manually delete a product from ES
2. Run reconciliation mutation
3. Verify product is re-indexed

## Notes

- Worker starts automatically on application bootstrap
- Webhook processing is asynchronous and non-blocking
- All webhook handlers return 200 OK immediately
- Reconciliation can be triggered manually via GraphQL or scheduled
- Product transformation in worker is simplified - consider using ProductBulkIndexer's logic for full consistency

