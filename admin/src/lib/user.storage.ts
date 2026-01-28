/**
 * User Storage with GraphQL Integration
 * Uses GraphQL to fetch users from Node.js server, with in-memory fallback
 */

import { User, UserRole, UserPermissions } from '@/types/auth';
import { createGraphQLClient, GraphQLClient } from '@/lib/graphql.client';

// In-memory fallback storage
const usersStore = new Map<string, User>();

// GraphQL queries and mutations
const GET_ALL_USERS_QUERY = `
  query GetAllAdminUsers {
    adminUsers {
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

const GET_USER_BY_ID_QUERY = `
  query GetAdminUser($id: ID!) {
    adminUser(id: $id) {
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

const GET_USER_BY_EMAIL_QUERY = `
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

const CREATE_USER_MUTATION = `
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

const UPDATE_USER_MUTATION = `
  mutation UpdateAdminUser($id: ID!, $input: UpdateAdminUserInput!) {
    updateAdminUser(id: $id, input: $input) {
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

const DELETE_USER_MUTATION = `
  mutation DeleteAdminUser($id: ID!) {
    deleteAdminUser(id: $id)
  }
`;

/**
 * Convert GraphQL AdminUser to User type
 */
function graphQLUserToUser(gqlUser: any): User {
  return {
    id: gqlUser.id,
    email: gqlUser.email,
    name: gqlUser.name,
    role: gqlUser.role,
    permissions: gqlUser.permissions,
    isActive: gqlUser.isActive,
    createdAt: gqlUser.createdAt,
    updatedAt: gqlUser.updatedAt,
  };
}

/**
 * Get GraphQL client if available
 */
function getGraphQLClient(): GraphQLClient | null {
  return createGraphQLClient();
}

// Default permissions based on role
export function getDefaultPermissions(role: UserRole): UserPermissions {
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
      return {
        canViewPayments: false,
        canViewSubscriptions: false,
        canManageShops: true,
        canManageTeam: false,
        canViewDocs: true,
      };
    default:
      return {
        canViewPayments: false,
        canViewSubscriptions: false,
        canManageShops: false,
        canManageTeam: false,
        canViewDocs: false,
      };
  }
}

// Determine role based on email
function determineRoleFromEmail(email: string): UserRole {
  const emailLower = email.toLowerCase();
  if (emailLower === 'admin@digitalcoo.com') {
    return 'super_admin';
  }
  return 'employee';
}

// Get or create user by email (uses GraphQL if available, falls back to in-memory)
export async function getOrCreateUserByEmail(email: string): Promise<User> {
  const emailLower = email.toLowerCase();
  
  // Try GraphQL first
  const client = getGraphQLClient();
  if (client) {
    try {
      const result = await client.query(GET_USER_BY_EMAIL_QUERY, { email });
      if (result?.adminUserByEmail) {
        const user = graphQLUserToUser(result.adminUserByEmail);
        // Cache in memory
        usersStore.set(emailLower, user);
        return user;
      }
    } catch (error: any) {
      console.warn('GraphQL query failed, using fallback:', error?.message || error);
    }
  }

  // Fallback to in-memory
  let user = usersStore.get(emailLower);
  if (!user) {
    const role = determineRoleFromEmail(email);
    const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    user = {
      id: Date.now().toString(),
      email: email,
      name: name,
      role: role,
      permissions: getDefaultPermissions(role),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
    };
    
    usersStore.set(emailLower, user);
    console.log(`Created new user in memory: ${email} with role: ${role}`);
  }

  return user;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const emailLower = email.toLowerCase();
  
  // Try GraphQL first
  const client = getGraphQLClient();
  if (client) {
    try {
      const result = await client.query(GET_USER_BY_EMAIL_QUERY, { email });
      if (result?.adminUserByEmail) {
        return graphQLUserToUser(result.adminUserByEmail);
      }
      return null;
    } catch (error: any) {
      console.warn('GraphQL query failed, using fallback:', error?.message || error);
    }
  }

  // Fallback to in-memory
  return usersStore.get(emailLower) || null;
}

export async function getUserById(id: string): Promise<User | null> {
  // Try GraphQL first
  const client = getGraphQLClient();
  if (client) {
    try {
      const result = await client.query(GET_USER_BY_ID_QUERY, { id });
      if (result?.adminUser) {
        return graphQLUserToUser(result.adminUser);
      }
      return null;
    } catch (error: any) {
      console.warn('GraphQL query failed, using fallback:', error?.message || error);
    }
  }

  // Fallback to in-memory
  for (const user of usersStore.values()) {
    if (user.id === id) {
      return user;
    }
  }
  return null;
}

export async function getAllUsers(): Promise<User[]> {
  // Try GraphQL first
  const client = getGraphQLClient();
  if (client) {
    try {
      const result = await client.query(GET_ALL_USERS_QUERY);
      if (result?.adminUsers) {
        return result.adminUsers.map(graphQLUserToUser);
      }
      return [];
    } catch (error: any) {
      console.warn('GraphQL query failed, using fallback:', error?.message || error);
    }
  }

  // Fallback to in-memory
  return Array.from(usersStore.values());
}

export async function createUser(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
  // Try GraphQL first
  const client = getGraphQLClient();
  if (client) {
    try {
      const result = await client.mutate(CREATE_USER_MUTATION, {
        input: {
          email: userData.email,
          name: userData.name,
          role: userData.role,
          permissions: userData.permissions,
          isActive: userData.isActive,
        },
      });
      
      if (result?.createAdminUser?.user) {
        return graphQLUserToUser(result.createAdminUser.user);
      }
    } catch (error: any) {
      console.warn('GraphQL mutation failed, using fallback:', error?.message || error);
    }
  }

  // Fallback to in-memory
  const emailLower = userData.email.toLowerCase();
  const newUser: User = {
    ...userData,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  usersStore.set(emailLower, newUser);
  return newUser;
}

export async function updateUser(id: string, updates: Partial<User>): Promise<User | null> {
  // Try GraphQL first
  const client = getGraphQLClient();
  if (client) {
    try {
      const input: any = {};
      if (updates.name !== undefined) input.name = updates.name;
      if (updates.role !== undefined) input.role = updates.role;
      if (updates.permissions !== undefined) input.permissions = updates.permissions;
      if (updates.isActive !== undefined) input.isActive = updates.isActive;

      const result = await client.mutate(UPDATE_USER_MUTATION, {
        id,
        input,
      });
      
      if (result?.updateAdminUser) {
        return graphQLUserToUser(result.updateAdminUser);
      }
    } catch (error: any) {
      console.warn('GraphQL mutation failed, using fallback:', error?.message || error);
    }
  }

  // Fallback to in-memory
  for (const [email, user] of usersStore.entries()) {
    if (user.id === id) {
      const updatedUser: User = {
        ...user,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      usersStore.set(email, updatedUser);
      return updatedUser;
    }
  }
  return null;
}

export async function deleteUser(id: string): Promise<boolean> {
  // Try GraphQL first
  const client = getGraphQLClient();
  if (client) {
    try {
      const result = await client.mutate(DELETE_USER_MUTATION, { id });
      if (result?.deleteAdminUser === true) {
        // Remove from cache
        for (const [email, user] of usersStore.entries()) {
          if (user.id === id) {
            usersStore.delete(email);
            break;
          }
        }
        return true;
      }
      return false;
    } catch (error: any) {
      console.warn('GraphQL mutation failed, using fallback:', error?.message || error);
    }
  }

  // Fallback to in-memory
  for (const [email, user] of usersStore.entries()) {
    if (user.id === id) {
      usersStore.delete(email);
      return true;
    }
  }
  return false;
}
