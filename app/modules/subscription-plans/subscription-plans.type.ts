export type PlanInterval = 'EVERY_30_DAYS' | 'ANNUAL';

export interface Money {
  amount: number;
  currencyCode: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  handle: string; // pro, starter, enterprise
  productLimit: number;
  price: Money;
  interval: PlanInterval;
  test: boolean;
  createdAt: string;
  updatedAt?: string | null;
}

export interface CreatePlanInput {
  name: string;
  handle: string;
  productLimit: number;
  price: Money;
  interval: PlanInterval;
  test?: boolean;
}
