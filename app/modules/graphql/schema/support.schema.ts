/**
 * Support Tickets GraphQL Schema
 * Defines GraphQL types and operations for support ticket management
 */

export const supportSchema = `
  type SupportTicket {
    id: String!
    shop: String!
    name: String!
    email: String!
    subject: String!
    priority: String!
    message: String!
    status: String!
    createdAt: String!
    updatedAt: String
    resolvedAt: String
    assignedTo: String
    notes: String
  }

  type SupportTicketConnection {
    tickets: [SupportTicket!]!
    total: Int!
    page: Int!
    pageSize: Int!
  }

  input CreateSupportTicketInput {
    shop: String!
    name: String!
    email: String!
    subject: String!
    priority: String!
    message: String!
  }

  input UpdateSupportTicketInput {
    id: String!
    status: String
    assignedTo: String
    notes: String
  }

  type Query {
    supportTicket(id: String!): SupportTicket
    supportTickets(
      shop: String
      status: String
      priority: String
      page: Int
      pageSize: Int
    ): SupportTicketConnection!
  }

  type Mutation {
    createSupportTicket(input: CreateSupportTicketInput!): SupportTicket!
    updateSupportTicket(input: UpdateSupportTicketInput!): SupportTicket!
    deleteSupportTicket(id: String!): Boolean!
  }
`;

