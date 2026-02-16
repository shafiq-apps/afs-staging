import { NextRequest, NextResponse } from 'next/server';
import { getESClient } from '@/lib/elasticsearch';
import { LEGACY_SHOPS_INDEX_NAME } from '@/lib/es.constants';
import { authenticatedGraphQLRequest } from '@/lib/app-server-graphql';

type LegacyShopStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';

interface LegacyShop {
  shop: string;
  isUpgradeAllowed?: boolean;
  hasUpgradeRequest?: boolean;
  status?: LegacyShopStatus;
  statusMessage?: string;
}

interface UpsertLegacyShopInput {
  shop: string;
  isUpgradeAllowed?: boolean;
  hasUpgradeRequest?: boolean;
  status?: LegacyShopStatus | string;
  statusMessage?: string;
}

interface UpsertLegacyShopMutationResult {
  createOrUpdateLegacyShop: LegacyShop | null;
}

const UPSERT_LEGACY_SHOP_MUTATION = `
  mutation CreateOrUpdateLegacyShop($input: LegacyShopInput!) {
    createOrUpdateLegacyShop(input: $input) {
      shop
      isUpgradeAllowed
      hasUpgradeRequest
      status
      statusMessage
    }
  }
`;

function normalizeStatus(value?: string): LegacyShopStatus | undefined {
  if (!value) return undefined;
  const normalized = value.toUpperCase();
  if (normalized === 'PENDING' || normalized === 'IN_PROGRESS' || normalized === 'COMPLETED' || normalized === 'REJECTED') {
    return normalized;
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  try {
    const esClient = getESClient();

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.max(1, parseInt(searchParams.get('limit') || '100', 10));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));
    const shop = searchParams.get('shop')?.trim();

    const query = shop
      ? {
          bool: {
            should: [
              {
                term: {
                  'shop.keyword': shop,
                },
              },
              {
                match_phrase: {
                  shop,
                },
              },
            ],
            minimum_should_match: 1,
          },
        }
      : { match_all: {} };

    const response = await esClient.search({
      index: LEGACY_SHOPS_INDEX_NAME,
      body: {
        query,
        size: limit,
        from: offset,
        sort: [
          {
            'shop.keyword': {
              order: 'asc',
              unmapped_type: 'keyword',
            },
          },
          {
            _doc: {
              order: 'asc',
            },
          },
        ],
      },
    });

    const legacyShops: LegacyShop[] = response.hits.hits.map((hit) => {
      const source = (hit._source || {}) as LegacyShop;
      return {
        ...source
      };
    });

    return NextResponse.json({
      success: true,
      legacyShops,
      total: typeof response.hits.total === 'number' ? response.hits.total : response.hits.total?.value || 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch legacy shops';
    console.error('Error fetching legacy shops:', error);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as UpsertLegacyShopInput;
    const shop = body?.shop?.trim();

    if (!shop) {
      return NextResponse.json(
        {
          success: false,
          error: 'shop is required',
        },
        { status: 400 }
      );
    }

    const input = {
      shop,
      isUpgradeAllowed: body.isUpgradeAllowed,
      hasUpgradeRequest: body.hasUpgradeRequest,
      status: normalizeStatus(body.status),
      statusMessage: body.statusMessage,
    };

    // Primary source: app GraphQL createOrUpdateLegacyShop mutation.
    try {
      const gqlResponse = await authenticatedGraphQLRequest<UpsertLegacyShopMutationResult>(
        UPSERT_LEGACY_SHOP_MUTATION,
        { input }
      );

      if (gqlResponse.data?.createOrUpdateLegacyShop) {
        return NextResponse.json({
          success: true,
          source: 'graphql',
          legacyShop: gqlResponse.data.createOrUpdateLegacyShop,
        });
      }
    } catch (gqlError) {
      console.warn('[legacy-shops][POST] GraphQL failed, falling back to ES:', gqlError);
    }

    // ES fallback path.
    const esClient = getESClient();
    const doc = {
      shop,
      isUpgradeAllowed: input.isUpgradeAllowed,
      hasUpgradeRequest: input.hasUpgradeRequest,
      status: input.status,
      statusMessage: input.statusMessage,
    };

    await esClient.update({
      index: LEGACY_SHOPS_INDEX_NAME,
      id: shop,
      doc,
      doc_as_upsert: true,
      refresh: true,
    });

    const result = await esClient.get({
      index: LEGACY_SHOPS_INDEX_NAME,
      id: shop,
    });

    return NextResponse.json({
      success: true,
      source: 'es',
      legacyShop: {
        ...(result._source as LegacyShop),
        shop,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create/update legacy shop';
    console.error('Error creating/updating legacy shop:', error);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
