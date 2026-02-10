/**
 * Elasticsearch Static Index Configurations
 * Defines mappings and settings for all static (non-dynamic) indices
 * These indices are created on application bootstrap
 */

import {
  SHOPS_INDEX_NAME,
  FILTERS_INDEX_NAME,
  SEARCH_INDEX_NAME,
  SETTINGS_INDEX_NAME,
  CHECKPOINT_INDEX_NAME,
  LOCK_INDEX_NAME,
  WEBHOOKS_QUEUE_INDEX_NAME,
  BEST_SELLER_COLLECTION_INDEX,
  SUBSCRIPTIONS_INDEX_NAME,
  SUBSCRIPTION_PLANS_INDEX_NAME,
  APP_SUPPORT_TICKET_INDEX,
  ADMIN_USERS_INDEX_NAME,
} from '@shared/constants/es.constant';

export interface StaticIndexConfig {
  index: string;
  mappings: {
    properties: Record<string, any>;
  };
  settings: {
    number_of_shards?: number;
    number_of_replicas?: number;
    refresh_interval?: string;
    index?: {
      mapping?: {
        total_fields?: {
          limit?: number;
        };
      };
      max_result_window?: number;
    };
    analysis?: {
      analyzer?: Record<string, any>;
    };
  };
}

/**
 * All static index configurations
 * These indices are created on application bootstrap
 */
