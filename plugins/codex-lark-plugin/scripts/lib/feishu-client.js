const defaultBaseUrl = "https://open.feishu.cn/open-apis/";
const defaultTokenRefreshBufferMs = 60 * 1000;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createErrorMessage(prefix, details = {}) {
  const parts = Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${String(value)}`);

  return parts.length > 0 ? `${prefix} (${parts.join(", ")})` : prefix;
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export class FeishuApiError extends Error {
  constructor(message, details = {}) {
    super(message, details.cause ? { cause: details.cause } : undefined);
    this.name = "FeishuApiError";
    this.status = details.status;
    this.code = details.code;
    this.requestPath = details.requestPath;
    this.requestMethod = details.requestMethod;
    this.context = details.context ?? {};
    this.details = details.details;
  }
}

export function createFeishuClient(config, options = {}) {
  const appId = normalizeText(config?.appId);
  const appSecret = normalizeText(config?.appSecret);

  if (!appId || !appSecret) {
    throw new Error("创建飞书 client 时必须提供 appId 和 appSecret。");
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("当前运行环境不支持 fetch，无法请求飞书 API。");
  }

  const now = options.now ?? Date.now;
  const tokenRefreshBufferMs =
    options.tokenRefreshBufferMs ?? defaultTokenRefreshBufferMs;
  const baseUrl = new URL(options.baseUrl ?? defaultBaseUrl);

  let tokenCache = null;

  function buildUrl(requestPath, searchParams) {
    const normalizedPath = String(requestPath ?? "").replace(/^\/+/, "");
    const url = new URL(normalizedPath, baseUrl);

    if (searchParams) {
      for (const [key, value] of Object.entries(searchParams)) {
        if (value === undefined || value === null || value === "") {
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }

    return url;
  }

  async function parseJsonResponse(response, requestContext) {
    const rawText = await safeReadText(response);

    if (!response.ok) {
      throw new FeishuApiError(
        createErrorMessage("飞书 API HTTP 请求失败", {
          method: requestContext.method,
          path: requestContext.path,
          status: response.status,
          ...requestContext.context
        }),
        {
          status: response.status,
          requestPath: requestContext.path,
          requestMethod: requestContext.method,
          context: requestContext.context,
          details: rawText
        }
      );
    }

    let parsed;

    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch (cause) {
      throw new FeishuApiError(
        createErrorMessage("飞书 API 返回了无法解析的 JSON", {
          method: requestContext.method,
          path: requestContext.path,
          ...requestContext.context
        }),
        {
          requestPath: requestContext.path,
          requestMethod: requestContext.method,
          context: requestContext.context,
          details: rawText,
          cause
        }
      );
    }

    if (typeof parsed.code === "number" && parsed.code !== 0) {
      throw new FeishuApiError(
        createErrorMessage("飞书 API 返回业务错误", {
          method: requestContext.method,
          path: requestContext.path,
          code: parsed.code,
          msg: parsed.msg,
          ...requestContext.context
        }),
        {
          code: parsed.code,
          requestPath: requestContext.path,
          requestMethod: requestContext.method,
          context: requestContext.context,
          details: parsed
        }
      );
    }

    return parsed;
  }

  async function sendRequest(requestPath, requestOptions = {}) {
    const method = (requestOptions.method ?? "GET").toUpperCase();
    const headers = {
      Accept: "application/json",
      ...(requestOptions.headers ?? {})
    };
    const url = buildUrl(requestPath, requestOptions.searchParams);

    if (requestOptions.body !== undefined) {
      headers["Content-Type"] = "application/json; charset=utf-8";
    }

    if (requestOptions.auth !== false) {
      headers.Authorization = `Bearer ${await getTenantAccessToken()}`;
    }

    let response;

    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body:
          requestOptions.body === undefined
            ? undefined
            : JSON.stringify(requestOptions.body)
      });
    } catch (cause) {
      throw new FeishuApiError(
        createErrorMessage("请求飞书 API 失败", {
          method,
          path: requestPath,
          ...requestOptions.context
        }),
        {
          requestPath,
          requestMethod: method,
          context: requestOptions.context,
          cause
        }
      );
    }

    return parseJsonResponse(response, {
      method,
      path: requestPath,
      context: requestOptions.context
    });
  }

  async function getTenantAccessToken(options = {}) {
    const currentTime = now();

    if (
      !options.forceRefresh &&
      tokenCache?.token &&
      tokenCache.expiresAt > currentTime
    ) {
      return tokenCache.token;
    }

    // 官方文档：自建应用通过 auth/v3/tenant_access_token/internal 获取 token，
    // 请求体字段为 app_id / app_secret，返回 tenant_access_token / expire。
    // Source: https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal
    const payload = await sendRequest("auth/v3/tenant_access_token/internal", {
      method: "POST",
      auth: false,
      body: {
        app_id: appId,
        app_secret: appSecret
      }
    });

    if (
      !normalizeText(payload.tenant_access_token) ||
      typeof payload.expire !== "number"
    ) {
      throw new FeishuApiError("飞书 tenant_access_token 响应缺少必要字段。", {
        requestPath: "auth/v3/tenant_access_token/internal",
        requestMethod: "POST",
        details: payload
      });
    }

    const expiresAt = currentTime + Math.max(payload.expire * 1000 - tokenRefreshBufferMs, 0);
    tokenCache = {
      token: payload.tenant_access_token,
      expiresAt
    };

    return tokenCache.token;
  }

  async function request(requestPath, requestOptions = {}) {
    return sendRequest(requestPath, requestOptions);
  }

  function inspectTokenCache() {
    return tokenCache ? { ...tokenCache } : null;
  }

  return {
    getTenantAccessToken,
    request,
    inspectTokenCache
  };
}
