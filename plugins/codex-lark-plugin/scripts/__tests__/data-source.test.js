import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ensureIndex } from "../lib/index-store.js";
import { resolveDataSourceConfig } from "../lib/data-source.js";

async function createTempIndexPath() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "codex-lark-plugin-source-test-")
  );
  return path.join(directory, "index.json");
}

function createStubFeishuClient() {
  return {
    async request(path, options = {}) {
      if (path === "drive/v1/files") {
        return {
          code: 0,
          data: {
            files: [
              {
                name: "Atlas 方案",
                token: "dox_stub",
                type: "docx",
                owner_id: "ou_stub",
                modified_time: "1714305600",
                url: "https://feishu.cn/docx/dox_stub"
              }
            ],
            has_more: false
          }
        };
      }

      if (path === "docx/v1/documents/dox_stub/raw_content") {
        return {
          code: 0,
          data: {
            content: "Atlas 平台同步方案正文。"
          }
        };
      }

      throw new Error(`unexpected request: ${path} ${JSON.stringify(options)}`);
    }
  };
}

test("默认使用 sample 数据源配置", () => {
  const config = resolveDataSourceConfig({}, {});

  assert.equal(config.sourceType, "sample");
  assert.equal(config.fixturePath, undefined);
});

test("feishu 模式会校验必填凭证", () => {
  assert.throws(
    () =>
      resolveDataSourceConfig(
        {
          sourceType: "feishu",
          syncRoots: [{ type: "folder", token: "fldcn_root" }]
        },
        {}
      ),
    /LARK_FEISHU_APP_ID, LARK_FEISHU_APP_SECRET/
  );
});

test("feishu 模式会解析同步根入口契约", () => {
  const config = resolveDataSourceConfig(
    {
      sourceType: "feishu",
      appId: "cli_xxx",
      appSecret: "secret_xxx",
      syncRoots: JSON.stringify([
        { type: "folder", token: "fldcn_root" },
        { type: "wiki", token: "wiki_root" }
      ])
    },
    {}
  );

  assert.equal(config.sourceType, "feishu");
  assert.deepEqual(config.syncRoots, [
    { type: "folder", token: "fldcn_root" },
    { type: "wiki", token: "wiki_root" }
  ]);
});

test("非法数据源模式会快速报错", () => {
  assert.throws(
    () => resolveDataSourceConfig({ sourceType: "remote" }, {}),
    /sample 或 feishu/
  );
});

test("ensureIndex 在 feishu 模式下可生成兼容索引", async () => {
  const indexPath = await createTempIndexPath();

  const { index } = await ensureIndex({
    sourceType: "feishu",
    appId: "cli_xxx",
    appSecret: "secret_xxx",
    syncRoots: [{ type: "folder", token: "fldcn_root" }],
    indexPath,
    forceSync: true,
    feishuClient: createStubFeishuClient()
  });

  assert.equal(index.source_type, "feishu");
  assert.ok(index.documents.some((item) => item.doc_id === "dox_stub"));
});
