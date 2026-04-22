import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ensureIndex } from "../lib/index-store.js";
import { executeTool } from "../lib/knowledge-tools.js";
import { handleRequest } from "../server.js";

async function createTempIndexPath() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "codex-lark-plugin-test-")
  );
  return path.join(directory, "index.json");
}

test("样本文档可以生成包含推断字段的索引", async () => {
  const indexPath = await createTempIndexPath();
  const { index } = await ensureIndex({ forceSync: true, indexPath });

  assert.equal(index.documents.length, 5);

  const phoenixPrd = index.documents.find((document) => document.doc_id === "doc-phoenix-prd");

  assert.equal(phoenixPrd.project_id, "phoenix-app");
  assert.equal(phoenixPrd.doc_type, "requirement");
  assert.match(phoenixPrd.inference_source, /project:/);
  assert.ok(phoenixPrd.inference_confidence >= 0.5);
});

test("search_docs 能按关键词返回 Atlas 架构文档", async () => {
  const indexPath = await createTempIndexPath();
  const result = await executeTool(
    "search_docs",
    { query: "自动同步", project: "atlas-platform" },
    { forceSync: true, indexPath }
  );

  assert.equal(result.documents[0].doc_id, "doc-atlas-weekly");
  assert.ok(result.documents.some((document) => document.doc_id === "doc-atlas-architecture"));
});

test("list_recent_docs 会按时间窗口过滤旧文档", async () => {
  const indexPath = await createTempIndexPath();
  const result = await executeTool(
    "list_recent_docs",
    { days: 7 },
    { forceSync: true, indexPath, now: "2026-04-22T12:00:00.000Z" }
  );

  const ids = result.documents.map((document) => document.doc_id);

  assert.ok(ids.includes("doc-atlas-weekly"));
  assert.ok(!ids.includes("doc-orion-roadmap"));
});

test("compare_doc_changes 会返回 revision 差异摘要", async () => {
  const indexPath = await createTempIndexPath();
  const result = await executeTool(
    "compare_doc_changes",
    { doc_id: "doc-phoenix-prd" },
    { forceSync: true, indexPath }
  );

  assert.equal(result.doc_id, "doc-phoenix-prd");
  assert.ok(result.added_paragraphs.some((line) => line.includes("指标")));
  assert.ok(result.removed_paragraphs.some((line) => line.includes("覆盖新手引导与注册流程")));
});

test("MCP 请求处理可列出工具并调用摘要接口", async () => {
  const indexPath = await createTempIndexPath();
  const listResponse = await handleRequest(
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    { forceSync: true, indexPath }
  );

  assert.equal(listResponse.result.tools.length, 5);

  const summaryResponse = await handleRequest(
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "get_doc_summary",
        arguments: { doc_id: "doc-atlas-architecture" }
      }
    },
    { forceSync: true, indexPath }
  );

  assert.equal(
    summaryResponse.result.structuredContent.doc_id,
    "doc-atlas-architecture"
  );
  assert.match(
    summaryResponse.result.structuredContent.summary,
    /Atlas 平台为知识插件提供自动同步链路/
  );
});
