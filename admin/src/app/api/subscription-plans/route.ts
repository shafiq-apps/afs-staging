import { NextRequest, NextResponse } from 'next/server';
import { getESClient } from '@/lib/elasticsearch';
import { SUBSCRIPTION_PLANS_INDEX_NAME } from '@/lib/es.constants';
import { v4 as uuidv4 } from 'uuid';

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

// GET - List all subscription plans
export async function GET(request: NextRequest) {
  try {
    const esClient = getESClient();
    
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    const response = await esClient.search({
      index: SUBSCRIPTION_PLANS_INDEX_NAME,
      body: {
        query: { match_all: {} },
        size: limit,
        from: offset,
        sort: [
          { createdAt: { order: 'desc', missing: '_last' } },
        ],
      },
    });

    const plans = response.hits.hits.map((hit: any) => ({
      ...hit._source,
      id: hit._id,
    }));

    return NextResponse.json({
      success: true,
      plans,
      total: response.hits.total,
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
    const esClient = getESClient();
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

    // Check if handle already exists
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

