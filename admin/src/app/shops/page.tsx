'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import { LoadingBar } from '@/components/ui/LoadingBar';
import { ExternalLink, Calendar, Clock, Eye } from 'lucide-react';

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

export default function ShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchShops();
  }, []);

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
    } catch (err: any) {
      console.error('Error fetching shops:', err);
      setError(err.message || 'Failed to fetch shops');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const getShopStatus = (shop: Shop) => {
    if (shop.uninstalledAt) return { label: 'Uninstalled', color: 'red' };
    if (shop.isDeleted) return { label: 'Deleted', color: 'red' };
    if (shop.installedAt) return { label: 'Active', color: 'green' };
    return { label: 'Unknown', color: 'gray' };
  };

  if (loading) {
    return (
      <Layout>
        <LoadingBar loading={true} />
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500 dark:text-gray-400">Loading shops...</div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">Shops</h1>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-red-200 dark:border-red-800">
            <p className="text-red-600 dark:text-red-400">Error: {error}</p>
            <button
              onClick={fetchShops}
              className="mt-4 px-4 py-2 bg-purple-500/90 hover:bg-purple-600 text-white rounded-lg transition-colors duration-200 shadow-md shadow-purple-500/20 hover:shadow-purple-500/30 cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Shops</h1>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Total: {shops.length} {shops.length === 1 ? 'shop' : 'shops'}
          </div>
        </div>

        {shops.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-700">
            <p className="text-gray-600 dark:text-gray-300 text-center">No shops found.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                <thead className="bg-gray-50 dark:bg-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Shop Domain
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Installed
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Last Accessed
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Scopes
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                  {shops.map((shop) => {
                    const status = getShopStatus(shop);
                    return (
                      <tr key={shop.shop} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <Link
                              href={`/shops/${encodeURIComponent(shop.shop)}`}
                              className="text-sm font-medium text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 flex items-center space-x-1 cursor-pointer"
                            >
                              <span>{shop.shop}</span>
                              <Eye className="h-3 w-3" />
                            </Link>
                            <a
                              href={`https://${shop.shop}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              status.color === 'green'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                : status.color === 'red'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
                            }`}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                            <Calendar className="h-4 w-4 mr-1" />
                            {formatDate(shop.installedAt)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                            <Clock className="h-4 w-4 mr-1" />
                            {formatDate(shop.lastAccessed)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {shop.email || shop.metadata?.email || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {shop.scopes && shop.scopes.length > 0 ? (
                              <span className="inline-block max-w-xs truncate" title={shop.scopes.join(', ')}>
                                {shop.scopes.length} {shop.scopes.length === 1 ? 'scope' : 'scopes'}
                              </span>
                            ) : (
                              '-'
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
