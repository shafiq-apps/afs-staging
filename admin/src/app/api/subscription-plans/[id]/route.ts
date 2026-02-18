import { NextRequest, NextResponse } from 'next/server';
import { getESClient } from '@/lib/elasticsearch';
import { SUBSCRIPTION_PLANS_INDEX_NAME } from '@/lib/es.constants';
import { CreateSubscriptionPlanInput } from '../route';
import { authenticatedGraphQLRequest } from '@/lib/app-server-graphql';
import { requirePermission } from '@/lib/api-auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface SubscriptionPlanQueryResult {
  subscriptionPlan: {
    id: string;
    handle: string;
    name: string;
    description?: string;
    productLimit: number;
    interval?: 'EVERY_30_DAYS' | 'ANNUAL';
    test?: boolean;
    createdAt: string;
    updatedAt?: string;
    price: {
      amount: number;
      currencyCode: string;
    };
  } | null;
}

interface DeleteSubscriptionPlanMutationResult {
  deleteSubscriptionPlan: boolean;
}

interface ResolvedPlanDocument {
  documentId: string;
  source: Record<string, unknown>;
}

interface ErrorWithMeta {
  message?: string;
  meta?: {
    statusCode?: number;
  };
}

const SUBSCRIPTION_PLAN_FIELDS = `
  id
  handle
  name
  description
  productLimit
  interval
  test
  createdAt
  updatedAt
  price {
    amount
    currencyCode
  }
`;

function getErrorStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  return (error as ErrorWithMeta).meta?.statusCode;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error && typeof error === 'object' && typeof (error as ErrorWithMeta).message === 'string') {
    return (error as ErrorWithMeta).message as string;
  }
  return fallback;
}

async function resolveSubscriptionPlanDocument(
  esClient: ReturnType<typeof getESClient>,
  id: string
): Promise<ResolvedPlanDocument | null> {
  try {
    const byDocumentId = await esClient.get({
      index: SUBSCRIPTION_PLANS_INDEX_NAME,
      id,
    });

    if (byDocumentId.found && byDocumentId._source) {
      return {
        documentId: byDocumentId._id,
        source: byDocumentId._source as Record<string, unknown>,
      };
    }
  } catch (error: unknown) {
    if (getErrorStatusCode(error) !== 404) {
      throw error;
    }
  }

  const bySourceId = await esClient.search({
    index: SUBSCRIPTION_PLANS_INDEX_NAME,
    body: {
      size: 1,
      query: {
        bool: {
          should: [
            { term: { 'id.keyword': id } },
            { term: { id } },
            { match_phrase: { id } },
          ],
          minimum_should_match: 1,
        },
      },
    },
  });

  const hit = bySourceId.hits?.hits?.[0];
  if (!hit || !hit._source) {
    return null;
  }

  return {
    documentId: hit._id as string,
    source: hit._source as Record<string, unknown>,
  };
}

// GET - Get a single subscription plan by ID
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const authResult = await requirePermission(request, 'canViewSubscriptions');
    if (authResult instanceof Response) {
      return authResult;
    }

    const { id } = await params;

    // Primary source: app GraphQL subscriptionPlan query.
    try {
      const gqlQuery = `
        query GetSubscriptionPlan($id: ID!) {
          subscriptionPlan(id: $id) {
            ${SUBSCRIPTION_PLAN_FIELDS}
          }
        }
      `;

      const gqlResponse = await authenticatedGraphQLRequest<SubscriptionPlanQueryResult>(gqlQuery, { id });
      if (gqlResponse.data?.subscriptionPlan) {
        return NextResponse.json({
          success: true,
          source: 'graphql',
          plan: gqlResponse.data.subscriptionPlan,
        });
      }
    } catch (gqlError) {
      console.warn('[subscription-plans/:id][GET] GraphQL failed, falling back to ES:', gqlError);
    }

    const esClient = getESClient();
    const resolvedPlan = await resolveSubscriptionPlanDocument(esClient, id);
    if (!resolvedPlan) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subscription plan not found',
        },
        { status: 404 }
      );
    }

    const plan = {
      ...resolvedPlan.source,
      id: resolvedPlan.source.id || resolvedPlan.documentId,
    };

    return NextResponse.json({
      success: true,
      source: 'es',
      plan,
    });
  } catch (error: unknown) {
    if (getErrorStatusCode(error) === 404) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subscription plan not found',
        },
        { status: 404 }
      );
    }

    console.error('Error fetching subscription plan:', error);
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, 'Failed to fetch subscription plan'),
      },
      { status: 500 }
    );
  }
}

