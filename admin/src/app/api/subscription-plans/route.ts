import { NextRequest, NextResponse } from 'next/server';
import { getESClient } from '@/lib/elasticsearch';
import { SUBSCRIPTION_PLANS_INDEX_NAME } from '@/lib/es.constants';
import { v4 as uuidv4 } from 'uuid';
import { authenticatedGraphQLRequest } from '@/lib/app-server-graphql';

export interface SubscriptionPlan {
  id: string;
  handle: string;
  name: string;
  description?: string;
  productLimit: number;
  price: {
    amount: number;
    currencyCode: string;
  };
  interval?: 'EVERY_30_DAYS' | 'ANNUAL';
  test?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateSubscriptionPlanInput {
  handle: string;
  name: string;
  description?: string;
  productLimit: number;
  price: {
    amount: number;
    currencyCode: string;
  };
  interval?: 'EVERY_30_DAYS' | 'ANNUAL';
  test?: boolean;
}

interface SubscriptionPlansQueryResult {
  subscriptionPlans: SubscriptionPlan[];
}

interface CreateSubscriptionPlanMutationResult {
  createSubscriptionPlan: SubscriptionPlan;
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

// GET - List all subscription plans
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.max(1, parseInt(searchParams.get('limit') || '100', 10));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

    // Primary source: app GraphQL module (subscriptionPlans query)
    try {
      const gqlQuery = `
        query GetSubscriptionPlans {
          subscriptionPlans {
            ${SUBSCRIPTION_PLAN_FIELDS}
          }
        }
      `;

      const response = await authenticatedGraphQLRequest<SubscriptionPlansQueryResult>(gqlQuery);
      const plans = Array.isArray(response.data?.subscriptionPlans)
        ? response.data.subscriptionPlans
        : [];

      const pagedPlans = plans.slice(offset, offset + limit);

      return NextResponse.json({
        success: true,
        source: 'graphql',
        plans: pagedPlans,
        total: plans.length,
      });
    } catch (gqlError) {
      // Fallback to direct ES read for resilience.
      console.warn('[subscription-plans][GET] GraphQL failed, falling back to ES:', gqlError);
    }

    const esClient = getESClient();
    const esResponse = await esClient.search({
      index: SUBSCRIPTION_PLANS_INDEX_NAME,
      body: {
        query: { match_all: {} },
        size: limit,
        from: offset,
        sort: [{ createdAt: { order: 'desc', missing: '_last' } }],
      },
    });

    const plans = esResponse.hits.hits.map((hit: any) => ({
      ...hit._source,
      id: hit._source?.id || hit._id,
    }));

    return NextResponse.json({
      success: true,
      source: 'es',
      plans,
      total: typeof esResponse.hits.total === 'number' ? esResponse.hits.total : esResponse.hits.total?.value || 0,
    });
  } catch (error: any) {
    console.error('Error fetching subscription plans:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch subscription plans',
      },
      { status: 500 }
    );
  }
}

// POST - Create a new subscription plan
export async function POST(request: NextRequest) {
  try {
    const body: CreateSubscriptionPlanInput = await request.json();

    // Validate required fields
    if (!body.handle || !body.name || body.productLimit === undefined || !body.price) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: handle, name, productLimit, price',
        },
        { status: 400 }
      );
    }

    // Primary source: app GraphQL module (createSubscriptionPlan mutation)
    try {
      const gqlMutation = `
        mutation CreateSubscriptionPlan($input: CreateSubscriptionPlanInput!) {
          createSubscriptionPlan(input: $input) {
            ${SUBSCRIPTION_PLAN_FIELDS}
          }
        }
      `;

      const response = await authenticatedGraphQLRequest<CreateSubscriptionPlanMutationResult>(
        gqlMutation,
        {
          input: {
            handle: body.handle,
            name: body.name,
            description: body.description || null,
            productLimit: body.productLimit,
            price: {
              amount: body.price.amount,
              currencyCode: body.price.currencyCode,
            },
            interval: body.interval || 'EVERY_30_DAYS',
            test: body.test ?? false,
          },
        }
      );

      if (response.data?.createSubscriptionPlan) {
        return NextResponse.json({
          success: true,
          source: 'graphql',
          plan: response.data.createSubscriptionPlan,
        });
      }
    } catch (gqlError) {
      // Fallback below if GraphQL is unavailable.
      console.warn('[subscription-plans][POST] GraphQL failed, falling back to ES:', gqlError);
    }

    const esClient = getESClient();

    // ES fallback path
    const existingResponse = await esClient.search({
      index: SUBSCRIPTION_PLANS_INDEX_NAME,
      body: {
        query: {
          term: {
            'handle.keyword': body.handle,
          },
        },
      },
    });

    if (existingResponse.hits.hits.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Plan with handle "${body.handle}" already exists`,
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const planId = uuidv4();

    const planDoc: SubscriptionPlan = {
      id: planId,
      handle: body.handle,
      name: body.name,
      description: body.description || '',
      productLimit: body.productLimit,
      price: body.price,
      interval: body.interval || 'EVERY_30_DAYS',
      test: body.test ?? false,
      createdAt: now,
      updatedAt: now,
    };

    await esClient.index({
      index: SUBSCRIPTION_PLANS_INDEX_NAME,
      id: planId,
      document: planDoc,
      refresh: true,
    });

    return NextResponse.json({
      success: true,
      source: 'es',
      plan: planDoc,
    });
  } catch (error: any) {
    console.error('Error creating subscription plan:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to create subscription plan',
      },
      { status: 500 }
    );
  }
}

