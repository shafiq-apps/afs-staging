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

interface RouteParams {
  params: Promise<{ shop: string }>;
}

interface LegacyShopQueryResult {
  legacyShops: LegacyShop | null;
}

interface UpsertLegacyShopMutationResult {
  createOrUpdateLegacyShop: LegacyShop | null;
}

const LEGACY_SHOP_QUERY = `
  query GetLegacyShop($where: ShopFilterInput) {
    legacyShops(where: $where) {
      shop
      isUpgradeAllowed
      hasUpgradeRequest
      status
      statusMessage
    }
  }
`;

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

const DELETE_LEGACY_SHOP_MUTATION = `
  mutation DeleteLegacyShop($domain: String!) {
    deleteLegacyShop(domain: $domain)
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { shop } = await params;
    const shopDomain = decodeURIComponent(shop);

    try {
      const gqlResponse = await authenticatedGraphQLRequest<LegacyShopQueryResult>(
        LEGACY_SHOP_QUERY,
        {
          where: { shop: shopDomain },
        }
      );

      if (gqlResponse.data?.legacyShops) {
        return NextResponse.json({
          success: true,
          source: 'graphql',
          legacyShop: gqlResponse.data.legacyShops,
        });
      }
    } catch (gqlError) {
      console.warn('[legacy-shops/:shop][GET] GraphQL failed, falling back to ES:', gqlError);
    }

    const esClient = getESClient();
    const response = await esClient.get({
      index: LEGACY_SHOPS_INDEX_NAME,
      id: shopDomain,
    });

    if (!response.found) {
      return NextResponse.json(
        {
          success: false,
          error: 'Legacy shop not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      source: 'es',
      legacyShop: {
        ...(response._source as LegacyShop),
        shop: shopDomain,
      },
    });
  } catch (error: unknown) {
    const isNotFound =
      typeof error === 'object' &&
      error !== null &&
      'meta' in error &&
      typeof (error as { meta?: { statusCode?: number } }).meta?.statusCode === 'number' &&
      (error as { meta?: { statusCode?: number } }).meta?.statusCode === 404;

    if (isNotFound) {
      return NextResponse.json(
        {
          success: false,
          error: 'Legacy shop not found',
        },
        { status: 404 }
      );
    }

    console.error('Error fetching legacy shop:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch legacy shop',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { shop } = await params;
    const shopDomain = decodeURIComponent(shop);
    const body = (await request.json()) as Partial<LegacyShop>;

    const input = {
      shop: shopDomain,
      isUpgradeAllowed: body.isUpgradeAllowed,
      hasUpgradeRequest: body.hasUpgradeRequest,
      status: normalizeStatus(body.status),
      statusMessage: body.statusMessage,
    };

    try {
      const gqlResponse = await authenticatedGraphQLRequest<UpsertLegacyShopMutationResult>(
        UPSERT_LEGACY_SHOP_MUTATION,
        { input, shop }
      );

      if (gqlResponse.data?.createOrUpdateLegacyShop) {
        return NextResponse.json({
          success: true,
          source: 'graphql',
          legacyShop: gqlResponse.data.createOrUpdateLegacyShop,
        });
      }
    } catch (gqlError) {
      console.warn('[legacy-shops/:shop][PATCH] GraphQL failed, falling back to ES:', gqlError);
    }

    const esClient = getESClient();
    await esClient.update({
      index: LEGACY_SHOPS_INDEX_NAME,
      id: shopDomain,
      doc: input,
      doc_as_upsert: true,
      refresh: true,
    });

    const updated = await esClient.get({
      index: LEGACY_SHOPS_INDEX_NAME,
      id: shopDomain,
    });

    return NextResponse.json({
      success: true,
      source: 'es',
      legacyShop: {
        ...(updated._source as LegacyShop),
        shop: shopDomain,
      },
    });
  } catch (error: unknown) {
    console.error('Error updating legacy shop:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update legacy shop',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { shop } = await params;
    const shopDomain = decodeURIComponent(shop);

    const input = {
      shop: shopDomain,
      domain: shopDomain
    };

    try {
      const gqlResponse = await authenticatedGraphQLRequest<Boolean>(
        DELETE_LEGACY_SHOP_MUTATION,
        { domain: shopDomain, shop }
      );

      console.log("gqlResponse.data", gqlResponse.data);

      if (gqlResponse.data) {
        return NextResponse.json({
          success: true,
          source: 'graphql',
          legacyShop: gqlResponse.data,
        });
      }
    } catch (gqlError) {
      console.warn('[legacy-shops/:shop][DELETE] GraphQL failed, falling back to ES:', gqlError);
    }

    const esClient = getESClient();
    const response = await esClient.delete({
      index: LEGACY_SHOPS_INDEX_NAME,
      id: shopDomain,
      refresh: true,
    });

    return NextResponse.json({
      success: true,
      source: 'es',
      legacyShop: response._id,
    });
  } catch (error: unknown) {
    console.error('Error updating legacy shop:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update legacy shop',
      },
      { status: 500 }
    );
  }
}
