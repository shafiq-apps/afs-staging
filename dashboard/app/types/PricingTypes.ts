// PricingTypes.ts

export interface Money {
  amount: number;
  currencyCode: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  handle: string;
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
  plans: SubscriptionPlan[];
  subscriptionPlan: SubscriptionPlan | null;
  productsCount: ProductsCount | null;
  error: string | null;
}

// Optional: GraphQL action response
export interface SubscribePlanResponse {
  confirmationUrl?: string;
  error?: string;
}

// Pricing context state
export interface PricingContextState {
  plans: SubscriptionPlan[];
  subscriptionPlan: SubscriptionPlan | null;
  productsCount: ProductsCount | null;
  selectedPlanId: string | null;
  setSelectedPlanId: (planId: string | null) => void;
  error: string | null;
  setError: (error: string | null) => void;
}
