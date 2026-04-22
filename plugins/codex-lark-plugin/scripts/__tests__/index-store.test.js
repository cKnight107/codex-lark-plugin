import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ensureIndex } from "../lib/index-store.js";
import { executeTool } from "../lib/knowledge-tools.js";

async function createTempIndexPath() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "codex-lark-plugin-index-test-")
  );
  return path.join(directory, "index.json");
}

async function createTempFixturePath() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "codex-lark-plugin-fixture-test-")
  );
  const fixturePath = path.join(directory, "fixture.json");

  await fs.writeFile(
    fixturePath,
    `${JSON.stringify(
      {
        projects: [
          {
            project_id: "atlas-platform",
            name: "Atlas Platform",
            keywords: ["atlas"]
          }
        ],
        docTypes: [
          {
            doc_type: "design",
            keywords: ["方案", "design"]
          }
        ],
        documents: [
          {
            doc_id: "doc-atlas-temp",
            title: "Atlas 临时方案",
            url: "https://feishu.cn/docx/doc-atlas-temp",
            author: "ou_temp",
            updated_at: "2026-04-22T12:00:00.000Z",
            source_path: "飞书/Atlas/方案",
            body: "Atlas 临时方案正文。",
            revisions: [
              {
                timestamp: "2026-04-22T12:00:00.000Z",
                content: "Atlas 临时方案正文。"
              }
            ]
          }
        ]
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return fixturePath;
}

function createFeishuClient(documentId, body, stats) {
  return {
    async request(requestPath, options = {}) {
      stats.calls.push({
        requestPath,
        options
      });

      if (requestPath === "drive/v1/files") {
        return {
          code: 0,
          data: {
            files: [
              {
                name: `${documentId} title`,
                token: documentId,
                type: "docx",
                owner_id: "ou_index",
                modified_time: "1714305600",
                url: `https://feishu.cn/docx/${documentId}`
              }
            ],
            has_more: false
          }
        };
      }

      if (requestPath === `docx/v1/documents/${documentId}/raw_content`) {
        return {
          code: 0,
          data: {
            content: body
          }
        };
      }

      throw new Error(`unexpected request: ${requestPath}`);
    }
  };
}

test("sample 模式在 fixture 未变化时会直接复用已有索引", async () => {
  const indexPath = await createTempIndexPath();
  const fixturePath = await createTempFixturePath();
  const first = await ensureIndex({ forceSync: true, indexPath, fixturePath });
  const second = await ensureIndex({ indexPath, fixturePath });

  assert.equal(second.index.generated_at, first.index.generated_at);
  assert.equal(second.index.source_type, "sample");
});

test("feishu 模式在 source signature 未变化时不会重复请求远端", async () => {
  const indexPath = await createTempIndexPath();
  const stats = { calls: [] };
  const client = createFeishuClient("dox_cached", "cached body", stats);

  const first = await ensureIndex({
    sourceType: "feishu",
    appId: "cli_test",
    appSecret: "secret_test",
    syncRoots: [{ type: "folder", token: "fld_root" }],
    feishuClient: client,
    indexPath,
    forceSync: true
  });
  const callCountAfterFirstRun = stats.calls.length;
  const second = await ensureIndex({
    sourceType: "feishu",
    appId: "cli_test",
    appSecret: "secret_test",
    syncRoots: [{ type: "folder", token: "fld_root" }],
    feishuClient: client,
    indexPath
  });

  assert.equal(second.index.generated_at, first.index.generated_at);
  assert.equal(second.index.source_type, "feishu");
  assert.equal(second.index.source_signature, first.index.source_signature);
  assert.equal(stats.calls.length, callCountAfterFirstRun);
});

test("feishu 模式在 syncRoots 变化时会刷新索引", async () => {
  const indexPath = await createTempIndexPath();
  const firstStats = { calls: [] };
  const secondStats = { calls: [] };

  await ensureIndex({
    sourceType: "feishu",
    appId: "cli_test",
    appSecret: "secret_test",
    syncRoots: [{ type: "folder", token: "fld_root_a" }],
    feishuClient: createFeishuClient("dox_root_a", "root a body", firstStats),
    indexPath,
    forceSync: true
  });

  const refreshed = await ensureIndex({
    sourceType: "feishu",
    appId: "cli_test",
    appSecret: "secret_test",
    syncRoots: [{ type: "folder", token: "fld_root_b" }],
    feishuClient: createFeishuClient("dox_root_b", "root b body", secondStats),
    indexPath
  });

  assert.ok(secondStats.calls.length > 0);
  assert.ok(refreshed.index.documents.some((item) => item.doc_id === "dox_root_b"));
  assert.equal(refreshed.index.source_type, "feishu");
  assert.equal(refreshed.index.source.syncRoots[0].token, "fld_root_b");
});

test("feishu 模式首次同步时 compare_doc_changes 会给出明确降级提示", async () => {
  const indexPath = await createTempIndexPath();
  const options = {
    sourceType: "feishu",
    appId: "cli_test",
    appSecret: "secret_test",
    syncRoots: [{ type: "folder", token: "fld_root" }],
    indexPath
  };

  await ensureIndex({
    ...options,
    feishuClient: createFeishuClient("dox_single", "single body", { calls: [] }),
    forceSync: true
  });

  await assert.rejects(
    () =>
      executeTool(
        "compare_doc_changes",
        { doc_id: "dox_single" },
        options
      ),
    /至少完成两次同步后才能比较差异/
  );
});

test("feishu 模式重复同步同一文档后会累积本地快照并支持 diff", async () => {
  const indexPath = await createTempIndexPath();
  const options = {
    sourceType: "feishu",
    appId: "cli_test",
    appSecret: "secret_test",
    syncRoots: [{ type: "folder", token: "fld_root" }],
    indexPath
  };

  await ensureIndex({
    ...options,
    feishuClient: createFeishuClient("dox_compare", "old line", { calls: [] }),
    forceSync: true
  });

  const refreshed = await ensureIndex({
    ...options,
    feishuClient: createFeishuClient(
      "dox_compare",
      "old line\nnew line",
      { calls: [] }
    ),
    forceSync: true
  });

  const document = refreshed.index.documents.find((item) => item.doc_id === "dox_compare");
  assert.equal(document.revisions.length, 2);

  const diff = await executeTool(
    "compare_doc_changes",
    { doc_id: "dox_compare" },
    options
  );

  assert.equal(diff.doc_id, "dox_compare");
  assert.ok(diff.added_paragraphs.some((line) => line.includes("new line")));
});
