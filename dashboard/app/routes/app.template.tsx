import { useMemo, useState, type CSSProperties } from "react";
import { type HeadersFunction, type LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { renderTemplate } from "../template-engine/render";
import path from "node:path";
import { readFile, stat, readdir } from "node:fs/promises";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const templateId = url.searchParams.get("template") || "collection-page";
  const candidatePaths = [
    path.resolve(process.cwd(), "templates", templateId, "template.json"),
    path.resolve(process.cwd(), "dashboard", "templates", templateId, "template.json"),
  ];
  const blocksDirCandidates = [
    path.resolve(process.cwd(), "templates", templateId, "blocks"),
    path.resolve(process.cwd(), "dashboard", "templates", templateId, "blocks"),
  ];
  let templatePath: string | null = null;
  let blocksDir: string | null = null;
  for (const candidate of candidatePaths) {
    try {
      await stat(candidate);
      templatePath = candidate;
      break;
    } catch {
      // keep searching
    }
  }
  for (const candidate of blocksDirCandidates) {
    try {
      await stat(candidate);
      blocksDir = candidate;
      break;
    } catch {
      // keep searching
    }
  }
  if (!templatePath) {
    throw new Response(`Template not found: ${templateId}`, { status: 404 });
  }
  const raw = await readFile(templatePath, "utf8");
  const template = JSON.parse(raw) as TemplateConfig;
  const blockSources: Record<string, string> = {};
  if (blocksDir) {
    const files = await readdir(blocksDir);
    for (const file of files) {
      if (!file.endsWith(".js")) continue;
      const blockType = file.replace(/\\.js$/, "");
      const source = await readFile(path.join(blocksDir, file), "utf8");
      blockSources[blockType] = source;
    }
  }
  return { template, templateId, blockSources };
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
  const { template, blockSources } = useLoaderData<typeof loader>();
  const [history, setHistory] = useState<{
    past: TemplateConfig[];
    present: TemplateConfig;
    future: TemplateConfig[];
  }>({
    past: [],
    present: template as unknown as TemplateConfig,
    future: [],
  });
  const templateConfig = history.present;
  const [selected, setSelected] = useState<Selection | null>(() => {
    const first = (template as TemplateConfig).areas[0];
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

  const previewHtml = useMemo(() => {
    const registry = Object.fromEntries(
      Object.entries(blockSources ?? {}).map(([blockType, source]) => {
        try {
          const factory = new Function(`${source}\nreturn main;`);
          const main = factory();
          return [blockType, main];
        } catch {
          return [blockType, () => `<!-- Error in ${blockType} -->`];
        }
      })
    );
    return renderTemplate(templateConfig, registry);
  }, [templateConfig, blockSources]);

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
                  <div className="template-preview-html" dangerouslySetInnerHTML={{ __html: previewHtml }} />
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

        .template-preview-html {
          display: grid;
          gap: 12px;
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
