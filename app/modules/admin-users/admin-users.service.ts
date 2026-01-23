/**
 * Admin Users Service
 * Business logic for admin user management
 */

import { AdminUsersRepository } from './admin-users.repository';
import { AdminUser, CreateAdminUserInput, UpdateAdminUserInput } from './admin-users.type';
import { createModuleLogger } from '@shared/utils/logger.util';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

const logger = createModuleLogger('AdminUsersService');

export class AdminUsersService {
  private repository: AdminUsersRepository;

  constructor(repository: AdminUsersRepository) {
    this.repository = repository;
  }

  /**
   * Generate API key (random string)
   */
  generateApiKey(): string {
    return `ak_${crypto.randomBytes(32).toString('hex')}`;
  }

  /**
   * Generate API secret (random string)
   */
  generateApiSecret(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Hash API secret using bcrypt
   */
  async hashSecret(secret: string): Promise<string> {
    return bcrypt.hash(secret, 10);
  }

  /**
   * Verify API secret against hash
   */
  async verifySecret(secret: string, hash: string): Promise<boolean> {
    return bcrypt.compare(secret, hash);
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<AdminUser | null> {
    return this.repository.findByEmail(email);
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<AdminUser | null> {
    return this.repository.findById(id);
  }

  /**
   * Get user by API key
   */
  async getUserByApiKey(apiKey: string): Promise<AdminUser | null> {
    return this.repository.findByApiKey(apiKey);
  }

  /**
   * Get all users
   */
  async getAllUsers(): Promise<AdminUser[]> {
    return this.repository.findAll();
  }

  /**
   * Create user with API credentials
   */
  async createUser(input: CreateAdminUserInput): Promise<{ user: AdminUser; apiKey: string; apiSecret: string }> {
    // Check if user already exists
    const existing = await this.repository.findByEmail(input.email);
    if (existing) {
      throw new Error(`Admin user with email ${input.email} already exists`);
    }

    // Generate API credentials
    const apiKey = this.generateApiKey();
    const apiSecret = this.generateApiSecret();
    const hashedSecret = await this.hashSecret(apiSecret);

    // Create user
    const user = await this.repository.create({
      ...input,
      apiKey,
      apiSecret: hashedSecret,
    });

    return {
      user,
      apiKey,
      apiSecret,
    };
  }

  /**
   * Update user
   */
  async updateUser(id: string, input: UpdateAdminUserInput): Promise<AdminUser | null> {
    return this.repository.update(id, input);
  }

  /**
   * Regenerate API credentials
   */
  async regenerateApiCredentials(id: string): Promise<{ apiKey: string; apiSecret: string }> {
    const user = await this.repository.findById(id);
    if (!user) {
      throw new Error(`Admin user with ID ${id} not found`);
    }

    const apiKey = this.generateApiKey();
    const apiSecret = this.generateApiSecret();
    const hashedSecret = await this.hashSecret(apiSecret);

    await this.repository.updateApiCredentials(id, apiKey, hashedSecret);

    return {
      apiKey,
      apiSecret,
    };
  }

  /**
   * Delete user
   */
  async deleteUser(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  /**
   * Validate API credentials
   */
  async validateApiCredentials(apiKey: string, apiSecret: string): Promise<AdminUser | null> {
    const user = await this.repository.findByApiKey(apiKey);
    if (!user || !user.isActive) {
      return null;
    }

    const isValid = await this.verifySecret(apiSecret, user.apiSecret);
    if (!isValid) {
      return null;
    }

    return user;
  }
}

