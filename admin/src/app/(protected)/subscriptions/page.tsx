'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { LoadingBar } from '@/components/ui/LoadingBar';
import Input from '@/components/ui/Input';
import { RefreshCw, Search } from 'lucide-react';
import { Banner, Button, DataTable } from '@/components/ui';
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

  return (
    <Page
      title='Subscriptions'
      description='Manage Shopify app subscriptions stored in `app_subscriptions`'
      actions={[
        {
          label: "Refresh",
          onClick: () => void fetchSubscriptions(),
          icon: RefreshCw,
          loading
        }
      ]}
    >
      {
        error && (
          <Banner variant='error'>{error}</Banner>
        )
      }

      <DataTable
        loading={loading}
        columns={[
          { header: "Shop", key: "shop", },
          { header: "Name", key: "name" },
          { header: "Plan", key: "test", render: (item) => item.test ? "Test Plan" : "Paid Plan" },
          { header: "Status", key: "status" },
          { header: "Shopify ID", key: "shopifySubscriptionId", render: (item) => normalizeShopifyId(item.shopifySubscriptionId) },
          {
            header: "Actions", key: "id", render: (item) => (
              <Button
                variant='secondary'
                onClick={() => void syncSubscriptionStatus(item)}
                disabled={syncingShop === item.shop}
                icon={RefreshCw}
                loading={syncingShop === item.shop}
              >
                {
                  syncingShop === item.shop ? "Checking..." : "Check Status"
                }
              </Button>
            )
          }
        ]}
        data={filteredSubscriptions}
        keyExtractor={(item) => item.id + item.shop}
        emptyMessage='No subscriptions found'
      />

      {/* <div className="bg-white dark:bg-slate-800 rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700">
        <tr key={`${subscription.shop}-${subscription.shopifySubscriptionId}`}>
          <td className="px-6 py-4 whitespace-nowrap text-sm">
            <Link
              href={`/shops/${encodeURIComponent(subscription.shop)}`}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
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
              className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${subscription.test ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}`}
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
      </div> */}
    </Page>
  )
}

