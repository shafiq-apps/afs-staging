// -------------------
// Scalars
// -------------------

export type JSONValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JSONValue }
  | JSONValue[];

export type URLString = string;

// -------------------
// Enums
// -------------------

export enum AppSubscriptionReplacementBehavior {
  STANDARD = 'STANDARD',
  REPLACE = 'REPLACE',
  CANCEL = 'CANCEL',
}

export enum AppRecurringPricingInterval {
  EVERY_30_DAYS = 'EVERY_30_DAYS',
  ANNUAL = 'ANNUAL',
}

// -------------------
// Common Types
// -------------------

export interface UserError {
  field?: string[];
  message: string;
}

// -------------------
// Money & Pricing
// -------------------

export interface Money {
  amount: number;
  currencyCode: string;
}

export interface MoneyInput {
  amount: number;
  currencyCode: string;
}

export interface AppRecurringPricingDetailsInput {
  interval: AppRecurringPricingInterval;
  price: MoneyInput;
}

export interface AppSubscriptionPlanInput {
  appRecurringPricingDetails?: AppRecurringPricingDetailsInput;
}

export interface AppSubscriptionLineItemInput {
  plan: AppSubscriptionPlanInput;
}

// -------------------
// Shopify Types
// -------------------

export interface AppPlan {
  pricingDetails?: JSONValue;
}

export interface AppSubscriptionLineItem {
  id: string;
  plan: AppPlan;
}

export interface AppSubscription {
  id: string;
  name: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  lineItems: AppSubscriptionLineItem[];
}

export interface AppSubscriptionCreatePayload {
  userErrors: UserError[];
  appSubscription?: AppSubscription | null;
  confirmationUrl?: URLString | null;
}

// -------------------
// Stored Subscription (ES)
// -------------------

export interface StoredSubscriptionLineItem {
  id: string;
  pricingDetails?: JSONValue;
}

export interface StoredSubscription {
  id: string; // internal ES id
  shop: string;
  shopifySubscriptionId: string;
  name: string;
  status: string;
  confirmationUrl?: URLString | null;
  test: boolean;
  lineItems: StoredSubscriptionLineItem[];
  createdAt: string;
  updatedAt?: string | null;
}

// -------------------
// Query & Mutation Args
// -------------------

export interface SubscriptionQueryArgs {
  shop: string;
  id: string;
}

export interface SubscriptionsQueryArgs {
  shop: string;
}

export interface AppSubscriptionCreateArgs {
  name: string;
  returnUrl: URLString;
  lineItems: AppSubscriptionLineItemInput[];
  trialDays?: number;
  test?: boolean;
  replacementBehavior?: AppSubscriptionReplacementBehavior;
}

export interface GraphQLResponse<T = StoredSubscription> {
  status: string;
  data?: T;
  errors?: Array<{ code?: string; message?: string; field?: string }>;
}