'use client';

import { useEffect, useMemo, useState } from 'react';
import { LoadingBar } from '@/components/ui/LoadingBar';
import { ExternalLink, Calendar, Search, Edit } from 'lucide-react';
import { AlertModal, Banner, Button, Checkbox, DataTable, Input, Modal, Select, Stack, Textarea } from '@/components/ui';
import type { SelectOption } from '@/components/ui';
import Page from '@/components/ui/Page';
import LinkComponent, { Href } from '@/components/ui/LinkComponent';
import Badge from '@/components/ui/Badge';
import { formatDate } from '@/lib/string.utils';
import { useAuth } from '@/components/providers';
import { hasPermission } from '@/lib/rbac';

type LegacyShopStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
type ShopStatusFilter =
  | 'ALL'
  | 'ACTIVE'
  | 'UNINSTALLED'
  | 'DELETED'
  | 'UNKNOWN'
  | 'LEGACY'
  | 'LEGACY_PENDING'
  | 'LEGACY_IN_PROGRESS'
  | 'LEGACY_COMPLETED'
  | 'LEGACY_REJECTED'
  | 'NON_LEGACY';

const shopStatusFilterOptions: SelectOption[] = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'UNINSTALLED', label: 'Uninstalled' },
  { value: 'DELETED', label: 'Deleted' },
  { value: 'UNKNOWN', label: 'Unknown' },
  { value: 'LEGACY', label: 'Legacy (All)' },
  { value: 'NON_LEGACY', label: 'Non Legacy' },
  { value: 'LEGACY_PENDING', label: 'Legacy: PENDING' },
  { value: 'LEGACY_IN_PROGRESS', label: 'Legacy: IN_PROGRESS' },
  { value: 'LEGACY_COMPLETED', label: 'Legacy: COMPLETED' },
  { value: 'LEGACY_REJECTED', label: 'Legacy: REJECTED' },
] as const;

const legacyStatusOptions: SelectOption[] = [
  { value: 'PENDING', label: 'PENDING' },
  { value: 'IN_PROGRESS', label: 'IN_PROGRESS' },
  { value: 'COMPLETED', label: 'COMPLETED' },
  { value: 'REJECTED', label: 'REJECTED' },
] as const;

export interface LegacyShop {
  shop: string;
  isUpgradeAllowed?: boolean;
  hasUpgradeRequest?: boolean;
  status?: LegacyShopStatus;
  statusMessage?: string;
}

export interface Shop {
  shop: string;
  installedAt?: string;
  scopes?: string[];
  lastAccessed?: string;
  updatedAt?: string;
  isDeleted?: string;
  uninstalledAt?: string;
  reinstalledAt?: string;
  reinstalled?: string;
  metadata?: {
    shopId?: string;
    currencyCode?: string;
    email?: string;
  };
  locals?: {
    ip?: string;
    userAgent?: string;
  };
  sessionId?: string;
  state?: string;
  isOnline?: boolean;
  scope?: string;
  expires?: string;
  userId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  accountOwner?: boolean;
  locale?: string;
  collaborator?: boolean;
  emailVerified?: boolean;
  legacyShop?: LegacyShop | null;
  isLegacyShop?: boolean;
}

