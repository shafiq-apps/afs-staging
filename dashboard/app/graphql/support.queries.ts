/**
 * Support Tickets GraphQL Queries
 * Ready-to-use queries and mutations for support ticket management
 */

export const GET_SUPPORT_TICKET = `
  query GetSupportTicket($id: String!) {
    supportTicket(id: $id) {
      id
      shop
      name
      email
      subject
      priority
      message
      status
      createdAt
      updatedAt
      resolvedAt
      assignedTo
      notes
    }
  }
`;

export const GET_SUPPORT_TICKETS = `
  query GetSupportTickets($shop: String, $status: String, $priority: String, $page: Int, $pageSize: Int) {
    supportTickets(shop: $shop, status: $status, priority: $priority, page: $page, pageSize: $pageSize) {
      tickets {
        id
        shop
        name
        email
        subject
        priority
        status
        createdAt
        updatedAt
        resolvedAt
        assignedTo
      }
      total
      page
      pageSize
    }
  }
`;

export const CREATE_SUPPORT_TICKET = `
  mutation CreateSupportTicket($input: CreateSupportTicketInput!) {
    createSupportTicket(input: $input) {
      id
      shop
      name
      email
      subject
      priority
      message
      status
      createdAt
    }
  }
`;

export const UPDATE_SUPPORT_TICKET = `
  mutation UpdateSupportTicket($input: UpdateSupportTicketInput!) {
    updateSupportTicket(input: $input) {
      id
      shop
      name
      email
      subject
      priority
      message
      status
      createdAt
      updatedAt
      resolvedAt
      assignedTo
      notes
    }
  }
`;

export const DELETE_SUPPORT_TICKET = `
  mutation DeleteSupportTicket($id: String!) {
    deleteSupportTicket(id: $id)
  }
`;

