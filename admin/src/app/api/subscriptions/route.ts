import { NextRequest, NextResponse } from 'next/server';
import { getESClient } from '@/lib/elasticsearch';
import { SUBSCRIPTIONS_INDEX_NAME } from '@/lib/es.constants';

interface StoredSubscription {
  id: string;
  shopifySubscriptionId: string;
  name: string;
  status: string;
  confirmationUrl?: string | null;
  test?: boolean;
  lineItems?: Array<{
    id: string;
    pricingDetails?: unknown;
  }>;
  createdAt: string;
  updatedAt?: string | null;
}

type SubscriptionRecord = StoredSubscription & {
  shop: string;
};

export async function GET(request: NextRequest) {
  try {
    const esClient = getESClient();

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.max(1, parseInt(searchParams.get('limit') || '100', 10));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));
    const shop = searchParams.get('shop')?.trim();

    const query = shop
      ? {
          term: {
            _id: {
              value: shop,
            },
          },
        }
      : { match_all: {} };

    const response = await esClient.search({
      index: SUBSCRIPTIONS_INDEX_NAME,
      body: {
        query,
        size: limit,
        from: offset,
        sort: [
          { updatedAt: { order: 'desc', missing: '_last' } },
          { createdAt: { order: 'desc', missing: '_last' } },
        ],
      },
    });

    const subscriptions: SubscriptionRecord[] = response.hits.hits.map((hit) => {
      const source = (hit._source || {}) as StoredSubscription;
      return {
        ...source,
        shop: hit._id,
      };
    });

    return NextResponse.json({
      success: true,
      subscriptions,
      total: typeof response.hits.total === 'number' ? response.hits.total : response.hits.total?.value || 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch subscriptions';
    console.error('Error fetching subscriptions:', error);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
