import { User, UserPermissions } from '@/types/auth';

export type AppPermission = keyof UserPermissions;

type AccessUser = Pick<User, 'role' | 'permissions' | 'email'> | null | undefined;

const TEAM_ADMIN_RULES = (
  process.env.ADMIN_ACCESS_EMAILS ||
  process.env.TEAM_ADMIN_DOMAINS ||
  process.env.ADMIN_EMAIL_DOMAINS ||
  'digitalcoo.com'
)
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

function matchesTeamAdminRule(normalizedEmail: string, rule: string): boolean {
  if (!rule) {
    return false;
  }

  // Exact allow-list email entry
  if (rule.includes('@') && !rule.startsWith('*')) {
    return normalizedEmail === rule;
  }

  // Domain forms: *example.com, *@example.com, @example.com, example.com
  let domainRule = rule;
  if (domainRule.startsWith('*@')) {
    domainRule = domainRule.slice(2);
  } else if (domainRule.startsWith('*')) {
    domainRule = domainRule.slice(1);
  } else if (domainRule.startsWith('@')) {
    domainRule = domainRule.slice(1);
  }

  if (domainRule.includes('@')) {
    return false;
  }

  return normalizedEmail.endsWith(`@${domainRule}`);
}

export function isTeamAdminEmail(email?: string): boolean {
  if (!email) {
    return false;
  }

  const normalizedEmail = email.trim().toLowerCase();
  return TEAM_ADMIN_RULES.some((rule) => matchesTeamAdminRule(normalizedEmail, rule));
}

export function isSuperAdmin(user: AccessUser): boolean {
  return user?.role === 'super_admin';
}

export function hasPermission(user: AccessUser, permission: AppPermission): boolean {
  if (!user) {
    return false;
  }

  if (isSuperAdmin(user)) {
    return true;
  }

  return Boolean(user.permissions?.[permission]);
}

export function canAccessTeamManagement(user: AccessUser): boolean {
  if (!user) {
    return false;
  }

  return isSuperAdmin(user) || Boolean(user.permissions?.canManageTeam) || isTeamAdminEmail(user.email);
}
