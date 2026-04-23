import { loadFixture } from "./fixture-client.js";
import { createFeishuClient } from "./feishu-client.js";
import { loadFeishuDocuments } from "./feishu-docs-source.js";
import {
  readPersistedUserToken,
  resolveUserTokenPath,
  writePersistedUserToken
} from "./oauth-user-token.js";

const supportedSourceTypes = new Set(["sample", "feishu"]);
const supportedRootTypes = new Set(["folder", "wiki"]);
const supportedTokenModes = new Set(["tenant", "user"]);

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeTokenMode(value) {
  const tokenMode = normalizeText(value || "tenant").toLowerCase();

  if (!supportedTokenModes.has(tokenMode)) {
    throw new Error(
      `LARK_FEISHU_TOKEN_MODE 仅支持 tenant 或 user，当前收到: ${value}`
    );
  }

  return tokenMode;
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
  const tokenMode = normalizeTokenMode(
    options.tokenMode ?? env.LARK_FEISHU_TOKEN_MODE ?? "tenant"
  );
  const syncRoots = parseSyncRoots(
    options.syncRoots ?? env.LARK_FEISHU_SYNC_ROOTS
  );
  const userAccessToken = normalizeText(
    options.userAccessToken ?? env.LARK_FEISHU_USER_ACCESS_TOKEN
  );
  const userRefreshToken = normalizeText(
    options.userRefreshToken ?? env.LARK_FEISHU_USER_REFRESH_TOKEN
  );
  const userTokenPath = normalizeText(
    options.userTokenPath ?? env.LARK_FEISHU_USER_TOKEN_PATH
  );
  const userAccessTokenExpiresAt = normalizeNumber(
    options.userAccessTokenExpiresAt ??
      env.LARK_FEISHU_USER_ACCESS_TOKEN_EXPIRES_AT
  );
  const userRefreshTokenExpiresAt = normalizeNumber(
    options.userRefreshTokenExpiresAt ??
      env.LARK_FEISHU_USER_REFRESH_TOKEN_EXPIRES_AT
  );

  const missingFields = [];

  if (tokenMode === "tenant") {
    if (!appId) {
      missingFields.push("LARK_FEISHU_APP_ID");
    }

    if (!appSecret) {
      missingFields.push("LARK_FEISHU_APP_SECRET");
    }
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
    syncRoots,
    tokenMode,
    userAccessToken,
    userRefreshToken,
    userAccessTokenExpiresAt,
    userRefreshTokenExpiresAt,
    userTokenPath
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

  const persistedUserToken =
    config.tokenMode === "user"
      ? await readPersistedUserToken(config.userTokenPath)
      : null;
  const userClientConfig =
    config.tokenMode === "user"
      ? {
          ...persistedUserToken,
          userAccessToken:
            config.userAccessToken || persistedUserToken?.userAccessToken,
          userRefreshToken:
            config.userRefreshToken || persistedUserToken?.userRefreshToken,
          userAccessTokenExpiresAt:
            config.userAccessTokenExpiresAt ??
            persistedUserToken?.userAccessTokenExpiresAt,
          userRefreshTokenExpiresAt:
            config.userRefreshTokenExpiresAt ??
            persistedUserToken?.userRefreshTokenExpiresAt
        }
      : {};

  const [catalogs, documents] = await Promise.all([
    loadFixture({
      fixturePath: options.fixturePath ?? env.LARK_DOCS_FIXTURE
    }),
    loadFeishuDocuments({
      client:
        options.feishuClient ??
        createFeishuClient(
          {
            ...config,
            ...userClientConfig
          },
          {
            fetchImpl: options.fetchImpl,
            baseUrl: options.baseUrl,
            onUserTokenUpdate:
              config.tokenMode === "user"
                ? (token) =>
                    writePersistedUserToken(
                      resolveUserTokenPath(config.userTokenPath),
                      token
                    )
                : undefined
          }
        ),
      syncRoots: config.syncRoots
    })
  ]);

  return {
    sourceType: "feishu",
    appId: config.appId,
    syncRoots: config.syncRoots,
    tokenMode: config.tokenMode,
    userTokenPath:
      config.tokenMode === "user"
        ? resolveUserTokenPath(config.userTokenPath)
        : "",
    projects: catalogs.projects ?? [],
    docTypes: catalogs.docTypes ?? [],
    documents
  };
}

export async function createFeishuClientForTool(options = {}, env = process.env) {
  const appId = normalizeText(options.appId ?? env.LARK_FEISHU_APP_ID);
  const appSecret = normalizeText(
    options.appSecret ?? env.LARK_FEISHU_APP_SECRET
  );
  const tokenMode = normalizeTokenMode(
    options.tokenMode ?? env.LARK_FEISHU_TOKEN_MODE ?? "tenant"
  );
  const userAccessToken = normalizeText(
    options.userAccessToken ?? env.LARK_FEISHU_USER_ACCESS_TOKEN
  );
  const userRefreshToken = normalizeText(
    options.userRefreshToken ?? env.LARK_FEISHU_USER_REFRESH_TOKEN
  );
  const userTokenPath = normalizeText(
    options.userTokenPath ?? env.LARK_FEISHU_USER_TOKEN_PATH
  );
  const userAccessTokenExpiresAt = normalizeNumber(
    options.userAccessTokenExpiresAt ??
      env.LARK_FEISHU_USER_ACCESS_TOKEN_EXPIRES_AT
  );
  const userRefreshTokenExpiresAt = normalizeNumber(
    options.userRefreshTokenExpiresAt ??
      env.LARK_FEISHU_USER_REFRESH_TOKEN_EXPIRES_AT
  );

  if (tokenMode === "tenant" && (!appId || !appSecret)) {
    throw new Error(
      "调用真实飞书 MCP tool 时，tenant 模式必须提供 LARK_FEISHU_APP_ID 和 LARK_FEISHU_APP_SECRET。"
    );
  }

  const persistedUserToken =
    tokenMode === "user" ? await readPersistedUserToken(userTokenPath) : null;
  const userClientConfig =
    tokenMode === "user"
      ? {
          ...persistedUserToken,
          userAccessToken:
            userAccessToken || persistedUserToken?.userAccessToken,
          userRefreshToken:
            userRefreshToken || persistedUserToken?.userRefreshToken,
          userAccessTokenExpiresAt:
            userAccessTokenExpiresAt ??
            persistedUserToken?.userAccessTokenExpiresAt,
          userRefreshTokenExpiresAt:
            userRefreshTokenExpiresAt ??
            persistedUserToken?.userRefreshTokenExpiresAt
        }
      : {};

  return createFeishuClient(
    {
      appId,
      appSecret,
      tokenMode,
      userAccessToken,
      userRefreshToken,
      userAccessTokenExpiresAt,
      userRefreshTokenExpiresAt,
      userTokenPath,
      ...userClientConfig
    },
    {
      fetchImpl: options.fetchImpl,
      baseUrl: options.baseUrl,
      onUserTokenUpdate:
        tokenMode === "user"
          ? (token) =>
              writePersistedUserToken(
                resolveUserTokenPath(userTokenPath),
                token
              )
          : undefined
    }
  );
}

export async function createFeishuClientForWrite(options = {}, env = process.env) {
  return createFeishuClientForTool(options, env);
}
