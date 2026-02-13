'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { LoadingBar } from '@/components/ui/LoadingBar';
import { Banner, Button, Checkbox, Select, Textarea } from '@/components/ui';
import type { SelectOption } from '@/components/ui';
import {
  ArrowLeft,
  ExternalLink,
  Calendar,
  Clock,
  Mail,
  Globe,
  Shield,
  User,
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
  Key,
  RefreshCw,
  Database,
} from 'lucide-react';
import Page from '@/components/ui/Page';

const legacyStatusOptions: SelectOption[] = [
  { value: 'PENDING', label: 'PENDING' },
  { value: 'IN_PROGRESS', label: 'IN_PROGRESS' },
  { value: 'COMPLETED', label: 'COMPLETED' },
  { value: 'REJECTED', label: 'REJECTED' },
];

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
  legacyShop?: {
    shop: string;
    isUpgradeAllowed?: boolean;
    hasUpgradeRequest?: boolean;
    status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';
    statusMessage?: string;
  } | null;
}

export default function ShopDetailPage() {
  const params = useParams();
  const shopDomain = params?.shop as string;
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [reindexMessage, setReindexMessage] = useState<string | null>(null);
  const [legacyForm, setLegacyForm] = useState({
    isUpgradeAllowed: false,
    hasUpgradeRequest: false,
    status: 'PENDING' as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED',
    statusMessage: '',
  });
  const [savingLegacy, setSavingLegacy] = useState(false);

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return fallback;
  };

  const fetchShop = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const encodedShop = encodeURIComponent(shopDomain);
      const response = await fetch(`/api/shops/${encodedShop}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch shop');
      }
      const data = await response.json();
      setShop(data.shop);
    } catch (err: unknown) {
      console.error('Error fetching shop:', err);
      setError(getErrorMessage(err, 'Failed to fetch shop'));
    } finally {
      setLoading(false);
    }
  }, [shopDomain]);

  useEffect(() => {
    if (shopDomain) {
      void fetchShop();
    }
  }, [shopDomain, fetchShop]);

  useEffect(() => {
    if (!shop?.legacyShop) {
      setLegacyForm({
        isUpgradeAllowed: false,
        hasUpgradeRequest: false,
        status: 'PENDING',
        statusMessage: '',
      });
      return;
    }

    setLegacyForm({
      isUpgradeAllowed: Boolean(shop.legacyShop.isUpgradeAllowed),
      hasUpgradeRequest: Boolean(shop.legacyShop.hasUpgradeRequest),
      status: (shop.legacyShop.status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED') || 'PENDING',
      statusMessage: shop.legacyShop.statusMessage || '',
    });
  }, [shop]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const getShopStatus = (shop: Shop) => {
    if (shop.uninstalledAt) return { label: 'Uninstalled', color: 'red', icon: XCircle };
    if (shop.isDeleted) return { label: 'Deleted', color: 'red', icon: XCircle };
    if (shop.installedAt) return { label: 'Active', color: 'green', icon: CheckCircle };
    return { label: 'Unknown', color: 'gray', icon: AlertCircle };
  };

  const handleReindex = async () => {
    if (!shop || reindexing) return;

    setReindexing(true);
    setReindexMessage(null);

    try {
      const encodedShop = encodeURIComponent(shop.shop);
      const response = await fetch(`/api/shops/${encodedShop}/reindex`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to start reindexing');
      }

      setReindexMessage(data.message || 'Indexing started successfully');
    } catch (err: unknown) {
      console.error('Error reindexing shop:', err);
      setReindexMessage(`Error: ${getErrorMessage(err, 'Failed to start reindexing')}`);
    } finally {
      setReindexing(false);
    }
  };

  const saveLegacyShop = async () => {
    if (!shop) return;

    try {
      setSavingLegacy(true);
      const response = await fetch(`/api/legacy-shops/${encodeURIComponent(shop.shop)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(legacyForm),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to update legacy shop');
      }

      setShop((prev) =>
        prev
          ? {
            ...prev,
            legacyShop: data.legacyShop,
          }
          : prev
      );
    } catch (saveError: unknown) {
      setReindexMessage(`Error: ${getErrorMessage(saveError, 'Failed to update legacy shop')}`);
    } finally {
      setSavingLegacy(false);
    }
  };

  const InfoCard = ({
    title,
    children,
    icon: Icon,
  }: {
    title: string;
    children: ReactNode;
    icon?: ComponentType<{ className?: string }>;
  }) => (
    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-700">
      <div className="flex items-center space-x-2 mb-4">
        {Icon && <Icon className="h-5 w-5 text-purple-500 dark:text-purple-400" />}
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );

  const InfoRow = ({
    label,
    value,
    icon: Icon,
  }: {
    label: string;
    value: ReactNode;
    icon?: ComponentType<{ className?: string }>;
  }) => (
    <div className="flex items-start justify-between py-2 border-b border-gray-100 dark:border-slate-700 last:border-0">
      <div className="flex items-center space-x-2 flex-1">
        {Icon && <Icon className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />}
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</span>
      </div>
      <div className="text-sm text-gray-900 dark:text-gray-100 text-right ml-4 break-words max-w-md">
        {value}
      </div>
    </div>
  );

  if (loading) {
    return (
      <Page title=''>
        <LoadingBar loading={true} />
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500 dark:text-gray-400">Loading shop details...</div>
        </div>
      </Page>
    );
  }

  if (error || !shop) {
    return (
      <Page
        title=''
        backButton={{
          label: "Back to Shops",
          href: "/shops"
        }}
      >
        <div>
          <Banner variant='error'>
            <div className="space-y-4">
              <p className="text-red-600 dark:text-red-400">{error || 'Shop not found'}</p>
              <Button onClick={fetchShop} variant='danger'>
                Retry
              </Button>
            </div>
          </Banner>
        </div>
      </Page>
    );
  }

  const status = getShopStatus(shop);

  return (
    <Page
      title={shop.shop}
      backButton={{
        label: 'Shops',
        href: '/shops'
      }}
      actions={[
        {
          label: "Reindex products",
          icon: Database,
          loading: reindexing,
          onClick: handleReindex,
          disabled: (reindexing || !shop.installedAt || !!shop.uninstalledAt) ? true : false
        },
        {
          label: "Visit shop",
          href: `https://${shop.shop}`,
          icon: ExternalLink,
          onClick: handleReindex,
          external: true
        }
      ]}
      description={
        <div className="flex items-center space-x-3 mt-2">
          <span
            className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-semibold ${status.color === 'green'
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
              : status.color === 'red'
                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
              }`}
          >
            <status.icon className="h-3 w-3" />
            <span>{status.label}</span>
          </span>
          {shop.isOnline && (
            <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
              <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span>Online</span>
            </span>
          )}
        </div>
      }
    >
      <div>

        {/* Reindex Message */}
        {reindexMessage && (
          <div
            className={`mb-6 p-4 rounded-lg border ${reindexMessage.startsWith('Error')
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
              : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300'
              }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {reindexMessage.startsWith('Error') ? (
                  <AlertCircle className="h-5 w-5" />
                ) : (
                  <CheckCircle className="h-5 w-5" />
                )}
                <span className="font-medium">{reindexMessage}</span>
              </div>
              <button
                onClick={() => setReindexMessage(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Installation & Status */}
          <InfoCard title="Installation & Status" icon={Info}>
            <InfoRow
              label="Installed At"
              value={formatDate(shop.installedAt)}
              icon={Calendar}
            />
            <InfoRow
              label="Last Accessed"
              value={formatDate(shop.lastAccessed)}
              icon={Clock}
            />
            <InfoRow
              label="Updated At"
              value={formatDate(shop.updatedAt)}
              icon={RefreshCw}
            />
            {shop.uninstalledAt && (
              <InfoRow
                label="Uninstalled At"
                value={formatDate(shop.uninstalledAt)}
                icon={XCircle}
              />
            )}
            {shop.reinstalledAt && (
              <InfoRow
                label="Reinstalled At"
                value={formatDate(shop.reinstalledAt)}
                icon={CheckCircle}
              />
            )}
            {shop.reinstalled && (
              <InfoRow
                label="Reinstalled"
                value={shop.reinstalled === 'true' ? 'Yes' : 'No'}
                icon={RefreshCw}
              />
            )}
            {shop.isDeleted && (
              <InfoRow
                label="Deleted"
                value={formatDate(shop.isDeleted)}
                icon={XCircle}
              />
            )}
          </InfoCard>

          {/* Shop Information */}
          <InfoCard title="Shop Information" icon={Globe}>
            <InfoRow
              label="Shop Domain"
              value={
                <a
                  href={`https://${shop.shop}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 dark:text-purple-400 hover:underline flex items-center space-x-1 cursor-pointer"
                >
                  <span>{shop.shop}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              }
              icon={Globe}
            />
            {shop.metadata?.shopId && (
              <InfoRow label="Shop ID" value={shop.metadata.shopId} icon={Key} />
            )}
            {shop.metadata?.currencyCode && (
              <InfoRow label="Currency" value={shop.metadata.currencyCode} icon={Info} />
            )}
            {shop.locale && (
              <InfoRow label="Locale" value={shop.locale} icon={Globe} />
            )}
          </InfoCard>


          {/* Legacy Shop Management */}
          {
            shop.legacyShop && (
              <InfoCard title="Legacy Shop" icon={Database}>
                <InfoRow
                  label="Current Status"
                  value={shop.legacyShop?.status || 'PENDING'}
                  icon={Info}
                />
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
                  label="Legacy Status"
                  value={legacyForm.status}
                  onChange={(event) =>
                    setLegacyForm((prev) => ({
                      ...prev,
                      status: event.target.value as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED',
                    }))
                  }
                  options={legacyStatusOptions}
                />
                <Textarea
                  label="Status Message"
                  value={legacyForm.statusMessage}
                  onChange={(event) => setLegacyForm((prev) => ({ ...prev, statusMessage: event.target.value }))}
                  rows={3}
                  resize="none"
                />
                <div className="flex justify-end">
                  <Button
                    onClick={saveLegacyShop}
                    disabled={savingLegacy}
                    variant='primary'
                    loading={savingLegacy}
                  >
                    {savingLegacy ? 'Updating...' : 'Update'}
                  </Button>
                </div>
              </InfoCard>
            )
          }

          {/* User Information */}
          <InfoCard title="User Information" icon={User}>
            <InfoRow
              label="Email"
              value={
                shop.email || shop.metadata?.email ? (
                  <a
                    href={`mailto:${shop.email || shop.metadata?.email}`}
                    className="text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
                  >
                    {shop.email || shop.metadata?.email}
                  </a>
                ) : (
                  '-'
                )
              }
              icon={Mail}
            />
            {(shop.firstName || shop.lastName) && (
              <InfoRow
                label="Name"
                value={`${shop.firstName || ''} ${shop.lastName || ''}`.trim()}
                icon={User}
              />
            )}
            {shop.userId && (
              <InfoRow label="User ID" value={shop.userId} icon={User} />
            )}
            {shop.accountOwner !== undefined && (
              <InfoRow
                label="Account Owner"
                value={
                  <span className={`inline-flex items-center space-x-1 ${shop.accountOwner ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {shop.accountOwner ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    <span>{shop.accountOwner ? 'Yes' : 'No'}</span>
                  </span>
                }
                icon={User}
              />
            )}
            {shop.collaborator !== undefined && (
              <InfoRow
                label="Collaborator"
                value={shop.collaborator ? 'Yes' : 'No'}
                icon={User}
              />
            )}
            {shop.emailVerified !== undefined && (
              <InfoRow
                label="Email Verified"
                value={
                  <span className={`inline-flex items-center space-x-1 ${shop.emailVerified ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {shop.emailVerified ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    <span>{shop.emailVerified ? 'Yes' : 'No'}</span>
                  </span>
                }
                icon={Mail}
              />
            )}
          </InfoCard>

          {/* Permissions & Scopes */}
          <InfoCard title="Permissions & Scopes" icon={Shield}>
            {shop.scopes && shop.scopes.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {shop.scopes.length} {shop.scopes.length === 1 ? 'scope' : 'scopes'} granted
                </div>
                <div className="flex flex-wrap gap-2">
                  {shop.scopes.map((scope, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 rounded-full text-xs font-medium"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400">No scopes available</div>
            )}
            {shop.scope && (
              <InfoRow label="Scope" value={shop.scope} icon={Shield} />
            )}
          </InfoCard>

          {/* Session Information */}
          {(shop.sessionId || shop.state || shop.expires) && (
            <InfoCard title="Session Information" icon={Key}>
              {shop.sessionId && (
                <InfoRow
                  label="Session ID"
                  value={<code className="text-xs bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded">{shop.sessionId}</code>}
                  icon={Key}
                />
              )}
              {shop.state && (
                <InfoRow label="State" value={shop.state} icon={Info} />
              )}
              {shop.expires && (
                <InfoRow
                  label="Expires"
                  value={formatDate(shop.expires)}
                  icon={Clock}
                />
              )}
            </InfoCard>
          )}

          {/* Connection Details */}
          {shop.locals && (
            <InfoCard title="Connection Details" icon={Globe}>
              {shop.locals.ip && (
                <InfoRow label="IP Address" value={shop.locals.ip} icon={Globe} />
              )}
              {shop.locals.userAgent && (
                <InfoRow
                  label="User Agent"
                  value={<code className="text-xs bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded break-all">{shop.locals.userAgent}</code>}
                  icon={Info}
                />
              )}
            </InfoCard>
          )}

        </div>
      </div>
    </Page>
  );
}

