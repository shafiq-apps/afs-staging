'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import { LoadingBar } from '@/components/ui/LoadingBar';
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
}

export default function ShopDetailPage() {
  const params = useParams();
  const router = useRouter();
  const shopDomain = params?.shop as string;
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [reindexMessage, setReindexMessage] = useState<string | null>(null);

  useEffect(() => {
    if (shopDomain) {
      fetchShop();
    }
  }, [shopDomain]);

  const fetchShop = async () => {
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
    } catch (err: any) {
      console.error('Error fetching shop:', err);
      setError(err.message || 'Failed to fetch shop');
    } finally {
      setLoading(false);
    }
  };

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
    } catch (err: any) {
      console.error('Error reindexing shop:', err);
      setReindexMessage(`Error: ${err.message || 'Failed to start reindexing'}`);
    } finally {
      setReindexing(false);
    }
  };

  const InfoCard = ({ title, children, icon: Icon }: { title: string; children: React.ReactNode; icon?: any }) => (
    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-700">
      <div className="flex items-center space-x-2 mb-4">
        {Icon && <Icon className="h-5 w-5 text-purple-500 dark:text-purple-400" />}
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );

  const InfoRow = ({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: any }) => (
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
      <Layout>
        <LoadingBar loading={true} />
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500 dark:text-gray-400">Loading shop details...</div>
        </div>
      </Layout>
    );
  }

  if (error || !shop) {
    return (
      <Layout>
        <div>
          <Link
            href="/shops"
            className="inline-flex items-center space-x-2 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 mb-6 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Shops</span>
          </Link>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-red-200 dark:border-red-800">
            <p className="text-red-600 dark:text-red-400">Error: {error || 'Shop not found'}</p>
            <button
              onClick={fetchShop}
              className="mt-4 px-4 py-2 bg-purple-500/90 hover:bg-purple-600 text-white rounded-lg transition-colors duration-200 shadow-md shadow-purple-500/20 hover:shadow-purple-500/30 cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  const status = getShopStatus(shop);

  return (
    <Layout>
      <div>
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/shops"
            className="inline-flex items-center space-x-2 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 mb-4 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Shops</span>
          </Link>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{shop.shop}</h1>
                <div className="flex items-center space-x-3 mt-2">
                  <span
                    className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-semibold ${
                      status.color === 'green'
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
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleReindex}
                disabled={reindexing || !shop.installedAt || !!shop.uninstalledAt}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-500/90 hover:bg-indigo-600 text-white rounded-lg transition-colors duration-200 shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reindexing ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Reindexing...</span>
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4" />
                    <span>Reindex Products</span>
                  </>
                )}
              </button>
              <a
                href={`https://${shop.shop}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 px-4 py-2 bg-purple-500/90 hover:bg-purple-600 text-white rounded-lg transition-colors duration-200 shadow-md shadow-purple-500/20 hover:shadow-purple-500/30 cursor-pointer"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Visit Shop</span>
              </a>
            </div>
          </div>
        </div>

        {/* Reindex Message */}
        {reindexMessage && (
          <div
            className={`mb-6 p-4 rounded-lg border ${
              reindexMessage.startsWith('Error')
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
    </Layout>
  );
}

