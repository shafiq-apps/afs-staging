import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user } = authResult;

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions,
        lastActiveAt: user.lastActiveAt,
      },
    });
  } catch (error) {
    console.error('Error getting user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

