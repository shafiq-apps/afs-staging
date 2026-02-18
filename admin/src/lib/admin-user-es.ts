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

type AdminUserRecord = {
  id: string;
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
  createdAt?: string;
  updatedAt?: string;
};

type AdminUserByEmailResponse = {
  adminUserByEmail?: AdminUserRecord | null;
};

type CreateAdminUserResponse = {
  createAdminUser?: {
    user: AdminUserRecord;
    apiKey?: string;
    apiSecret?: string;
  } | null;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isUnsupportedCreateAdminUserMutation(error: unknown): boolean {
  const message = getErrorMessage(error);
  return (
    message.includes('Cannot return null for non-nullable field Mutation.createAdminUser') ||
    message.includes('Cannot query field "createAdminUser" on type "Mutation"') ||
    message.includes('GraphQL errors: Cannot return null for non-nullable field Mutation.createAdminUser')
  );
}

/**
 * Create or get admin user in ES
 * Returns API credentials if user was created
 * Note: This requires API credentials for the first user
 */
export async function createOrGetAdminUserInES(
  userInput: AdminUserInput,
  existingApiKey?: string,
  existingApiSecret?: string
): Promise<{ user: AdminUserRecord | null; apiKey?: string; apiSecret?: string }> {
  // Create GraphQL client with existing credentials if available
  // Otherwise, use API credentials from env
  let client: GraphQLClient | null = null;
  
  if (existingApiKey && existingApiSecret) {
    client = new GraphQLClient({
      apiKey: existingApiKey,
      apiSecret: existingApiSecret,
    });
  } else {
    // Try to use API credentials from env
    const apiKeyFromEnv = process.env.API_KEY;
    const apiSecretFromEnv = process.env.API_SECRET;
    
    if (apiKeyFromEnv && apiSecretFromEnv) {
      client = new GraphQLClient({
        apiKey: apiKeyFromEnv,
        apiSecret: apiSecretFromEnv,
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
      const result = await client.query<AdminUserByEmailResponse>(GET_ADMIN_USER_BY_EMAIL_QUERY, {
        email: userInput.email,
      });
      
      if (result?.adminUserByEmail) {
        return {
          user: result.adminUserByEmail,
        };
      }
    } catch {
      // User doesn't exist, continue to create
      console.log('User not found in ES, creating new user:', userInput.email);
    }

    // Create new user
    let result: CreateAdminUserResponse | null = null;
    try {
      result = await client.mutate<CreateAdminUserResponse>(CREATE_ADMIN_USER_MUTATION, {
        input: {
          email: userInput.email,
          name: userInput.name,
          role: userInput.role,
          permissions: userInput.permissions,
          isActive: userInput.isActive ?? true,
        },
      });
    } catch (createError: unknown) {
      if (isUnsupportedCreateAdminUserMutation(createError)) {
        console.warn(
          '[admin-user-es] createAdminUser mutation is unavailable on app server, skipping ES user creation.'
        );
        return { user: null, apiKey: undefined, apiSecret: undefined };
      }

      throw createError;
    }

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
  } catch (error: unknown) {
    console.warn('Error creating/getting admin user in ES:', getErrorMessage(error));
    // Don't throw - allow fallback to in-memory storage
    return { user: null, apiKey: undefined, apiSecret: undefined };
  }
}

