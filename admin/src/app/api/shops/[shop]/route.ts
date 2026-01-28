import { NextRequest, NextResponse } from 'next/server';
import { getESClient } from '@/lib/elasticsearch';
import { SHOPS_INDEX_NAME } from '@/lib/es.constants';

interface RouteParams {
  params: Promise<{ shop: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { shop } = await params;
    const esClient = getESClient();

    // Decode the shop domain (in case it's URL encoded)
    const shopDomain = decodeURIComponent(shop);

    const response = await esClient.get({
      index: SHOPS_INDEX_NAME,
      id: shopDomain,
    });

    if (!response.found) {
      return NextResponse.json(
        {
          success: false,
          error: 'Shop not found',
        },
        { status: 404 }
      );
    }

    const source = response._source as any;
    const { accessToken, refreshToken, ...shopDataWithoutTokens } = source;
    
    const shopData = {
      ...shopDataWithoutTokens,
      shop: shopDataWithoutTokens.shop || shopDomain,
    };

    return NextResponse.json({
      success: true,
      shop: shopData,
    });
  } catch (error: any) {
    if (error.meta?.statusCode === 404) {
      return NextResponse.json(
        {
          success: false,
          error: 'Shop not found',
        },
        { status: 404 }
      );
    }

    console.error('Error fetching shop:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch shop',
      },
      { status: 500 }
    );
  }
}

