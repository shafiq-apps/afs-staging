import { NextRequest, NextResponse } from 'next/server';
import { authenticatedGraphQLRequest } from '@/lib/app-server-graphql';
import { requirePermission } from '@/lib/api-auth';

interface SyncSubscriptionRequest {
  shop: string;
  shopifySubscriptionId: string;
}

interface SyncSubscriptionMutationResult {
  updateSubscriptionStatus: {
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
  } | null;
}

const SYNC_SUBSCRIPTION_MUTATION = `
  mutation SyncSubscriptionStatus($id: String!) {
    updateSubscriptionStatus(id: $id) {
      id
      shopifySubscriptionId
      name
      status
      confirmationUrl
      test
      lineItems {
        id
        pricingDetails
      }
      createdAt
      updatedAt
    }
  }
`;

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'canViewSubscriptions');
    if (authResult instanceof Response) {
      return authResult;
    }

    const body = (await request.json()) as SyncSubscriptionRequest;
    const shop = body?.shop?.trim();
    const shopifySubscriptionId = body?.shopifySubscriptionId?.trim();

    if (!shop || !shopifySubscriptionId) {
      return NextResponse.json(
        {
          success: false,
          error: 'shop and shopifySubscriptionId are required',
        },
        { status: 400 }
      );
    }

    const gqlResponse = await authenticatedGraphQLRequest<SyncSubscriptionMutationResult>(
      SYNC_SUBSCRIPTION_MUTATION,
      { id: shopifySubscriptionId },
      { shop }
    );

    if (!gqlResponse.data?.updateSubscriptionStatus) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to sync subscription status',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      subscription: {
        ...gqlResponse.data.updateSubscriptionStatus,
        shop,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to sync subscription status';
    console.error('Error syncing subscription status:', error);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
