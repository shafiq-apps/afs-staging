/**
 * Admin Users Repository
 * Handles Elasticsearch operations for admin users and API credentials.
 */

import { Client } from '@elastic/elasticsearch';
import crypto from 'crypto';
import { createModuleLogger } from '@shared/utils/logger.util';
import { ADMIN_USERS_INDEX_NAME } from '@shared/constants/es.constant';

const logger = createModuleLogger('admin-users-repository');

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

interface AdminUserDocument extends AdminUser {
  apiKey: string;
  apiSecret: string;
}

interface ResolvedDocument {
  docId: string;
  source: AdminUserDocument;
}

export interface AdminUserWithCredentials {
  user: AdminUser;
  apiKey: string;
  apiSecret: string;
}

export interface RegeneratedAdminCredentials extends AdminUserWithCredentials {
  previousApiKey: string | null;
}

function getDefaultPermissions(role: AdminUserRole): AdminUserPermissions {
  switch (role) {
    case 'super_admin':
      return {
        canViewPayments: true,
        canViewSubscriptions: true,
        canManageShops: true,
        canManageTeam: true,
        canViewDocs: true,
      };
    case 'admin':
      return {
        canViewPayments: true,
        canViewSubscriptions: true,
        canManageShops: true,
        canManageTeam: false,
        canViewDocs: true,
      };
    case 'employee':
    default:
      return {
        canViewPayments: false,
        canViewSubscriptions: false,
        canManageShops: true,
        canManageTeam: false,
        canViewDocs: true,
      };
  }
}

function applyRolePermissionConstraints(
  role: AdminUserRole,
  permissions: AdminUserPermissions
): AdminUserPermissions {
  if (role !== 'employee') {
    return permissions;
  }

  return {
    ...permissions,
    canViewPayments: false,
    canViewSubscriptions: false,
  };
}

function normalizeRole(role: unknown): AdminUserRole {
  if (role === 'super_admin' || role === 'admin' || role === 'employee') {
    return role;
  }
  return 'employee';
}

function generateApiCredentials(): { apiKey: string; apiSecret: string } {
  return {
    apiKey: `adm_${crypto.randomBytes(12).toString('hex')}`,
    apiSecret: crypto.randomBytes(48).toString('hex'),
  };
}

export class AdminUsersRepository {
  private esClient: Client;
  private index: string;

  constructor(esClient: Client, index: string = ADMIN_USERS_INDEX_NAME) {
    this.esClient = esClient;
    this.index = index;
  }

  private normalizePermissions(
    role: AdminUserRole,
    permissions?: Partial<AdminUserPermissions>
  ): AdminUserPermissions {
    const merged = {
      ...getDefaultPermissions(role),
      ...(permissions || {}),
    };
    return applyRolePermissionConstraints(role, merged);
  }

  private normalizeUser(source: Partial<AdminUserDocument>, fallbackId: string): AdminUser {
    const role = normalizeRole(source.role);
    const normalizedEmail = (source.email || '').trim().toLowerCase();
    const now = new Date().toISOString();

    return {
      id: source.id || fallbackId,
      email: normalizedEmail,
      name: source.name || normalizedEmail.split('@')[0] || 'Admin User',
      role,
      permissions: this.normalizePermissions(role, source.permissions),
      isActive: source.isActive !== false,
      createdAt: source.createdAt || now,
      updatedAt: source.updatedAt || now,
    };
  }

  private async resolveDocumentById(id: string): Promise<ResolvedDocument | null> {
    try {
      const byDocId = await this.esClient.get<AdminUserDocument>({
        index: this.index,
        id,
      });

      if (byDocId.found && byDocId._source) {
        return {
          docId: byDocId._id,
          source: byDocId._source as AdminUserDocument,
        };
      }
    } catch (error: any) {
      if (error?.statusCode !== 404) {
        throw error;
      }
    }

    const byFieldId = await this.esClient.search<AdminUserDocument>({
      index: this.index,
      size: 1,
      query: {
        term: {
          id,
        },
      },
    });

    const hit = byFieldId.hits.hits[0];
    if (!hit?._source) {
      return null;
    }

    return {
      docId: hit._id || (hit._source as any).id,
      source: hit._source as AdminUserDocument,
    };
  }

