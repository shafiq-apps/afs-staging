import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt.utils';
import { getUserById, updateUser, deleteUser, getDefaultPermissions } from '@/lib/user.storage';
import { UserRole } from '@/types/auth';
import { z } from 'zod';

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(['admin', 'employee']).optional(),
  permissions: z.object({
    canViewPayments: z.boolean().optional(),
    canViewSubscriptions: z.boolean().optional(),
    canManageShops: z.boolean().optional(),
    canManageTeam: z.boolean().optional(),
    canViewDocs: z.boolean().optional(),
  }).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = verifyToken(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    if (!session.permissions.canManageTeam) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const user = await getUserById(params.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = verifyToken(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    if (!session.permissions.canManageTeam) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const updates = updateUserSchema.parse(body);

    const existingUser = await getUserById(params.id);
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Prevent modifying super admin
    if (existingUser.role === 'super_admin') {
      return NextResponse.json(
        { error: 'Cannot modify super admin' },
        { status: 403 }
      );
    }

    // Merge permissions if role is being updated
    let finalUpdates = { ...updates };
    if (updates.role) {
      const defaultPerms = getDefaultPermissions(updates.role as UserRole);
      finalUpdates.permissions = {
        ...defaultPerms,
        ...(updates.permissions || {}),
      };

      // Employees cannot have payment/subscription permissions
      if (updates.role === 'employee') {
        finalUpdates.permissions.canViewPayments = false;
        finalUpdates.permissions.canViewSubscriptions = false;
      }
    } else if (updates.permissions && existingUser.role === 'employee') {
      // Ensure employees can't get payment/subscription permissions
      finalUpdates.permissions.canViewPayments = false;
      finalUpdates.permissions.canViewSubscriptions = false;
    }

    const updatedUser = await updateUser(params.id, finalUpdates);
    if (!updatedUser) {
      return NextResponse.json(
        { error: 'Failed to update user' },
        { status: 500 }
      );
    }

    return NextResponse.json({ user: updatedUser });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = verifyToken(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    if (!session.permissions.canManageTeam) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const user = await getUserById(params.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Prevent deleting super admin
    if (user.role === 'super_admin') {
      return NextResponse.json(
        { error: 'Cannot delete super admin' },
        { status: 403 }
      );
    }

    // Prevent deleting yourself
    if (user.id === session.userId) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }

    const deleted = await deleteUser(params.id);
    if (!deleted) {
      return NextResponse.json(
        { error: 'Failed to delete user' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

