/**
 * Elasticsearch Index Configuration for Support Tickets
 * Defines mappings and settings for the support_tickets index
 */

export const supportTicketsIndexConfig = {
  index: 'support_tickets',
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
    number_of_replicas: 1,
    analysis: {
      analyzer: {
        support_text_analyzer: {
          type: 'standard',
          stopwords: '_english_'
        }
      }
    }
  }
};