export const STATIC_INDEX_CONFIGS: StaticIndexConfig[] = [
  // Shops index
  {
    index: SHOPS_INDEX_NAME,
    mappings: {
      properties: {
        shop: { type: 'keyword' },
        accessToken: { type: 'keyword' },
        refreshToken: { type: 'keyword' },
        installedAt: { type: 'date' },
        scopes: { type: 'keyword' },
        lastAccessed: { type: 'date' },
        updatedAt: { type: 'date' },
        uninstalledAt: { type: 'date' },
        reinstalledAt: { type: 'date' },
        metadata: { type: 'object', enabled: true },
        locals: { type: 'object', enabled: true },
        sessionId: { type: 'keyword' },
        state: { type: 'keyword' },
        isOnline: { type: 'boolean' },
        scope: { type: 'keyword' },
        expires: { type: 'date' },
        userId: { type: 'keyword' },
        firstName: { type: 'text' },
        lastName: { type: 'text' },
        email: { type: 'keyword' },
        accountOwner: { type: 'boolean' },
        locale: { type: 'keyword' },
        collaborator: { type: 'boolean' },
        emailVerified: { type: 'boolean' },
      },
    },
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
    },
  },

  // Filters index
  {
    index: FILTERS_INDEX_NAME,
    mappings: {
      properties: {
        id: { type: 'keyword' },
        shop: { type: 'keyword' },
        title: { type: 'text' },
        description: { type: 'text' },
        filterType: { type: 'keyword' },
        targetScope: { type: 'keyword' },
        allowedCollections: { type: 'keyword' },
        options: {
          type: 'nested',
          properties: {
            handle: { type: 'keyword' },
            position: { type: 'integer' },
            label: { type: 'text' },
            optionType: { type: 'keyword' },
            displayType: { type: 'keyword' },
            selectionType: { type: 'keyword' },
            allowedOptions: { type: 'keyword' },
            collapsed: { type: 'boolean' },
            searchable: { type: 'boolean' },
            showTooltip: { type: 'boolean' },
            tooltipContent: { type: 'text' },
            showCount: { type: 'boolean' },
            showMenu: { type: 'boolean' },
            status: { type: 'keyword' },
            optionSettings: { type: 'object', enabled: true },
          },
        },
        status: { type: 'keyword' },
        deploymentChannel: { type: 'keyword' },
        settings: { type: 'object', enabled: true },
        tags: { type: 'keyword' },
        version: { type: 'integer' },
        createdAt: { type: 'date' },
        updatedAt: { type: 'date' },
      },
    },
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
    },
  },

  // Search configuration index
  {
    index: SEARCH_INDEX_NAME,
    mappings: {
      properties: {
        id: { type: 'keyword' },
        shop: { type: 'keyword' },
        fields: {
          type: 'nested',
          properties: {
            field: { type: 'keyword' },
            weight: { type: 'float' },
          },
        },
        createdAt: { type: 'date' },
        updatedAt: { type: 'date' },
      },
    },
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
    },
  },

  // Settings index (if used)
  {
    index: SETTINGS_INDEX_NAME,
    mappings: {
      properties: {
        id: { type: 'keyword' },
        shop: { type: 'keyword' },
        key: { type: 'keyword' },
        value: { type: 'object', enabled: true },
        createdAt: { type: 'date' },
        updatedAt: { type: 'date' },
      },
    },
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
    },
  },

  // Checkpoint index
  {
    index: CHECKPOINT_INDEX_NAME,
    mappings: {
      properties: {
        shop: { type: 'keyword' },
        checkpointId: { type: 'keyword' },
        data: { type: 'object', enabled: true },
        updatedAt: { type: 'date' },
        expiresAt: { type: 'date' },
      },
    },
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
      refresh_interval: '5s',
    },
  },

  // Lock index
  {
    index: LOCK_INDEX_NAME,
    mappings: {
      properties: {
        shop: { type: 'keyword' },
        lockId: { type: 'keyword' },
        startedAt: { type: 'date' },
        expiresAt: { type: 'date' },
      },
    },
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
    },
  },

  // Webhooks queue index
  {
    index: WEBHOOKS_QUEUE_INDEX_NAME,
    mappings: {
      properties: {
        webhookId: { type: 'keyword' },
        topic: { type: 'keyword' },
        shop: { type: 'keyword' },
        eventType: { type: 'keyword' },
        status: { type: 'keyword' },
        payload: { type: 'object', enabled: true },
        receivedAt: { type: 'date' },
        processedAt: { type: 'date' },
        retryCount: { type: 'integer' },
        error: { type: 'text' },
        productId: { type: 'keyword' },
        productGid: { type: 'keyword' },
        collectionId: { type: 'keyword' },
        collectionGid: { type: 'keyword' },
        isBestSellerCollection: { type: 'boolean' },
      },
    },
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
    },
  },

  // Best seller collections index
  {
    index: BEST_SELLER_COLLECTION_INDEX,
    mappings: {
      properties: {
        shop: { type: 'keyword' },
        collectionHandle: { type: 'keyword' },
        collectionId: { type: 'keyword' },
        status: { type: 'keyword' },
        productCount: { type: 'integer' },
        expectedProductCount: { type: 'integer' },
        createdAt: { type: 'date' },
        lastUsedAt: { type: 'date' },
        lastVerifiedAt: { type: 'date' },
        isStale: { type: 'boolean' },
        error: { type: 'text' },
      },
    },
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
    },
  },

  // Subscriptions index
  {
    index: SUBSCRIPTIONS_INDEX_NAME,
    mappings: {
      properties: {
        id: { type: 'keyword' },
        shopifySubscriptionId: { type: 'keyword' },
        name: { type: 'text' },
        status: { type: 'keyword' },
        confirmationUrl: { type: 'keyword' },
        test: { type: 'boolean' },
        lineItems: {
          type: 'nested',
          properties: {
            id: { type: 'keyword' },
            plan: { type: 'object', enabled: true },
            quantity: { type: 'integer' },
          },
        },
        createdAt: { type: 'date' },
        updatedAt: { type: 'date' },
      },
    },
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
    },
  },

  // Subscription plans index
  {
    index: SUBSCRIPTION_PLANS_INDEX_NAME,
    mappings: {
      properties: {
        id: { type: 'keyword' },
        handle: { type: 'keyword' },
        name: { type: 'text' },
        description: { type: 'text' },
        productLimit: { type: 'integer' },
        test: { type: 'boolean' },
        price: {
          properties: {
            amount: {
              type: "long"
            },
            currencyCode: {
              type: "text",
              fields: {
                keyword: {
                  type: "keyword",
                  ignore_above: 256
                }
              }
            }
          }
        },
        createdAt: { type: 'date' },
        updatedAt: { type: 'date' },
      },
    },
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
    },
  },

  // Support tickets index
  {
    index: APP_SUPPORT_TICKET_INDEX,
    mappings: {
      properties: {
        id: { type: 'keyword' },
        shop: { type: 'keyword' },
        name: { type: 'text' },
        email: { type: 'keyword' },
        subject: {
          type: 'text',
          fields: {
            keyword: { type: 'keyword' }
          }
        },
        priority: { type: 'keyword' },
        message: { type: 'text' },
        status: { type: 'keyword' },
        createdAt: { type: 'date' },
        updatedAt: { type: 'date' },
        resolvedAt: { type: 'date' },
        assignedTo: { type: 'keyword' },
        notes: { type: 'text' },
      }
    },
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
      analysis: {
        analyzer: {
          support_text_analyzer: {
            type: 'standard',
            stopwords: '_english_'
          }
        }
      }
    }
  },

  // Admin users index
  {
    index: ADMIN_USERS_INDEX_NAME,
    mappings: {
      properties: {
        id: { type: 'keyword' },
        email: { type: 'keyword' },
        name: { type: 'text' },
        role: { type: 'keyword' },
        permissions: {
          type: 'object',
          properties: {
            canViewPayments: { type: 'boolean' },
            canViewSubscriptions: { type: 'boolean' },
            canManageShops: { type: 'boolean' },
            canManageTeam: { type: 'boolean' },
            canViewDocs: { type: 'boolean' },
          },
        },
        apiKey: { type: 'keyword' },
        apiSecret: { type: 'keyword' },
        isActive: { type: 'boolean' },
        createdAt: { type: 'date' },
        updatedAt: { type: 'date' },
      },
    },
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
    },
  },
];

