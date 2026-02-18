import { NextRequest, NextResponse } from 'next/server';
import { getESClient } from '@/lib/elasticsearch';
import { LEGACY_SHOPS_INDEX_NAME, SHOPS_INDEX_NAME } from '@/lib/es.constants';
import { authenticatedGraphQLRequest } from '@/lib/app-server-graphql';
import { requirePermission } from '@/lib/api-auth';

interface RouteParams {
  params: Promise<{ shop: string }>;
}

interface UpdateShopMutationResult {
  updateShop: {
    shop: string;
    installedAt?: string;
    scopes?: string[];
    lastAccessed?: string;
    updatedAt?: string;
    isDeleted?: string;
    uninstalledAt?: string;
    reinstalledAt?: string;
    reinstalled?: string;
    metadata?: Record<string, unknown>;
    locals?: Record<string, unknown>;
    sessionId?: string;
    state?: string;
    isOnline?: boolean;
    scope?: string;
    expires?: string;
    userId?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    accountOwner?: boolean;
    locale?: string;
    collaborator?: boolean;
    emailVerified?: boolean;
  } | null;
}

const UPDATE_SHOP_MUTATION = `
  mutation UpdateShop($domain: String!, $input: UpdateShopInput!) {
    updateShop(domain: $domain, input: $input) {
      shop
      installedAt
      scopes
      lastAccessed
      updatedAt
      isDeleted
      uninstalledAt
      reinstalledAt
      reinstalled
      metadata
      locals
      sessionId
      state
      isOnline
      scope
      expires
      userId
      firstName
      lastName
      email
      accountOwner
      locale
      collaborator
      emailVerified
    }
  }
`;

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const authResult = await requirePermission(request, 'canManageShops');
    if (authResult instanceof Response) {
      return authResult;
    }

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
    
    const shopData: Record<string, any> = {
      ...shopDataWithoutTokens,
      shop: shopDataWithoutTokens.shop || shopDomain,
    };

    try {
      const legacyResponse = await esClient.get({
        index: LEGACY_SHOPS_INDEX_NAME,
        id: shopDomain,
      });

      if (legacyResponse.found && legacyResponse._source) {
        shopData.legacyShop = {
          ...(legacyResponse._source as any),
          shop: shopDomain,
        };
      } else {
        shopData.legacyShop = null;
      }
    } catch (legacyError: any) {
      if (legacyError?.meta?.statusCode === 404 || legacyError?.statusCode === 404) {
        shopData.legacyShop = null;
      } else {
        console.warn('Unable to fetch legacy shop status:', legacyError?.message || legacyError);
        shopData.legacyShop = null;
      }
    }

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

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const authResult = await requirePermission(request, 'canManageShops');
    if (authResult instanceof Response) {
      return authResult;
    }

    const { shop } = await params;
    const esClient = getESClient();
    const shopDomain = decodeURIComponent(shop);
    const updates = await request.json();

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request body',
        },
        { status: 400 }
      );
    }

    const safeUpdates: Record<string, unknown> = { ...updates };
    delete safeUpdates.accessToken;
    delete safeUpdates.refreshToken;
    delete safeUpdates.shop;

    // Primary source: app GraphQL updateShop mutation.
    try {
      const gqlResponse = await authenticatedGraphQLRequest<UpdateShopMutationResult>(
        UPDATE_SHOP_MUTATION,
        {
          domain: shopDomain,
          input: safeUpdates,
        }
      );

      if (gqlResponse.data?.updateShop) {
        return NextResponse.json({
          success: true,
          source: 'graphql',
          shop: gqlResponse.data.updateShop,
        });
      }
    } catch (gqlError) {
      console.warn('[shops/:shop][PATCH] GraphQL failed, falling back to ES:', gqlError);
    }

    const existing = await esClient.get({
      index: SHOPS_INDEX_NAME,
      id: shopDomain,
    });

    if (!existing.found || !existing._source) {
      return NextResponse.json(
        {
          success: false,
          error: 'Shop not found',
        },
        { status: 404 }
      );
    }

    const existingSource = existing._source as Record<string, unknown>;
    const updatedShop = {
      ...existingSource,
      ...safeUpdates,
      updatedAt: new Date().toISOString(),
    };

    await esClient.index({
      index: SHOPS_INDEX_NAME,
      id: shopDomain,
      document: updatedShop,
      refresh: true,
    });

    const { accessToken, refreshToken, ...safeShop } = updatedShop as Record<string, unknown>;

    return NextResponse.json({
      success: true,
      source: 'es',
      shop: {
        ...safeShop,
        shop: (safeShop.shop as string) || shopDomain,
      },
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

    console.error('Error updating shop:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to update shop',
      },
      { status: 500 }
    );
  }
}

