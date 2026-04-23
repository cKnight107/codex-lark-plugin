import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ensureIndex } from "../lib/index-store.js";
import {
  assertFeishuWriteEnabled,
  FeishuWriteError,
  FEISHU_WRITE_ENABLED_ENV,
  isWriteTool,
  validateWriteToolArgs,
  writeToolDefinitions
} from "../lib/feishu-write-contract.js";
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

  assert.equal(listResponse.result.tools.length, 9);
  assert.ok(
    listResponse.result.tools.some((tool) => tool.name === "create_feishu_doc")
  );

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

test("飞书写入 tool 合同定义 4 个默认禁用的写入能力", () => {
  assert.deepEqual(
    writeToolDefinitions.map((tool) => tool.name),
    [
      "create_feishu_doc",
      "edit_feishu_doc",
      "create_feishu_folder",
      "move_feishu_file"
    ]
  );

  assert.ok(isWriteTool("create_feishu_doc"));
  assert.equal(isWriteTool("search_docs"), false);

  const editTool = writeToolDefinitions.find((tool) => tool.name === "edit_feishu_doc");
  assert.deepEqual(
    editTool.inputSchema.properties.operation.enum,
    ["append", "insert", "update_text"]
  );
  assert.deepEqual(
    editTool.inputSchema.properties.content_type.enum,
    ["plain_text", "markdown"]
  );

  const moveTool = writeToolDefinitions.find((tool) => tool.name === "move_feishu_file");
  assert.ok(moveTool.inputSchema.properties.file_type.enum.includes("docx"));
  assert.ok(moveTool.inputSchema.properties.file_type.enum.includes("folder"));
});

test("飞书写入安全开关必须显式启用", () => {
  assert.throws(
    () => assertFeishuWriteEnabled("create_feishu_doc", { env: {} }),
    (error) => {
      assert.ok(error instanceof FeishuWriteError);
      assert.equal(error.code, "FEISHU_WRITE_DISABLED");
      assert.equal(error.toolName, "create_feishu_doc");
      assert.match(error.message, new RegExp(`${FEISHU_WRITE_ENABLED_ENV}=true`));
      return true;
    }
  );

  assert.doesNotThrow(() =>
    assertFeishuWriteEnabled("create_feishu_doc", {
      env: { [FEISHU_WRITE_ENABLED_ENV]: "true" }
    })
  );
});

test("飞书写入参数校验会拒绝越界操作并保留脱敏上下文", () => {
  const normalizedCreate = validateWriteToolArgs("create_feishu_doc", {
    folder_token: "fldcn_parent",
    title: "测试文档"
  });

  assert.equal(normalizedCreate.content_type, "plain_text");
  assert.equal(normalizedCreate.index_after_create, false);

  assert.throws(
    () =>
      validateWriteToolArgs("edit_feishu_doc", {
        document_id: "doxcn_doc",
        operation: "replace_all",
        content: "不允许整篇覆盖"
      }),
    /operation 仅支持: append, insert, update_text/
  );

  assert.throws(
    () =>
      validateWriteToolArgs("edit_feishu_doc", {
        document_id: "doxcn_doc",
        operation: "insert",
        content: "插入内容"
      }),
    /parent_block_id 不能为空|parent_block_id 必须是字符串/
  );

  assert.throws(
    () =>
      validateWriteToolArgs("move_feishu_file", {
        file_token: "fldcn_same",
        file_type: "docx",
        target_folder_token: "fldcn_same",
        app_secret: "should-not-leak"
      }),
    (error) => {
      assert.ok(error instanceof FeishuWriteError);
      assert.equal(error.code, "FEISHU_WRITE_INVALID_ARGUMENTS");
      assert.equal(error.context.file_token, "fldcn_same");
      assert.equal(error.context.target_folder_token, "fldcn_same");
      assert.equal("app_secret" in error.context, false);
      return true;
    }
  );
});