  async list(limit: number = 100, offset: number = 0): Promise<AdminUser[]> {
    const size = Math.min(Math.max(limit, 1), 500);
    const from = Math.max(offset, 0);

    const response = await this.esClient.search<AdminUserDocument>({
      index: this.index,
      from,
      size,
      query: {
        match_all: {},
      },
      sort: [
        { createdAt: { order: 'desc', unmapped_type: 'date' } },
        { email: { order: 'asc', unmapped_type: 'keyword' } },
      ],
    });

    return response.hits.hits
      .map(hit => {
        if (!hit._source) {
          return null;
        }
        return this.normalizeUser(hit._source, hit._id || (hit._source as any).id);
      })
      .filter((item): item is AdminUser => Boolean(item));
  }

  async getById(id: string): Promise<AdminUser | null> {
    const record = await this.resolveDocumentById(id);
    if (!record) {
      return null;
    }
    return this.normalizeUser(record.source, record.docId);
  }

  async getByEmail(email: string): Promise<AdminUser | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const response = await this.esClient.search<AdminUserDocument>({
      index: this.index,
      size: 1,
      query: {
        term: {
          email: normalizedEmail,
        },
      },
    });

    const hit = response.hits.hits[0];
    if (!hit?._source) {
      return null;
    }

    return this.normalizeUser(hit._source, hit._id || (hit._source as any).id);
  }

  async create(input: CreateAdminUserInput): Promise<AdminUserWithCredentials> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await this.getByEmail(normalizedEmail);
    if (existing) {
      throw new Error(`Admin user already exists for email: ${normalizedEmail}`);
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const role = normalizeRole(input.role);
    const permissions = this.normalizePermissions(role, input.permissions);
    const { apiKey, apiSecret } = generateApiCredentials();

    const document: AdminUserDocument = {
      id,
      email: normalizedEmail,
      name: input.name?.trim() || normalizedEmail.split('@')[0] || 'Admin User',
      role,
      permissions,
      apiKey,
      apiSecret,
      isActive: input.isActive !== false,
      createdAt: now,
      updatedAt: now,
    };

    await this.esClient.index({
      index: this.index,
      id,
      document,
      refresh: true,
    });

    logger.info('Admin user created', {
      id,
      email: normalizedEmail,
      role,
    });

    return {
      user: this.normalizeUser(document, id),
      apiKey,
      apiSecret,
    };
  }

  async update(id: string, input: UpdateAdminUserInput): Promise<AdminUser | null> {
    const record = await this.resolveDocumentById(id);
    if (!record) {
      return null;
    }

    const current = record.source;
    const role = normalizeRole(input.role || current.role);
    const permissions = this.normalizePermissions(role, {
      ...(current.permissions || {}),
      ...(input.permissions || {}),
    });

    const updatedDocument: AdminUserDocument = {
      ...current,
      id: current.id || record.docId,
      email: (current.email || '').trim().toLowerCase(),
      name: input.name !== undefined ? input.name.trim() : current.name,
      role,
      permissions,
      isActive: input.isActive !== undefined ? input.isActive : current.isActive !== false,
      updatedAt: new Date().toISOString(),
      createdAt: current.createdAt || new Date().toISOString(),
      apiKey: current.apiKey,
      apiSecret: current.apiSecret,
    };

    await this.esClient.index({
      index: this.index,
      id: record.docId,
      document: updatedDocument,
      refresh: true,
    });

    logger.info('Admin user updated', {
      id: record.docId,
      email: updatedDocument.email,
      role: updatedDocument.role,
    });

    return this.normalizeUser(updatedDocument, record.docId);
  }

  async delete(id: string): Promise<{ deleted: boolean; apiKey?: string }> {
    const record = await this.resolveDocumentById(id);
    if (!record) {
      return { deleted: false };
    }

    await this.esClient.delete({
      index: this.index,
      id: record.docId,
      refresh: true,
    });

    logger.info('Admin user deleted', {
      id: record.docId,
      email: record.source.email,
    });

    return {
      deleted: true,
      apiKey: record.source.apiKey,
    };
  }

  async regenerateApiCredentials(id: string): Promise<RegeneratedAdminCredentials | null> {
    const record = await this.resolveDocumentById(id);
    if (!record) {
      return null;
    }

    const { apiKey, apiSecret } = generateApiCredentials();
    const previousApiKey = record.source.apiKey || null;
    const updatedDocument: AdminUserDocument = {
      ...record.source,
      apiKey,
      apiSecret,
      updatedAt: new Date().toISOString(),
    };

    await this.esClient.index({
      index: this.index,
      id: record.docId,
      document: updatedDocument,
      refresh: true,
    });

    logger.info('Admin user credentials regenerated', {
      id: record.docId,
      email: updatedDocument.email,
    });

    return {
      user: this.normalizeUser(updatedDocument, record.docId),
      apiKey,
      apiSecret,
      previousApiKey,
    };
  }
}

