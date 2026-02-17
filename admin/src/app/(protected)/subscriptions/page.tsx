'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Banner, Button, DataTable } from '@/components/ui';
import { formatDate, maskString, normalizeShopifyId } from '@/lib/string.utils';
import Page from '@/components/ui/Page';
import LinkComponent from '@/components/ui/LinkComponent';
import Badge from '@/components/ui/Badge';

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
        searchable={false}
        loading={loading}
        columns={[
          { header: "Shop", key: "shop", render: (item) => (<LinkComponent href={`/shops/${decodeURIComponent(item.shop)}`}>{item.shop}</LinkComponent>) },
          { header: "Status", key: "status", render: (item) => (<Badge variant={item.status === "ACTIVE"?"success":"default"}>{item.status}</Badge>) },
          { header: "Plan Name", key: "name" },
          { header: "Payment", key: "test", render: (item) => (<Badge variant={item.test?"warning":"success"}>{item.test?"Free":"Paid"}</Badge>) },
          { header: "Shopify ID", key: "shopifySubscriptionId", render: (item) => maskString(normalizeShopifyId(item.shopifySubscriptionId)??"",3,3) },
          { header: "Created At", key: "createdAt", render: (item) => formatDate(item.createdAt) },
          { header: "Updated At", key: "updatedAt", render: (item) => formatDate(item.updatedAt??"") },
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
        pageSize={10}
      />
    </Page>
  )
}