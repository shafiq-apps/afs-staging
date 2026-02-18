'use client';

import { useState, useEffect } from 'react';
import { User, UserRole } from '@/types/auth';
import { Edit, Trash2 } from 'lucide-react';
import { AlertModal, Banner, Button, ButtonGroup, Checkbox, ConfirmModal, DataTable, Input, Modal, Select } from '@/components/ui';
import type { SelectOption } from '@/components/ui';
import Page from '@/components/ui/Page';
import Badge from '@/components/ui/Badge';
import { useAuth } from '@/components/providers';
import { canAccessTeamManagement, isSuperAdmin } from '@/lib/rbac';

const roleOptions: SelectOption[] = [
  { value: 'employee', label: 'Employee' },
  { value: 'admin', label: 'Admin' },
];

export default function TeamPage() {
  const { user: currentUser, isLoading: isAuthLoading } = useAuth();
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
  const canManageTeam = canAccessTeamManagement(currentUser);
  const actorIsSuperAdmin = isSuperAdmin(currentUser);
  const selectableRoleOptions = actorIsSuperAdmin
    ? roleOptions
    : roleOptions.filter((option) => option.value === 'employee');

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

  if (isAuthLoading) {
    return (
      <Page title='Team Management'>
        <div>Loading...</div>
      </Page>
    );
  }

  if (!canManageTeam) {
    return (
      <Page title='Team Management'>
        <Banner variant='warning'>You do not have permission to manage team members.</Banner>
      </Page>
    );
  }


  return (
    <Page
      title='Team Management'
      actions={[
        {
          label: "Add Member",
          onClick: () => {
            resetForm();
            setShowAddModal(true);
          }
        }
      ]}
    >
      <div>
        <DataTable
          pageSize={50}
          searchable={users.length > 20}
          loading={loading}
          data={users}
          keyExtractor={(item) => item.id + item.email}
          emptyMessage='no user found'
          columns={[
            {
              header: "Name", key: "name"
            },
            {
              header: "Email", key: "email"
            },
            {
              header: "Role", key: "role", render: (item) => item.role.replace('_', ' ').toUpperCase()
            },
            {
              header: "Status", key: "status", render: (item) => item.isActive ? <Badge variant='success'>ACTIVE</Badge> : <Badge variant='warning'>DISABLED</Badge>
            },
            {
              header: "Actions", key: "id", render: (item) => (
                <ButtonGroup>
                  {
                    item.role !== 'super_admin' &&
                    (actorIsSuperAdmin || item.role === 'employee' || item.id === currentUser?.id) && (
                      <Button
                        onClick={() => handleEdit(item)}
                        icon={Edit}
                        iconOnly
                        size='sm'
                      />
                    )
                  }
                  {
                    item.role !== 'super_admin' &&
                    item.id !== currentUser?.id &&
                    (actorIsSuperAdmin || item.role === 'employee') && (
                      <Button
                        onClick={() => setConfirmDeleteUserId(item.id)}
                        icon={Trash2}
                        iconOnly
                        size='sm'
                      />
                    )
                  }
                </ButtonGroup>
              )
            }
          ]}
        />

        <Modal
          isOpen={showAddModal}
          title={editingUser ? 'Edit Team Member' : 'Add Team Member'}
          onClose={() => {
            setShowAddModal(false);
            resetForm();
          }}
          actions={[
            {
              label: "Cancel",
              onClick: () => {
                setShowAddModal(false);
                resetForm();
              }
            },
            {
              label: editingUser ? 'Update' : 'Create',
              type: "submit",
              variant: "primary",
              onClick: handleSubmit
            }
          ]}
        >
          <form onSubmit={handleSubmit} className="space-y-6">
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

            {
              editingUser?.role !== "super_admin" && (
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
                  options={selectableRoleOptions}
                />
              )
            }

            {
              editingUser?.role !== "super_admin" && (
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
                    {formData.role === 'admin' && actorIsSuperAdmin && (
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
              )
            }
          </form>
        </Modal>


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
    </Page>
  );
}

