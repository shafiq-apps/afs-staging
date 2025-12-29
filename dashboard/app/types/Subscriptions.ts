export interface Money {
  amount: number;
  currencyCode: string;
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
  subscription: Subscription
}


// Optional: GraphQL action response
export interface SubscribePlanResponse {
  confirmationUrl?: string;
  error?: string;
}
