'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import { Plus, Edit, Trash2, X, Save, Eye } from 'lucide-react';
import { LoadingBar } from '@/components/ui/LoadingBar';
import Checkbox from '@/components/ui/Checkbox';

export interface SubscriptionPlan {
  id: string;
  handle: string;
  name: string;
  description?: string;
  productLimit: number;
  price: {
    amount: number;
    currencyCode: string;
  };
  interval?: 'EVERY_30_DAYS' | 'ANNUAL';
  test?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export default function SubscriptionPlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingPlan, setViewingPlan] = useState<SubscriptionPlan | null>(null);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [formData, setFormData] = useState({
    handle: '',
    name: '',
    description: '',
    productLimit: 0,
    priceAmount: 0,
    interval: 'EVERY_30_DAYS' as 'EVERY_30_DAYS' | 'ANNUAL',
    test: false,
  });

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/subscription-plans');
      if (!response.ok) throw new Error('Failed to fetch plans');
      const data = await response.json();
      setPlans(data.plans || []);
    } catch (error) {
      console.error('Error fetching plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingPlan ? `/api/subscription-plans/${editingPlan.id}` : '/api/subscription-plans';
      const method = editingPlan ? 'PATCH' : 'POST';

      const payload = {
        handle: formData.handle,
        name: formData.name,
        description: formData.description || undefined,
        productLimit: formData.productLimit,
        price: {
          amount: formData.priceAmount,
          currencyCode: 'USD', // Hardcoded to USD
        },
        interval: formData.interval,
        test: formData.test,
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save plan');
      }

      await fetchPlans();
      setShowAddModal(false);
      setEditingPlan(null);
      resetForm();
    } catch (error: any) {
      alert(error.message || 'Failed to save plan');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this subscription plan?')) return;

    try {
      const response = await fetch(`/api/subscription-plans/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete plan');
      }
      await fetchPlans();
    } catch (error: any) {
      alert(error.message || 'Failed to delete plan');
    }
  };

  const handleView = (plan: SubscriptionPlan) => {
    setViewingPlan(plan);
    setShowViewModal(true);
  };

  const handleEdit = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setFormData({
      handle: plan.handle,
      name: plan.name,
      description: plan.description || '',
      productLimit: plan.productLimit,
      priceAmount: plan.price.amount,
      interval: plan.interval || 'EVERY_30_DAYS',
      test: plan.test ?? false,
    });
    setShowAddModal(true);
  };

  const resetForm = () => {
    setFormData({
      handle: '',
      name: '',
      description: '',
      productLimit: 0,
      priceAmount: 0,
      interval: 'EVERY_30_DAYS',
      test: false,
    });
    setEditingPlan(null);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const formatPrice = (plan: SubscriptionPlan) => {
    return `${plan.price.currencyCode} ${plan.price.amount.toFixed(2)}`;
  };

  if (loading) {
    return (
      <Layout>
        <LoadingBar loading={true} />
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500 dark:text-gray-400">Loading subscription plans...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Subscription Plans</h1>
          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            className="flex items-center space-x-2 bg-purple-500/90 hover:bg-purple-600 text-white px-4 py-2 rounded-lg transition-colors duration-200 shadow-md shadow-purple-500/20 hover:shadow-purple-500/30 cursor-pointer"
          >
            <Plus className="h-5 w-5" />
            <span>Add Plan</span>
          </button>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
            <thead className="bg-gray-50 dark:bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Handle
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Interval
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Product Limit
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Test
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
              {plans.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    No subscription plans found.
                  </td>
                </tr>
              ) : (
                plans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{plan.handle}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100">{plan.name}</div>
                      {plan.description && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{plan.description}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100">{formatPrice(plan)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                        {plan.interval === 'ANNUAL' ? 'Annual' : 'Monthly'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100">{plan.productLimit}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          plan.test
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                            : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                        }`}
                      >
                        {plan.test ? 'Test' : 'Live'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500 dark:text-gray-400">{formatDate(plan.createdAt)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleView(plan)}
                          className="inline-flex items-center space-x-1 px-3 py-1.5 bg-blue-500/90 hover:bg-blue-600 text-white rounded-lg transition-colors duration-200 shadow-md shadow-blue-500/20 hover:shadow-blue-500/30 cursor-pointer text-xs"
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                          <span>View</span>
                        </button>
                        <button
                          onClick={() => handleEdit(plan)}
                          className="inline-flex items-center space-x-1 px-3 py-1.5 bg-purple-500/90 hover:bg-purple-600 text-white rounded-lg transition-colors duration-200 shadow-md shadow-purple-500/20 hover:shadow-purple-500/30 cursor-pointer text-xs"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(plan.id)}
                          className="inline-flex items-center space-x-1 px-3 py-1.5 bg-red-500/90 hover:bg-red-600 text-white rounded-lg transition-colors duration-200 shadow-md shadow-red-500/20 hover:shadow-red-500/30 cursor-pointer text-xs"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200 dark:border-slate-700">
              <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-slate-700">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {editingPlan ? 'Edit Subscription Plan' : 'Add Subscription Plan'}
                </h2>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-300 dark:hover:text-gray-100 cursor-pointer"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Handle *
                    </label>
                    <input
                      type="text"
                      value={formData.handle}
                      onChange={(e) => setFormData({ ...formData, handle: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                      required
                      placeholder="e.g., starter, pro, enterprise"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-700 placeholder-gray-400 dark:placeholder-gray-500 font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="Plan name"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-700 placeholder-gray-400 dark:placeholder-gray-500 font-sans"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    placeholder="Plan description (optional)"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-700 placeholder-gray-400 dark:placeholder-gray-500 font-sans resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Price Amount (USD) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.priceAmount}
                      onChange={(e) => setFormData({ ...formData, priceAmount: parseFloat(e.target.value) || 0 })}
                      required
                      placeholder="0.00"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-700 placeholder-gray-400 dark:placeholder-gray-500 font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Interval *
                    </label>
                    <select
                      value={formData.interval}
                      onChange={(e) => setFormData({ ...formData, interval: e.target.value as 'EVERY_30_DAYS' | 'ANNUAL' })}
                      required
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-700 font-sans cursor-pointer"
                    >
                      <option value="EVERY_30_DAYS">Monthly (30 days)</option>
                      <option value="ANNUAL">Annual</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Product Limit *
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.productLimit}
                      onChange={(e) => setFormData({ ...formData, productLimit: parseInt(e.target.value) || 0 })}
                      required
                      placeholder="0"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-700 placeholder-gray-400 dark:placeholder-gray-500 font-sans"
                    />
                  </div>

                  <div className="flex items-end">
                    <Checkbox
                      checked={formData.test}
                      onChange={(e) => setFormData({ ...formData, test: e.target.checked })}
                      label="Test Plan"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      resetForm();
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:border-slate-600 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex items-center space-x-2 bg-purple-500/90 hover:bg-purple-600 text-white px-4 py-2 rounded-lg transition-colors duration-200 shadow-md shadow-purple-500/20 hover:shadow-purple-500/30 cursor-pointer"
                  >
                    <Save className="h-5 w-5" />
                    <span>{editingPlan ? 'Update' : 'Create'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* View Modal */}
        {showViewModal && viewingPlan && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200 dark:border-slate-700">
              <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-slate-700">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  Subscription Plan Details
                </h2>
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    setViewingPlan(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-300 dark:hover:text-gray-100 cursor-pointer"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Handle
                    </label>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {viewingPlan.handle}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Name
                    </label>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {viewingPlan.name}
                    </div>
                  </div>
                </div>

                {viewingPlan.description && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Description
                    </label>
                    <div className="text-sm text-gray-900 dark:text-gray-100">
                      {viewingPlan.description}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Price Amount (USD)
                    </label>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      ${viewingPlan.price.amount.toFixed(2)}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Interval
                    </label>
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                      {viewingPlan.interval === 'ANNUAL' ? 'Annual' : 'Monthly (30 days)'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Product Limit
                    </label>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {viewingPlan.productLimit}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Status
                    </label>
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        viewingPlan.test
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                          : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      }`}
                    >
                      {viewingPlan.test ? 'Test Plan' : 'Live Plan'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Created At
                    </label>
                    <div className="text-sm text-gray-900 dark:text-gray-100">
                      {formatDate(viewingPlan.createdAt)}
                    </div>
                  </div>

                  {viewingPlan.updatedAt && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Updated At
                      </label>
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {formatDate(viewingPlan.updatedAt)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setShowViewModal(false);
                      setViewingPlan(null);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:border-slate-600 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowViewModal(false);
                      handleEdit(viewingPlan);
                    }}
                    className="flex items-center space-x-2 bg-purple-500/90 hover:bg-purple-600 text-white px-4 py-2 rounded-lg transition-colors duration-200 shadow-md shadow-purple-500/20 hover:shadow-purple-500/30 cursor-pointer"
                  >
                    <Edit className="h-4 w-4" />
                    <span>Edit Plan</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

