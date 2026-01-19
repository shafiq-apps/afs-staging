/**
 * Support Tickets GraphQL Resolvers
 * Handles CRUD operations for support tickets using Elasticsearch
 */

import { GraphQLContext } from '../graphql.type';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('support-resolvers');
const SUPPORT_INDEX = 'support_tickets';

interface SupportTicket {
  id: string;
  shop: string;
  name: string;
  email: string;
  subject: string;
  priority: string;
  message: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string;
  assignedTo?: string;
  notes?: string;
}

interface CreateSupportTicketInput {
  shop: string;
  name: string;
  email: string;
  subject: string;
  priority: string;
  message: string;
}

interface UpdateSupportTicketInput {
  id: string;
  status?: string;
  assignedTo?: string;
  notes?: string;
}

function getESClient(context: GraphQLContext): any {
  const esClient = (context.req as any).esClient;
  if (!esClient) {
    logger.error('ES client not found in context.req', {
      reqKeys: Object.keys(context.req || {}),
      hasReq: !!context.req,
    });
    throw new Error('ES client not available in context. Make sure it is injected in bootstrap.');
  }
  return esClient;
}

export const supportResolvers = {
  Query: {
    async supportTicket(_: any, { id }: { id: string }, context: GraphQLContext) {
      try {
        const esClient = getESClient(context);
        const response = await esClient.get({
          index: SUPPORT_INDEX,
          id,
        });

        if (response.found && response._source) {
          return response._source;
        }
        
        return null;
      } catch (error: any) {
        if (error.statusCode === 404) {
          return null;
        }
        logger.error('Error fetching support ticket:', error);
        throw new Error('Failed to fetch support ticket');
      }
    },

    async supportTickets(
      _: any,
      {
        shop,
        status,
        priority,
        page = 1,
        pageSize = 20,
      }: {
        shop?: string;
        status?: string;
        priority?: string;
        page?: number;
        pageSize?: number;
      },
      context: GraphQLContext
    ) {
      try {
        const esClient = getESClient(context);
        
        const mustClauses: any[] = [];
        
        if (shop) {
          mustClauses.push({ term: { 'shop.keyword': shop } });
        }
        
        if (status) {
          mustClauses.push({ term: { 'status.keyword': status } });
        }
        
        if (priority) {
          mustClauses.push({ term: { 'priority.keyword': priority } });
        }

        const query = mustClauses.length > 0
          ? { bool: { must: mustClauses } }
          : { match_all: {} };

        const from = (page - 1) * pageSize;
        
        const result = await esClient.search({
          index: SUPPORT_INDEX,
          body: {
            query,
            from,
            size: pageSize,
            sort: [{ createdAt: { order: 'desc' } }],
          },
        });

        const hits = result.hits?.hits?.map((hit: any) => hit._source) || [];
        const total = result.hits?.total?.value || result.hits?.total || 0;

        return {
          tickets: hits,
          total,
          page,
          pageSize,
        };
      } catch (error: any) {
        logger.error('Error fetching support tickets:', error);
        return {
          tickets: [],
          total: 0,
          page,
          pageSize,
        };
      }
    },
  },

  Mutation: {
    async createSupportTicket(_: any, { input }: { input: CreateSupportTicketInput }, context: GraphQLContext) {
      try {
        const esClient = getESClient(context);
        
        const ticket: SupportTicket = {
          id: `ticket-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ...input,
          status: 'open',
          createdAt: new Date().toISOString(),
        };

        await esClient.index({
          index: SUPPORT_INDEX,
          id: ticket.id,
          body: ticket,
          refresh: 'true',
        });
        
        logger.info('Support ticket created', { id: ticket.id, shop: ticket.shop });
        return ticket;
      } catch (error: any) {
        logger.error('Error creating support ticket:', error);
        throw new Error('Failed to create support ticket');
      }
    },

    async updateSupportTicket(_: any, { input }: { input: UpdateSupportTicketInput }, context: GraphQLContext) {
      try {
        const esClient = getESClient(context);
        
        const getResponse = await esClient.get({
          index: SUPPORT_INDEX,
          id: input.id,
        });

        if (!getResponse.found) {
          throw new Error('Support ticket not found');
        }

        const updates: any = {
          updatedAt: new Date().toISOString(),
        };

        if (input.status) {
          updates.status = input.status;
          if (input.status === 'resolved' || input.status === 'closed') {
            updates.resolvedAt = new Date().toISOString();
          }
        }

        if (input.assignedTo !== undefined) {
          updates.assignedTo = input.assignedTo;
        }

        if (input.notes !== undefined) {
          updates.notes = input.notes;
        }

        await esClient.update({
          index: SUPPORT_INDEX,
          id: input.id,
          body: {
            doc: updates,
          },
          refresh: 'true',
        });
        
        const updatedResponse = await esClient.get({
          index: SUPPORT_INDEX,
          id: input.id,
        });

        logger.info('Support ticket updated', { id: input.id });
        return updatedResponse._source;
      } catch (error: any) {
        logger.error('Error updating support ticket:', error);
        throw new Error('Failed to update support ticket');
      }
    },

    async deleteSupportTicket(_: any, { id }: { id: string }, context: GraphQLContext) {
      try {
        const esClient = getESClient(context);
        await esClient.delete({
          index: SUPPORT_INDEX,
          id,
          refresh: 'true',
        });
        logger.info('Support ticket deleted', { id });
        return true;
      } catch (error: any) {
        logger.error('Error deleting support ticket:', error);
        return false;
      }
    },
  },
};

