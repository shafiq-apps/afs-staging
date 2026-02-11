import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt.utils';
import { getUserById, getUserByEmail, getOrCreateUserByEmail, getDefaultPermissions } from '@/lib/user.storage';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const session = verifyToken(token);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    let user = await getUserById(session.userId);

    // In development/fallback mode the user ID in token can become stale.
    if (!user && session.email) {
      user = await getUserByEmail(session.email);
    }

    // Final fallback: recreate by email so existing login session continues to work.
    if (!user && session.email) {
      user = await getOrCreateUserByEmail(session.email);
    }

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: 'User not found or inactive' },
        { status: 404 }
      );
    }

    // Ensure permissions are set (fallback to defaults if missing)
    if (!user.permissions) {
      user.permissions = getDefaultPermissions(user.role);
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions,
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

