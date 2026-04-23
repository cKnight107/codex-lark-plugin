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

  assert.equal(listResponse.result.tools.length, 12);
  assert.ok(
    listResponse.result.tools.some((tool) => tool.name === "create_feishu_doc")
  );
  assert.ok(
    listResponse.result.tools.some((tool) => tool.name === "get_docx_blocks")
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

test("原子读 tool 可以列文件夹、读取 blocks 和获取元数据", async () => {
  const calls = [];
  const feishuClient = {
    async request(path, options = {}) {
      calls.push({ path, options });

      if (path === "drive/v1/files") {
        const folderToken = options.searchParams.folder_token;

        if (folderToken === "fld_root") {
          return {
            code: 0,
            data: {
              files: [
                {
                  token: "dox_root",
                  type: "docx",
                  name: "根文档",
                  url: "https://feishu.cn/docx/dox_root",
                  owner_id: "ou_root",
                  modified_time: "1713873600"
                },
                {
                  token: "fld_child",
                  type: "folder",
                  name: "子目录",
                  modified_time: "1713873601"
                }
              ],
              has_more: false
            }
          };
        }

        return {
          code: 0,
          data: {
            files: [
              {
                token: "dox_child",
                type: "docx",
                name: "子文档",
                url: "https://feishu.cn/docx/dox_child",
                modified_time: "1713873602"
              }
            ],
            has_more: false
          }
        };
      }

      if (path === "docx/v1/documents/dox_root/blocks") {
        return {
          code: 0,
          data: {
            items: [
              {
                block_id: "blk_text",
                block_type: 2,
                parent_id: "dox_root",
                text: {
                  elements: [
                    {
                      text_run: {
                        content: "正文"
                      }
                    }
                  ]
                }
              }
            ],
            has_more: false
          }
        };
      }

      if (path === "drive/v1/metas/batch_query") {
        return {
          code: 0,
          data: {
            metas: [
              {
                doc_token: "dox_root",
                doc_type: "docx",
                title: "根文档",
                owner_id: "ou_root",
                url: "https://feishu.cn/docx/dox_root"
              }
            ]
          }
        };
      }

      throw new Error(`unexpected request: ${path}`);
    }
  };

  const files = await executeTool(
    "list_folder_files",
    {
      folder_token: "fld_root",
      recursive: true,
      max_depth: 1
    },
    { feishuClient }
  );

  assert.equal(files.total, 3);
  assert.equal(files.files[2].path, "子目录/子文档");

  const blocks = await executeTool(
    "get_docx_blocks",
    { document_id: "dox_root" },
    { feishuClient }
  );

  assert.equal(blocks.blocks[0].block_id, "blk_text");
  assert.equal(blocks.blocks[0].plain_text, "正文");
  assert.equal(blocks.blocks[0].parent_id, "dox_root");

  const meta = await executeTool(
    "get_file_meta",
    { url: "https://feishu.cn/docx/dox_root" },
    { feishuClient }
  );

  assert.equal(meta.file_token, "dox_root");
  assert.equal(meta.file_type, "docx");
  assert.equal(meta.title, "根文档");
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).options.body)), {
    request_docs: [{ doc_token: "dox_root", doc_type: "docx" }],
    with_url: true
  });
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
    title: "测试文档",
    dry_run: true
  });

  assert.equal(normalizedCreate.content_type, "plain_text");
  assert.equal(normalizedCreate.index_after_create, false);
  assert.equal(normalizedCreate.dry_run, true);

  const normalizedEdit = validateWriteToolArgs("edit_feishu_doc", {
    document_id: "doxcn_doc",
    operation: "update_text",
    block_id: "blk_text",
    content: "更新",
    expected_old_text: "旧文本",
    verify_after_write: true,
    document_revision_id: "rev_1"
  });

  assert.equal(normalizedEdit.verify_after_write, true);
  assert.equal(normalizedEdit.document_revision_id, "rev_1");

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
