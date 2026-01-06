import { useState } from "react";

// Multi-Select Component for Allowed Options
export function AllowedOptionsSelector({
  value,
  onChange,
  availableValues
}: {
  value: string[];
  onChange: (value: string[]) => void;
  availableValues: Array<{ value: string; count: number }>;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const filteredValues = availableValues.filter(item => 
    item.value.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleValue = (val: string) => {
    if (value.includes(val)) {
      onChange(value.filter(v => v !== val));
    } else {
      onChange([...value, val]);
    }
  };

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
      <s-stack direction="block" gap="small">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: '600', fontSize: '14px' }}>Select Allowed Values</span>
          <span style={{ fontSize: '12px', color: 'var(--p-color-text-subdued)' }}>
            {value.length} selected
          </span>
        </div>
        <s-text-field
          label="Search values"
          placeholder="Search values..."
          value={searchTerm}
          onChange={(e: any) => setSearchTerm(e.target.value)}
          labelAccessibilityVisibility="exclusive"
        />
        <div style={{ 
          maxHeight: '200px', 
          overflowY: 'auto', 
          border: '1px solid var(--p-color-border-subdued)',
          borderRadius: '4px',
          padding: '8px'
        }}>
          {filteredValues.length === 0 ? (
            <span style={{ color: 'var(--p-color-text-subdued)' }}>No values found</span>
          ) : (
            <s-stack direction="block" gap="small">
              {filteredValues.slice(0, 50).map((item) => (
                <label key={item.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={value.includes(item.value)}
                    onChange={() => toggleValue(item.value)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>{item.value}</span>
                  <span style={{ color: 'var(--p-color-text-subdued)', fontSize: '12px' }}>
                    ({item.count})
                  </span>
                </label>
              ))}
            </s-stack>
          )}
        </div>
        {value.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <s-button
              variant="tertiary"
              onClick={() => onChange([])}
            >
              Clear Selection
            </s-button>
          </div>
        )}
      </s-stack>
    </s-box>
  );
}