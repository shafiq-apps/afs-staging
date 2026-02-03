import { useMemo, useState, type CSSProperties } from "react";
import { type HeadersFunction, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
const templateSample = {
  "template_id": "collection-page",
  "template_version": "1.0",
  "settings": {
    "colors": {
      "background": {
        "type": "color",
        "label": "Background",
        "value": "#ffffff",
        "default": "#ffffff"
      },
      "text": {
        "type": "color",
        "label": "Text",
        "value": "#1f1f1f",
        "default": "#1f1f1f"
      },
      "accent": {
        "type": "color",
        "label": "Accent",
        "value": "#111827",
        "default": "#111827"
      }
    },
    "buttons": {
      "primary": {
        "background_color": {
          "type": "color",
          "label": "Primary Background",
          "value": "#111827",
          "default": "#111827"
        },
        "text_color": {
          "type": "color",
          "label": "Primary Text",
          "value": "#ffffff",
          "default": "#ffffff"
        },
        "border_radius": {
          "type": "text",
          "label": "Primary Radius",
          "value": "6px",
          "default": "6px"
        },
        "padding": {
          "type": "text",
          "label": "Primary Padding",
          "value": "10px 18px",
          "default": "10px 18px"
        }
      },
      "secondary": {
        "background_color": {
          "type": "color",
          "label": "Secondary Background",
          "value": "#ffffff",
          "default": "#ffffff"
        },
        "text_color": {
          "type": "color",
          "label": "Secondary Text",
          "value": "#111827",
          "default": "#111827"
        },
        "border_radius": {
          "type": "text",
          "label": "Secondary Radius",
          "value": "6px",
          "default": "6px"
        },
        "padding": {
          "type": "text",
          "label": "Secondary Padding",
          "value": "10px 18px",
          "default": "10px 18px"
        }
      }
    }
  },
  "areas": [
    {
      "id": "filters",
      "label": "Filters",
      "disabled": false,
      "settings": {
        "layout": {
          "type": "radio",
          "label": "Layout",
          "value": "left",
          "default": "left",
          "options": [
            { "label": "Left", "value": "left" },
            { "label": "Top", "value": "top" }
          ]
        },
        "background_color": {
          "type": "color",
          "label": "Background",
          "value": "#ffffff",
          "default": "#ffffff"
        },
        "border_color": {
          "type": "color",
          "label": "Border Color",
          "value": "#e5e7eb",
          "default": "#e5e7eb"
        },
        "padding": {
          "type": "text",
          "label": "Padding",
          "value": "16px",
          "default": "16px"
        },
        "border_radius": {
          "type": "text",
          "label": "Border Radius",
          "value": "12px",
          "default": "12px"
        },
        "search_enabled": {
          "type": "checkbox",
          "label": "Search Enabled",
          "value": true,
          "default": true
        }
      },
      "blocks": [
        {
          "id": "filters-group",
          "label": "Filter Group",
          "block_type": "filter_group",
          "disabled": false,
          "settings": {
            "counts_enabled": {
              "type": "checkbox",
              "label": "Show Counts",
              "value": true,
              "default": true
            },
            "collapsible": {
              "type": "checkbox",
              "label": "Collapsible",
              "value": true,
              "default": true
            }
          }
        },
        {
          "id": "filters-custom-html",
          "label": "Custom HTML",
          "block_type": "custom_html",
          "disabled": false,
          "settings": {
            "html": {
              "type": "textarea",
              "label": "HTML",
              "value": "<div class='custom-block'>Free shipping over $50</div>",
              "default": ""
            }
          }
        }
      ]
    },
    {
      "id": "products",
      "label": "Products",
      "disabled": false,
      "settings": {
        "layout": {
          "type": "radio",
          "label": "Layout",
          "value": "grid",
          "default": "grid",
          "options": [
            { "label": "Grid", "value": "grid" },
            { "label": "List", "value": "list" }
          ]
        },
        "columns": {
          "type": "select",
          "label": "Columns",
          "value": "3",
          "default": "3",
          "options": [
            { "label": "2", "value": "2" },
            { "label": "3", "value": "3" },
            { "label": "4", "value": "4" }
          ]
        },
        "background_color": {
          "type": "color",
          "label": "Background",
          "value": "#ffffff",
          "default": "#ffffff"
        },
        "border_color": {
          "type": "color",
          "label": "Border Color",
          "value": "#e5e7eb",
          "default": "#e5e7eb"
        },
        "padding": {
          "type": "text",
          "label": "Padding",
          "value": "16px",
          "default": "16px"
        },
        "border_radius": {
          "type": "text",
          "label": "Border Radius",
          "value": "12px",
          "default": "12px"
        },
        "sort_enabled": {
          "type": "checkbox",
          "label": "Sort Enabled",
          "value": true,
          "default": true
        }
      },
      "blocks": [
        {
          "id": "products-toolbar",
          "label": "Products Toolbar",
          "block_type": "products_toolbar",
          "disabled": false,
          "settings": {
            "show_sort": {
              "type": "checkbox",
              "label": "Show Sort",
              "value": true,
              "default": true
            },
            "show_count": {
              "type": "checkbox",
              "label": "Show Count",
              "value": true,
              "default": true
            }
          }
        },
        {
          "id": "product-card",
          "label": "Product Card",
          "block_type": "product_card",
          "disabled": false,
          "settings": {
            "background_color": {
              "type": "color",
              "label": "Background",
              "value": "#f9fafb",
              "default": "#f9fafb"
            },
            "border_color": {
              "type": "color",
              "label": "Border Color",
              "value": "#e5e7eb",
              "default": "#e5e7eb"
            },
            "border_radius": {
              "type": "text",
              "label": "Border Radius",
              "value": "12px",
              "default": "12px"
            }
          },
          "blocks": [
            {
              "id": "product-title",
              "label": "Title",
              "block_type": "product_title",
              "disabled": false,
              "settings": {
                "tag": {
                  "type": "select",
                  "label": "Tag",
                  "value": "h3",
                  "default": "h3",
                  "options": [
                    { "label": "H2", "value": "h2" },
                    { "label": "H3", "value": "h3" },
                    { "label": "H4", "value": "h4" },
                    { "label": "P", "value": "p" }
                  ]
                },
                "text_color": {
                  "type": "color",
                  "label": "Text Color",
                  "value": "#1f1f1f",
                  "default": "#1f1f1f"
                },
                "font_size": {
                  "type": "text",
                  "label": "Font Size",
                  "value": "18px",
                  "default": "18px"
                }
              }
            },
            {
              "id": "product-vendor",
              "label": "Vendor",
              "block_type": "vendor",
              "disabled": false,
              "settings": {
                "text_color": {
                  "type": "color",
                  "label": "Text Color",
                  "value": "#6b7280",
                  "default": "#6b7280"
                },
                "font_size": {
                  "type": "text",
                  "label": "Font Size",
                  "value": "13px",
                  "default": "13px"
                }
              }
            },
            {
              "id": "product-price",
              "label": "Price",
              "block_type": "price",
              "disabled": false,
              "settings": {
                "compare_price_enabled": {
                  "type": "checkbox",
                  "label": "Show Compare",
                  "value": true,
                  "default": true
                },
                "text_color": {
                  "type": "color",
                  "label": "Text Color",
                  "value": "#111827",
                  "default": "#111827"
                },
                "font_size": {
                  "type": "text",
                  "label": "Font Size",
                  "value": "15px",
                  "default": "15px"
                }
              }
            },
            {
              "id": "product-quick-add",
              "label": "Quick Add",
              "block_type": "quick_add_button",
              "disabled": false,
              "settings": {
                "label": {
                  "type": "text",
                  "label": "Label",
                  "value": "Quick Add",
                  "default": "Quick Add"
                },
                "button_style": {
                  "type": "select",
                  "label": "Button Style",
                  "value": "primary",
                  "default": "primary",
                  "options": [
                    { "label": "Primary", "value": "primary" },
                    { "label": "Secondary", "value": "secondary" }
                  ]
                }
              }
            },
            {
              "id": "product-stock-badge",
              "label": "Stock Badge",
              "block_type": "stock_badge",
              "disabled": false,
              "settings": {
                "in_stock_text": {
                  "type": "text",
                  "label": "In Stock Text",
                  "value": "In Stock",
                  "default": "In Stock"
                },
                "out_of_stock_text": {
                  "type": "text",
                  "label": "Out of Stock Text",
                  "value": "Sold Out",
                  "default": "Sold Out"
                },
                "in_stock_color": {
                  "type": "color",
                  "label": "In Stock Color",
                  "value": "#16a34a",
                  "default": "#16a34a"
                },
                "out_of_stock_color": {
                  "type": "color",
                  "label": "Out of Stock Color",
                  "value": "#dc2626",
                  "default": "#dc2626"
                }
              }
            },
            {
              "id": "product-hover-images",
              "label": "Hover Images",
              "block_type": "hover_images",
              "disabled": false,
              "settings": {
                "transition": {
                  "type": "select",
                  "label": "Transition",
                  "value": "fade",
                  "default": "fade",
                  "options": [
                    { "label": "Fade", "value": "fade" },
                    { "label": "Slide", "value": "slide" }
                  ]
                }
              }
            }
          ]
        }
      ]
    },
    {
      "id": "pagination",
      "label": "Pagination",
      "disabled": false,
      "settings": {
        "style": {
          "type": "select",
          "label": "Style",
          "value": "buttons",
          "default": "buttons",
          "options": [
            { "label": "Buttons", "value": "buttons" },
            { "label": "Numbers", "value": "numbers" }
          ]
        },
        "alignment": {
          "type": "radio",
          "label": "Alignment",
          "value": "center",
          "default": "center",
          "options": [
            { "label": "Left", "value": "left" },
            { "label": "Center", "value": "center" },
            { "label": "Right", "value": "right" }
          ]
        },
        "load_more_enabled": {
          "type": "checkbox",
          "label": "Load More",
          "value": false,
          "default": false
        }
      },
      "blocks": [
        {
          "id": "pagination-controls",
          "label": "Pagination Controls",
          "block_type": "pagination_controls",
          "disabled": false,
          "settings": {
            "numbers_enabled": {
              "type": "checkbox",
              "label": "Numbers Enabled",
              "value": true,
              "default": true
            },
            "arrows_enabled": {
              "type": "checkbox",
              "label": "Arrows Enabled",
              "value": true,
              "default": true
            }
          }
        }
      ]
    }
  ],
  "block_presets": [
    {
      "id": "custom_html",
      "label": "Custom HTML",
      "scope": "global",
      "disabled": false,
      "settings": {
        "html": {
          "type": "textarea",
          "label": "HTML",
          "value": "<div class='custom-block'>Free shipping over $50</div>",
          "default": ""
        }
      }
    },
    {
      "id": "banner",
      "label": "Banner",
      "scope": "global",
      "disabled": false,
      "settings": {
        "text": {
          "type": "text",
          "label": "Text",
          "value": "Seasonal offer",
          "default": "Seasonal offer"
        },
        "tone": {
          "type": "select",
          "label": "Tone",
          "value": "info",
          "default": "info",
          "options": [
            { "label": "Info", "value": "info" },
            { "label": "Success", "value": "success" },
            { "label": "Warning", "value": "warning" }
          ]
        }
      }
    },
    {
      "id": "divider",
      "label": "Divider",
      "scope": "global",
      "disabled": false,
      "settings": {
        "style": {
          "type": "select",
          "label": "Style",
          "value": "line",
          "default": "line",
          "options": [
            { "label": "Line", "value": "line" },
            { "label": "Dashed", "value": "dashed" }
          ]
        }
      }
    },
    {
      "id": "filter_group",
      "label": "Filter Group",
      "scope": "filters",
      "disabled": false,
      "settings": {
        "counts_enabled": {
          "type": "checkbox",
          "label": "Show Counts",
          "value": true,
          "default": true
        },
        "collapsible": {
          "type": "checkbox",
          "label": "Collapsible",
          "value": true,
          "default": true
        }
      }
    },
    {
      "id": "price_range",
      "label": "Price Range",
      "scope": "filters",
      "disabled": false,
      "settings": {
        "min": {
          "type": "text",
          "label": "Min",
          "value": "0",
          "default": "0"
        },
        "max": {
          "type": "text",
          "label": "Max",
          "value": "500",
          "default": "500"
        }
      }
    },
    {
      "id": "swatches",
      "label": "Swatches",
      "scope": "filters",
      "disabled": false,
      "settings": {
        "shape": {
          "type": "select",
          "label": "Shape",
          "value": "circle",
          "default": "circle",
          "options": [
            { "label": "Circle", "value": "circle" },
            { "label": "Square", "value": "square" }
          ]
        },
        "size": {
          "type": "select",
          "label": "Size",
          "value": "small",
          "default": "small",
          "options": [
            { "label": "Small", "value": "small" },
            { "label": "Medium", "value": "medium" },
            { "label": "Large", "value": "large" }
          ]
        }
      }
    },
    {
      "id": "search_input",
      "label": "Search Input",
      "scope": "filters",
      "disabled": false,
      "settings": {
        "placeholder": {
          "type": "text",
          "label": "Placeholder",
          "value": "Search",
          "default": "Search"
        }
      }
    },
    {
      "id": "products_toolbar",
      "label": "Products Toolbar",
      "scope": "products",
      "disabled": false,
      "settings": {
        "show_sort": {
          "type": "checkbox",
          "label": "Show Sort",
          "value": true,
          "default": true
        },
        "show_count": {
          "type": "checkbox",
          "label": "Show Count",
          "value": true,
          "default": true
        }
      }
    },
    {
      "id": "product_title",
      "label": "Product Title",
      "scope": "product_card",
      "disabled": false,
      "settings": {
        "tag": {
          "type": "select",
          "label": "Tag",
          "value": "h3",
          "default": "h3",
          "options": [
            { "label": "H2", "value": "h2" },
            { "label": "H3", "value": "h3" },
            { "label": "H4", "value": "h4" },
            { "label": "P", "value": "p" }
          ]
        },
        "text_color": {
          "type": "color",
          "label": "Text Color",
          "value": "#1f1f1f",
          "default": "#1f1f1f"
        },
        "font_size": {
          "type": "text",
          "label": "Font Size",
          "value": "18px",
          "default": "18px"
        }
      }
    },
    {
      "id": "vendor",
      "label": "Vendor",
      "scope": "product_card",
      "disabled": false,
      "settings": {
        "text_color": {
          "type": "color",
          "label": "Text Color",
          "value": "#6b7280",
          "default": "#6b7280"
        },
        "font_size": {
          "type": "text",
          "label": "Font Size",
          "value": "13px",
          "default": "13px"
        }
      }
    },
    {
      "id": "price",
      "label": "Price",
      "scope": "product_card",
      "disabled": false,
      "settings": {
        "compare_price_enabled": {
          "type": "checkbox",
          "label": "Show Compare",
          "value": true,
          "default": true
        },
        "text_color": {
          "type": "color",
          "label": "Text Color",
          "value": "#111827",
          "default": "#111827"
        },
        "font_size": {
          "type": "text",
          "label": "Font Size",
          "value": "15px",
          "default": "15px"
        }
      }
    },
    {
      "id": "quick_add_button",
      "label": "Quick Add Button",
      "scope": "product_card",
      "disabled": false,
      "settings": {
        "label": {
          "type": "text",
          "label": "Label",
          "value": "Quick Add",
          "default": "Quick Add"
        },
        "button_style": {
          "type": "select",
          "label": "Button Style",
          "value": "primary",
          "default": "primary",
          "options": [
            { "label": "Primary", "value": "primary" },
            { "label": "Secondary", "value": "secondary" }
          ]
        }
      }
    },
    {
      "id": "stock_badge",
      "label": "Stock Badge",
      "scope": "product_card",
      "disabled": false,
      "settings": {
        "in_stock_text": {
          "type": "text",
          "label": "In Stock Text",
          "value": "In Stock",
          "default": "In Stock"
        },
        "out_of_stock_text": {
          "type": "text",
          "label": "Out of Stock Text",
          "value": "Sold Out",
          "default": "Sold Out"
        },
        "in_stock_color": {
          "type": "color",
          "label": "In Stock Color",
          "value": "#16a34a",
          "default": "#16a34a"
        },
        "out_of_stock_color": {
          "type": "color",
          "label": "Out of Stock Color",
          "value": "#dc2626",
          "default": "#dc2626"
        }
      }
    },
    {
      "id": "hover_images",
      "label": "Hover Images",
      "scope": "product_card",
      "disabled": false,
      "settings": {
        "transition": {
          "type": "select",
          "label": "Transition",
          "value": "fade",
          "default": "fade",
          "options": [
            { "label": "Fade", "value": "fade" },
            { "label": "Slide", "value": "slide" }
          ]
        }
      }
    }
  ]
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
};

type FieldOption = { label: string; value: string };

type FieldNode = {
  type: "text" | "textarea" | "color" | "select" | "radio" | "checkbox";
  label: string;
  value?: any;
  default?: any;
  options?: FieldOption[];
  placeholder?: string;
  help?: string;
};

interface SettingsTree {
  [key: string]: FieldNode | SettingsTree;
}

type TemplateBlock = {
  id: string;
  label: string;
  block_type: string;
  disabled: boolean;
  removable?: boolean;
  settings: SettingsTree;
  blocks?: TemplateBlock[];
};

type TemplateArea = {
  id: string;
  label: string;
  disabled: boolean;
  settings: SettingsTree;
  blocks: TemplateBlock[];
};

type TemplatePreset = {
  id: string;
  label: string;
  scope: "global" | "filters" | "products" | "product_card";
  disabled: boolean;
  settings: SettingsTree;
};

type TemplateConfig = {
  template_id: string;
  template_version: string;
  settings: SettingsTree;
  areas: TemplateArea[];
  block_presets: TemplatePreset[];
};

type Selection =
  | { type: "area"; areaId: string; label: string }
  | { type: "block"; areaId: string; blockId: string; label: string; parentBlockId?: string };

type DragInfo = {
  areaId: string;
  blockId: string;
  parentBlockId?: string;
};

type TextTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";

const INITIAL_TEMPLATE = templateSample as unknown as TemplateConfig;

const SAMPLE_PRODUCT = {
  title: "Canvas Utility Jacket",
  vendor: "Northwind",
  price: "$72.00",
  compareAt: "$90.00",
};

const reorderArray = <T,>(list: T[], fromIndex: number, toIndex: number) => {
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

function setByPath(obj: any, path: Array<string | number>, value: any): any {
  const cloned = Array.isArray(obj) ? [...obj] : { ...obj };
  let cursor: any = cloned;
  path.forEach((key, idx) => {
    if (idx === path.length - 1) {
      cursor[key] = value;
      return;
    }
    const next = cursor[key];
    cursor[key] = Array.isArray(next) ? [...next] : { ...next };
    cursor = cursor[key];
  });
  return cloned;
}

const getByPath = (obj: any, path: Array<string | number>) => {
  return path.reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
};

const isFieldNode = (value: any): value is FieldNode => {
  return Boolean(value && typeof value === "object" && typeof value.type === "string" && "label" in value);
};

const getFieldValue = (settings: SettingsTree, path: Array<string | number>) => {
  const node = getByPath(settings, path);
  if (isFieldNode(node)) {
    return node.value ?? node.default ?? (node.type === "checkbox" ? false : "");
  }
  return undefined;
};

const updateFieldValue = (settings: SettingsTree, path: Array<string | number>, value: any) => {
  return setByPath(settings, [...path, "value"], value);
};

const getPresetsForArea = (presets: TemplatePreset[], areaId: string, scope: "area" | "product_card") => {
  if (scope === "product_card") {
    return presets.filter((preset) => preset.scope === "product_card" && !preset.disabled);
  }
  return presets.filter(
    (preset) => (preset.scope === "global" || preset.scope === areaId) && !preset.disabled
  );
};

export default function TemplateEditorPage() {
  const [history, setHistory] = useState<{
    past: TemplateConfig[];
    present: TemplateConfig;
    future: TemplateConfig[];
  }>({
    past: [],
    present: INITIAL_TEMPLATE,
    future: [],
  });
  const templateConfig = history.present;
  const [selected, setSelected] = useState<Selection | null>(() => {
    const first = INITIAL_TEMPLATE.areas[0];
    return first ? { type: "area", areaId: first.id, label: first.label } : null;
  });
  const [hovered, setHovered] = useState<Selection | null>(null);
  const [dragging, setDragging] = useState<DragInfo | null>(null);
  const [areaPopover, setAreaPopover] = useState<string | null>(null);

  const commitConfig = (next: TemplateConfig) => {
    setHistory((current) => ({
      past: [...current.past, current.present],
      present: next,
      future: [],
    }));
  };

  const undo = () => {
    setHistory((current) => {
      if (current.past.length === 0) return current;
      const previous = current.past[current.past.length - 1];
      const nextPast = current.past.slice(0, -1);
      return {
        past: nextPast,
        present: previous,
        future: [current.present, ...current.future],
      };
    });
  };

  const redo = () => {
    setHistory((current) => {
      if (current.future.length === 0) return current;
      const [next, ...rest] = current.future;
      return {
        past: [...current.past, current.present],
        present: next,
        future: rest,
      };
    });
  };

  const previewStyle = useMemo(() => {
    return {
      color: getFieldValue(templateConfig.settings, ["colors", "text"]) || "#111111",
      backgroundColor: getFieldValue(templateConfig.settings, ["colors", "background"]) || "#ffffff",
    } as CSSProperties;
  }, [templateConfig.settings]);

  const getAreaIndex = (areaId: string) => templateConfig.areas.findIndex((area) => area.id === areaId);

  const updateAreaBlocks = (areaId: string, nextBlocks: TemplateBlock[]) => {
    const areaIndex = getAreaIndex(areaId);
    if (areaIndex === -1) return;
    commitConfig(setByPath(templateConfig, ["areas", areaIndex, "blocks"], nextBlocks));
  };

  const updateNestedBlocks = (areaId: string, parentBlockId: string, nextBlocks: TemplateBlock[]) => {
    const areaIndex = getAreaIndex(areaId);
    if (areaIndex === -1) return;
    const parentIndex = templateConfig.areas[areaIndex].blocks.findIndex((block) => block.id === parentBlockId);
    if (parentIndex === -1) return;
    commitConfig(
      setByPath(templateConfig, ["areas", areaIndex, "blocks", parentIndex, "blocks"], nextBlocks)
    );
  };

  const updateBlockDisabled = (areaId: string, blockId: string, value: boolean, parentBlockId?: string) => {
    const areaIndex = getAreaIndex(areaId);
    if (areaIndex === -1) return;
    const basePath = parentBlockId
      ? ["areas", areaIndex, "blocks", templateConfig.areas[areaIndex].blocks.findIndex((b) => b.id === parentBlockId), "blocks"]
      : ["areas", areaIndex, "blocks"];
    const blockIndex = parentBlockId
      ? templateConfig.areas[areaIndex].blocks
          .find((b) => b.id === parentBlockId)
          ?.blocks?.findIndex((b) => b.id === blockId) ?? -1
      : templateConfig.areas[areaIndex].blocks.findIndex((b) => b.id === blockId);
    if (blockIndex === -1) return;
    commitConfig(setByPath(templateConfig, [...basePath, blockIndex, "disabled"], value));
  };

  const updateBlockSettings = (
    areaId: string,
    blockId: string,
    path: Array<string | number>,
    value: any,
    parentBlockId?: string
  ) => {
    const areaIndex = getAreaIndex(areaId);
    if (areaIndex === -1) return;
    if (parentBlockId) {
      const parentIndex = templateConfig.areas[areaIndex].blocks.findIndex((b) => b.id === parentBlockId);
      if (parentIndex === -1) return;
      const blockIndex = templateConfig.areas[areaIndex].blocks[parentIndex].blocks?.findIndex((b) => b.id === blockId) ?? -1;
      if (blockIndex === -1) return;
      commitConfig(
        setByPath(
          templateConfig,
          ["areas", areaIndex, "blocks", parentIndex, "blocks", blockIndex, "settings", ...path, "value"],
          value
        )
      );
      return;
    }
    const blockIndex = templateConfig.areas[areaIndex].blocks.findIndex((b) => b.id === blockId);
    if (blockIndex === -1) return;
    commitConfig(
      setByPath(templateConfig, ["areas", areaIndex, "blocks", blockIndex, "settings", ...path, "value"], value)
    );
  };

  const removeBlock = (areaId: string, blockId: string, parentBlockId?: string) => {
    const areaIndex = getAreaIndex(areaId);
    if (areaIndex === -1) return;
    if (parentBlockId) {
      const parentIndex = templateConfig.areas[areaIndex].blocks.findIndex((b) => b.id === parentBlockId);
      if (parentIndex === -1) return;
      const parent = templateConfig.areas[areaIndex].blocks[parentIndex];
      const nextBlocks = (parent.blocks ?? []).filter((block) => block.id !== blockId);
      updateNestedBlocks(areaId, parentBlockId, nextBlocks);
    } else {
      const nextBlocks = templateConfig.areas[areaIndex].blocks.filter((block) => block.id !== blockId);
      updateAreaBlocks(areaId, nextBlocks);
    }
    if (selected?.type === "block" && selected.blockId === blockId) {
      setSelected(null);
    }
  };

  const addBlockToArea = (areaId: string, presetId: string) => {
    const preset = templateConfig.block_presets.find((item) => item.id === presetId);
    if (!preset) return;
    const nextId = `${presetId}-${Date.now()}`;
    const nextBlock: TemplateBlock = {
      id: nextId,
      label: preset.label,
      block_type: preset.id,
      disabled: false,
      removable: true,
      settings: structuredClone(preset.settings),
    };
    const areaIndex = getAreaIndex(areaId);
    if (areaIndex === -1) return;
    const nextBlocks = [...templateConfig.areas[areaIndex].blocks, nextBlock];
    updateAreaBlocks(areaId, nextBlocks);
    setSelected({ type: "block", areaId, blockId: nextId, label: preset.label });
  };

  const addBlockToProductCard = (areaId: string, parentBlockId: string, presetId: string) => {
    const preset = templateConfig.block_presets.find((item) => item.id === presetId);
    if (!preset) return;
    const areaIndex = getAreaIndex(areaId);
    if (areaIndex === -1) return;
    const parentBlock = templateConfig.areas[areaIndex].blocks.find((block) => block.id === parentBlockId);
    if (!parentBlock) return;
    const nextId = `${presetId}-${Date.now()}`;
    const nextBlock: TemplateBlock = {
      id: nextId,
      label: preset.label,
      block_type: preset.id,
      disabled: false,
      removable: true,
      settings: structuredClone(preset.settings),
    };
    const nextBlocks = [...(parentBlock.blocks ?? []), nextBlock];
    updateNestedBlocks(areaId, parentBlockId, nextBlocks);
    setSelected({ type: "block", areaId, blockId: nextId, label: preset.label, parentBlockId });
  };

  const renderSettingsTree = (
    node: SettingsTree,
    basePath: Array<string | number>,
    onUpdate: (path: Array<string | number>, value: any) => void
  ) => {
    return Object.entries(node).map(([key, value]) => {
      const nextPath = basePath.concat(key);
      if (isFieldNode(value)) {
        const currentValue = value.value ?? value.default ?? (value.type === "checkbox" ? false : "");

        if (value.type === "checkbox") {
          return (
            <label key={nextPath.join(".")} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={Boolean(currentValue)}
                onChange={(e) => onUpdate(nextPath, e.target.checked)}
              />
              <span>{value.label}</span>
            </label>
          );
        }

        if (value.type === "color") {
          return (
            <label key={nextPath.join(".")} style={{ display: "grid", gap: "6px" }}>
              <span>{value.label}</span>
              <input
                type="color"
                value={String(currentValue || "#000000")}
                onChange={(e) => onUpdate(nextPath, e.target.value)}
              />
            </label>
          );
        }

        if (value.type === "textarea") {
          return (
            <label key={nextPath.join(".")} style={{ display: "grid", gap: "6px" }}>
              <span>{value.label}</span>
              <textarea
                className="template-textarea"
                value={String(currentValue ?? "")}
                placeholder={value.placeholder}
                onChange={(e) => onUpdate(nextPath, e.target.value)}
              />
            </label>
          );
        }

        if (value.type === "select") {
          return (
            <label key={nextPath.join(".")} style={{ display: "grid", gap: "6px" }}>
              <span>{value.label}</span>
              <select
                className="template-select"
                value={String(currentValue ?? "")}
                onChange={(e) => onUpdate(nextPath, e.target.value)}
              >
                {(value.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        if (value.type === "radio") {
          return (
            <div key={nextPath.join(".")} className="template-radio-group">
              <span>{value.label}</span>
              <div className="template-radio-options">
                {(value.options ?? []).map((option) => (
                  <label key={option.value} className="template-radio-option">
                    <input
                      type="radio"
                      name={nextPath.join("-")}
                      value={option.value}
                      checked={String(currentValue) === option.value}
                      onChange={(e) => onUpdate(nextPath, e.target.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        }

        return (
          <s-text-field
            key={nextPath.join(".")}
            label={value.label}
            value={String(currentValue ?? "")}
            onChange={(e: any) => onUpdate(nextPath, e.target.value)}
          />
        );
      }

      return (
        <s-stack key={nextPath.join(".")} direction="block" gap="small">
          <s-text type="strong">{key}</s-text>
          {renderSettingsTree(value as SettingsTree, nextPath, onUpdate)}
        </s-stack>
      );
    });
  };

  const rightPanel = useMemo(() => {
    if (!selected) {
      return (
        <s-stack direction="block" gap="small">
          <s-heading>Settings</s-heading>
          <s-text tone="auto">Select an area or block.</s-text>
        </s-stack>
      );
    }

    if (selected.type === "area") {
      const areaIndex = getAreaIndex(selected.areaId);
      if (areaIndex === -1) return null;
      return (
        <s-stack direction="block" gap="base">
          <s-heading>{selected.label}</s-heading>
          {renderSettingsTree(templateConfig.areas[areaIndex].settings, [], (path, value) =>
            commitConfig(
              setByPath(templateConfig, ["areas", areaIndex, "settings", ...path, "value"], value)
            )
          )}
        </s-stack>
      );
    }

    const areaIndex = getAreaIndex(selected.areaId);
    if (areaIndex === -1) return null;
    const area = templateConfig.areas[areaIndex];
    const block = selected.parentBlockId
      ? area.blocks.find((b) => b.id === selected.parentBlockId)?.blocks?.find((b) => b.id === selected.blockId)
      : area.blocks.find((b) => b.id === selected.blockId);
    if (!block) return null;

    return (
      <s-stack direction="block" gap="base">
        <s-heading>{selected.label}</s-heading>
        <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={!block.disabled}
            onChange={(e) => updateBlockDisabled(selected.areaId, block.id, !e.target.checked, selected.parentBlockId)}
          />
          <span>Enabled</span>
        </label>
        {renderSettingsTree(block.settings, [], (path, value) =>
          updateBlockSettings(selected.areaId, block.id, path, value, selected.parentBlockId)
        )}
      </s-stack>
    );
  }, [selected, templateConfig]);

  const renderPreviewBlock = (block: TemplateBlock, selection: Selection) => {
    if (block.disabled) return null;
    const baseStyle: CSSProperties = {
      color: getFieldValue(block.settings, ["text_color"]) || "inherit",
      fontSize: getFieldValue(block.settings, ["font_size"]) || "14px",
    };
    const isSelected = selected?.type === "block" && selected.blockId === block.id;
    const isHovered = hovered?.type === "block" && hovered.blockId === block.id;

    if (block.block_type === "hover_images") {
      return (
        <div
          key={block.id}
          className={`template-block ${isSelected ? "is-selected" : ""} ${isHovered ? "is-hovered" : ""}`}
          onMouseEnter={() => setHovered(selection)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => setSelected(selection)}
        >
          <div className="template-image">Hover image enabled</div>
        </div>
      );
    }

    if (block.block_type === "stock_badge") {
      return (
        <div
          key={block.id}
          className={`template-block ${isSelected ? "is-selected" : ""} ${isHovered ? "is-hovered" : ""}`}
          onMouseEnter={() => setHovered(selection)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => setSelected(selection)}
        >
          <span className="template-badge" style={{ backgroundColor: getFieldValue(block.settings, ["in_stock_color"]) || "#16a34a" }}>
            {getFieldValue(block.settings, ["in_stock_text"]) || "In Stock"}
          </span>
        </div>
      );
    }

    if (block.block_type === "custom_html") {
      return (
        <div
          key={block.id}
          className={`template-block ${isSelected ? "is-selected" : ""} ${isHovered ? "is-hovered" : ""}`}
          onMouseEnter={() => setHovered(selection)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => setSelected(selection)}
          style={baseStyle}
          dangerouslySetInnerHTML={{ __html: String(getFieldValue(block.settings, ["html"]) || "") }}
        />
      );
    }

    if (block.block_type === "price") {
      return (
        <div
          key={block.id}
          className={`template-block ${isSelected ? "is-selected" : ""} ${isHovered ? "is-hovered" : ""}`}
          onMouseEnter={() => setHovered(selection)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => setSelected(selection)}
          style={baseStyle}
        >
          <span>{SAMPLE_PRODUCT.price}</span>
          {getFieldValue(block.settings, ["compare_price_enabled"]) ? (
            <span className="template-compare">{SAMPLE_PRODUCT.compareAt}</span>
          ) : null}
        </div>
      );
    }

    if (block.block_type === "quick_add_button") {
      const buttonStyleKey = getFieldValue(block.settings, ["button_style"]) || "primary";
      const buttonStyle = {
        background_color: getFieldValue(templateConfig.settings, ["buttons", buttonStyleKey, "background_color"]),
        text_color: getFieldValue(templateConfig.settings, ["buttons", buttonStyleKey, "text_color"]),
        border_radius: getFieldValue(templateConfig.settings, ["buttons", buttonStyleKey, "border_radius"]),
        padding: getFieldValue(templateConfig.settings, ["buttons", buttonStyleKey, "padding"]),
      };
      return (
        <div
          key={block.id}
          className={`template-block ${isSelected ? "is-selected" : ""} ${isHovered ? "is-hovered" : ""}`}
          onMouseEnter={() => setHovered(selection)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => setSelected(selection)}
        >
          <button
            className="template-button"
            style={{
              backgroundColor: buttonStyle.background_color,
              color: buttonStyle.text_color,
              borderRadius: buttonStyle.border_radius,
              padding: buttonStyle.padding,
            }}
          >
            {getFieldValue(block.settings, ["label"]) || "Quick Add"}
          </button>
        </div>
      );
    }

    if (block.block_type === "product_title") {
      const Tag = (getFieldValue(block.settings, ["tag"]) as TextTag) || "h3";
      return (
        <div
          key={block.id}
          className={`template-block ${isSelected ? "is-selected" : ""} ${isHovered ? "is-hovered" : ""}`}
          onMouseEnter={() => setHovered(selection)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => setSelected(selection)}
        >
          <Tag style={baseStyle}>{SAMPLE_PRODUCT.title}</Tag>
        </div>
      );
    }

    return (
      <div
        key={block.id}
        className={`template-block ${isSelected ? "is-selected" : ""} ${isHovered ? "is-hovered" : ""}`}
        onMouseEnter={() => setHovered(selection)}
        onMouseLeave={() => setHovered(null)}
        onClick={() => setSelected(selection)}
        style={baseStyle}
      >
        {block.block_type === "vendor" ? SAMPLE_PRODUCT.vendor : block.label}
      </div>
    );
  };

  return (
    <div>
      <s-section>
        <s-stack direction="block" gap="small">
          <s-heading>Template Editor</s-heading>
          <s-text tone="auto">Hover to highlight, click to select, and edit settings on the right.</s-text>
        </s-stack>
      </s-section>

      <s-section padding="none">
        <div className="template-toolbar">
          <div className="template-toolbar__group">
            <span className="template-toolbar__title">Collection Template</span>
            <span className="template-toolbar__badge">Draft</span>
          </div>
          <div className="template-toolbar__group">
            <button
              className="template-toolbar__button"
              onClick={undo}
              disabled={history.past.length === 0}
            >
              Undo
            </button>
            <button
              className="template-toolbar__button"
              onClick={redo}
              disabled={history.future.length === 0}
            >
              Redo
            </button>
          </div>
          <div className="template-toolbar__group">
            <button className="template-toolbar__button template-toolbar__button--ghost">Preview</button>
            <button className="template-toolbar__button template-toolbar__button--primary">Save</button>
            <button className="template-toolbar__button template-toolbar__button--primary">Publish</button>
          </div>
        </div>

        <div className="template-layout">
          <div className="template-sidebar">
            <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
              <s-stack direction="block" gap="base">
                <s-stack direction="block" gap="small">
                  <s-heading>Areas</s-heading>
                  <div className="template-section-list">
                    {templateConfig.areas.map((area) => {
                      const areaSelection: Selection = { type: "area", areaId: area.id, label: area.label };
                      const areaPresets = getPresetsForArea(templateConfig.block_presets, area.id, "area");
                      return (
                        <div key={area.id} className="template-section-group">
                          <button
                            className="template-section-item"
                            onClick={() => setSelected(areaSelection)}
                          >
                            {area.label}
                          </button>
                          <div className="template-section-blocks">
                            {area.blocks.map((block) => {
                              const isDragging =
                                dragging?.blockId === block.id && dragging.areaId === area.id && !dragging.parentBlockId;
                              return (
                                <div
                                  key={block.id}
                                  className={`template-block-row ${isDragging ? "is-dragging" : ""}`}
                                  draggable
                                  onDragStart={() => setDragging({ areaId: area.id, blockId: block.id })}
                                  onDragEnd={() => setDragging(null)}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    if (!dragging || dragging.areaId !== area.id || dragging.parentBlockId) return;
                                    const fromIndex = area.blocks.findIndex((b) => b.id === dragging.blockId);
                                    const toIndex = area.blocks.findIndex((b) => b.id === block.id);
                                    if (fromIndex === -1 || toIndex === -1) return;
                                    updateAreaBlocks(area.id, reorderArray(area.blocks, fromIndex, toIndex));
                                  }}
                                  onClick={() => setSelected({ type: "block", areaId: area.id, blockId: block.id, label: block.label })}
                                >
                                  <span className="template-block-handle">::</span>
                                  <span className={`template-block-title ${block.disabled ? "is-muted" : ""}`}>{block.label}</span>
                                  <label className="template-block-toggle">
                                    <input
                                      type="checkbox"
                                      checked={!block.disabled}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        updateBlockDisabled(area.id, block.id, !e.target.checked);
                                      }}
                                    />
                                    <span>Enabled</span>
                                  </label>
                                  {block.removable ? (
                                    <button
                                      className="template-block-remove"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeBlock(area.id, block.id);
                                      }}
                                    >
                                      Remove
                                    </button>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                          <div className="template-section-actions">
                            <button
                              className="template-section-add"
                              onClick={() => setAreaPopover(areaPopover === area.id ? null : area.id)}
                            >
                              Add block
                            </button>
                            {areaPopover === area.id && (
                              <div className="template-popover">
                                {areaPresets.map((preset) => (
                                  <button
                                    key={`${area.id}-${preset.id}`}
                                    className="template-popover-item"
                                    onClick={() => {
                                      addBlockToArea(area.id, preset.id);
                                      setAreaPopover(null);
                                    }}
                                  >
                                    {preset.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {area.blocks
                            .filter((block) => block.block_type === "product_card")
                            .map((block) => (
                              <div key={`${area.id}-${block.id}`} className="template-section-subblocks">
                                <div className="template-section-subtitle">{block.label} Blocks</div>
                                {(block.blocks ?? []).map((inner) => {
                                  const isDragging =
                                    dragging?.blockId === inner.id &&
                                    dragging.areaId === area.id &&
                                    dragging.parentBlockId === block.id;
                                  return (
                                    <div
                                      key={inner.id}
                                      className={`template-block-row ${isDragging ? "is-dragging" : ""}`}
                                      draggable
                                      onDragStart={() => setDragging({ areaId: area.id, blockId: inner.id, parentBlockId: block.id })}
                                      onDragEnd={() => setDragging(null)}
                                      onDragOver={(e) => e.preventDefault()}
                                      onDrop={(e) => {
                                        e.preventDefault();
                                        if (
                                          !dragging ||
                                          dragging.areaId !== area.id ||
                                          dragging.parentBlockId !== block.id
                                        ) {
                                          return;
                                        }
                                        const blocks = block.blocks ?? [];
                                        const fromIndex = blocks.findIndex((b) => b.id === dragging.blockId);
                                        const toIndex = blocks.findIndex((b) => b.id === inner.id);
                                        if (fromIndex === -1 || toIndex === -1) return;
                                        updateNestedBlocks(area.id, block.id, reorderArray(blocks, fromIndex, toIndex));
                                      }}
                                      onClick={() =>
                                        setSelected({
                                          type: "block",
                                          areaId: area.id,
                                          blockId: inner.id,
                                          label: inner.label,
                                          parentBlockId: block.id,
                                        })
                                      }
                                    >
                                      <span className="template-block-handle">::</span>
                                      <span className={`template-block-title ${inner.disabled ? "is-muted" : ""}`}>{inner.label}</span>
                                      <label className="template-block-toggle">
                                        <input
                                          type="checkbox"
                                          checked={!inner.disabled}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            updateBlockDisabled(area.id, inner.id, !e.target.checked, block.id);
                                          }}
                                        />
                                        <span>Enabled</span>
                                      </label>
                                      {inner.removable ? (
                                        <button
                                          className="template-block-remove"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            removeBlock(area.id, inner.id, block.id);
                                          }}
                                        >
                                          Remove
                                        </button>
                                      ) : null}
                                    </div>
                                  );
                                })}
                                <div className="template-section-actions">
                                  <button
                                    className="template-section-add"
                                    onClick={() =>
                                      setAreaPopover(areaPopover === `${area.id}-${block.id}` ? null : `${area.id}-${block.id}`)
                                    }
                                  >
                                    Add product card block
                                  </button>
                                  {areaPopover === `${area.id}-${block.id}` && (
                                    <div className="template-popover">
                                      {getPresetsForArea(templateConfig.block_presets, area.id, "product_card").map((preset) => (
                                        <button
                                          key={`${area.id}-${block.id}-${preset.id}`}
                                          className="template-popover-item"
                                          onClick={() => {
                                            addBlockToProductCard(area.id, block.id, preset.id);
                                            setAreaPopover(null);
                                          }}
                                        >
                                          {preset.label}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                      );
                    })}
                  </div>
                </s-stack>

                <s-stack direction="block" gap="base">
                  <s-heading>Template Settings</s-heading>
                  {renderSettingsTree(templateConfig.settings, [], (path, value) =>
                    commitConfig(setByPath(templateConfig, ["settings", ...path, "value"], value))
                  )}
                </s-stack>
              </s-stack>
            </s-box>
          </div>

          <div className="template-preview-shell">
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="base">
                <s-heading>Preview</s-heading>
                <div className="template-preview" style={previewStyle}>
                  {templateConfig.areas.map((area) => {
                    if (area.disabled) return null;
                    const areaSelection: Selection = { type: "area", areaId: area.id, label: area.label };
                    const isAreaSelected = selected?.type === "area" && selected.areaId === area.id;
                    const isAreaHovered = hovered?.type === "area" && hovered.areaId === area.id;

                    if (area.id === "filters") {
                      const filtersBackground = getFieldValue(area.settings, ["background_color"]);
                      const filtersBorder = getFieldValue(area.settings, ["border_color"]);
                      const filtersPadding = getFieldValue(area.settings, ["padding"]);
                      const filtersRadius = getFieldValue(area.settings, ["border_radius"]);
                      return (
                        <div
                          key={area.id}
                          className={`template-area template-area--filters ${isAreaSelected ? "is-selected" : ""} ${isAreaHovered ? "is-hovered" : ""}`}
                          style={{
                            backgroundColor: filtersBackground,
                            borderColor: filtersBorder,
                            padding: filtersPadding,
                            borderRadius: filtersRadius,
                          }}
                          onMouseEnter={() => setHovered(areaSelection)}
                          onMouseLeave={() => setHovered(null)}
                          onClick={() => setSelected(areaSelection)}
                        >
                          <div className="template-area__header">
                            <span>Filters</span>
                            <button className="template-link">Clear all</button>
                          </div>
                          {area.blocks.map((block) => {
                            if (block.disabled) return null;
                            const blockSelection: Selection = {
                              type: "block",
                              areaId: area.id,
                              blockId: block.id,
                              label: block.label,
                            };
                            if (block.block_type === "custom_html") {
                              return renderPreviewBlock(block, blockSelection);
                            }
                            return (
                              <div
                                key={block.id}
                                className={`template-block ${
                                  selected?.type === "block" && selected.blockId === block.id ? "is-selected" : ""
                                } ${
                                  hovered?.type === "block" && hovered.blockId === block.id ? "is-hovered" : ""
                                }`}
                                onMouseEnter={() => setHovered(blockSelection)}
                                onMouseLeave={() => setHovered(null)}
                                onClick={() => setSelected(blockSelection)}
                              >
                                <div className="template-filter">
                                  <span>{block.label}</span>
                                  <div className="template-filter__chips">
                                    <span>Northwind</span>
                                    <span>Arbor</span>
                                    <span>Seaside</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }

                    if (area.id === "products") {
                      const cardBlock = area.blocks.find((block) => block.block_type === "product_card");
                      const productsBackground = getFieldValue(area.settings, ["background_color"]);
                      const productsBorder = getFieldValue(area.settings, ["border_color"]);
                      const productsPadding = getFieldValue(area.settings, ["padding"]);
                      const productsRadius = getFieldValue(area.settings, ["border_radius"]);
                      return (
                        <div
                          key={area.id}
                          className={`template-area template-area--products ${isAreaSelected ? "is-selected" : ""} ${isAreaHovered ? "is-hovered" : ""}`}
                          style={{
                            backgroundColor: productsBackground,
                            borderColor: productsBorder,
                            padding: productsPadding,
                            borderRadius: productsRadius,
                          }}
                          onMouseEnter={() => setHovered(areaSelection)}
                          onMouseLeave={() => setHovered(null)}
                          onClick={() => setSelected(areaSelection)}
                        >
                          <div className="template-area__header">
                            <span>Products</span>
                            <select aria-label="Sort products">
                              <option>Best selling</option>
                              <option>Price: low to high</option>
                              <option>Price: high to low</option>
                            </select>
                          </div>
                          {cardBlock && !cardBlock.disabled && (
                            <div
                              className={`template-card ${
                                selected?.type === "block" && selected.blockId === cardBlock.id ? "is-selected" : ""
                              } ${hovered?.type === "block" && hovered.blockId === cardBlock.id ? "is-hovered" : ""}`}
                              style={{
                                backgroundColor: getFieldValue(cardBlock.settings, ["background_color"]),
                                borderColor: getFieldValue(cardBlock.settings, ["border_color"]),
                                borderRadius: getFieldValue(cardBlock.settings, ["border_radius"]),
                              }}
                              onMouseEnter={(e) => {
                                e.stopPropagation();
                                setHovered({ type: "block", areaId: area.id, blockId: cardBlock.id, label: cardBlock.label });
                              }}
                              onMouseLeave={(e) => {
                                e.stopPropagation();
                                setHovered(null);
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected({ type: "block", areaId: area.id, blockId: cardBlock.id, label: cardBlock.label });
                              }}
                            >
                              <div className="template-card__image" />
                              <div className="template-card__content">
                                {(cardBlock.blocks ?? []).map((block) =>
                                  renderPreviewBlock(block, {
                                    type: "block",
                                    areaId: area.id,
                                    blockId: block.id,
                                    label: block.label,
                                    parentBlockId: cardBlock.id,
                                  })
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (area.id === "pagination") {
                      return (
                        <div
                          key={area.id}
                          className={`template-area template-area--pagination ${isAreaSelected ? "is-selected" : ""} ${isAreaHovered ? "is-hovered" : ""}`}
                          style={{
                            backgroundColor: "#ffffff",
                            borderColor: "#e5e7eb",
                            padding: "16px",
                            borderRadius: "12px",
                          }}
                          onMouseEnter={() => setHovered(areaSelection)}
                          onMouseLeave={() => setHovered(null)}
                          onClick={() => setSelected(areaSelection)}
                        >
                          <div className="template-pagination">
                            <button className="template-toolbar__button">Prev</button>
                            <button className="template-toolbar__button">1</button>
                            <button className="template-toolbar__button">2</button>
                            <button className="template-toolbar__button">Next</button>
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              </s-stack>
            </s-box>
          </div>

          <div className="template-right-panel">
            <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
              <s-stack direction="block" gap="base">{rightPanel}</s-stack>
            </s-box>
          </div>
        </div>
      </s-section>

      <style>{`
        .template-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 12px 16px;
          border: 1px solid #e5e5e5;
          border-radius: 12px;
          background: #ffffff;
          margin-bottom: 12px;
        }

        .template-toolbar__group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .template-toolbar__title {
          font-weight: 600;
          font-size: 14px;
        }

        .template-toolbar__badge {
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 999px;
          background: #f1f5f9;
          color: #475569;
        }

        .template-toolbar__button {
          border: 1px solid #d0d5dd;
          background: #ffffff;
          color: #111827;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 12px;
          cursor: pointer;
        }

        .template-toolbar__button--ghost {
          background: #f8fafc;
        }

        .template-toolbar__button--primary {
          border-color: #111827;
          background: #111827;
          color: #ffffff;
        }

        .template-layout {
          display: grid;
          grid-template-columns: 300px 1fr 300px;
          align-items: stretch;
          gap: 16px;
          min-height: calc(100vh - 220px);
        }

        .template-sidebar {
          position: sticky;
          top: 12px;
          max-height: calc(100vh - 24px);
          overflow: auto;
          width: 300px;
        }

        .template-preview-shell {
          min-height: calc(100vh - 220px);
        }

        .template-right-panel {
          position: sticky;
          top: 12px;
          max-height: calc(100vh - 24px);
          overflow: auto;
          width: 300px;
        }

        .template-preview {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 16px;
          border: 1px solid #e1e1e1;
          border-radius: 16px;
          padding: 16px;
          background: #fafafa;
        }

        .template-area {
          border: 1px solid transparent;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          cursor: pointer;
        }

        .template-area.is-hovered,
        .template-area.is-selected {
          border-color: #1a73e8;
          box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.2);
        }

        .template-area__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          font-weight: 600;
        }

        .template-link {
          border: none;
          background: none;
          color: #1a73e8;
          cursor: pointer;
          font-size: 12px;
        }

        .template-filter {
          display: grid;
          gap: 8px;
          margin-bottom: 12px;
          font-size: 12px;
        }

        .template-filter__chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .template-filter__chips span {
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid #d8d8d8;
          background: #f4f4f4;
        }

        .template-card {
          border: 1px solid #e0e0e0;
          overflow: hidden;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          cursor: pointer;
        }

        .template-card.is-hovered,
        .template-card.is-selected {
          border-color: #1a73e8;
          box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.2);
        }

        .template-card__image {
          height: 160px;
          background: linear-gradient(135deg, #ececec, #f8f8f8);
        }

        .template-card__content {
          padding: 12px;
          display: grid;
          gap: 8px;
        }

        .template-block {
          border: 1px dashed transparent;
          padding: 4px;
          border-radius: 6px;
          transition: border-color 0.15s ease, background 0.15s ease;
          cursor: pointer;
        }

        .template-block.is-hovered,
        .template-block.is-selected {
          border-color: #ff6600;
          background: rgba(255, 102, 0, 0.06);
        }

        .template-badge {
          display: inline-flex;
          padding: 4px 8px;
          border-radius: 999px;
          font-size: 11px;
          color: #ffffff;
        }

        .template-compare {
          margin-left: 8px;
          text-decoration: line-through;
          opacity: 0.6;
        }

        .template-button {
          border: none;
          font-size: 12px;
          cursor: pointer;
        }

        .template-pagination {
          display: flex;
          gap: 8px;
          justify-content: center;
        }

        .template-textarea {
          min-height: 90px;
          padding: 8px;
          border-radius: 8px;
          border: 1px solid #d0d5dd;
          font-size: 12px;
          resize: vertical;
        }

        .template-select {
          padding: 6px 8px;
          border-radius: 8px;
          border: 1px solid #d0d5dd;
          font-size: 12px;
          background: #ffffff;
        }

        .template-radio-group {
          display: grid;
          gap: 6px;
          font-size: 12px;
        }

        .template-radio-options {
          display: grid;
          gap: 6px;
        }

        .template-radio-option {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .template-section-list {
          display: grid;
          gap: 6px;
        }

        .template-section-group {
          display: grid;
          gap: 8px;
          position: relative;
          padding-bottom: 12px;
          margin-bottom: 12px;
          border-bottom: 1px solid #e5e7eb;
        }

        .template-section-group:last-child {
          border-bottom: none;
          padding-bottom: 0;
          margin-bottom: 0;
        }

        .template-section-item {
          text-align: left;
          padding: 8px 10px;
          border: 1px solid #e5e5e5;
          border-radius: 8px;
          background: #ffffff;
          font-size: 13px;
          cursor: pointer;
        }

        .template-section-blocks,
        .template-section-subblocks {
          display: grid;
          gap: 6px;
        }

        .template-section-subblocks {
          padding-left: 10px;
          border-left: 2px solid #eef2ff;
        }

        .template-section-subtitle {
          font-size: 12px;
          font-weight: 600;
          color: #4338ca;
        }

        .template-section-actions {
          display: flex;
          justify-content: flex-start;
          padding-left: 10px;
          position: relative;
        }

        .template-section-add {
          border: 1px dashed #cbd5f5;
          background: #f8fbff;
          color: #1d4ed8;
          padding: 6px 10px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
        }

        .template-popover {
          position: absolute;
          left: 10px;
          top: 34px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
          border-radius: 8px;
          padding: 6px;
          display: grid;
          gap: 4px;
          z-index: 10;
          min-width: 180px;
        }

        .template-popover-item {
          text-align: left;
          padding: 6px 8px;
          border-radius: 6px;
          border: 1px solid transparent;
          background: #f8fafc;
          font-size: 12px;
          cursor: pointer;
        }

        .template-popover-item:hover {
          background: #eef2ff;
          border-color: #c7d2fe;
        }

        .template-block-row {
          display: grid;
          grid-template-columns: auto 1fr auto auto;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border: 1px solid #e5e5e5;
          border-radius: 8px;
          background: #fafafa;
          cursor: grab;
        }

        .template-block-row.is-dragging {
          opacity: 0.6;
        }

        .template-block-handle {
          font-size: 14px;
          color: #666;
        }

        .template-block-title {
          font-size: 13px;
          font-weight: 600;
        }

        .template-block-title.is-muted {
          color: #9a9a9a;
        }

        .template-block-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
        }

        .template-block-remove {
          border: 1px solid #f0b3b3;
          background: #fff5f5;
          color: #c81e1e;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
        }

        @media (max-width: 1200px) {
          .template-layout {
            grid-template-columns: 300px 1fr;
          }

          .template-right-panel {
            display: none;
          }
        }

        @media (max-width: 960px) {
          .template-preview {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
