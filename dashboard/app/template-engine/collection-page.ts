import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import templateJson from "../../templates/collection-page/template.json";
import { renderTemplate } from "./render";
import type { TemplateConfig } from "./types";

const loadBlocks = async () => {
  const blocksDir = path.resolve(process.cwd(), "dashboard", "templates", "collection-page", "blocks");
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

export const renderCollectionTemplate = async () => {
  const template = templateJson as unknown as TemplateConfig;
  const blocks = await loadBlocks();
  return renderTemplate(template, blocks);
};
