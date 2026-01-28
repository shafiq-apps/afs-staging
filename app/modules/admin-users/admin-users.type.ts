/**
 * Admin Users Types
 * Type definitions for admin user management
 */

export type AdminUserRole = 'super_admin' | 'admin' | 'employee';

export interface AdminUserPermissions {
  canViewPayments: boolean;
  canViewSubscriptions: boolean;
  canManageShops: boolean;
  canManageTeam: boolean;
  canViewDocs: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminUserRole;
  permissions: AdminUserPermissions;
  apiKey: string;
  apiSecret: string; // Hashed
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAdminUserInput {
  email: string;
  name: string;
  role: AdminUserRole;
  permissions?: Partial<AdminUserPermissions>;
  isActive?: boolean;
}

export interface UpdateAdminUserInput {
  name?: string;
  role?: AdminUserRole;
  permissions?: Partial<AdminUserPermissions>;
  isActive?: boolean;
}

