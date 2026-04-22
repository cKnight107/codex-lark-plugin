import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

export const pluginRoot = path.resolve(currentDir, "..", "..");
export const dataDir = path.join(pluginRoot, "data");
export const defaultFixturePath = path.join(dataDir, "feishu-docs.sample.json");
export const defaultIndexPath = path.join(dataDir, "index.json");

export function resolvePluginPath(inputPath, fallbackPath) {
  if (!inputPath) {
    return fallbackPath;
  }

  return path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(pluginRoot, inputPath);
}
