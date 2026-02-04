import path from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";
import { renderAreasMap, renderTemplate } from "./render";
import type { TemplateConfig } from "./types";

const findTemplateRoot = async (templateId: string) => {
  const candidates = [
    path.resolve(process.cwd(), "templates", templateId),
    path.resolve(process.cwd(), "dashboard", "templates", templateId),
  ];
  for (const candidate of candidates) {
    try {
      await stat(candidate);
      return candidate;
    } catch {
      // keep searching
    }
  }
  return null;
};

const loadBlockSources = async (blocksDir: string) => {
  const registry: Record<string, (block: any, ctx: any) => string> = {};
  const files = await readdir(blocksDir);
  for (const file of files) {
    if (!file.endsWith(".js")) continue;
    const blockType = file.replace(/\.js$/, "");
    const source = await readFile(path.join(blocksDir, file), "utf8");
    try {
      const factory = new Function(`${source}\nreturn main;`);
      registry[blockType] = factory();
    } catch {
      registry[blockType] = () => `<!-- Error in ${blockType} -->`;
    }
  }
  return registry;
};

const buildSettingsDataFromTemplate = (template: TemplateConfig) => {
  return {
    template_id: template.template_id,
    template_version: template.template_version,
    settings: {},
    areas: template.areas.map((area) => ({
      id: area.id,
      disabled: area.disabled,
      settings: {},
      blocks: (area.blocks ?? []).map((block) => ({
        id: block.id,
        block_type: block.block_type,
        disabled: block.disabled,
        settings: {},
        blocks: (block.blocks ?? []).map((inner) => ({
          id: inner.id,
          block_type: inner.block_type,
          disabled: inner.disabled,
          settings: {},
        })),
      })),
    })),
  };
};

export const renderTemplateById = async (templateId: string) => {
  const root = await findTemplateRoot(templateId);
  if (!root) return "";
  const templatePath = path.join(root, "template.json");
  const layoutPath = path.join(root, "layout.js");
  const blocksDir = path.join(root, "blocks");
  const configPath = path.join(root, "config", "settings_data.json");

  const template = JSON.parse(await readFile(templatePath, "utf8")) as TemplateConfig;
  let settingsData: any;
  try {
    settingsData = JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    settingsData = buildSettingsDataFromTemplate(template);
  }

  const registry = await loadBlockSources(blocksDir);
  const areasHtml = renderAreasMap(settingsData as any, registry);
  let html = renderTemplate(settingsData as any, registry);

  try {
    const layoutSource = await readFile(layoutPath, "utf8");
    const factory = new Function(`${layoutSource}\nreturn layout;`);
    const layoutFn = factory();
    html = layoutFn(areasHtml);
  } catch {
    // ignore layout issues
  }

  return html;
};
