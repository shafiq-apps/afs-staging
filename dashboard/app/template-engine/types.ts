export type FieldNode = {
  type: "text" | "textarea" | "color" | "select" | "radio" | "checkbox";
  label: string;
  value?: any;
  default?: any;
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
  help?: string;
};

export interface SettingsTree {
  [key: string]: FieldNode | SettingsTree;
}

export type TemplateBlock = {
  id: string;
  label: string;
  block_type: string;
  disabled: boolean;
  removable?: boolean;
  settings: SettingsTree;
  blocks?: TemplateBlock[];
};

export type TemplatePreset = {
  id: string;
  label: string;
  scope: "global" | "filters" | "products" | "product_card";
  disabled: boolean;
  settings: SettingsTree;
};

export type TemplateArea = {
  id: string;
  label: string;
  disabled: boolean;
  settings: SettingsTree;
  blocks: TemplateBlock[];
};

export type TemplateConfig = {
  template_id: string;
  template_version: string;
  settings: SettingsTree;
  areas: TemplateArea[];
  block_presets: TemplatePreset[];
};

export type RuntimeBlock = Omit<TemplateBlock, "settings" | "blocks"> & {
  settings: Record<string, any>;
  blocks?: RuntimeBlock[];
};

export type RenderContext = {
  template: TemplateConfig;
  area?: TemplateArea;
  renderBlock?: (block: RuntimeBlock, ctx: RenderContext) => string;
};

export type BlockRenderer = (block: RuntimeBlock, ctx: RenderContext) => string;
