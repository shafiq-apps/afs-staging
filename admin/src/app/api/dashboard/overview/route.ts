import { NextRequest, NextResponse } from 'next/server';
import { getESClient } from '@/lib/elasticsearch';
import {
  ADMIN_USERS_INDEX_NAME,
  LEGACY_SHOPS_INDEX_NAME,
  SHOPS_INDEX_NAME,
  SUBSCRIPTIONS_INDEX_NAME,
  SUBSCRIPTION_PLANS_INDEX_NAME,
} from '@/lib/es.constants';
import { requireAuthenticatedUser } from '@/lib/api-auth';
import { canAccessTeamManagement, hasPermission } from '@/lib/rbac';

type Interval = 'EVERY_30_DAYS' | 'ANNUAL';

interface SearchHit<TSource> {
  _id: string;
  _source?: TSource;
  sort?: unknown[];
}

interface SearchResult<TSource> {
  total: number;
  hits: Array<SearchHit<TSource>>;
}

interface MoneyLike {
  amount: number;
  currencyCode: string;
}

interface RecurringCharge extends MoneyLike {
  interval: Interval;
}

interface SubscriptionLineItemDoc {
  id?: string;
  pricingDetails?: unknown;
  plan?: {
    pricingDetails?: unknown;
  } | null;
}

interface SubscriptionDoc {
  name?: string;
  status?: string;
  test?: boolean;
  lineItems?: SubscriptionLineItemDoc[];
  createdAt?: string;
  updatedAt?: string;
}

interface SubscriptionPlanDoc {
  name?: string;
  handle?: string;
  interval?: string;
  test?: boolean;
  price?: {
    amount?: number | string;
    currencyCode?: string;
  };
}

interface RecentShopRecord {
  shop?: string;
  state?: string;
  installedAt?: string;
  lastAccessed?: string;
  uninstalledAt?: string;
  updatedAt?: string;
}

interface RecentTeamRecord {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
  isActive?: boolean;
  lastActiveAt?: string;
  updatedAt?: string;
}

interface RevenueSummary {
  estimatedMrr: number;
  estimatedArr: number;
  paidActiveSubscriptions: number;
  unresolvedSubscriptions: number;
  currencyCode: string | null;
  topPlanNames: Array<{ name: string; count: number }>;
}

function isIndexNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const typed = error as {
    meta?: {
      statusCode?: number;
      body?: { error?: { type?: string } };
    };
  };

  return (
    typed.meta?.statusCode === 404 ||
    typed.meta?.body?.error?.type === 'index_not_found_exception'
  );
}

function parseCountResponseCount(response: unknown): number {
  if (!response || typeof response !== 'object') {
    return 0;
  }

  const count = (response as { count?: unknown }).count;
  return typeof count === 'number' ? count : 0;
}

function parseSearchTotal(response: unknown): number {
  if (!response || typeof response !== 'object') {
    return 0;
  }

  const hits = (response as { hits?: { total?: unknown } }).hits;
  const total = hits?.total;

  if (typeof total === 'number') {
    return total;
  }

  if (total && typeof total === 'object') {
    const value = (total as { value?: unknown }).value;
    return typeof value === 'number' ? value : 0;
  }

  return 0;
}

