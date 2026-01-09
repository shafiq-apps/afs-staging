/**
 * Search Configuration GraphQL Schema
 * Defines GraphQL types and operations for search field configuration
 * 
 * Index Configuration:
 * @index app_search
 */

export const searchSchema = `
  type SearchField {
    field: String!
    weight: Float!
  }

  type SearchConfig {
    id: String!
    shop: String!
    fields: [SearchField!]!
    updatedAt: String
    createdAt: String!
  }

  input SearchFieldInput {
    field: String!
    weight: Float!
  }

  input SearchConfigInput {
    fields: [SearchFieldInput!]!
  }

  type Query {
    searchConfig(shop: String!): SearchConfig
  }

  type Mutation {
    updateSearchConfig(shop: String!, input: SearchConfigInput!): SearchConfig!
  }
`;

