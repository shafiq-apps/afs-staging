import { MenuTreeNode } from "app/utils/filter.enums";
import { useEffect, useState } from "react";

// Menu Tree Builder Component
export function MenuTreeBuilder({ 
  value, 
  onChange, 
  availableValues 
}: { 
  value: string[]; 
  onChange: (value: string[]) => void;
  availableValues: Array<{ value: string; count: number }>;
}) {
  const [tree, setTree] = useState<MenuTreeNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const buildTree = (items: string[]): MenuTreeNode[] => {
      const treeMap: Record<string, MenuTreeNode> = {};
      
      items.forEach(item => {
        const parts = item.split(' > ');
        let currentPath = '';
        
        parts.forEach((part, index) => {
          const path = currentPath ? `${currentPath} > ${part}` : part;
          
          if (!treeMap[path]) {
            treeMap[path] = {
              id: path,
              label: part,
              children: [],
            };
            
            if (currentPath && treeMap[currentPath]) {
              if (!treeMap[currentPath].children) {
                treeMap[currentPath].children = [];
              }
              treeMap[currentPath].children!.push(treeMap[path]);
            }
          }
          
          currentPath = path;
        });
      });
      
      return Object.values(treeMap).filter(node => !node.id.includes(' > '));
    };
    
    if (value.length > 0) {
      setTree(buildTree(value));
    }
  }, [value]);

  const addRootNode = () => {
    const label = prompt("Enter menu item name:");
    if (label && label.trim()) {
      const newValue = [...value, label.trim()];
      onChange(newValue);
    }
  };

  const addChildNode = (parentPath: string) => {
    const label = prompt("Enter submenu item name:");
    if (label && label.trim()) {
      const newPath = `${parentPath} > ${label.trim()}`;
      const newValue = [...value, newPath];
      onChange(newValue);
    }
  };

  const removeNode = (path: string) => {
    const newValue = value.filter(v => v !== path && !v.startsWith(path + ' > '));
    onChange(newValue);
  };

  const toggleExpand = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const renderNode = (node: MenuTreeNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    
    return (
      <div key={node.id} style={{ marginLeft: `${level * 24}px`, marginTop: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {hasChildren && (
            <button
              type="button"
              onClick={() => toggleExpand(node.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                fontSize: '12px'
              }}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
          {!hasChildren && <span style={{ width: '20px' }} />}
          <span style={{ flex: 1 }}>{node.label}</span>
          <s-button
            variant="tertiary"
            onClick={() => addChildNode(node.id)}
            icon="plus"
          />
          <s-button
            variant="tertiary"
            tone="critical"
            onClick={() => removeNode(node.id)}
            icon="delete"
          />
        </div>
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
      <s-stack direction="block" gap="small">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: '600', fontSize: '14px' }}>Menu Structure</span>
          <s-button variant="secondary" onClick={addRootNode} icon="plus">
            Add Category
          </s-button>
        </div>
        {tree.length === 0 ? (
          <span style={{ color: 'var(--p-color-text-subdued)', fontSize: '14px' }}>
            No menu items yet. Click "Add Category" to create a menu structure.
          </span>
        ) : (
          <div>
            {tree.map(node => renderNode(node))}
          </div>
        )}
        {value.length > 0 && (
          <div style={{ marginTop: '12px', padding: '8px', backgroundColor: 'var(--p-color-bg-surface)', borderRadius: '4px' }}>
            <span style={{ fontSize: '12px', color: 'var(--p-color-text-subdued)' }}>
              Menu paths: {value.join(', ')}
            </span>
          </div>
        )}
      </s-stack>
    </s-box>
  );
}