function parseSearchHits<TSource>(response: unknown): Array<SearchHit<TSource>> {
  if (!response || typeof response !== 'object') {
    return [];
  }

  const hits = (response as { hits?: { hits?: unknown } }).hits?.hits;
  if (!Array.isArray(hits)) {
    return [];
  }

  return hits as Array<SearchHit<TSource>>;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toLowerText(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeInterval(value: unknown): Interval | null {
  const normalized = toLowerText(value);

  if (!normalized) {
    return null;
  }

  if (
    normalized === 'annual' ||
    normalized === 'yearly' ||
    normalized === 'every_365_days'
  ) {
    return 'ANNUAL';
  }

  if (
    normalized === 'every_30_days' ||
    normalized === 'monthly' ||
    normalized === 'month' ||
    normalized === 'every_30_day'
  ) {
    return 'EVERY_30_DAYS';
  }

  return null;
}

function parseMoneyFromCandidate(candidate: unknown): MoneyLike | null {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const typed = candidate as { amount?: unknown; currencyCode?: unknown };
  const amount = toNumber(typed.amount);
  const currencyCode = typeof typed.currencyCode === 'string' ? typed.currencyCode : null;

  if (amount === null || !currencyCode) {
    return null;
  }

  return {
    amount,
    currencyCode,
  };
}

function extractRecurringCharge(payload: unknown): RecurringCharge | null {
  const queue: unknown[] = [payload];
  const visited = new Set<object>();

  while (queue.length > 0) {
    const current = queue.shift();

    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }

    if (!current || typeof current !== 'object') {
      continue;
    }

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    const typed = current as Record<string, unknown>;
    const interval =
      normalizeInterval(typed.interval) ||
      normalizeInterval(typed.billingInterval) ||
      normalizeInterval(typed.planInterval);
    const money =
      parseMoneyFromCandidate(typed.price) ||
      parseMoneyFromCandidate(typed.recurringPrice) ||
      parseMoneyFromCandidate(typed.amount);

    if (interval && money) {
      return {
        ...money,
        interval,
      };
    }

    for (const value of Object.values(typed)) {
      queue.push(value);
    }
  }

  return null;
}

function normalizeSubscriptionStatus(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return 'UNKNOWN';
  }
  return value.trim().toUpperCase();
}

function normalizePlanName(value: unknown): string {
  if (typeof value !== 'string') {
    return 'Unknown Plan';
  }
  const trimmed = value.trim();
  return trimmed || 'Unknown Plan';
}

