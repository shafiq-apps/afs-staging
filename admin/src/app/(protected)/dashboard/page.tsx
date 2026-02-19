'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/components/providers';
import { hasPermission } from '@/lib/rbac';
import { Banner, Button, Card } from '@/components/ui';
import { formatDate } from '@/lib/string.utils';

interface DashboardOverviewPayload {
  success: boolean;
  generatedAt: string;
  permissions: {
    canManageShops: boolean;
    canViewSubscriptions: boolean;
    canManageSubscriptionPlans: boolean;
    canAccessTeam: boolean;
    canViewMonitoring: boolean;
  };
  stats: {
    totalShops: number | null;
    activeShops: number | null;
    uninstalledShops: number | null;
    deletedShops: number | null;
    legacyShops: number | null;
    totalSubscriptions: number | null;
    activeSubscriptions: number | null;
    paidActiveSubscriptions: number | null;
    estimatedMrr: number | null;
    estimatedArr: number | null;
    revenueCurrencyCode: string | null;
    subscriptionPlans: number | null;
    teamMembers: number | null;
    activeTeamMembers: number | null;
  };
  breakdowns: {
    subscriptionStatuses: Array<{ status: string; count: number }>;
    topPlanNames: Array<{ name: string; count: number }>;
  };
  recent: {
    shops: Array<{
      shop: string;
      state: string;
      installedAt?: string;
      lastAccessed?: string;
      uninstalledAt?: string;
      updatedAt?: string;
    }>;
    subscriptions: Array<{
      shop: string;
      name: string;
      status: string;
      test: boolean;
      createdAt?: string;
      updatedAt?: string;
    }>;
    team: Array<{
      id: string;
      email: string;
      name: string;
      role: string;
      isActive: boolean;
      lastActiveAt?: string;
      updatedAt?: string;
    }>;
  };
  warnings: string[];
}

function formatCount(value: number | null): string {
  if (typeof value !== 'number') {
    return '-';
  }
  return value.toLocaleString();
}

