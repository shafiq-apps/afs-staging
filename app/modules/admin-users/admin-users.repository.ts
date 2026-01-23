/**
 * Admin Users Repository
 * Handles Elasticsearch operations for admin users
 */

import { Client } from '@elastic/elasticsearch';
import { createModuleLogger } from '@shared/utils/logger.util';
import { AdminUser, CreateAdminUserInput, UpdateAdminUserInput } from './admin-users.type';
import { ADMIN_USERS_INDEX_NAME } from '@shared/constants/es.constant';

const logger = createModuleLogger('AdminUsersRepository');

export class AdminUsersRepository {
  private esClient: Client;
  private index: string;

  constructor(esClient: Client, index: string = ADMIN_USERS_INDEX_NAME) {
    this.esClient = esClient;
    this.index = index;
  }

  /**
   * Find admin user by email
   */
  async findByEmail(email: string): Promise<AdminUser | null> {
    try {
      const response = await this.esClient.search({
        index: this.index,
        body: {
          query: {
            term: {
              email: email.toLowerCase(),
            },
          },
        },
      });

      if (response.hits.hits.length === 0) {
        return null;
      }

      const hit = response.hits.hits[0];
      return {
        ...hit._source,
        id: hit._id,
      } as AdminUser;
    } catch (error: any) {
      logger.error('Failed to find admin user by email', {
        email,
        error: error?.message || error,
      });
      throw error;
    }
  }

  /**
   * Find admin user by ID
   */
  async findById(id: string): Promise<AdminUser | null> {
    try {
      const response = await this.esClient.get({
        index: this.index,
        id,
      });

      if (!response.found) {
        return null;
      }

      return {
        ...response._source,
        id: response._id,
      } as AdminUser;
    } catch (error: any) {
      if (error?.meta?.statusCode === 404) {
        return null;
      }
      logger.error('Failed to find admin user by ID', {
        id,
        error: error?.message || error,
      });
      throw error;
    }
  }

  /**
   * Find admin user by API key
   */
  async findByApiKey(apiKey: string): Promise<AdminUser | null> {
    try {
      const response = await this.esClient.search({
        index: this.index,
        body: {
          query: {
            term: {
              apiKey: apiKey,
            },
          },
        },
      });

      if (response.hits.hits.length === 0) {
        return null;
      }

      const hit = response.hits.hits[0];
      return {
        ...hit._source,
        id: hit._id,
      } as AdminUser;
    } catch (error: any) {
      logger.error('Failed to find admin user by API key', {
        error: error?.message || error,
      });
      throw error;
    }
  }

  /**
   * Get all admin users
   */
  async findAll(): Promise<AdminUser[]> {
    try {
      const response = await this.esClient.search({
        index: this.index,
        body: {
          query: {
            match_all: {},
          },
          size: 1000,
        },
      });

      return response.hits.hits.map((hit: any) => ({
        ...hit._source,
        id: hit._id,
      })) as AdminUser[];
    } catch (error: any) {
      logger.error('Failed to get all admin users', {
        error: error?.message || error,
      });
      throw error;
    }
  }

  /**
   * Create admin user
   */
  async create(userData: CreateAdminUserInput & { apiKey: string; apiSecret: string }): Promise<AdminUser> {
    try {
      const now = new Date().toISOString();
      const user: Omit<AdminUser, 'id'> = {
        email: userData.email.toLowerCase(),
        name: userData.name,
        role: userData.role,
        permissions: {
          canViewPayments: userData.permissions?.canViewPayments ?? false,
          canViewSubscriptions: userData.permissions?.canViewSubscriptions ?? false,
          canManageShops: userData.permissions?.canManageShops ?? false,
          canManageTeam: userData.permissions?.canManageTeam ?? false,
          canViewDocs: userData.permissions?.canViewDocs ?? false,
        },
        apiKey: userData.apiKey,
        apiSecret: userData.apiSecret,
        isActive: userData.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      };

      const response = await this.esClient.index({
        index: this.index,
        document: user,
        refresh: true,
      });

      return {
        ...user,
        id: response._id,
      };
    } catch (error: any) {
      logger.error('Failed to create admin user', {
        email: userData.email,
        error: error?.message || error,
      });
      throw error;
    }
  }

  /**
   * Update admin user
   */
  async update(id: string, updates: UpdateAdminUserInput): Promise<AdminUser | null> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        return null;
      }

      const updated: Partial<AdminUser> = {
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      // Merge permissions if provided
      if (updates.permissions) {
        updated.permissions = {
          ...existing.permissions,
          ...updates.permissions,
        };
      }

      await this.esClient.update({
        index: this.index,
        id,
        doc: updated,
        refresh: true,
      });

      return await this.findById(id);
    } catch (error: any) {
      logger.error('Failed to update admin user', {
        id,
        error: error?.message || error,
      });
      throw error;
    }
  }

  /**
   * Update API credentials
   */
  async updateApiCredentials(id: string, apiKey: string, apiSecret: string): Promise<void> {
    try {
      await this.esClient.update({
        index: this.index,
        id,
        doc: {
          apiKey,
          apiSecret,
          updatedAt: new Date().toISOString(),
        },
        refresh: true,
      });
    } catch (error: any) {
      logger.error('Failed to update API credentials', {
        id,
        error: error?.message || error,
      });
      throw error;
    }
  }

  /**
   * Delete admin user
   */
  async delete(id: string): Promise<boolean> {
    try {
      await this.esClient.delete({
        index: this.index,
        id,
        refresh: true,
      });
      return true;
    } catch (error: any) {
      if (error?.meta?.statusCode === 404) {
        return false;
      }
      logger.error('Failed to delete admin user', {
        id,
        error: error?.message || error,
      });
      throw error;
    }
  }
}

