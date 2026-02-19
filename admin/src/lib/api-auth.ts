import { NextRequest, NextResponse } from 'next/server';
import { User } from '@/types/auth';
import { verifyToken } from '@/lib/jwt.utils';
import { getDefaultPermissions, getUserByEmail, getUserById, touchUserActivity } from '@/lib/user.storage';
import { canAccessTeamManagement, hasPermission, type AppPermission } from '@/lib/rbac';

const AUTH_COOKIE_NAME = 'auth_token';

export type ApiAuthResult = { user: User } | NextResponse;

function getErrorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function getAuthTokenFromCookieHeader(cookieHeader?: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookie = cookieHeader
    .split(';')
    .map((segment) => segment.trim())
    .find((segment) => segment.startsWith(`${AUTH_COOKIE_NAME}=`));

  if (!cookie) {
    return null;
  }

  const token = cookie.slice(`${AUTH_COOKIE_NAME}=`.length).trim();
  return token || null;
}

export async function resolveAuthenticatedUserFromToken(token?: string | null): Promise<User | null> {
  if (!token) {
    return null;
  }

  const session = verifyToken(token);
  if (!session) {
    return null;
  }

  let user = await getUserById(session.userId);
  if (!user && session.email) {
    user = await getUserByEmail(session.email);
  }

  if (!user || !user.isActive) {
    return null;
  }

  if (!user.permissions) {
    user.permissions = getDefaultPermissions(user.role);
  }

  const touchedUser = await touchUserActivity({ userId: user.id, email: user.email });
  return touchedUser ?? user;
}

export async function resolveAuthenticatedUserFromRequest(request: NextRequest): Promise<User | null> {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  return resolveAuthenticatedUserFromToken(token);
}

export async function resolveAuthenticatedUserFromCookieHeader(
  cookieHeader?: string | null
): Promise<User | null> {
  const token = getAuthTokenFromCookieHeader(cookieHeader);
  return resolveAuthenticatedUserFromToken(token);
}

export async function requireAuthenticatedUser(request: NextRequest): Promise<ApiAuthResult> {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return getErrorResponse('Not authenticated', 401);
  }

  const session = verifyToken(token);
  if (!session) {
    return getErrorResponse('Invalid token', 401);
  }

  const user = await resolveAuthenticatedUserFromToken(token);
  if (!user) {
    return getErrorResponse('User not found or inactive', 401);
  }

  return { user };
}

export async function requirePermission(
  request: NextRequest,
  permission: AppPermission
): Promise<ApiAuthResult> {
  const authResult = await requireAuthenticatedUser(request);
  if (authResult instanceof Response) {
    return authResult;
  }

  if (!hasPermission(authResult.user, permission)) {
    return getErrorResponse('Forbidden', 403);
  }

  return authResult;
}

export async function requireTeamManagementAccess(request: NextRequest): Promise<ApiAuthResult> {
  const authResult = await requireAuthenticatedUser(request);
  if (authResult instanceof Response) {
    return authResult;
  }

  if (!canAccessTeamManagement(authResult.user)) {
    return getErrorResponse('Forbidden', 403);
  }

  return authResult;
}