export default function ShopsPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLegacyModal, setShowLegacyModal] = useState(false);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [savingLegacy, setSavingLegacy] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ShopStatusFilter>('ALL');
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'info' | 'success' | 'warning' | 'error';
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'error',
  });
  const [legacyForm, setLegacyForm] = useState({
    isUpgradeAllowed: false,
    hasUpgradeRequest: false,
    status: 'PENDING' as LegacyShopStatus,
    statusMessage: '',
  });

  useEffect(() => {
    fetchShops();
  }, []);

  const canManageShops = hasPermission(user, 'canManageShops');

  const showErrorAlert = (message: string) => {
    setAlertState({
      isOpen: true,
      title: 'Action Failed',
      message,
      variant: 'error',
    });
  };

  const fetchShops = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/shops?limit=100&offset=0');
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch shops');
      }
      const data = await response.json();
      setShops(data.shops || []);
    } catch (err: unknown) {
      console.error('Error fetching shops:', err);
      const message = err instanceof Error ? err.message : 'Failed to fetch shops';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const getShopStatus = (shop: Shop) => {
    if (shop.uninstalledAt) return { label: 'Uninstalled', color: 'red' };
    if (shop.isDeleted) return { label: 'Deleted', color: 'red' };
    if (shop.installedAt) return { label: 'Active', color: 'green' };
    return { label: 'Unknown', color: 'gray' };
  };

  const filteredShops = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return shops.filter((shop) => {
      const status = getShopStatus(shop);
      const legacyStatus = shop.legacyShop?.status || 'PENDING';

      if (statusFilter !== 'ALL') {
        const statusMatch =
          (statusFilter === 'ACTIVE' && status.label === 'Active') ||
          (statusFilter === 'UNINSTALLED' && status.label === 'Uninstalled') ||
          (statusFilter === 'DELETED' && status.label === 'Deleted') ||
          (statusFilter === 'UNKNOWN' && status.label === 'Unknown') ||
          (statusFilter === 'LEGACY' && Boolean(shop.legacyShop)) ||
          (statusFilter === 'NON_LEGACY' && !shop.legacyShop) ||
          (statusFilter === 'LEGACY_PENDING' && Boolean(shop.legacyShop) && legacyStatus === 'PENDING') ||
          (statusFilter === 'LEGACY_IN_PROGRESS' &&
            Boolean(shop.legacyShop) &&
            legacyStatus === 'IN_PROGRESS') ||
          (statusFilter === 'LEGACY_COMPLETED' && Boolean(shop.legacyShop) && legacyStatus === 'COMPLETED') ||
          (statusFilter === 'LEGACY_REJECTED' && Boolean(shop.legacyShop) && legacyStatus === 'REJECTED');

        if (!statusMatch) return false;
      }

      if (!normalizedSearch) return true;

      const fullName = [shop.firstName, shop.lastName].filter(Boolean).join(' ');
      const searchableValues = [
        shop.shop,
        shop.email,
        shop.metadata?.email,
        shop.metadata?.shopId,
        shop.userId,
        fullName || undefined,
        shop.locale,
      ].filter((value): value is string => typeof value === 'string' && value.length > 0);

      return searchableValues.some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [shops, searchTerm, statusFilter]);

  const openLegacyModal = (shop: Shop) => {
    setSelectedShop(shop);
    setLegacyForm({
      isUpgradeAllowed: Boolean(shop.legacyShop?.isUpgradeAllowed),
      hasUpgradeRequest: Boolean(shop.legacyShop?.hasUpgradeRequest),
      status: (shop.legacyShop?.status as LegacyShopStatus) || 'PENDING',
      statusMessage: shop.legacyShop?.statusMessage || '',
    });
    setShowLegacyModal(true);
  };

  const closeLegacyModal = () => {
    setShowLegacyModal(false);
    setSelectedShop(null);
  };

  const saveLegacyShop = async () => {
    if (!selectedShop) return;

    try {
      setSavingLegacy(true);
      const response = await fetch('/api/legacy-shops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: selectedShop.shop,
          isUpgradeAllowed: legacyForm.isUpgradeAllowed,
          hasUpgradeRequest: legacyForm.hasUpgradeRequest,
          status: legacyForm.status,
          statusMessage: legacyForm.statusMessage || undefined,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to update legacy shop');
      }

      const legacyShop = data.legacyShop as LegacyShop;
      setShops((prev) =>
        prev.map((shop) =>
          shop.shop === selectedShop.shop
            ? {
              ...shop,
              legacyShop,
              isLegacyShop: true,
            }
            : shop
        )
      );

      closeLegacyModal();
    } catch (saveError: unknown) {
      const message = saveError instanceof Error ? saveError.message : 'Failed to update legacy shop';
      showErrorAlert(message);
    } finally {
      setSavingLegacy(false);
    }
  };

  if (error) {
    return (
      <>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">Shops</h1>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
            <p className="text-blue-600 dark:text-blue-400">Error: {error}</p>
            <button
              onClick={fetchShops}
              className="mt-4 px-4 py-2 bg-blue-500/90 hover:bg-blue-600 text-white rounded-lg transition-colors duration-200 shadow-md shadow-blue-500/20 hover:shadow-blue-500/30 cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      </>
    );
  }

  if (isAuthLoading) {
    return (
      <Page title='Shops'>
        <LoadingBar loading={true} />
      </Page>
    );
  }

  if (!canManageShops) {
    return (
      <Page title='Shops'>
        <Banner variant='warning'>You do not have permission to access shops.</Banner>
      </Page>
    );
  }

  return (
    <Page
      title='Shops'
      description='Manage Shops stored in `shops`'
      actions={[
        {
          label: "Legacy Shops",
          href: "/legacy-shops"
        }
      ]}
    >
      <DataTable
        loading={loading}
        columns={[
          { header: "Shop Domain", key: "shop", render: (item) => (<LinkComponent href={`/shops/${decodeURIComponent(item.shop)}`}>{item.shop}</LinkComponent>) },
          { header: "Status", key: "status", render: (item) => <Badge variant={item.state === "ACTIVE" ? "success" : "info"}>{item.state || "UNKNOWN"}</Badge> },
          { header: "Installed", key: "installedAt", render: (item: Shop) => formatDate(item.installedAt, { month:"short", day:"numeric", year:"numeric" }) },
          { header: "UnInstalled", key: "uninstalledAt", render: (item: Shop) => formatDate(item.uninstalledAt, { month:"short", day:"numeric", year:"numeric" }) },
          {
            header: "Actions", key: "id", render: (item) => (
              <Button
                href={`/shops/${item.shop}`}
                size='sm'
              >Edit</Button>
            )
          },
        ]}
        data={filteredShops}
        keyExtractor={(item) => item.shop}
        emptyMessage='No shops match your current search or filters.'
      />

      <Modal
        title='Manage Legacy Shop'
        isOpen={(showLegacyModal && selectedShop) ? true : false}
        onClose={closeLegacyModal}
        actions={[
          {
            label: "Close",
            onClick: closeLegacyModal,
            disabled: savingLegacy
          },
          {
            label: savingLegacy ? 'Saving...' : 'Save',
            onClick: saveLegacyShop,
            disabled: savingLegacy,
            variant: 'primary'
          }
        ]}
      >
        <div className="space-y-4">
          <Checkbox
            checked={legacyForm.isUpgradeAllowed}
            onChange={(event) =>
              setLegacyForm((prev) => ({ ...prev, isUpgradeAllowed: event.target.checked }))
            }
            label="Upgrade Allowed"
          />

          <Checkbox
            checked={legacyForm.hasUpgradeRequest}
            onChange={(event) =>
              setLegacyForm((prev) => ({ ...prev, hasUpgradeRequest: event.target.checked }))
            }
            label="Has Upgrade Request"
            disabled
          />

          <Select
            label="Status"
            value={legacyForm.status}
            onChange={(event) =>
              setLegacyForm((prev) => ({
                ...prev,
                status: event.target.value as LegacyShopStatus,
              }))
            }
            options={legacyStatusOptions}
          />

          <Textarea
            label="Status Message"
            value={legacyForm.statusMessage}
            onChange={(event) => setLegacyForm((prev) => ({ ...prev, statusMessage: event.target.value }))}
            rows={3}
            placeholder="Optional message for current legacy status..."
            resize="none"
          />
        </div>
      </Modal>

      <AlertModal
        isOpen={alertState.isOpen}
        onClose={() => setAlertState((prev) => ({ ...prev, isOpen: false }))}
        title={alertState.title}
        message={alertState.message}
        variant={alertState.variant}
      />
    </Page>
  );
}
