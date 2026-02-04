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

const extractSettings = (settings: SettingsTree | Record<string, any>): Record<string, any> => {
  const result: Record<string, any> = {};
  Object.entries(settings ?? {}).forEach(([key, value]) => {
    if (isFieldNode(value)) {
      result[key] = value.value ?? value.default ?? (value.type === "checkbox" ? false : "");
      return;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = extractSettings(value as Record<string, any>);
      return;
    }
    result[key] = value;
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
    return `<div class="template-warning" data-block-type="${block.block_type}">Missing renderer for ${block.block_type}</div>`;
  }
  const nextCtx: RenderContext = {
    ...ctx,
    renderBlock: (nextBlock) => renderBlock(nextBlock, ctx, registry),
  };
  return renderer(block, nextCtx);
};

export const renderTemplate = (template: TemplateConfig, registry: Record<string, BlockRenderer>) => {
  if (!template?.areas) return "";
  return template.areas.map((area) => renderArea(area, template, registry)).join("\n");
};

type LayoutConfig = {
  html: string;
  styles?: string;
};

export const renderTemplateWithLayout = (
  layout: LayoutConfig | null,
  template: TemplateConfig,
  registry: Record<string, BlockRenderer>
) => {
  if (!layout?.html) {
    return renderTemplate(template, registry);
  }
  const areaHtml = new Map<string, string>();
  (template.areas ?? []).forEach((area) => {
    areaHtml.set(area.id, renderArea(area, template, registry));
  });
  let html = layout.html;
  areaHtml.forEach((value, key) => {
    html = html.replaceAll(`{{area:${key}}}`, value);
  });
  if (layout.styles) {
    return `<style>${layout.styles}</style>\n${html}`;
  }
  return html;
};
