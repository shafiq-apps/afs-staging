'use client';

import { useEffect, useState } from 'react';
import { AlertModal, Banner, Button, ButtonGroup, Checkbox, DataTable, Input, Modal, Select, Textarea } from '@/components/ui';
import type { SelectOption } from '@/components/ui';
import Page from '@/components/ui/Page';

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

const legacyStatusOptions: SelectOption[] = [
  { value: 'PENDING', label: 'PENDING' },
  { value: 'IN_PROGRESS', label: 'IN_PROGRESS' },
  { value: 'COMPLETED', label: 'COMPLETED' },
  { value: 'REJECTED', label: 'REJECTED' },
];

export default function LegacyShopsPage() {
  const [legacyShops, setLegacyShops] = useState<LegacyShopRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [editingShop, setEditingShop] = useState<string | null>(null);
  const [deletingShop, setDeleteShop] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const deleteLegacyShop = async () => {
    try {
      
      const shop = String(deletingShop).trim();

      if (!shop) {
        throw new Error('Shop domain is required');
      }

      setDeleting(true);
      setError(null);

      const payload = {
        shop: shop
      };

      const response = await fetch(`/api/legacy-shops/${encodeURIComponent(shop)}`, {
        method: "DELETE",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);
      
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to delete legacy shop');
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
      setDeleting(false);
      void fetchLegacyShops();
    }
  };

  return (
    <Page
      title="Legacy Shops"
      backButton={{
        label: "Shops",
        href: "/shops"
      }}
      description="Manage records from the `legacy_shops` model"
      actions={[
        {
          label: "Add legacy shop",
          onClick: openCreateModal
        }
      ]}
    >
      <div className="space-y-6">
        {
          error && (<Banner variant='error'>{error}</Banner>)
        }

        <DataTable
          loading={loading}
          emptyMessage='No legacy shop records found.'
          data={legacyShops}
          columns={[
            { header: "Shop", key: "shop" },
            { header: "Status", key: "status" },
            { header: "Upgrade Allowed", key: "isUpgradeAllowed", render: (item) => item.isUpgradeAllowed ? "Yes" : "No" },
            { header: "Has Upgrade Request", key: "hasUpgradeRequest", render: (item) => item.hasUpgradeRequest ? "Yes" : "No" },
            { header: "Message", key: "statusMessage" },
            {
              header: "Actions", key: "id", render: (item) => (
                <ButtonGroup>
                  <Button
                    onClick={() => openEditModal(item)}
                    size='sm'
                  >
                    Edit
                  </Button>
                  <Button
                    onClick={() => setDeleteShop(item.shop)}
                    size='sm'
                  >
                    Delete
                  </Button>
                </ButtonGroup>
              )
            },
          ]}
          keyExtractor={(item) => item.shop}
        />
      </div>

      <AlertModal
        isOpen={Boolean(deletingShop) || Boolean(deleting)}
        onClose={() => setDeleteShop(editingShop)}
        onConfirm={deleteLegacyShop}
        title='Delete legacy shop?'
        message={`By doing so, '${deletingShop}' will immediately gain access to the new version of the app.`}
        confirmText={'Yes, proceed'}
        loading={deleting}
        variant='error'
        key={`Delete-legacy-shop-${deletingShop}`}
      />

      <Modal
        title={editingShop ? 'Edit Legacy Shop' : 'Add Legacy Shop'}
        isOpen={showModal}
        onClose={closeModal}
        actions={[
          ...(Boolean(editingShop) ? [
            {
              label: 'Delete',
              onClick: () => { setDeleteShop(editingShop), closeModal() },
              disabled: saving,
              variant: 'danger' as any
            }
          ] : []),
          {
            label: 'Close',
            onClick: closeModal,
            disabled: saving
          },
          {
            label: saving ? 'Saving...' : 'Save',
            onClick: () => void saveLegacyShop(),
            loading: saving,
            variant: 'primary',
            disabled: !String(formData.shop).trim() || !/\.myshopify\.com$/.test(String(formData.shop).trim())
          }
        ]}
      >
        <div className="space-y-4">
          <Input
            label="Shop domain"
            type="text"
            value={formData.shop}
            onChange={(event) => setFormData((prev) => ({ ...prev, shop: event.target.value }))}
            disabled={Boolean(editingShop)}
            placeholder="example.myshopify.com"
            required
            aria-required="true"
          />

          <Checkbox
            checked={formData.isUpgradeAllowed}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, isUpgradeAllowed: event.target.checked }))
            }
            label="Upgrade allowed"
          />

          <Checkbox
            checked={formData.hasUpgradeRequest}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, hasUpgradeRequest: event.target.checked }))
            }
            label="Has upgrade request"
            disabled
          />

          <Select
            label="Status"
            value={formData.status}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, status: event.target.value as LegacyShopStatus }))
            }
            options={legacyStatusOptions}
          />

          <Textarea
            label="Status message"
            value={formData.statusMessage}
            onChange={(event) => setFormData((prev) => ({ ...prev, statusMessage: event.target.value }))}
            rows={3}
            resize="none"
          />
        </div>
      </Modal>
    </Page>
  );
}
