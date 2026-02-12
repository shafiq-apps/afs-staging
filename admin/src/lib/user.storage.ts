import crypto from 'crypto';
import { ADMIN_USERS_INDEX_NAME } from '@/lib/es.constants';
import { getESClient, initializeES } from '@/lib/elasticsearch';
import { User, UserPermissions, UserRole } from '@/types/auth';

type AdminUserDocument = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  permissions?: Partial<UserPermissions>;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

const SUPER_ADMIN_EMAILS = new Set(
  (process.env.SUPER_ADMIN_EMAILS || 'admin@digitalcoo.com')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

let ensureIndexPromise: Promise<void> | null = null;

async function getClient() {
  await initializeES();
  await ensureAdminUsersIndex();
  return getESClient();
}

async function ensureAdminUsersIndex(): Promise<void> {
  if (ensureIndexPromise) {
    await ensureIndexPromise;
    return;
  }

  ensureIndexPromise = (async () => {
    const client = getESClient();
    const existsResponse = await client.indices.exists({ index: ADMIN_USERS_INDEX_NAME });
    const exists =
      typeof existsResponse === 'boolean'
        ? existsResponse
        : Boolean((existsResponse as { body?: boolean }).body);

    if (exists) {
      return;
    }

    await client.indices.create({
      index: ADMIN_USERS_INDEX_NAME,
      mappings: {
        properties: {
          id: { type: 'keyword' },
          email: { type: 'keyword' },
          name: { type: 'text' },
          role: { type: 'keyword' },
          permissions: {
            type: 'object',
            properties: {
              canViewPayments: { type: 'boolean' },
              canViewSubscriptions: { type: 'boolean' },
              canManageShops: { type: 'boolean' },
              canManageTeam: { type: 'boolean' },
              canViewDocs: { type: 'boolean' },
            },
          },
          isActive: { type: 'boolean' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' },
        },
      },
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
      },
    });
  })();

  try {
    await ensureIndexPromise;
  } finally {
    ensureIndexPromise = null;
  }
}

function isUserRole(value: unknown): value is UserRole {
  return value === 'super_admin' || value === 'admin' || value === 'employee';
}

function toDisplayNameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

function determineRoleFromEmail(email: string): UserRole {
  const normalizedEmail = email.trim().toLowerCase();
  if (SUPER_ADMIN_EMAILS.has(normalizedEmail)) {
    return 'super_admin';
  }
  return 'employee';
}

function toUser(source: Partial<AdminUserDocument>, fallbackId: string): User {
  const role = isUserRole(source.role) ? source.role : 'employee';
  const email = (source.email || '').trim().toLowerCase();
  const permissions = {
    ...getDefaultPermissions(role),
    ...(source.permissions || {}),
  };
  const nowIso = new Date().toISOString();

  return {
    id: source.id || fallbackId,
    email,
    name: source.name || toDisplayNameFromEmail(email),
    role,
    permissions,
    isActive: source.isActive ?? true,
    createdAt: source.createdAt || nowIso,
    updatedAt: source.updatedAt || nowIso,
  };
}

async function resolveUserDocumentById(
  userId: string
): Promise<{ docId: string; user: User } | null> {
  const client = await getClient();

  try {
    const direct = await client.get<AdminUserDocument>({
      index: ADMIN_USERS_INDEX_NAME,
      id: userId,
    });

    if (direct.found && direct._source) {
      return {
        docId: direct._id,
        user: toUser(direct._source, direct._id),
      };
    }
  } catch (error: unknown) {
    const typedError = error as { meta?: { statusCode?: number } };
    if (typedError?.meta?.statusCode !== 404) {
      throw error;
    }
  }

  const searchResponse = await client.search<AdminUserDocument>({
    index: ADMIN_USERS_INDEX_NAME,
    body: {
      query: {
        term: {
          id: userId,
        },
      },
      size: 1,
    },
  });

  const hit = searchResponse.hits.hits[0];
  if (!hit?._source) {
    return null;
  }

  return {
    docId: hit._id ?? hit._source.id,
    user: toUser(hit._source, hit._id ?? hit._source.id),
  };
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const client = await getClient();

  const response = await client.search<AdminUserDocument>({
    index: ADMIN_USERS_INDEX_NAME,
    body: {
      query: {
        term: {
          email: normalizedEmail,
        },
      },
      size: 1,
    },
  });

  const hit = response.hits.hits[0];
  if (!hit?._source) {
    return null;
  }

  return toUser(hit._source, hit._id ?? hit._source.id);
}

export async function getUserById(id: string): Promise<User | null> {
  const record = await resolveUserDocumentById(id);
  return record?.user ?? null;
}

export async function getOrCreateUserByEmail(email: string): Promise<User> {
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await getUserByEmail(normalizedEmail);
  if (existingUser) {
    return existingUser;
  }

  const role = determineRoleFromEmail(normalizedEmail);
  const nowIso = new Date().toISOString();
  const newUser: User = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    name: toDisplayNameFromEmail(normalizedEmail),
    role,
    permissions: getDefaultPermissions(role),
    isActive: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const client = await getClient();
  await client.index({
    index: ADMIN_USERS_INDEX_NAME,
    id: newUser.id,
    document: newUser,
    refresh: 'wait_for',
  });

  return newUser;
}

export async function getAllUsers(): Promise<User[]> {
  const client = await getClient();
  const response = await client.search<AdminUserDocument>({
    index: ADMIN_USERS_INDEX_NAME,
    body: {
      query: { match_all: {} },
      size: 1000,
      sort: [
        {
          createdAt: {
            order: 'desc',
            unmapped_type: 'date',
          },
        },
        {
          email: {
            order: 'asc',
            unmapped_type: 'keyword',
          },
        },
      ],
    },
  });

  return response.hits.hits
    .map((hit) => {
      if (!hit._source) return null;
      return toUser(hit._source, hit._id ?? hit._source.id);
    })
    .filter((user): user is User => Boolean(user));
}

export async function createUser(
  userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>
): Promise<User> {
  const normalizedEmail = userData.email.trim().toLowerCase();
  const existingUser = await getUserByEmail(normalizedEmail);
  if (existingUser) {
    throw new Error(`User with email ${normalizedEmail} already exists`);
  }

  const nowIso = new Date().toISOString();
  const newUser: User = {
    ...userData,
    id: crypto.randomUUID(),
    email: normalizedEmail,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const client = await getClient();
  await client.index({
    index: ADMIN_USERS_INDEX_NAME,
    id: newUser.id,
    document: newUser,
    refresh: 'wait_for',
  });

  return newUser;
}

export async function updateUser(id: string, updates: Partial<User>): Promise<User | null> {
  const record = await resolveUserDocumentById(id);
  if (!record) {
    return null;
  }

  const current = record.user;
  const role = updates.role ?? current.role;
  const normalizedEmail = (updates.email ?? current.email).trim().toLowerCase();
  const mergedPermissions = {
    ...getDefaultPermissions(role),
    ...current.permissions,
    ...(updates.permissions || {}),
  };

  const updatedUser: User = {
    ...current,
    ...updates,
    id: current.id,
    email: normalizedEmail,
    role,
    permissions: mergedPermissions,
    updatedAt: new Date().toISOString(),
  };

  const client = await getClient();
  await client.index({
    index: ADMIN_USERS_INDEX_NAME,
    id: record.docId,
    document: updatedUser,
    refresh: 'wait_for',
  });

  return updatedUser;
}

export async function deleteUser(id: string): Promise<boolean> {
  const record = await resolveUserDocumentById(id);
  if (!record) {
    return false;
  }

  const client = await getClient();
  await client.delete({
    index: ADMIN_USERS_INDEX_NAME,
    id: record.docId,
    refresh: 'wait_for',
  });

  return true;
}

