'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import { User, UserRole } from '@/types/auth';
import { Plus, Edit, Trash2, X, Save } from 'lucide-react';

export default function TeamPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
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
    } catch (error: any) {
      alert(error.message || 'Failed to save user');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      const response = await fetch(`/api/team/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete user');
      await fetchUsers();
    } catch (error: any) {
      alert(error.message || 'Failed to delete user');
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
      <Layout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Team Management</h1>
          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            className="flex items-center space-x-2 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 text-white px-4 py-2 rounded-lg hover:from-purple-700 hover:via-indigo-700 hover:to-purple-700 shadow-lg shadow-purple-500/50 cursor-pointer"
          >
            <Plus className="h-5 w-5" />
            <span>Add Member</span>
          </button>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden border border-white/20">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{user.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800">
                      {user.role.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(user)}
                        className="text-purple-600 hover:text-purple-900 cursor-pointer"
                      >
                        <Edit className="h-5 w-5" />
                      </button>
                      {user.role !== 'super_admin' && (
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="text-red-600 hover:text-red-900 cursor-pointer"
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white/95 backdrop-blur-md rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-white/20">
              <div className="flex justify-between items-center p-6 border-b">
                <h2 className="text-xl font-bold">
                  {editingUser ? 'Edit Team Member' : 'Add Team Member'}
                </h2>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 bg-white font-sans"
                    style={{ color: '#111827' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    disabled={!!editingUser}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 text-gray-900 bg-white font-sans"
                    style={{ color: '#111827' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Role
                  </label>
                  <select
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900 bg-white font-sans"
                    style={{ color: '#111827' }}
                  >
                    <option value="employee">Employee</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-4">
                    Permissions
                  </label>
                  <div className="space-y-3">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
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
                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Manage Shops</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
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
                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">View Docs</span>
                    </label>
                    {formData.role !== 'employee' && (
                      <>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
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
                            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          />
                          <span className="ml-2 text-sm text-gray-700">View Payments</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
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
                            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          />
                          <span className="ml-2 text-sm text-gray-700">View Subscriptions</span>
                        </label>
                      </>
                    )}
                    {formData.role === 'admin' && (
                      <label className="flex items-center">
                        <input
                          type="checkbox"
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
                          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">Manage Team</span>
                      </label>
                    )}
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      resetForm();
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 text-white rounded-lg hover:from-purple-700 hover:via-indigo-700 hover:to-purple-700 shadow-lg shadow-purple-500/50 cursor-pointer"
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
    </Layout>
  );
}

