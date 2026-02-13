'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, Save, Eye } from 'lucide-react';
import { LoadingBar } from '@/components/ui/LoadingBar';
import Checkbox from '@/components/ui/Checkbox';
import { AlertModal, Button, ButtonGroup, ConfirmModal, Input, Modal, Select, Textarea } from '@/components/ui';
import type { SelectOption } from '@/components/ui';
import Page from '@/components/ui/Page';

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

const intervalOptions: SelectOption[] = [
  { value: 'EVERY_30_DAYS', label: 'Monthly (30 days)' },
  { value: 'ANNUAL', label: 'Annual' },
];

export default function SubscriptionPlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingPlan, setViewingPlan] = useState<SubscriptionPlan | null>(null);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [confirmDeletePlanId, setConfirmDeletePlanId] = useState<string | null>(null);
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

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return fallback;
  };

  const showErrorAlert = (message: string) => {
    setAlertState({
      isOpen: true,
      title: 'Action Failed',
      message,
      variant: 'error',
    });
  };

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

  const handleSubmit = async (e: any) => {
    if (e) {
      e.preventDefault();
    }
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
    } catch (error: unknown) {
      showErrorAlert(getErrorMessage(error, 'Failed to save plan'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/subscription-plans/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete plan');
      }
      await fetchPlans();
    } catch (error: unknown) {
      showErrorAlert(getErrorMessage(error, 'Failed to delete plan'));
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
    return `${plan.price.amount.toFixed(2)} ${plan.price.currencyCode}`;
  };

  if (loading) {
    return (
      <>
        <LoadingBar loading={true} />
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500 dark:text-gray-400">Loading subscription plans...</div>
        </div>
      </>
    );
  }

  return (
    <Page
      title='Subscription Plans'
      actions={[
        {
          label: "Add Plan",
          onClick: () => {
            resetForm();
            setShowAddModal(true);
          },
          variant: 'primary'
        }
      ]}
    >
      <div>
        <div className="bg-white dark:bg-slate-800 rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
            <thead className="bg-gray-50 dark:bg-slate-700">
              <tr>
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
                      <div className="text-sm text-gray-900 dark:text-gray-100">{plan.name}</div>
                      <div className="text-xs font-sm text-gray-500 dark:text-gray-400">{plan.handle}</div>
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
                      <div className="text-sm text-gray-900 dark:text-gray-100">{Number(plan.productLimit).toLocaleString()}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500 dark:text-gray-400">{formatDate(plan.createdAt)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <ButtonGroup>
                        <Button
                          title="View"
                          onClick={() => handleView(plan)}
                          variant='outline'
                          size='sm'
                        >
                          View
                        </Button>
                        <Button
                          title="Edit"
                          onClick={() => handleEdit(plan)}
                          variant='outline'
                          size='sm'
                        >
                          Edit
                        </Button>
                        <Button
                          title="Delete"
                          onClick={() => setConfirmDeletePlanId(plan.id)}
                          variant='outline'
                          size='sm'
                        >
                          Delete
                        </Button>
                      </ButtonGroup>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Modal
          isOpen={showAddModal}
          onClose={() => {
            setShowAddModal(false);
          }}
          title={editingPlan ? 'Edit Subscription Plan' : 'Add Subscription Plan'}
          size='lg'
          actions={[
            {
              label: "Cancel",
              onClick: () => {
                setShowAddModal(false);
                resetForm();
              },
              variant: 'outline'
            },
            {
              label: editingPlan ? 'Update' : 'Create',
              variant: 'primary',
              onClick: handleSubmit
            }
          ]}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className={`grid grid-cols-${Boolean(editingPlan) ? 1 : 2} gap-4`}>
              <Input
                label="Name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="Plan name"
              />
              {
                !Boolean(editingPlan) && (
                  <Input
                    label="Handle"
                    type="text"
                    value={formData.handle}
                    onChange={(e) =>
                      setFormData({ ...formData, handle: e.target.value.toLowerCase().replace(/\s+/g, '-') })
                    }
                    required
                    placeholder="e.g., starter, pro, enterprise"
                    disabled={Boolean(editingPlan)}
                  />
                )
              }
            </div>

            <Textarea
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              placeholder="Plan description (optional)"
              resize="none"
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Price Amount (USD)"
                type="number"
                step="0.01"
                min="0"
                value={formData.priceAmount}
                onChange={(e) => setFormData({ ...formData, priceAmount: parseFloat(e.target.value) || 0 })}
                required
                placeholder="0.00"
              />

              <Select
                label="Interval"
                value={formData.interval}
                onChange={(e) =>
                  setFormData({ ...formData, interval: e.target.value as 'EVERY_30_DAYS' | 'ANNUAL' })
                }
                required
                options={intervalOptions}
              />
            </div>

            <div className="grid grid-cols-1 gap-4">
              <Input
                label="Product Limit"
                type="number"
                min="0"
                value={formData.productLimit}
                onChange={(e) => setFormData({ ...formData, productLimit: parseInt(e.target.value, 10) || 0 })}
                required
                placeholder="0"
              />

              <div className="flex items-end">
                <Checkbox
                  checked={formData.test}
                  onChange={(e) => setFormData({ ...formData, test: e.target.checked })}
                  label="Test Plan"
                />
              </div>
            </div>
          </form>
        </Modal>

        <Modal
          title="Subscription Plan Details"
          isOpen={showViewModal}
          onClose={() => {
            setShowViewModal(false);
            setViewingPlan(null);
          }}
          size='lg'
          actions={[
            {
              label: "Edit Plan",
              variant: 'primary',
              type: 'button',
              onClick: (e) => {
                setShowViewModal(false);
                if (viewingPlan) {
                  handleEdit(viewingPlan);
                }
              }
            }
          ]}
        >
          {
            viewingPlan && (
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
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${viewingPlan.test
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
              </div>
            )
          }
        </Modal>

      </div>

      <ConfirmModal
        isOpen={Boolean(confirmDeletePlanId)}
        onClose={() => setConfirmDeletePlanId(null)}
        title="Delete Subscription Plan"
        message="Are you sure you want to delete this subscription plan?"
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => {
          if (confirmDeletePlanId) {
            void handleDelete(confirmDeletePlanId);
          }
        }}
      />

      <AlertModal
        isOpen={alertState.isOpen}
        onClose={() => setAlertState((prev) => ({ ...prev, isOpen: false }))}
        title={alertState.title}
        message={alertState.message}
        variant={alertState.variant}
      />
    </Page>
  )
}