function normalizePlanLookupKey(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

async function safeCount(
  esClient: ReturnType<typeof getESClient>,
  index: string,
  query?: Record<string, unknown>
): Promise<number> {
  try {
    const requestBody: Record<string, unknown> = { index };
    if (query) {
      requestBody.query = query;
    }

    const response = await esClient.count(requestBody as never);
    return parseCountResponseCount(response);
  } catch (error: unknown) {
    if (isIndexNotFoundError(error)) {
      return 0;
    }
    throw error;
  }
}

async function safeSearch<TSource>(
  esClient: ReturnType<typeof getESClient>,
  request: Record<string, unknown>
): Promise<SearchResult<TSource>> {
  try {
    const response = await esClient.search(request as never);
    return {
      total: parseSearchTotal(response),
      hits: parseSearchHits<TSource>(response),
    };
  } catch (error: unknown) {
    if (isIndexNotFoundError(error)) {
      return { total: 0, hits: [] };
    }
    throw error;
  }
}

async function buildSubscriptionPlanLookup(
  esClient: ReturnType<typeof getESClient>
): Promise<Map<string, RecurringCharge>> {
  const lookup = new Map<string, RecurringCharge>();

  const result = await safeSearch<SubscriptionPlanDoc>(esClient, {
    index: SUBSCRIPTION_PLANS_INDEX_NAME,
    size: 1000,
    query: { match_all: {} },
    _source: ['name', 'handle', 'interval', 'test', 'price.amount', 'price.currencyCode'],
    sort: [{ createdAt: { order: 'desc', missing: '_last' } }],
  });

  for (const hit of result.hits) {
    const source = hit._source;
    if (!source || source.test) {
      continue;
    }

    const amount = toNumber(source.price?.amount);
    const currencyCode = source.price?.currencyCode;
    const interval = normalizeInterval(source.interval);

    if (amount === null || !currencyCode || !interval) {
      continue;
    }

    const entry: RecurringCharge = {
      amount,
      currencyCode,
      interval,
    };

    const nameKey = normalizePlanLookupKey(source.name);
    if (nameKey && !lookup.has(nameKey)) {
      lookup.set(nameKey, entry);
    }

    const handleKey = normalizePlanLookupKey(source.handle);
    if (handleKey && !lookup.has(handleKey)) {
      lookup.set(handleKey, entry);
    }
  }

  return lookup;
}

async function fetchActiveSubscriptions(
  esClient: ReturnType<typeof getESClient>,
  limit: number = 10000
): Promise<Array<SearchHit<SubscriptionDoc>>> {
  const size = Math.min(Math.max(limit, 1), 10000);
  const queryResult = await safeSearch<SubscriptionDoc>(esClient, {
    index: SUBSCRIPTIONS_INDEX_NAME,
    size,
    query: {
      bool: {
        should: [
          { term: { status: 'ACTIVE' } },
          { term: { status: 'active' } },
        ],
        minimum_should_match: 1,
      },
    },
    _source: ['name', 'status', 'test', 'lineItems', 'createdAt', 'updatedAt'],
    sort: [
      { updatedAt: { order: 'desc', missing: '_last', unmapped_type: 'date' } },
      { createdAt: { order: 'desc', missing: '_last', unmapped_type: 'date' } },
    ],
  });

  return queryResult.hits;
}

function calculateRevenueFromSubscriptions(
  activeSubscriptionHits: Array<SearchHit<SubscriptionDoc>>,
  planLookup: Map<string, RecurringCharge>
): RevenueSummary {
  let estimatedMrr = 0;
  let estimatedArr = 0;
  let paidActiveSubscriptions = 0;
  let unresolvedSubscriptions = 0;
  let currencyCode: string | null = null;
  const planCountMap = new Map<string, number>();

  for (const hit of activeSubscriptionHits) {
    const source = hit._source || {};
    const isTest = source.test === true;
    const planName = normalizePlanName(source.name);
    planCountMap.set(planName, (planCountMap.get(planName) || 0) + 1);

    if (isTest) {
      continue;
    }

    paidActiveSubscriptions += 1;

    const lineItems = Array.isArray(source.lineItems) ? source.lineItems : [];
    const extractedCharges: RecurringCharge[] = [];

    for (const lineItem of lineItems) {
      const pricingPayload = lineItem?.pricingDetails ?? lineItem?.plan?.pricingDetails;
      const charge = extractRecurringCharge(pricingPayload);
      if (charge) {
        extractedCharges.push(charge);
      }
    }

    const fallbackCharge = planLookup.get(normalizePlanLookupKey(source.name));
    const charges = extractedCharges.length > 0 ? extractedCharges : fallbackCharge ? [fallbackCharge] : [];

    if (charges.length === 0) {
      unresolvedSubscriptions += 1;
      continue;
    }

    for (const charge of charges) {
      if (!currencyCode) {
        currencyCode = charge.currencyCode;
      }

      if (charge.interval === 'ANNUAL') {
        estimatedArr += charge.amount;
        estimatedMrr += charge.amount / 12;
      } else {
        estimatedMrr += charge.amount;
        estimatedArr += charge.amount * 12;
      }
    }
  }

  const topPlanNames = Array.from(planCountMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    estimatedMrr: Math.round(estimatedMrr * 100) / 100,
    estimatedArr: Math.round(estimatedArr * 100) / 100,
    paidActiveSubscriptions,
    unresolvedSubscriptions,
    currencyCode,
    topPlanNames,
  };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user } = authResult;
    const esClient = getESClient();

    const canManageShops = hasPermission(user, 'canManageShops');
    const canViewSubscriptions = hasPermission(user, 'canViewSubscriptions');
    const canManageSubscriptionPlans = hasPermission(user, 'canManageSubscriptionPlans');
    const canAccessTeam = canAccessTeamManagement(user);
    const canViewMonitoring = hasPermission(user, 'canViewMonitoring');

    const warnings: string[] = [];

    const shopStatsPromise = canManageShops
      ? Promise.all([
          safeCount(esClient, SHOPS_INDEX_NAME),
          safeCount(esClient, SHOPS_INDEX_NAME, {
            bool: {
              must: [{ exists: { field: 'installedAt' } }],
              must_not: [{ exists: { field: 'uninstalledAt' } }, { exists: { field: 'isDeleted' } }],
            },
          }),
          safeCount(esClient, SHOPS_INDEX_NAME, { exists: { field: 'uninstalledAt' } }),
          safeCount(esClient, SHOPS_INDEX_NAME, { exists: { field: 'isDeleted' } }),
          safeCount(esClient, LEGACY_SHOPS_INDEX_NAME),
          safeSearch<RecentShopRecord>(esClient, {
            index: SHOPS_INDEX_NAME,
            size: 5,
            query: { match_all: {} },
            _source: ['shop', 'state', 'installedAt', 'lastAccessed', 'uninstalledAt', 'updatedAt'],
            sort: [
              { lastAccessed: { order: 'desc', missing: '_last', unmapped_type: 'date' } },
              { installedAt: { order: 'desc', missing: '_last', unmapped_type: 'date' } },
            ],
          }),
        ])
      : Promise.resolve([null, null, null, null, null, { total: 0, hits: [] } as SearchResult<RecentShopRecord>]);

    const subscriptionStatsPromise = canViewSubscriptions
      ? Promise.all([
          safeCount(esClient, SUBSCRIPTIONS_INDEX_NAME),
          safeCount(esClient, SUBSCRIPTIONS_INDEX_NAME, {
            bool: {
              should: [{ term: { status: 'ACTIVE' } }, { term: { status: 'active' } }],
              minimum_should_match: 1,
            },
          }),
          safeSearch<SubscriptionDoc>(esClient, {
            index: SUBSCRIPTIONS_INDEX_NAME,
            size: 5,
            query: { match_all: {} },
            _source: ['name', 'status', 'test', 'createdAt', 'updatedAt'],
            sort: [
              { updatedAt: { order: 'desc', missing: '_last', unmapped_type: 'date' } },
              { createdAt: { order: 'desc', missing: '_last', unmapped_type: 'date' } },
            ],
          }),
        ])
      : Promise.resolve([null, null, { total: 0, hits: [] } as SearchResult<SubscriptionDoc>]);

    const planStatsPromise = canManageSubscriptionPlans
      ? safeCount(esClient, SUBSCRIPTION_PLANS_INDEX_NAME)
      : Promise.resolve(null);

    const teamStatsPromise = canAccessTeam
      ? Promise.all([
          safeCount(esClient, ADMIN_USERS_INDEX_NAME),
          safeCount(esClient, ADMIN_USERS_INDEX_NAME, { term: { isActive: true } }),
          safeSearch<RecentTeamRecord>(esClient, {
            index: ADMIN_USERS_INDEX_NAME,
            size: 5,
            query: { match_all: {} },
            _source: ['id', 'email', 'name', 'role', 'isActive', 'lastActiveAt', 'updatedAt'],
            sort: [
              { lastActiveAt: { order: 'desc', missing: '_last', unmapped_type: 'date' } },
              { updatedAt: { order: 'desc', missing: '_last', unmapped_type: 'date' } },
            ],
          }),
        ])
      : Promise.resolve([null, null, { total: 0, hits: [] } as SearchResult<RecentTeamRecord>]);

    const [shopStats, subscriptionStats, subscriptionPlansCount, teamStats] = await Promise.all([
      shopStatsPromise,
      subscriptionStatsPromise,
      planStatsPromise,
      teamStatsPromise,
    ]);

    const [
      totalShops,
      activeShops,
      uninstalledShops,
      deletedShops,
      legacyShops,
      recentShopsResult,
    ] = shopStats;
    const [totalSubscriptions, activeSubscriptions, recentSubscriptionsResult] = subscriptionStats;
    const [teamMembers, activeTeamMembers, recentTeamResult] = teamStats;

    const safeRecentShopsResult =
      recentShopsResult ||
      ({ total: 0, hits: [] as Array<SearchHit<RecentShopRecord>> } as SearchResult<RecentShopRecord>);
    const safeRecentSubscriptionsResult =
      recentSubscriptionsResult ||
      ({ total: 0, hits: [] as Array<SearchHit<SubscriptionDoc>> } as SearchResult<SubscriptionDoc>);
    const safeRecentTeamResult =
      recentTeamResult ||
      ({ total: 0, hits: [] as Array<SearchHit<RecentTeamRecord>> } as SearchResult<RecentTeamRecord>);

    let revenue: RevenueSummary | null = null;
    if (canViewSubscriptions) {
      const [planLookup, activeSubscriptionHits] = await Promise.all([
        buildSubscriptionPlanLookup(esClient),
        fetchActiveSubscriptions(esClient),
      ]);

      revenue = calculateRevenueFromSubscriptions(activeSubscriptionHits, planLookup);
      if (revenue.unresolvedSubscriptions > 0) {
        warnings.push(
          `Revenue estimate could not resolve pricing for ${revenue.unresolvedSubscriptions} active subscription(s).`
        );
      }
    }

    const subscriptionStatuses: Array<{ status: string; count: number }> = [];
    if (canViewSubscriptions) {
      const statusSampleSize = 10000;
      const statusSampleResult = await safeSearch<{ status?: string }>(esClient, {
        index: SUBSCRIPTIONS_INDEX_NAME,
        size: statusSampleSize,
        query: { match_all: {} },
        _source: ['status'],
      });

      const statusCounts = new Map<string, number>();
      for (const hit of statusSampleResult.hits) {
        const normalizedStatus = normalizeSubscriptionStatus(hit._source?.status);
        statusCounts.set(normalizedStatus, (statusCounts.get(normalizedStatus) || 0) + 1);
      }

      for (const [status, count] of statusCounts.entries()) {
        subscriptionStatuses.push({ status, count });
      }

      subscriptionStatuses.sort((a, b) => b.count - a.count);

      const sampledTotal = statusSampleResult.hits.length;
      const knownTotal = typeof totalSubscriptions === 'number' ? totalSubscriptions : sampledTotal;
      if (knownTotal > sampledTotal) {
        warnings.push(
          `Status breakdown sampled ${sampledTotal.toLocaleString()} of ${knownTotal.toLocaleString()} subscriptions.`
        );
      }
    }

    const recentShops = safeRecentShopsResult.hits.map((hit) => ({
      shop: hit._source?.shop || hit._id,
      state: hit._source?.state || 'UNKNOWN',
      installedAt: hit._source?.installedAt,
      lastAccessed: hit._source?.lastAccessed,
      uninstalledAt: hit._source?.uninstalledAt,
      updatedAt: hit._source?.updatedAt,
    }));

    const recentSubscriptions = safeRecentSubscriptionsResult.hits.map((hit) => ({
      shop: hit._id,
      name: hit._source?.name || 'Unknown',
      status: normalizeSubscriptionStatus(hit._source?.status),
      test: Boolean(hit._source?.test),
      createdAt: hit._source?.createdAt,
      updatedAt: hit._source?.updatedAt,
    }));

    const recentTeam = safeRecentTeamResult.hits.map((hit) => ({
      id: hit._source?.id || hit._id,
      email: hit._source?.email || '',
      name: hit._source?.name || '',
      role: hit._source?.role || 'employee',
      isActive: hit._source?.isActive !== false,
      lastActiveAt: hit._source?.lastActiveAt,
      updatedAt: hit._source?.updatedAt,
    }));

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      permissions: {
        canManageShops,
        canViewSubscriptions,
        canManageSubscriptionPlans,
        canAccessTeam,
        canViewMonitoring,
      },
      stats: {
        totalShops,
        activeShops,
        uninstalledShops,
        deletedShops,
        legacyShops,
        totalSubscriptions,
        activeSubscriptions,
        paidActiveSubscriptions: revenue?.paidActiveSubscriptions ?? null,
        estimatedMrr: revenue?.estimatedMrr ?? null,
        estimatedArr: revenue?.estimatedArr ?? null,
        revenueCurrencyCode: revenue?.currencyCode ?? null,
        subscriptionPlans: subscriptionPlansCount,
        teamMembers,
        activeTeamMembers,
      },
      breakdowns: {
        subscriptionStatuses,
        topPlanNames: revenue?.topPlanNames || [],
      },
      recent: {
        shops: recentShops,
        subscriptions: recentSubscriptions,
        team: recentTeam,
      },
      warnings,
      meta: {
        source: 'elasticsearch',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch dashboard overview';
    console.error('[dashboard/overview] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
