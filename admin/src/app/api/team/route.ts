import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt.utils';
import { getAllUsers, createUser, getUserByEmail, getDefaultPermissions, getUserById } from '@/lib/user.storage';
import { UserRole } from '@/types/auth';
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['admin', 'employee']),
  permissions: z.object({
    canViewPayments: z.boolean().optional(),
    canViewSubscriptions: z.boolean().optional(),
    canManageShops: z.boolean().optional(),
    canManageTeam: z.boolean().optional(),
    canViewDocs: z.boolean().optional(),
  }).optional(),
});

const TEAM_ADMIN_DOMAINS = (
  process.env.TEAM_ADMIN_DOMAINS ||
  process.env.ADMIN_EMAIL_DOMAINS ||
  'digitalcoo.com'
)
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

function isTeamAdminEmail(email?: string): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return TEAM_ADMIN_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`));
}

async function hasManageTeamAccess(session: {
  userId: string;
  email: string;
  role?: string;
  permissions?: { canManageTeam?: boolean };
}) {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  if (
    session.role === 'super_admin' ||
    session.role === 'admin' ||
    isTeamAdminEmail(session.email) ||
    Boolean(session.permissions?.canManageTeam)
  ) {
    return true;
  }

  const currentUser = (await getUserById(session.userId)) ?? (await getUserByEmail(session.email));
  if (!currentUser || !currentUser.isActive) {
    return false;
  }

  return (
    currentUser.role === 'super_admin' ||
    currentUser.role === 'admin' ||
    isTeamAdminEmail(currentUser.email) ||
    Boolean(currentUser.permissions?.canManageTeam)
  );
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = verifyToken(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    if (!(await hasManageTeamAccess(session))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const users = await getAllUsers();
    return NextResponse.json({ users });
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
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const session = verifyToken(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    if (!(await hasManageTeamAccess(session))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { email, name, role, permissions } = createUserSchema.parse(body);

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

    // Employees cannot have payment/subscription permissions
    if (role === 'employee') {
      finalPermissions.canViewPayments = false;
      finalPermissions.canViewSubscriptions = false;
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

