import { loadFixture } from "./fixture-client.js";
import { createFeishuClient } from "./feishu-client.js";
import { loadFeishuDocuments } from "./feishu-docs-source.js";

const supportedSourceTypes = new Set(["sample", "feishu"]);
const supportedRootTypes = new Set(["folder", "wiki"]);

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSourceType(value) {
  const sourceType = normalizeText(value || "sample").toLowerCase();

  if (!supportedSourceTypes.has(sourceType)) {
    throw new Error(
      `LARK_DOCS_SOURCE 仅支持 sample 或 feishu，当前收到: ${value}`
    );
  }

  return sourceType;
}

function parseSyncRoots(rawValue) {
  if (!rawValue) {
    throw new Error(
      "LARK_DOCS_SOURCE=feishu 时必须提供 LARK_FEISHU_SYNC_ROOTS，且内容必须是非空 JSON 数组。"
    );
  }

  let parsedValue = rawValue;

  if (typeof rawValue === "string") {
    try {
      parsedValue = JSON.parse(rawValue);
    } catch {
      throw new Error(
        "LARK_FEISHU_SYNC_ROOTS 必须是 JSON 数组，例如：[{\"type\":\"folder\",\"token\":\"fldcn...\"}]。"
      );
    }
  }

  if (!Array.isArray(parsedValue) || parsedValue.length === 0) {
    throw new Error(
      "LARK_FEISHU_SYNC_ROOTS 必须是非空数组，且每个元素都要声明同步根入口。"
    );
  }

  return parsedValue.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(
        `LARK_FEISHU_SYNC_ROOTS[${index}] 必须是对象，格式为 {\"type\":\"folder|wiki\",\"token\":\"...\"}。`
      );
    }

    const type = normalizeText(entry.type).toLowerCase();
    const token = normalizeText(entry.token);

    if (!supportedRootTypes.has(type)) {
      throw new Error(
        `LARK_FEISHU_SYNC_ROOTS[${index}].type 仅支持 folder 或 wiki，当前收到: ${entry.type}`
      );
    }

    if (!token) {
      throw new Error(`LARK_FEISHU_SYNC_ROOTS[${index}].token 不能为空。`);
    }

    return {
      type,
      token
    };
  });
}

export function resolveDataSourceConfig(options = {}, env = process.env) {
  const sourceType = normalizeSourceType(
    options.sourceType ?? env.LARK_DOCS_SOURCE ?? "sample"
  );

  if (sourceType === "sample") {
    return {
      sourceType,
      fixturePath: options.fixturePath ?? env.LARK_DOCS_FIXTURE
    };
  }

  const appId = normalizeText(options.appId ?? env.LARK_FEISHU_APP_ID);
  const appSecret = normalizeText(
    options.appSecret ?? env.LARK_FEISHU_APP_SECRET
  );
  const syncRoots = parseSyncRoots(
    options.syncRoots ?? env.LARK_FEISHU_SYNC_ROOTS
  );

  const missingFields = [];

  if (!appId) {
    missingFields.push("LARK_FEISHU_APP_ID");
  }

  if (!appSecret) {
    missingFields.push("LARK_FEISHU_APP_SECRET");
  }

  if (missingFields.length > 0) {
    throw new Error(
      `LARK_DOCS_SOURCE=feishu 时缺少必填配置: ${missingFields.join(", ")}。`
    );
  }

  return {
    sourceType,
    appId,
    appSecret,
    syncRoots
  };
}

export async function loadDocumentSource(options = {}, env = process.env) {
  const config = resolveDataSourceConfig(options, env);

  if (config.sourceType === "sample") {
    const fixture = await loadFixture({
      ...options,
      fixturePath: config.fixturePath
    });

    return {
      sourceType: "sample",
      ...fixture
    };
  }

  const [catalogs, documents] = await Promise.all([
    loadFixture({
      fixturePath: options.fixturePath ?? env.LARK_DOCS_FIXTURE
    }),
    loadFeishuDocuments({
      client:
        options.feishuClient ??
        createFeishuClient(config, {
          fetchImpl: options.fetchImpl,
          baseUrl: options.baseUrl
        }),
      syncRoots: config.syncRoots
    })
  ]);

  return {
    sourceType: "feishu",
    projects: catalogs.projects ?? [],
    docTypes: catalogs.docTypes ?? [],
    documents
  };
}
