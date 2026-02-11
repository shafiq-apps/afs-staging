'use client';

import { useEffect, useState } from 'react';
import { LoadingBar } from '@/components/ui/LoadingBar';
import { Plus, Save, X } from 'lucide-react';

type LegacyShopStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';

interface LegacyShopRecord {
  shop: string;
  isUpgradeAllowed?: boolean;
  hasUpgradeRequest?: boolean;
  status?: LegacyShopStatus;
  statusMessage?: string;
}

const DEFAULT_FORM = {
  shop: '',
  isUpgradeAllowed: false,
  hasUpgradeRequest: false,
  status: 'PENDING' as LegacyShopStatus,
  statusMessage: '',
};

export default function LegacyShopsPage() {
  const [legacyShops, setLegacyShops] = useState<LegacyShopRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [editingShop, setEditingShop] = useState<string | null>(null);

  const fetchLegacyShops = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/legacy-shops?limit=200&offset=0');
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to fetch legacy shops');
      }

      const data = await response.json();
      setLegacyShops(Array.isArray(data?.legacyShops) ? data.legacyShops : []);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Failed to fetch legacy shops';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLegacyShops();
  }, []);

  const openCreateModal = () => {
    setEditingShop(null);
    setFormData(DEFAULT_FORM);
    setShowModal(true);
  };

  const openEditModal = (record: LegacyShopRecord) => {
    setEditingShop(record.shop);
    setFormData({
      shop: record.shop,
      isUpgradeAllowed: Boolean(record.isUpgradeAllowed),
      hasUpgradeRequest: Boolean(record.hasUpgradeRequest),
      status: record.status || 'PENDING',
      statusMessage: record.statusMessage || '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setFormData(DEFAULT_FORM);
    setEditingShop(null);
  };

  const saveLegacyShop = async () => {
    try {
      if (!formData.shop.trim()) {
        throw new Error('Shop domain is required');
      }

      setSaving(true);
      setError(null);

      const payload = {
        shop: formData.shop.trim(),
        isUpgradeAllowed: formData.isUpgradeAllowed,
        hasUpgradeRequest: formData.hasUpgradeRequest,
        status: formData.status,
        statusMessage: formData.statusMessage || undefined,
      };

      const endpoint = editingShop
        ? `/api/legacy-shops/${encodeURIComponent(editingShop)}`
        : '/api/legacy-shops';

      const method = editingShop ? 'PATCH' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to save legacy shop');
      }

      const legacyShop = data.legacyShop as LegacyShopRecord;
      setLegacyShops((prev) => {
        const exists = prev.some((item) => item.shop === legacyShop.shop);
        if (exists) {
          return prev.map((item) => (item.shop === legacyShop.shop ? legacyShop : item));
        }
        return [legacyShop, ...prev];
      });

      closeModal();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Failed to save legacy shop';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <>
        <LoadingBar loading={true} />
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500 dark:text-gray-400">Loading legacy shops...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Legacy Shops</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage records from the `legacy_shops` model
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500/90 hover:bg-indigo-600 text-white cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add Legacy Shop
          </button>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-slate-800 rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
              <thead className="bg-gray-50 dark:bg-slate-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Shop
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Upgrade Allowed
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Has Upgrade Request
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Message
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                {legacyShops.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                      No legacy shop records found.
                    </td>
                  </tr>
                ) : (
                  legacyShops.map((record) => (
                    <tr key={record.shop}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {record.shop}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                          {record.status || 'PENDING'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                        {record.isUpgradeAllowed ? 'Yes' : 'No'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                        {record.hasUpgradeRequest ? 'Yes' : 'No'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {record.statusMessage || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => openEditModal(record)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-500/90 hover:bg-indigo-600 text-white text-xs font-medium cursor-pointer"
                        >
                          Edit
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

      {showModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-lg w-full border border-gray-200 dark:border-slate-700">
            <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {editingShop ? 'Edit Legacy Shop' : 'Add Legacy Shop'}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Shop Domain</label>
                <input
                  type="text"
                  value={formData.shop}
                  onChange={(event) => setFormData((prev) => ({ ...prev, shop: event.target.value }))}
                  disabled={Boolean(editingShop)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 disabled:opacity-60"
                  placeholder="example.myshopify.com"
                />
              </div>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={formData.isUpgradeAllowed}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, isUpgradeAllowed: event.target.checked }))
                  }
                  className="rounded border-gray-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 dark:bg-slate-700"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Upgrade Allowed</span>
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={formData.hasUpgradeRequest}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, hasUpgradeRequest: event.target.checked }))
                  }
                  className="rounded border-gray-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 dark:bg-slate-700"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Has Upgrade Request</span>
              </label>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                <select
                  value={formData.status}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, status: event.target.value as LegacyShopStatus }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="PENDING">PENDING</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status Message</label>
                <textarea
                  value={formData.statusMessage}
                  onChange={(event) => setFormData((prev) => ({ ...prev, statusMessage: event.target.value }))}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveLegacyShop()}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/90 hover:bg-indigo-600 disabled:opacity-60 text-white rounded-lg cursor-pointer"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
