export interface Money {
  amount: number;
  currencyCode: string;
}

export enum AppSubscriptionStatus {
  ACTIVE = "ACTIVE",
  CANCELLED = "CANCELLED",
  DECLINED = "DECLINED",
  EXPIRED = "EXPIRED",
  FROZEN = "FROZEN",
  PENDING = "PENDING",
}


export interface ShopifyActiveSubscriptions {
  id: string;
  name: string;
  status: AppSubscriptionStatus
}

export interface Subscription {
  id: string;
  name: string;
  handle: string;
  status: string;
  description: string;
  productLimit: number;
  price: Money;
  interval: "EVERY_30_DAYS" | "ANNUAL";
}

export interface ProductsCount {
  count: number;
  precision: string;
}

export interface PricingLoaderData {
  subscriptionPlans: Subscription[];
  error: string | null;
  productsCount: ProductsCount;
  subscription: Subscription;
  activeSubscriptions: ShopifyActiveSubscriptions[]
}


// Optional: GraphQL action response
export interface SubscribePlanResponse {
  confirmationUrl?: string;
  error?: string;
}
