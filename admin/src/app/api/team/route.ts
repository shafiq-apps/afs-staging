import { NextRequest, NextResponse } from 'next/server';
import { createUser, getAllUsers, getDefaultPermissions, getUserByEmail } from '@/lib/user.storage';
import { UserRole } from '@/types/auth';
import { requireTeamManagementAccess } from '@/lib/api-auth';
import { isSuperAdmin } from '@/lib/rbac';
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['admin', 'employee']),
  permissions: z.object({
    canViewSubscriptions: z.boolean().optional(),
    canManageSubscriptionPlans: z.boolean().optional(),
    canManageShops: z.boolean().optional(),
    canViewMonitoring: z.boolean().optional(),
    canManageTeam: z.boolean().optional(),
  }).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireTeamManagementAccess(request);
    if (authResult instanceof Response) {
      return authResult;
    }

    const users = await getAllUsers();
    const visibleUsers = isSuperAdmin(authResult.user)
      ? users
      : users.filter((user) => user.role !== 'super_admin');

    return NextResponse.json({ users: visibleUsers });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireTeamManagementAccess(request);
    if (authResult instanceof Response) {
      return authResult;
    }

    const body = await request.json();
    const { email, name, role, permissions } = createUserSchema.parse(body);

    if (!isSuperAdmin(authResult.user) && role !== 'employee') {
      return NextResponse.json(
        { error: 'Only super admin can create admin users' },
        { status: 403 }
      );
    }

    if (!isSuperAdmin(authResult.user) && permissions?.canManageTeam) {
      return NextResponse.json(
        { error: 'Only super admin can grant team management access' },
        { status: 403 }
      );
    }

    // Check if user already exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Merge permissions
    const defaultPerms = getDefaultPermissions(role as UserRole);
    const finalPermissions = {
      ...defaultPerms,
      ...(permissions || {}),
    };

    // Employees cannot have privileged permissions
    if (role === 'employee') {
      finalPermissions.canViewSubscriptions = false;
      finalPermissions.canManageSubscriptionPlans = false;
      finalPermissions.canViewMonitoring = false;
      finalPermissions.canManageTeam = false;
    }

    const user = await createUser({
      email,
      name,
      role: role as UserRole,
      permissions: finalPermissions,
      isActive: true,
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error in POST /api/team:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