function formatMoney(amount: number | null, currencyCode: string | null): string {
  if (typeof amount !== 'number') {
    return '-';
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode || 'USD',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currencyCode || ''}`.trim();
  }
}

export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const [overview, setOverview] = useState<DashboardOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/dashboard/overview', {
        method: 'GET',
        cache: 'no-store',
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to fetch dashboard overview');
      }

      setOverview(payload as DashboardOverviewPayload);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error ? fetchError.message : 'Failed to fetch dashboard overview';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOverview();
    const intervalId = setInterval(() => {
      void fetchOverview();
    }, 60_000);

    return () => clearInterval(intervalId);
  }, [fetchOverview]);

  const statCards = useMemo(
    () => [
      {
        title: 'Total Shops',
        value: formatCount(overview?.stats.totalShops ?? null),
        subtitle:
          overview?.permissions.canManageShops && overview?.stats.activeShops !== null
            ? `${formatCount(overview?.stats.activeShops ?? null)} active`
            : 'No access',
        isVisible: overview?.permissions.canManageShops ?? false,
      },
      {
        title: 'Active Subscriptions',
        value: formatCount(overview?.stats.activeSubscriptions ?? null),
        subtitle:
          overview?.permissions.canViewSubscriptions &&
          overview?.stats.paidActiveSubscriptions !== null
            ? `${formatCount(overview?.stats.paidActiveSubscriptions ?? null)} paid`
            : 'No access',
        isVisible: overview?.permissions.canViewSubscriptions ?? false,
      },
      {
        title: 'Estimated MRR',
        value: formatMoney(
          overview?.stats.estimatedMrr ?? null,
          overview?.stats.revenueCurrencyCode ?? null
        ),
        subtitle:
          overview?.permissions.canViewSubscriptions && overview?.stats.estimatedArr !== null
            ? `ARR ${formatMoney(
                overview?.stats.estimatedArr ?? null,
                overview?.stats.revenueCurrencyCode ?? null
              )}`
            : 'No access',
        isVisible: overview?.permissions.canViewSubscriptions ?? false,
      },
      {
        title: 'Team Members',
        value: formatCount(overview?.stats.teamMembers ?? null),
        subtitle:
          overview?.permissions.canAccessTeam && overview?.stats.activeTeamMembers !== null
            ? `${formatCount(overview?.stats.activeTeamMembers ?? null)} active`
            : 'No access',
        isVisible: overview?.permissions.canAccessTeam ?? false,
      },
      {
        title: 'Subscription Plans',
        value: formatCount(overview?.stats.subscriptionPlans ?? null),
        subtitle:
          overview?.permissions.canManageSubscriptionPlans
            ? 'From app_subscription_plans'
            : 'No access',
        isVisible: overview?.permissions.canManageSubscriptionPlans ?? false,
      },
      {
        title: 'Legacy Shops',
        value: formatCount(overview?.stats.legacyShops ?? null),
        subtitle:
          overview?.permissions.canManageShops &&
          overview?.stats.uninstalledShops !== null &&
          overview?.stats.deletedShops !== null
            ? `${formatCount(overview?.stats.uninstalledShops ?? null)} uninstalled, ${formatCount(
                overview?.stats.deletedShops ?? null
              )} deleted`
            : 'No access',
        isVisible: overview?.permissions.canManageShops ?? false,
      },
    ],
    [overview]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {overview?.generatedAt
              ? `Synced ${formatDate(overview.generatedAt)} from Elasticsearch`
              : 'Live summary from Elasticsearch'}
          </p>
        </div>
        <Button onClick={() => void fetchOverview()} icon={RefreshCw} loading={loading}>
          Refresh
        </Button>
      </div>

      {error ? <Banner variant='error'>{error}</Banner> : null}
      {overview?.warnings?.map((warning) => (
        <Banner key={warning} variant='warning'>
          {warning}
        </Banner>
      ))}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {statCards.map((card) => (
          <Card key={card.title} className="p-6">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{card.title}</h3>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
              {card.isVisible ? card.value : 'N/A'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{card.subtitle}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Subscription Status Breakdown
          </h2>
          {!overview?.permissions.canViewSubscriptions ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">No access.</p>
          ) : overview.breakdowns.subscriptionStatuses.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">No subscription data.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {overview.breakdowns.subscriptionStatuses.map((item) => (
                <div key={item.status} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">{item.status}</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {item.count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Top Plan Names</h2>
          {!overview?.permissions.canViewSubscriptions ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">No access.</p>
          ) : overview.breakdowns.topPlanNames.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">No active plan usage yet.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {overview.breakdowns.topPlanNames.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">{item.name}</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {item.count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Recent Shops</h2>
            <Link href="/shops" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              View all
            </Link>
          </div>
          {!overview?.permissions.canManageShops ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">No access.</p>
          ) : overview.recent.shops.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">No shop records.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {overview.recent.shops.map((shop) => (
                <div key={shop.shop} className="border-b border-gray-100 dark:border-slate-700 pb-3">
                  <p className="font-medium text-gray-900 dark:text-gray-100">{shop.shop}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {shop.state || 'UNKNOWN'}
                    {shop.lastAccessed ? ` | Active ${formatDate(shop.lastAccessed)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Recent Subscriptions</h2>
            <Link
              href="/subscriptions"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              View all
            </Link>
          </div>
          {!overview?.permissions.canViewSubscriptions ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">No access.</p>
          ) : overview.recent.subscriptions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">No subscription records.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {overview.recent.subscriptions.map((subscription) => (
                <div
                  key={`${subscription.shop}-${subscription.name}`}
                  className="border-b border-gray-100 dark:border-slate-700 pb-3"
                >
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {subscription.name}
                    {subscription.test ? (
                      <span className="ml-2 text-xs text-yellow-600 dark:text-yellow-400">TEST</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {subscription.shop} | {subscription.status} |{' '}
                    {formatDate(subscription.updatedAt || subscription.createdAt || '')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Recently Active Team</h2>
            <Link href="/team" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              View all
            </Link>
          </div>
          {!overview?.permissions.canAccessTeam ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">No access.</p>
          ) : overview.recent.team.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">No team records.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {overview.recent.team.map((member) => (
                <div key={member.id} className="border-b border-gray-100 dark:border-slate-700 pb-3">
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {member.name || member.email}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {member.role.replace('_', ' ').toUpperCase()} |{' '}
                    {member.isActive ? 'ACTIVE' : 'DISABLED'} |{' '}
                    {formatDate(member.lastActiveAt || member.updatedAt || '')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {loading && !overview ? (
        <Card className="p-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading dashboard stats...</p>
        </Card>
      ) : null}

    </div>
  );
}