// PATCH - Update a subscription plan
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const authResult = await requirePermission(request, 'canViewSubscriptions');
    if (authResult instanceof Response) {
      return authResult;
    }

    const { id } = await params;
    const esClient = getESClient();
    const rawUpdates: unknown = await request.json();
    if (!rawUpdates || typeof rawUpdates !== 'object') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request body',
        },
        { status: 400 }
      );
    }

    const updates = rawUpdates as Record<string, unknown>;
    const safeUpdates: Partial<CreateSubscriptionPlanInput> = {};

    if (typeof updates.handle === 'string') {
      safeUpdates.handle = updates.handle;
    }
    if (typeof updates.name === 'string') {
      safeUpdates.name = updates.name;
    }
    if (typeof updates.description === 'string') {
      safeUpdates.description = updates.description;
    }
    if (typeof updates.productLimit === 'number') {
      safeUpdates.productLimit = updates.productLimit;
    }
    if (updates.interval === 'EVERY_30_DAYS' || updates.interval === 'ANNUAL') {
      safeUpdates.interval = updates.interval;
    }
    if (typeof updates.test === 'boolean') {
      safeUpdates.test = updates.test;
    }
    if (updates.price && typeof updates.price === 'object') {
      const price = updates.price as Record<string, unknown>;
      if (typeof price.amount === 'number' && typeof price.currencyCode === 'string') {
        safeUpdates.price = {
          amount: price.amount,
          currencyCode: price.currencyCode,
        };
      }
    }

    const existing = await resolveSubscriptionPlanDocument(esClient, id);
    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subscription plan not found',
        },
        { status: 404 }
      );
    }

    const existingSource = existing.source;
    const existingBusinessId =
      typeof existingSource.id === 'string' && existingSource.id.length > 0
        ? existingSource.id
        : existing.documentId;

    // If handle is being updated, check if it conflicts with another plan
    if (safeUpdates.handle && safeUpdates.handle !== existingSource.handle) {
      const conflictCheck = await esClient.search({
        index: SUBSCRIPTION_PLANS_INDEX_NAME,
        body: {
          size: 5,
          query: {
            bool: {
              should: [
                {
                  term: {
                    'handle.keyword': safeUpdates.handle,
                  },
                },
                {
                  term: {
                    handle: safeUpdates.handle,
                  },
                },
                {
                  match_phrase: {
                    handle: safeUpdates.handle,
                  },
                },
              ],
              minimum_should_match: 1,
            },
          },
        },
      });

      const conflictingPlan = conflictCheck.hits.hits.find((hit) => {
        const source = (hit._source as Record<string, unknown> | undefined) || undefined;
        const hitBusinessId =
          source && typeof source.id === 'string' && source.id.length > 0
            ? source.id
            : hit._id;
        return hit._id !== existing.documentId && hitBusinessId !== existingBusinessId;
      });

      if (conflictingPlan) {
        return NextResponse.json(
          {
            success: false,
            error: `Plan with handle "${safeUpdates.handle}" already exists`,
          },
          { status: 409 }
        );
      }
    }

    const now = new Date().toISOString();
    const updatedPlan = {
      ...existingSource,
      ...safeUpdates,
      id: existingBusinessId,
      updatedAt: now,
    };

    await esClient.index({
      index: SUBSCRIPTION_PLANS_INDEX_NAME,
      id: existing.documentId,
      document: updatedPlan,
      refresh: true,
    });

    return NextResponse.json({
      success: true,
      plan: {
        ...updatedPlan,
        id: existingBusinessId,
      },
    });
  } catch (error: unknown) {
    if (getErrorStatusCode(error) === 404) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subscription plan not found',
        },
        { status: 404 }
      );
    }

    console.error('Error updating subscription plan:', error);
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, 'Failed to update subscription plan'),
      },
      { status: 500 }
    );
  }
}

// DELETE - Delete a subscription plan
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const authResult = await requirePermission(request, 'canViewSubscriptions');
    if (authResult instanceof Response) {
      return authResult;
    }

    const { id } = await params;

    // Primary source: app GraphQL deleteSubscriptionPlan mutation.
    try {
      const gqlMutation = `
        mutation DeleteSubscriptionPlan($id: String!) {
          deleteSubscriptionPlan(id: $id)
        }
      `;

      const gqlResponse = await authenticatedGraphQLRequest<DeleteSubscriptionPlanMutationResult>(gqlMutation, { id });
      if (typeof gqlResponse.data?.deleteSubscriptionPlan === 'boolean') {
        if (gqlResponse.data.deleteSubscriptionPlan) {
          return NextResponse.json({
            success: true,
            source: 'graphql',
            message: 'Subscription plan deleted successfully',
          });
        }
        // If GraphQL reports false, continue with ES fallback lookup by business id.
      }
    } catch (gqlError) {
      console.warn('[subscription-plans/:id][DELETE] GraphQL failed, falling back to ES:', gqlError);
    }

    const esClient = getESClient();

    const existing = await resolveSubscriptionPlanDocument(esClient, id);
    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subscription plan not found',
        },
        { status: 404 }
      );
    }

    await esClient.delete({
      index: SUBSCRIPTION_PLANS_INDEX_NAME,
      id: existing.documentId,
      refresh: true,
    });

    return NextResponse.json({
      success: true,
      source: 'es',
      message: 'Subscription plan deleted successfully',
    });
  } catch (error: unknown) {
    if (getErrorStatusCode(error) === 404) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subscription plan not found',
        },
        { status: 404 }
      );
    }

    console.error('Error deleting subscription plan:', error);
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, 'Failed to delete subscription plan'),
      },
      { status: 500 }
    );
  }
}
