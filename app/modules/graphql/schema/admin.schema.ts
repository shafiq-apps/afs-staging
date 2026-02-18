/**
 * Admin GraphQL Schema
 * Schema definitions for admin panel operations
 * Note: Uses existing Shop, Subscription, and SubscriptionPlan types from other schemas
 */

export const adminSchema = `
  type AdminUserPermissions {
    canViewSubscriptions: Boolean!
    canManageSubscriptionPlans: Boolean!
    canManageShops: Boolean!
    canViewMonitoring: Boolean!
    canManageTeam: Boolean!
  }

  enum AdminUserRole {
    super_admin
    admin
    employee
  }

  type AdminUser {
    id: ID!
    email: String!
    name: String!
    role: AdminUserRole!
    permissions: AdminUserPermissions!
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  input AdminUserPermissionsInput {
    canViewSubscriptions: Boolean
    canManageSubscriptionPlans: Boolean
    canManageShops: Boolean
    canViewMonitoring: Boolean
    canManageTeam: Boolean
  }

  input CreateAdminUserInput {
    email: String!
    name: String!
    role: AdminUserRole!
    permissions: AdminUserPermissionsInput
    isActive: Boolean
  }

  input UpdateAdminUserInput {
    name: String
    role: AdminUserRole
    permissions: AdminUserPermissionsInput
    isActive: Boolean
  }

  type AdminUserWithCredentials {
    user: AdminUser!
    apiKey: String!
    apiSecret: String!
  }

  type Query {
    adminUsers: [AdminUser!]!
    adminUser(id: ID!): AdminUser
    adminUserByEmail(email: String!): AdminUser
    adminShops(limit: Int, offset: Int): [Shop!]!
    adminShop(shop: String!): Shop
    adminSubscriptions(limit: Int, offset: Int): [StoredSubscription!]!
    adminSubscription(id: ID!): StoredSubscription
    adminSubscriptionPlans(limit: Int, offset: Int): [SubscriptionPlan!]!
    adminSubscriptionPlan(id: ID!): SubscriptionPlan
  }

  type Mutation {
    createAdminUser(input: CreateAdminUserInput!): AdminUserWithCredentials
    updateAdminUser(id: ID!, input: UpdateAdminUserInput!): AdminUser!
    deleteAdminUser(id: ID!): Boolean!
    regenerateAdminUserApiCredentials(id: ID!): AdminUserWithCredentials!
    updateAdminShop(shop: String!, input: JSON!): Shop!
    updateAdminSubscription(id: ID!, input: JSON!): StoredSubscription!
  }
`;

