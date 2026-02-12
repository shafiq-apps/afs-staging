'use client';

import { useState, useEffect } from 'react';
import { User, UserRole } from '@/types/auth';
import { Plus, Edit, Trash2, X, Save } from 'lucide-react';
import { LoadingBar } from '@/components/ui/LoadingBar';
import { AlertModal, Checkbox, ConfirmModal, Input, Select } from '@/components/ui';
import type { SelectOption } from '@/components/ui';

const roleOptions: SelectOption[] = [
  { value: 'employee', label: 'Employee' },
  { value: 'admin', label: 'Admin' },
];

export default function TeamPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
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
    email: '',
    name: '',
    role: 'employee' as UserRole,
    permissions: {
      canViewPayments: false,
      canViewSubscriptions: false,
      canManageShops: true,
      canManageTeam: false,
      canViewDocs: true,
    },
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const showErrorAlert = (message: string) => {
    setAlertState({
      isOpen: true,
      title: 'Action Failed',
      message,
      variant: 'error',
    });
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/team');
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      setUsers(data.users);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingUser ? `/api/team/${editingUser.id}` : '/api/team';
      const method = editingUser ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save user');
      }

      await fetchUsers();
      setShowAddModal(false);
      setEditingUser(null);
      resetForm();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save user';
      showErrorAlert(message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/team/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete user');
      await fetchUsers();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete user';
      showErrorAlert(message);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: user.permissions,
    });
    setShowAddModal(true);
  };

  const resetForm = () => {
    setFormData({
      email: '',
      name: '',
      role: 'employee',
      permissions: {
        canViewPayments: false,
        canViewSubscriptions: false,
        canManageShops: true,
        canManageTeam: false,
        canViewDocs: true,
      },
    });
    setEditingUser(null);
  };

  if (loading) {
    return (
      <>
        <LoadingBar loading={true} />
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500 dark:text-gray-400">Loading team members...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Team Management</h1>
          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            className="flex items-center space-x-2 bg-purple-500/90 hover:bg-purple-600 text-white px-4 py-2 rounded-lg transition-colors duration-200 shadow-md shadow-purple-500/20 hover:shadow-purple-500/30 cursor-pointer"
          >
            <Plus className="h-5 w-5" />
            <span>Add Member</span>
          </button>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
            <thead className="bg-gray-50 dark:bg-slate-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{user.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                      {user.role.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.isActive
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                      }`}
                    >
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(user)}
                        className="text-purple-600 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 cursor-pointer"
                      >
                        <Edit className="h-5 w-5" />
                      </button>
                      {user.role !== 'super_admin' && (
                        <button
                          onClick={() => setConfirmDeleteUserId(user.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 cursor-pointer"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center overflow-y-auto z-[1000] p-4 sm:py-8">
            <div className="bg-white dark:bg-slate-800 rounded-lg max-w-2xl w-full border border-gray-200 dark:border-slate-700">
              <div className="flex justify-between items-center p-6 border-b dark:border-slate-700">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {editingUser ? 'Edit Team Member' : 'Add Team Member'}
                </h2>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <Input
                  label="Name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />

                <Input
                  label="Email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  disabled={!!editingUser}
                />

                <Select
                  label="Role"
                  value={formData.role}
                  onChange={(e) => {
                    const role = e.target.value as UserRole;
                    setFormData({
                      ...formData,
                      role,
                      permissions: {
                        ...formData.permissions,
                        canViewPayments: role !== 'employee',
                        canViewSubscriptions: role !== 'employee',
                      },
                    });
                  }}
                  options={roleOptions}
                />

                <div>
                  <label className="block text-sm font-medium text-white dark:text-gray-300 mb-4">
                    Permissions
                  </label>
                  <div className="space-y-3">
                    <Checkbox
                      checked={formData.permissions.canManageShops}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          permissions: {
                            ...formData.permissions,
                            canManageShops: e.target.checked,
                          },
                        })
                      }
                      label="Manage Shops"
                    />
                    <Checkbox
                      checked={formData.permissions.canViewDocs}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          permissions: {
                            ...formData.permissions,
                            canViewDocs: e.target.checked,
                          },
                        })
                      }
                      label="View Docs"
                    />
                    {formData.role !== 'employee' && (
                      <>
                        <Checkbox
                          checked={formData.permissions.canViewPayments}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              permissions: {
                                ...formData.permissions,
                                canViewPayments: e.target.checked,
                              },
                            })
                          }
                          label="View Payments"
                        />
                        <Checkbox
                          checked={formData.permissions.canViewSubscriptions}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              permissions: {
                                ...formData.permissions,
                                canViewSubscriptions: e.target.checked,
                              },
                            })
                          }
                          label="View Subscriptions"
                        />
                      </>
                    )}
                    {formData.role === 'admin' && (
                      <Checkbox
                        checked={formData.permissions.canManageTeam}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            permissions: {
                              ...formData.permissions,
                              canManageTeam: e.target.checked,
                            },
                          })
                        }
                        label="Manage Team"
                      />
                    )}
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      resetForm();
                    }}
                    className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-white dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex items-center space-x-2 px-4 py-2 bg-purple-500/90 hover:bg-purple-600 text-white rounded-lg transition-colors duration-200 shadow-md shadow-purple-500/20 hover:shadow-purple-500/30 cursor-pointer"
                  >
                    <Save className="h-5 w-5" />
                    <span>{editingUser ? 'Update' : 'Create'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={Boolean(confirmDeleteUserId)}
        onClose={() => setConfirmDeleteUserId(null)}
        title="Delete Team Member"
        message="Are you sure you want to delete this user?"
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => {
          if (confirmDeleteUserId) {
            void handleDelete(confirmDeleteUserId);
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
    </>
  );
}

