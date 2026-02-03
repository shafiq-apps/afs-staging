import type {
  BlockRenderer,
  FieldNode,
  RenderContext,
  RuntimeBlock,
  SettingsTree,
  TemplateArea,
  TemplateBlock,
  TemplateConfig,
} from "./types";

const isFieldNode = (value: any): value is FieldNode => {
  return Boolean(value && typeof value === "object" && typeof value.type === "string" && "label" in value);
};

const extractSettings = (settings: SettingsTree): Record<string, any> => {
  const result: Record<string, any> = {};
  Object.entries(settings).forEach(([key, value]) => {
    if (isFieldNode(value)) {
      result[key] = value.value ?? value.default ?? (value.type === "checkbox" ? false : "");
      return;
    }
    result[key] = extractSettings(value as SettingsTree);
  });
  return result;
};

const toRuntimeBlock = (block: TemplateBlock): RuntimeBlock => {
  return {
    id: block.id,
    label: block.label,
    block_type: block.block_type,
    disabled: block.disabled,
    removable: block.removable,
    settings: extractSettings(block.settings),
    blocks: block.blocks?.map(toRuntimeBlock),
  };
};

export const renderArea = (
  area: TemplateArea,
  template: TemplateConfig,
  registry: Record<string, BlockRenderer>
) => {
  if (area.disabled) return "";
  const ctx: RenderContext = { template, area };
  return area.blocks
    .map((block) => renderBlock(toRuntimeBlock(block), ctx, registry))
    .filter(Boolean)
    .join("\n");
};

export const renderBlock = (
  block: RuntimeBlock,
  ctx: RenderContext,
  registry: Record<string, BlockRenderer>
) => {
  if (block.disabled) return "";
  const renderer = registry[block.block_type];
  if (!renderer) {
    return `<!-- Missing renderer for ${block.block_type} -->`;
  }
  const nextCtx: RenderContext = {
    ...ctx,
    renderBlock: (nextBlock) => renderBlock(nextBlock, ctx, registry),
  };
  return renderer(block, nextCtx);
};

export const renderTemplate = (template: TemplateConfig, registry: Record<string, BlockRenderer>) => {
  return template.areas.map((area) => renderArea(area, template, registry)).join("\n");
};
