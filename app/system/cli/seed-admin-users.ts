/**
 * Admin Users Seeder
 * Seeds initial admin users into Elasticsearch
 * 
 * Usage:
 *   ts-node app/system/cli/seed-admin-users.ts
 *   or
 *   npm run seed:admin-users
 */

import { initEnv } from '@core/config/env.loader';
import { initializeES, getESClient } from '@core/elasticsearch/es.client';
import { createAdminUsersModule } from '@modules/admin-users/admin-users.factory';
import { AdminUserRole } from '@modules/admin-users/admin-users.type';
import { createModuleLogger } from '@shared/utils/logger.util';

const logger = createModuleLogger('admin-users-seeder');

interface SeedUser {
  email: string;
  name: string;
  role: AdminUserRole;
  permissions?: {
    canViewPayments?: boolean;
    canViewSubscriptions?: boolean;
    canManageShops?: boolean;
    canManageTeam?: boolean;
    canViewDocs?: boolean;
  };
}

/**
 * Default admin users to seed
 */
const DEFAULT_ADMIN_USERS: SeedUser[] = [
  {
    email: 'admin@digitalcoo.com',
    name: 'Super Admin',
    role: 'super_admin',
    permissions: {
      canViewPayments: true,
      canViewSubscriptions: true,
      canManageShops: true,
      canManageTeam: true,
      canViewDocs: true,
    },
  },
  {
    email: 'shafiq.solutionwin@gmail.com',
    name: 'Super Admin',
    role: 'super_admin',
    permissions: {
      canViewPayments: true,
      canViewSubscriptions: true,
      canManageShops: true,
      canManageTeam: true,
      canViewDocs: true,
    },
  },
];

/**
 * Seed admin users
 */
async function seedAdminUsers(users: SeedUser[] = DEFAULT_ADMIN_USERS): Promise<void> {
  logger.info('Starting admin users seeder...');

  try {
    // Initialize environment
    initEnv();

    // Initialize Elasticsearch connection
    logger.info('Initializing Elasticsearch connection...');
    await initializeES({
      host: process.env.ELASTICSEARCH_HOST,
      username: process.env.ELASTICSEARCH_USERNAME,
      password: process.env.ELASTICSEARCH_PASSWORD,
      caCertPath: process.env.ELASTICSEARCH_CA_CERT_PATH,
      rejectUnauthorized: process.env.ELASTICSEARCH_REJECT_UNAUTHORIZED !== 'false',
      pingTimeout: parseInt(process.env.ELASTICSEARCH_PING_TIMEOUT || '5000'),
      requestTimeout: parseInt(process.env.ELASTICSEARCH_REQUEST_TIMEOUT || '30000'),
      maxRetries: parseInt(process.env.ELASTICSEARCH_MAX_RETRIES || '3'),
    });

    const esClient = getESClient();
    logger.info('Elasticsearch connection initialized');

    // Initialize admin users module
    const adminUsersModule = createAdminUsersModule(esClient);
    const service = adminUsersModule.service;

    // Ensure admin_users index exists
    logger.info('Ensuring admin_users index exists...');
    try {
      const { initializeStaticIndices } = await import('@core/elasticsearch');
      await initializeStaticIndices(esClient);
      logger.info('Indices initialized');
    } catch (error: any) {
      logger.warn('Index initialization warning:', error?.message || error);
      // Continue anyway - index might already exist
    }

    // Seed each user
    const results = {
      created: 0,
      skipped: 0,
      errors: 0,
    };

    for (const userData of users) {
      try {
        // Check if user already exists
        const existing = await service.getUserByEmail(userData.email);
        
        if (existing) {
          logger.info(`User already exists: ${userData.email} (skipping)`);
          results.skipped++;
          continue;
        }

        // Create user
        logger.info(`Creating admin user: ${userData.email} (${userData.role})`);
        const result = await service.createUser({
          email: userData.email,
          name: userData.name,
          role: userData.role,
          permissions: userData.permissions,
          isActive: true,
        });

        logger.info(`✓ Created admin user: ${result.user.email}`, {
          id: result.user.id,
          role: result.user.role,
          apiKey: result.apiKey.substring(0, 12) + '...',
        });

        // Log API credentials (important for first-time setup)
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log(`ADMIN USER CREATED: ${userData.email}`);
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`API Key: ${result.apiKey}`);
        console.log(`API Secret: ${result.apiSecret}`);
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log('⚠️  IMPORTANT: Save these credentials securely!');
        console.log('   The API secret will not be shown again.\n');

        results.created++;
      } catch (error: any) {
        logger.error(`Failed to create user ${userData.email}:`, {
          error: error?.message || error,
          stack: error?.stack,
        });
        results.errors++;
      }
    }

    // Summary
    logger.info('Admin users seeder completed', results);
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('SEEDER SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Created: ${results.created}`);
    console.log(`Skipped: ${results.skipped}`);
    console.log(`Errors: ${results.errors}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (results.errors > 0) {
      process.exit(1);
    }
  } catch (error: any) {
    logger.error('Seeder failed:', {
      error: error?.message || error,
      stack: error?.stack,
    });
    console.error('\n❌ Seeder failed:', error?.message || error);
    process.exit(1);
  }
}

// Run seeder if executed directly
// Parse command line arguments for custom users
// Format: EMAIL:NAME:ROLE
// Example: node seed-admin-users.ts user@example.com:John Doe:admin
const customUsers: SeedUser[] = [];
const args = process.argv.slice(2);
if (args.length > 0) {
  for (const arg of args) {
    const parts = arg.split(':');
    if (parts.length >= 3) {
      customUsers.push({
        email: parts[0],
        name: parts[1],
        role: parts[2] as AdminUserRole,
      });
    }
  }
}

const usersToSeed = customUsers.length > 0 ? customUsers : DEFAULT_ADMIN_USERS;
seedAdminUsers(usersToSeed).catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

export { seedAdminUsers, SeedUser };

