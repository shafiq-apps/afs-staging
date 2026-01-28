import { NextRequest, NextResponse } from 'next/server';
import { getESClient } from '@/lib/elasticsearch';
import { SHOPS_INDEX_NAME } from '@/lib/es.constants';

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

