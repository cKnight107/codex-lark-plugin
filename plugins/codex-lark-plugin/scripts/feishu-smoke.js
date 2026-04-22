import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { ensureIndex } from "./lib/index-store.js";
import { executeTool } from "./lib/knowledge-tools.js";

const requiredEnvKeys = [
  "LARK_FEISHU_APP_ID",
  "LARK_FEISHU_APP_SECRET",
  "LARK_FEISHU_SYNC_ROOTS"
];

process.env.LARK_DOCS_SOURCE ??= "feishu";

const missingKeys = requiredEnvKeys.filter((key) => !process.env[key]?.trim());

if (missingKeys.length > 0) {
  throw new Error(
    `运行真实飞书 smoke test 前缺少配置：${missingKeys.join(", ")}。请在本地 MCP 配置的 env 中补齐。`
  );
}

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-lark-feishu-smoke-"));
const tempIndexPath = path.join(tempDir, "index.json");
const { index } = await ensureIndex({
  forceSync: true,
  indexPath: tempIndexPath
});

if (index.source_type !== "feishu") {
  throw new Error("真实飞书 smoke test 未进入 feishu 模式。");
}

if (!index.documents?.length) {
  throw new Error("真实飞书 smoke test 未同步到任何文档。");
}

const firstDocument = index.documents[0];

for (const field of ["doc_id", "title", "updated_at", "url", "body", "source_path"]) {
  if (!firstDocument[field]) {
    throw new Error(`真实飞书 smoke test 首篇文档缺少字段：${field}`);
  }
}

const summary = await executeTool(
  "get_doc_summary",
  { doc_id: firstDocument.doc_id },
  { indexPath: tempIndexPath }
);

process.stdout.write(
  `${JSON.stringify(
    {
      sourceType: index.source_type,
      sourceSignature: index.source_signature,
      documents: index.documents.length,
      firstDocId: firstDocument.doc_id,
      firstDocTitle: firstDocument.title,
      summaryDocId: summary.doc_id,
      indexPath: tempIndexPath
    },
    null,
    2
  )}\n`
);
