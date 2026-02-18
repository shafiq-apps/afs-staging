import { NextRequest, NextResponse } from 'next/server';
import { deleteUser, getDefaultPermissions, getUserById, updateUser } from '@/lib/user.storage';
import { UserRole } from '@/types/auth';
import { requireTeamManagementAccess } from '@/lib/api-auth';
import { isSuperAdmin } from '@/lib/rbac';
import { z } from 'zod';

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(['admin', 'employee']).optional(),
  permissions: z
    .object({
      canViewSubscriptions: z.boolean().optional(),
      canManageSubscriptionPlans: z.boolean().optional(),
      canManageShops: z.boolean().optional(),
      canViewMonitoring: z.boolean().optional(),
      canManageTeam: z.boolean().optional(),
    })
    .optional(),
  isActive: z.boolean().optional(),
});

function canNonSuperAdminAccessTarget(actorId: string, targetId: string, targetRole: UserRole): boolean {
  if (targetId === actorId) {
    return true;
  }

  return targetRole === 'employee';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const authResult = await requireTeamManagementAccess(request);
    if (authResult instanceof Response) {
      return authResult;
    }

    const user = await getUserById(id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!isSuperAdmin(authResult.user)) {
      const allowed = canNonSuperAdminAccessTarget(authResult.user.id, user.id, user.role);
      if (!allowed || user.role === 'super_admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const authResult = await requireTeamManagementAccess(request);
    if (authResult instanceof Response) {
      return authResult;
    }

    const body = await request.json();
    const updates = updateUserSchema.parse(body);

    const existingUser = await getUserById(id);
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (existingUser.role === 'super_admin') {
      return NextResponse.json({ error: 'Cannot modify super admin' }, { status: 403 });
    }

    const actorIsSuperAdmin = isSuperAdmin(authResult.user);

    if (!actorIsSuperAdmin) {
      const canAccessTarget = canNonSuperAdminAccessTarget(authResult.user.id, existingUser.id, existingUser.role);
      if (!canAccessTarget) {
        return NextResponse.json(
          { error: 'Only super admin can modify admin accounts' },
          { status: 403 }
        );
      }

      if (existingUser.id === authResult.user.id) {
        const hasRestrictedSelfChange =
          updates.role !== undefined ||
          updates.permissions !== undefined ||
          updates.isActive !== undefined;

        if (hasRestrictedSelfChange) {
          return NextResponse.json(
            { error: 'You cannot modify your own role, permissions, or status' },
            { status: 403 }
          );
        }
      }

      if (updates.role && updates.role !== 'employee') {
        return NextResponse.json(
          { error: 'Only super admin can promote users to admin' },
          { status: 403 }
        );
      }

      if (updates.permissions?.canManageTeam) {
        return NextResponse.json(
          { error: 'Only super admin can grant team management access' },
          { status: 403 }
        );
      }
    }

    const finalUpdates = { ...updates };
    const resultingRole = (updates.role || existingUser.role) as UserRole;

    if (updates.role) {
      const defaultPerms = getDefaultPermissions(resultingRole);
      finalUpdates.permissions = {
        ...defaultPerms,
        ...existingUser.permissions,
        ...(updates.permissions || {}),
      };
    } else if (updates.permissions) {
      finalUpdates.permissions = {
        ...existingUser.permissions,
        ...updates.permissions,
      };
    }

    if (resultingRole === 'employee') {
      finalUpdates.permissions = {
        ...(finalUpdates.permissions || existingUser.permissions),
        canViewSubscriptions: false,
        canManageSubscriptionPlans: false,
        canViewMonitoring: false,
        canManageTeam: false,
      };
    }

    const updatedUser = await updateUser(id, finalUpdates as any);
    if (!updatedUser) {
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }

    return NextResponse.json({ user: updatedUser });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }

    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const authResult = await requireTeamManagementAccess(request);
    if (authResult instanceof Response) {
      return authResult;
    }

    const user = await getUserById(id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.role === 'super_admin') {
      return NextResponse.json({ error: 'Cannot delete super admin' }, { status: 403 });
    }

    if (user.id === authResult.user.id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    if (!isSuperAdmin(authResult.user) && user.role !== 'employee') {
      return NextResponse.json(
        { error: 'Only super admin can delete admin accounts' },
        { status: 403 }
      );
    }

    const deleted = await deleteUser(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
