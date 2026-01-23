import { NextRequest, NextResponse } from 'next/server';
import { getESClient } from '@/lib/elasticsearch';
import { SUBSCRIPTION_PLANS_INDEX_NAME } from '@/lib/es.constants';
import { CreateSubscriptionPlanInput } from '../route';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Get a single subscription plan by ID
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const esClient = getESClient();

    const response = await esClient.get({
      index: SUBSCRIPTION_PLANS_INDEX_NAME,
      id: id,
    });

    if (!response.found) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subscription plan not found',
        },
        { status: 404 }
      );
    }

    const plan = {
      ...(response._source as any),
      id: response._id,
    };

    return NextResponse.json({
      success: true,
      plan,
    });
  } catch (error: any) {
    if (error.meta?.statusCode === 404) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subscription plan not found',
        },
        { status: 404 }
      );
    }

    console.error('Error fetching subscription plan:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch subscription plan',
      },
      { status: 500 }
    );
  }
}

// PATCH - Update a subscription plan
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const esClient = getESClient();
    const updates: Partial<CreateSubscriptionPlanInput> = await request.json();

    // Check if plan exists
    const existing = await esClient.get({
      index: SUBSCRIPTION_PLANS_INDEX_NAME,
      id: id,
    });

    if (!existing.found) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subscription plan not found',
        },
        { status: 404 }
      );
    }

    const existingSource = existing._source as any;

    // If handle is being updated, check if it conflicts with another plan
    if (updates.handle && updates.handle !== existingSource.handle) {
      const conflictCheck = await esClient.search({
        index: SUBSCRIPTION_PLANS_INDEX_NAME,
        body: {
          query: {
            term: {
              'handle.keyword': updates.handle,
            },
          },
        },
      });

      if (conflictCheck.hits.hits.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Plan with handle "${updates.handle}" already exists`,
          },
          { status: 409 }
        );
      }
    }

    const now = new Date().toISOString();
    const updatedPlan = {
      ...existingSource,
      ...updates,
      updatedAt: now,
    };

    await esClient.index({
      index: SUBSCRIPTION_PLANS_INDEX_NAME,
      id: id,
      document: updatedPlan,
      refresh: true,
    });

    return NextResponse.json({
      success: true,
      plan: {
        ...updatedPlan,
        id: id,
      },
    });
  } catch (error: any) {
    if (error.meta?.statusCode === 404) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subscription plan not found',
        },
        { status: 404 }
      );
    }

    console.error('Error updating subscription plan:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to update subscription plan',
      },
      { status: 500 }
    );
  }
}

// DELETE - Delete a subscription plan
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const esClient = getESClient();

    // Check if plan exists
    const existing = await esClient.get({
      index: SUBSCRIPTION_PLANS_INDEX_NAME,
      id: id,
    });

    if (!existing.found) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subscription plan not found',
        },
        { status: 404 }
      );
    }

    await esClient.delete({
      index: SUBSCRIPTION_PLANS_INDEX_NAME,
      id: id,
      refresh: true,
    });

    return NextResponse.json({
      success: true,
      message: 'Subscription plan deleted successfully',
    });
  } catch (error: any) {
    if (error.meta?.statusCode === 404) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subscription plan not found',
        },
        { status: 404 }
      );
    }

    console.error('Error deleting subscription plan:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to delete subscription plan',
      },
      { status: 500 }
    );
  }
}
