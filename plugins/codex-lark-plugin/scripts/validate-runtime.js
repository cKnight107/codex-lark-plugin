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
const serverConfig = mcpConfig.mcpServers?.["codex-feishu-knowledge"] ?? {};
const serverEnv = serverConfig.env ?? {};
const { index } = await ensureIndex({ forceSync: true, indexPath: tempIndexPath });

const summary = {
  manifestVersion: pluginManifest.version,
  registeredTools: toolDefinitions.map((tool) => tool.name),
  mcpServers: Object.keys(mcpConfig.mcpServers ?? {}),
  documentCount: index.documents.length,
  sourceType: index.source_type,
  mcpDefaultSourceType: serverEnv.LARK_DOCS_SOURCE ?? "sample"
};

if (summary.registeredTools.length !== 5) {
  throw new Error("第一版 MCP tools 数量不正确。");
}

if (!summary.mcpServers.includes("codex-feishu-knowledge")) {
  throw new Error("插件 .mcp.json 未注册 codex-feishu-knowledge server。");
}

for (const key of [
  "LARK_DOCS_SOURCE",
  "LARK_DOCS_FIXTURE",
  "LARK_INDEX_PATH",
  "LARK_FEISHU_APP_ID",
  "LARK_FEISHU_APP_SECRET",
  "LARK_FEISHU_SYNC_ROOTS"
]) {
  if (!(key in serverEnv)) {
    throw new Error(`插件 .mcp.json 缺少 ${key} 配置模板。`);
  }
}

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
