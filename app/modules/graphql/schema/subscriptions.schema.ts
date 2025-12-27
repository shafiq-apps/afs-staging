export const subscriptionSchema = `
  scalar JSON
  scalar URL

  type UserError {
    field: [String!]
    message: String!
  }

  enum AppSubscriptionReplacementBehavior {
    STANDARD
    REPLACE
    CANCEL
  }

  enum AppRecurringPricingInterval {
    EVERY_30_DAYS
    ANNUAL
  }

  # -------------------
  # Money & Pricing
  # -------------------

  type Money {
    amount: Float!
    currencyCode: String!
  }

  input MoneyInput {
    amount: Float!
    currencyCode: String!
  }

  input AppRecurringPricingDetailsInput {
    interval: AppRecurringPricingInterval!
    price: MoneyInput!
  }

  input AppSubscriptionPlanInput {
    appRecurringPricingDetails: AppRecurringPricingDetailsInput
  }

  input AppSubscriptionLineItemInput {
    plan: AppSubscriptionPlanInput!
  }

  # -------------------
  # Shopify Types
  # -------------------

  type AppPlan {
    pricingDetails: JSON
  }

  type AppSubscriptionLineItem {
    id: ID!
    plan: AppPlan!
  }

  type AppSubscription {
    id: ID!
    name: String!
    status: String
    createdAt: String
    updatedAt: String
    lineItems: [AppSubscriptionLineItem!]!
  }

  type AppSubscriptionCreatePayload {
    userErrors: [UserError!]!
    appSubscription: AppSubscription
    confirmationUrl: URL
  }

  # -------------------
  # Stored Subscription (ES)
  # -------------------

  type StoredSubscriptionLineItem {
    id: ID!
    pricingDetails: JSON
  }

  type StoredSubscription {
    id: ID!
    shopifySubscriptionId: ID!
    name: String!
    status: String!
    confirmationUrl: URL
    test: Boolean!
    lineItems: [StoredSubscriptionLineItem!]!
    createdAt: String!
    updatedAt: String
  }

  type SubscriptionPlan {
    id: ID!
    name: String!
    handle: String!
    description: String
    productLimit: Int!
    price: Money!
    interval: AppRecurringPricingInterval!
    test: Boolean!
    createdAt: String!
    updatedAt: String
  }

  input CreateSubscriptionPlanInput {
    name: String!
    handle: String!
    description: String
    productLimit: Int!
    price: MoneyInput!
    interval: AppRecurringPricingInterval!
    test: Boolean
  }

  # -------------------
  # Queries & Mutations
  # -------------------

  type Query {
    subscription: SubscriptionPlan!
    subscriptionPlans: [SubscriptionPlan!]!
    subscriptionPlan(id: ID!): SubscriptionPlan
  }

  type Mutation {
    appSubscriptionCreate(
      name: String!
      returnUrl: URL!
      lineItems: [AppSubscriptionLineItemInput!]!
      trialDays: Int
      test: Boolean
      replacementBehavior: AppSubscriptionReplacementBehavior
    ): AppSubscriptionCreatePayload!

    updateSubscriptionStatus(id: String!): StoredSubscription!
    createSubscriptionPlan(input: CreateSubscriptionPlanInput!): SubscriptionPlan!
    deleteSubscriptionPlan(id: String!): Boolean!
  }
`;