# UI Components Usage Guide

This directory contains reusable UI components for the admin panel. All components are TypeScript-typed and follow consistent design patterns.

## Components

### Button
A versatile button component with variants, sizes, icons, and loading states.

```tsx
import { Button } from '@/components/ui';
import { Plus, Save } from 'lucide-react';

// Basic usage
<Button>Click me</Button>

// With variants
<Button variant="primary">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="danger">Delete</Button>

// With sizes
<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>

// With icons
<Button icon={Plus} iconPosition="left">Add Item</Button>
<Button icon={Save} iconPosition="right">Save</Button>

// Loading state
<Button loading>Processing...</Button>
```

### Card
A container component with consistent styling and padding options.

```tsx
import { Card } from '@/components/ui';

<Card>
  <h2>Card Title</h2>
  <p>Card content</p>
</Card>

<Card padding="sm">Small padding</Card>
<Card padding="md">Medium padding (default)</Card>
<Card padding="lg">Large padding</Card>
<Card hover>Hover effect</Card>
```

### Stack
A layout component for stacking elements with consistent spacing.

```tsx
import { Stack } from '@/components/ui';

<Stack spacing="md">
  <div>Item 1</div>
  <div>Item 2</div>
</Stack>

<Stack direction="row" spacing="lg" align="center" justify="between">
  <div>Left</div>
  <div>Right</div>
</Stack>
```

### Banner
Display informational messages with different variants.

```tsx
import { Banner } from '@/components/ui';

<Banner variant="info">Information message</Banner>
<Banner variant="success">Success message</Banner>
<Banner variant="warning">Warning message</Banner>
<Banner variant="error">Error message</Banner>
<Banner variant="default">Default message</Banner>

<Banner variant="info" dismissible onDismiss={() => console.log('dismissed')}>
  Dismissible banner
</Banner>
```

### Modal
Modal dialogs for alerts and confirmations.

```tsx
import { Modal, AlertModal, ConfirmModal } from '@/components/ui';

// Basic modal
<Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Title">
  Content here
</Modal>

// Alert modal
<AlertModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Success"
  message="Operation completed successfully"
  variant="success"
/>

// Confirmation modal
<ConfirmModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Delete Item"
  message="Are you sure you want to delete this item?"
  variant="danger"
  onConfirm={() => handleDelete()}
/>
```

### ButtonGroup
Group buttons together.

```tsx
import { ButtonGroup, Button } from '@/components/ui';

<ButtonGroup>
  <Button>First</Button>
  <Button>Second</Button>
  <Button>Third</Button>
</ButtonGroup>

<ButtonGroup attached>
  <Button>Attached</Button>
  <Button>Buttons</Button>
</ButtonGroup>
```

### Form Fields

#### Input
```tsx
import { Input } from '@/components/ui';
import { Search } from 'lucide-react';

<Input label="Email" type="email" required />
<Input label="Password" type="password" showPasswordToggle />
<Input label="Search" leftIcon={<Search />} />
<Input label="Email" error="Invalid email" />
<Input label="Email" helperText="Enter your email address" />
```

#### Select
```tsx
import { Select } from '@/components/ui';

<Select
  label="Role"
  options={[
    { value: 'admin', label: 'Admin' },
    { value: 'user', label: 'User' },
  ]}
  placeholder="Select a role"
/>
```

#### Checkbox
```tsx
import { Checkbox } from '@/components/ui';

<Checkbox label="I agree to terms" />
<Checkbox label="Subscribe" helperText="Receive email updates" />
```

#### Textarea
```tsx
import { Textarea } from '@/components/ui';

<Textarea label="Description" rows={4} />
<Textarea label="Notes" resize="none" />
```

### DataTable
A feature-rich data table with search, pagination, sorting, and selection.

```tsx
import { DataTable } from '@/components/ui';
import { Button } from '@/components/ui';
import { Trash2 } from 'lucide-react';

const columns = [
  { key: 'name', header: 'Name', sortable: true, searchable: true },
  { key: 'email', header: 'Email', sortable: true, searchable: true },
  {
    key: 'role',
    header: 'Role',
    render: (item) => <span className="uppercase">{item.role}</span>,
  },
];

<DataTable
  data={users}
  columns={columns}
  keyExtractor={(item) => item.id}
  searchable
  pagination
  pageSize={10}
  selectable
  actions={(selectedItems) => (
    <Button variant="danger" icon={Trash2} onClick={() => handleDelete(selectedItems)}>
      Delete Selected ({selectedItems.length})
    </Button>
  )}
/>
```

## Design System

All components follow these design principles:
- **Colors**: Purple/Indigo gradient for primary actions
- **Borders**: Soft gray borders (`border-gray-200`)
- **Spacing**: Consistent spacing scale (xs, sm, md, lg, xl)
- **Typography**: Inter font family
- **Accessibility**: Proper ARIA labels and keyboard navigation
- **Responsive**: Mobile-first design approach

