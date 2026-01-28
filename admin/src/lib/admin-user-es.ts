/**
 * Admin User ES Integration
 * Helper functions to create/update admin users in Elasticsearch via GraphQL
 */

import { GraphQLClient, createGraphQLClient, storeApiCredentials } from '@/lib/graphql.client';

const CREATE_ADMIN_USER_MUTATION = `
  mutation CreateAdminUser($input: CreateAdminUserInput!) {
    createAdminUser(input: $input) {
      user {
        id
        email
        name
        role
        permissions {
          canViewPayments
          canViewSubscriptions
          canManageShops
          canManageTeam
          canViewDocs
        }
        isActive
        createdAt
        updatedAt
      }
      apiKey
      apiSecret
    }
  }
`;

const GET_ADMIN_USER_BY_EMAIL_QUERY = `
  query GetAdminUserByEmail($email: String!) {
    adminUserByEmail(email: $email) {
      id
      email
      name
      role
      permissions {
        canViewPayments
        canViewSubscriptions
        canManageShops
        canManageTeam
        canViewDocs
      }
      isActive
      createdAt
      updatedAt
    }
  }
`;

export interface AdminUserInput {
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'employee';
  permissions?: {
    canViewPayments?: boolean;
    canViewSubscriptions?: boolean;
    canManageShops?: boolean;
    canManageTeam?: boolean;
    canViewDocs?: boolean;
  };
  isActive?: boolean;
}

/**
 * Create or get admin user in ES
 * Returns API credentials if user was created
 * Note: This requires bootstrap API credentials for the first user
 */
export async function createOrGetAdminUserInES(
  userInput: AdminUserInput,
  existingApiKey?: string,
  existingApiSecret?: string
): Promise<{ user: any; apiKey?: string; apiSecret?: string }> {
  // Create GraphQL client with existing credentials if available
  // Otherwise, use bootstrap credentials from env
  let client: GraphQLClient | null = null;
  
  if (existingApiKey && existingApiSecret) {
    client = new GraphQLClient({
      apiKey: existingApiKey,
      apiSecret: existingApiSecret,
    });
  } else {
    // Try to use bootstrap credentials from env
    const bootstrapKey = process.env.BOOTSTRAP_API_KEY;
    const bootstrapSecret = process.env.BOOTSTRAP_API_SECRET;
    
    if (bootstrapKey && bootstrapSecret) {
      client = new GraphQLClient({
        apiKey: bootstrapKey,
        apiSecret: bootstrapSecret,
      });
    } else {
      // Fallback: try to create client (might fail, but we'll handle it)
      client = createGraphQLClient();
    }
  }

  if (!client) {
    console.warn('Cannot create GraphQL client - user will be created in memory only');
    // Return null to indicate ES sync failed, but don't throw
    // The user will still be created in memory
    return { user: null, apiKey: undefined, apiSecret: undefined };
  }

  try {
    // First, try to get existing user
    try {
      const result = await client.query(GET_ADMIN_USER_BY_EMAIL_QUERY, {
        email: userInput.email,
      });
      
      if (result?.adminUserByEmail) {
        return {
          user: result.adminUserByEmail,
        };
      }
    } catch (error: any) {
      // User doesn't exist, continue to create
      console.log('User not found in ES, creating new user:', userInput.email);
    }

    // Create new user
    const result = await client.mutate(CREATE_ADMIN_USER_MUTATION, {
      input: {
        email: userInput.email,
        name: userInput.name,
        role: userInput.role,
        permissions: userInput.permissions,
        isActive: userInput.isActive ?? true,
      },
    });

    if (result?.createAdminUser) {
      const { user, apiKey, apiSecret } = result.createAdminUser;
      
      // Store API credentials in session storage if available
      if (apiKey && apiSecret && typeof window !== 'undefined') {
        storeApiCredentials(apiKey, apiSecret);
      }

      return {
        user,
        apiKey,
        apiSecret,
      };
    }

    throw new Error('Failed to create admin user in ES');
  } catch (error: any) {
    console.error('Error creating/getting admin user in ES:', error);
    // Don't throw - allow fallback to in-memory storage
    return { user: null, apiKey: undefined, apiSecret: undefined };
  }
}

