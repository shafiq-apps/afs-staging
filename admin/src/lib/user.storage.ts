import { User, UserRole, UserPermissions } from '@/types/auth';

// In-memory user storage (temporary - will use Elasticsearch later)
const usersStore = new Map<string, User>();

// Initialize with super admin
function initializeSuperAdmin(): void {
  const superAdminEmail = 'admin@digitalcoo.com';
  if (!usersStore.has(superAdminEmail.toLowerCase())) {
    const superAdmin: User = {
      id: '1',
      email: superAdminEmail,
      name: 'Super Admin',
      role: 'super_admin',
      permissions: getDefaultPermissions('super_admin'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
    };
    usersStore.set(superAdminEmail.toLowerCase(), superAdmin);
  }
}

// Initialize on module load
initializeSuperAdmin();

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
  // Default to employee for new users
  return 'employee';
}

// Get or create user by email
export function getOrCreateUserByEmail(email: string): User {
  const emailLower = email.toLowerCase();
  let user = usersStore.get(emailLower);

  if (!user) {
    // Create new user automatically
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
    console.log(`Created new user: ${email} with role: ${role}`);
  }

  return user;
}

export function getUserByEmail(email: string): User | null {
  const emailLower = email.toLowerCase();
  return usersStore.get(emailLower) || null;
}

export function getUserById(id: string): User | null {
  for (const user of usersStore.values()) {
    if (user.id === id) {
      return user;
    }
  }
  return null;
}

export function getAllUsers(): User[] {
  return Array.from(usersStore.values());
}

export function createUser(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): User {
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

export function updateUser(id: string, updates: Partial<User>): User | null {
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

export function deleteUser(id: string): boolean {
  for (const [email, user] of usersStore.entries()) {
    if (user.id === id) {
      usersStore.delete(email);
      return true;
    }
  }
  return false;
}

