import { NextRequest, NextResponse } from 'next/server';
import { authenticatedGraphQLRequest } from '@/lib/app-server-graphql';

interface RouteParams {
  params: Promise<{ shop: string }>;
}

/**
 * Reindex shop products via GraphQL mutation
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { shop } = await params;
    const shopDomain = decodeURIComponent(shop);

    const mutation = `
      mutation ReindexProducts($shop: String!) {
        reindexProducts(shop: $shop) {
          success
          message
        }
      }
    `;

    const response = await authenticatedGraphQLRequest<{
      reindexProducts: {
        success: boolean;
        message: string;
      };
    }>(mutation, { shop: shopDomain });

    if (!response.data) {
      throw new Error('No data returned from GraphQL mutation');
    }

    const result = response.data.reindexProducts;

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.message || 'Failed to start reindexing',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message || 'Indexing started successfully',
    });
  } catch (error: any) {
    console.error('Error reindexing shop:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to start reindexing',
      },
      { status: 500 }
    );
  }
}

