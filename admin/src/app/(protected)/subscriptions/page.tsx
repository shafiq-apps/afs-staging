'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { LoadingBar } from '@/components/ui/LoadingBar';
import Input from '@/components/ui/Input';
import { RefreshCw, Search } from 'lucide-react';

interface SubscriptionLineItem {
  id: string;
  pricingDetails?: unknown;
}

interface SubscriptionRecord {
  id: string;
  shop: string;
  shopifySubscriptionId: string;
  name: string;
  status: string;
  confirmationUrl?: string | null;
  test?: boolean;
  lineItems?: SubscriptionLineItem[];
  createdAt: string;
  updatedAt?: string | null;
}

const formatDateTime = (value?: string | null): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingShop, setSyncingShop] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterShop, setFilterShop] = useState('');

  const filteredSubscriptions = useMemo(() => {
    const value = filterShop.trim().toLowerCase();
    if (!value) return subscriptions;
    return subscriptions.filter((subscription) => subscription.shop.toLowerCase().includes(value));
  }, [filterShop, subscriptions]);

  const fetchSubscriptions = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/subscriptions?limit=200&offset=0');
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to fetch subscriptions');
      }

      const data = await response.json();
      setSubscriptions(Array.isArray(data?.subscriptions) ? data.subscriptions : []);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Failed to fetch subscriptions';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const syncSubscriptionStatus = async (subscription: SubscriptionRecord): Promise<void> => {
    try {
      setSyncingShop(subscription.shop);
      setError(null);

      const response = await fetch('/api/subscriptions/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shop: subscription.shop,
          shopifySubscriptionId: subscription.shopifySubscriptionId,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to sync subscription status');
      }

      const data = await response.json();
      const updated = data?.subscription as SubscriptionRecord | undefined;
      if (!updated) {
        throw new Error('No subscription returned from sync operation');
      }

      setSubscriptions((prev) =>
        prev.map((item) => (item.shop === updated.shop ? { ...item, ...updated } : item))
      );
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Failed to sync subscription status';
      setError(message);
    } finally {
      setSyncingShop(null);
    }
  };

  useEffect(() => {
    void fetchSubscriptions();
  }, []);

  if (loading) {
    return (
      <>
        <LoadingBar loading={true} />
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500 dark:text-gray-400">Loading subscriptions...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Subscriptions</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage Shopify app subscriptions stored in `app_subscriptions`
            </p>
          </div>

          <button
            onClick={() => void fetchSubscriptions()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/90 hover:bg-purple-600 text-white transition-colors duration-200 shadow-md shadow-purple-500/20 hover:shadow-purple-500/30 cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <Input
            type="text"
            value={filterShop}
            onChange={(event) => setFilterShop(event.target.value)}
            placeholder="Filter by shop domain..."
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-slate-800 rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Showing {filteredSubscriptions.length} subscription{filteredSubscriptions.length === 1 ? '' : 's'}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
              <thead className="bg-gray-50 dark:bg-slate-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Shop
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Shopify Subscription ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Updated
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                {filteredSubscriptions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
                      No subscriptions found.
                    </td>
                  </tr>
                ) : (
                  filteredSubscriptions.map((subscription) => (
                    <tr key={`${subscription.shop}-${subscription.shopifySubscriptionId}`}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <Link
                          href={`/shops/${encodeURIComponent(subscription.shop)}`}
                          className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                        >
                          {subscription.shop}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {subscription.name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                          {subscription.status || 'UNKNOWN'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400 break-all">
                        {subscription.shopifySubscriptionId || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {formatDateTime(subscription.updatedAt || subscription.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => void syncSubscriptionStatus(subscription)}
                          disabled={syncingShop === subscription.shop}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/90 hover:bg-indigo-600 disabled:opacity-60 text-white text-xs font-medium cursor-pointer"
                        >
                          {syncingShop === subscription.shop ? (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              Syncing...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-3.5 w-3.5" />
                              Sync Status
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

