import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import pluginManifest from "../.codex-plugin/plugin.json" with { type: "json" };

import { ensureIndex } from "./lib/index-store.js";
import { toolDefinitions } from "./lib/knowledge-tools.js";
import { pluginRoot } from "./lib/path-utils.js";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-lark-plugin-"));
const tempIndexPath = path.join(tempDir, "index.json");
const mcpConfigPath = path.join(pluginRoot, ".mcp.json");
const mcpConfig = JSON.parse(await fs.readFile(mcpConfigPath, "utf8"));
const { index } = await ensureIndex({ forceSync: true, indexPath: tempIndexPath });

const summary = {
  manifestVersion: pluginManifest.version,
  registeredTools: toolDefinitions.map((tool) => tool.name),
  mcpServers: Object.keys(mcpConfig.mcpServers ?? {}),
  documentCount: index.documents.length
};

if (summary.registeredTools.length !== 5) {
  throw new Error("第一版 MCP tools 数量不正确。");
}

if (!summary.mcpServers.includes("codex-feishu-knowledge")) {
  throw new Error("插件 .mcp.json 未注册 codex-feishu-knowledge server。");
}

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
