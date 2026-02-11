import { NextRequest, NextResponse } from 'next/server';
import { getESClient } from '@/lib/elasticsearch';
import { LEGACY_SHOPS_INDEX_NAME, SHOPS_INDEX_NAME } from '@/lib/es.constants';

export async function GET(request: NextRequest) {
  try {
    const esClient = getESClient();
    
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    const response = await esClient.search({
      index: SHOPS_INDEX_NAME,
      body: {
        query: { match_all: {} },
        size: limit,
        from: offset,
        sort: [
          { lastAccessed: { order: 'desc', missing: '_last' } },
          { installedAt: { order: 'desc', missing: '_last' } },
        ],
      },
    });

    const shops = response.hits.hits.map((hit: any) => ({
      ...hit._source,
      shop: hit._source.shop || hit._id,
    }));

    // Enrich list with legacy shop status for admin management.
    if (shops.length > 0) {
      try {
        const legacyLookup = await esClient.mget({
          index: LEGACY_SHOPS_INDEX_NAME,
          docs: shops.map((shop: any) => ({ _id: shop.shop })),
        });

        const legacyByShop = new Map<string, any>();
        for (const doc of legacyLookup.docs || []) {
          if ((doc as any).found && (doc as any)._source) {
            legacyByShop.set((doc as any)._id, (doc as any)._source);
          }
        }

        for (const shop of shops as any[]) {
          const legacy = legacyByShop.get(shop.shop) || null;
          shop.legacyShop = legacy;
          shop.isLegacyShop = Boolean(legacy);
        }
      } catch (legacyError) {
        for (const shop of shops as any[]) {
          shop.legacyShop = null;
          shop.isLegacyShop = false;
        }
      }
    }

    return NextResponse.json({
      success: true,
      shops,
      total: response.hits.total,
    });
  } catch (error: any) {
    console.error('Error fetching shops:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch shops',
      },
      { status: 500 }
    );
  }
}

