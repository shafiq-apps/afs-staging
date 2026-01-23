/**
 * Admin Auth Service
 * Handles API credentials lookup and validation for GraphQL requests
 */

import { AdminUsersService } from '@modules/admin-users/admin-users.service';
import { AdminUser } from '@modules/admin-users/admin-users.type';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('AdminAuthService');

export class AdminAuthService {
  private adminUsersService: AdminUsersService;

  constructor(adminUsersService: AdminUsersService) {
    this.adminUsersService = adminUsersService;
  }

  /**
   * Validate API credentials and return admin user
   */
  async validateApiCredentials(apiKey: string, apiSecret: string): Promise<AdminUser | null> {
    try {
      const user = await this.adminUsersService.validateApiCredentials(apiKey, apiSecret);
      return user;
    } catch (error: any) {
      logger.error('Failed to validate API credentials', {
        error: error?.message || error,
      });
      return null;
    }
  }

  /**
   * Get admin user by API key (without secret validation)
   * Useful for looking up user context
   */
  async getUserByApiKey(apiKey: string): Promise<AdminUser | null> {
    try {
      return await this.adminUsersService.getUserByApiKey(apiKey);
    } catch (error: any) {
      logger.error('Failed to get user by API key', {
        error: error?.message || error,
      });
      return null;
    }
  }
}

