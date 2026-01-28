export type UserRole = 'super_admin' | 'admin' | 'employee';

export interface UserPermissions {
  canViewPayments: boolean;
  canViewSubscriptions: boolean;
  canManageShops: boolean;
  canManageTeam: boolean;
  canViewDocs: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  permissions: UserPermissions;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface OTPCode {
  code: string;
  email: string;
  expiresAt: number;
  attempts: number;
  isSuperAdmin: boolean;
}

export interface PINCode {
  code: string;
  email: string;
  expiresAt: number;
  attempts: number;
}

export interface SessionData {
  userId: string;
  email: string;
  role: UserRole;
  permissions: UserPermissions;
  iat: number;
  exp: number;
}

