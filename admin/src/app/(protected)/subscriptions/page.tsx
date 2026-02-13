'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { LoadingBar } from '@/components/ui/LoadingBar';
import Input from '@/components/ui/Input';
import { RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui';
import { formatDate, normalizeShopifyId } from '@/lib/string.utils';
import Page from '@/components/ui/Page';

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

  const fetchSubscriptions = async (initial: boolean = false): Promise<void> => {
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
    <Page
      title='Subscriptions'
      description='Manage Shopify app subscriptions stored in `app_subscriptions`'
      actions={[
        {
          label: "Refresh",
          onClick: () => void fetchSubscriptions(),
          icon: RefreshCw
        }
      ]}
    >
      <Input
        type="text"
        value={filterShop}
        onChange={(event) => setFilterShop(event.target.value)}
        placeholder="Filter by shop domain..."
        leftIcon={<Search className="h-4 w-4" />}
      />

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

        <div>
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
                  Plan
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Shopify ID
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
                        <div>{subscription.shop}</div>
                        <div className="text-xs font-sm text-gray-500 dark:text-gray-400 gap-2 flex flex-columns">
                          <span className='inline-block'>Created: {formatDate(subscription.createdAt)}</span>
                          {
                            subscription.updatedAt && (
                              <span className='inline-block'>|</span>
                            )
                          }
                          {
                            subscription.updatedAt && (
                              <span className='inline-block'>
                                Updated {formatDate(subscription.updatedAt)}
                              </span>
                            )
                          }
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {subscription.name || '-'}
                      {
                        subscription.shopifySubscriptionId && (
                          <div className="text-xs font-sm text-gray-500 dark:text-gray-400">Shopify ID: {normalizeShopifyId(subscription.shopifySubscriptionId)}</div>
                        )
                      }
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${subscription.test ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}`}
                      >
                        {subscription.test ? 'TEST PLAN' : 'PAID'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                        {subscription.status || 'UNKNOWN'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400 break-all">
                      <div>
                        {normalizeShopifyId(subscription.shopifySubscriptionId) || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Button
                        variant='secondary'
                        onClick={() => void syncSubscriptionStatus(subscription)}
                        disabled={syncingShop === subscription.shop}
                        icon={RefreshCw}
                        loading={syncingShop === subscription.shop}
                      >
                        {
                          syncingShop === subscription.shop ? "Checking..." : "Check Status"
                        }
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Page>
  )
}

