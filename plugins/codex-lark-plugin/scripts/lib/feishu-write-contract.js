import process from "node:process";

export const FEISHU_WRITE_ENABLED_ENV = "LARK_FEISHU_WRITE_ENABLED";
export const MAX_WRITE_CONTENT_LENGTH = 20_000;
export const MAX_DOC_TITLE_LENGTH = 255;
export const MAX_FOLDER_NAME_LENGTH = 200;

const contentTypes = ["plain_text", "markdown"];
const editOperations = ["append", "insert", "update_text"];
const movableFileTypes = [
  "doc",
  "docx",
  "sheet",
  "bitable",
  "mindnote",
  "slides",
  "file",
  "folder"
];

const safeContextKeys = new Set([
  "document_id",
  "folder_token",
  "parent_folder_token",
  "target_folder_token",
  "file_token",
  "file_type",
  "block_id",
  "parent_block_id",
  "operation",
  "content_type",
  "http_status",
  "feishu_code"
]);

export const writeToolDefinitions = [
  {
    name: "create_feishu_doc",
    description: "在指定飞书文件夹下创建新版 docx 文档，可选写入初始内容。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        folder_token: {
          type: "string",
          minLength: 1,
          description: "目标父文件夹 token。"
        },
        title: {
          type: "string",
          minLength: 1,
          maxLength: MAX_DOC_TITLE_LENGTH,
          description: "新文档标题。"
        },
        content: {
          type: "string",
          maxLength: MAX_WRITE_CONTENT_LENGTH,
          description: "可选初始内容。"
        },
        content_type: {
          type: "string",
          enum: contentTypes,
          default: "plain_text",
          description: "初始内容格式。"
        },
        index_after_create: {
          type: "boolean",
          default: false,
          description: "创建后是否强制刷新本地索引。"
        }
      },
      required: ["folder_token", "title"]
    }
  },
  {
    name: "edit_feishu_doc",
    description: "对新版飞书 docx 文档执行受控块编辑，支持追加、插入或更新指定块文本。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        document_id: {
          type: "string",
          minLength: 1,
          description: "目标 docx 文档 ID。"
        },
        operation: {
          type: "string",
          enum: editOperations,
          description: "编辑操作类型。"
        },
        content: {
          type: "string",
          minLength: 1,
          maxLength: MAX_WRITE_CONTENT_LENGTH,
          description: "要写入或更新的文本内容。"
        },
        content_type: {
          type: "string",
          enum: contentTypes,
          default: "plain_text",
          description: "内容格式。"
        },
        parent_block_id: {
          type: "string",
          minLength: 1,
          description: "append 或 insert 的目标父块 ID；append 未传时由实现使用文档根块。"
        },
        index: {
          type: "integer",
          minimum: 0,
          description: "insert 操作的插入位置。"
        },
        block_id: {
          type: "string",
          minLength: 1,
          description: "update_text 操作要更新的块 ID。"
        },
        refresh_index: {
          type: "boolean",
          default: false,
          description: "编辑后是否强制刷新本地索引。"
        }
      },
      required: ["document_id", "operation", "content"]
    }
  },
  {
    name: "create_feishu_folder",
    description: "在指定飞书父文件夹下创建子文件夹。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        parent_folder_token: {
          type: "string",
          minLength: 1,
          description: "目标父文件夹 token。"
        },
        name: {
          type: "string",
          minLength: 1,
          maxLength: MAX_FOLDER_NAME_LENGTH,
          description: "新文件夹名称。"
        }
      },
      required: ["parent_folder_token", "name"]
    }
  },
  {
    name: "move_feishu_file",
    description: "把指定飞书文件或文件夹移动到目标文件夹。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        file_token: {
          type: "string",
          minLength: 1,
          description: "要移动的文件或文件夹 token。"
        },
        file_type: {
          type: "string",
          enum: movableFileTypes,
          description: "要移动对象的类型；首版不做 token 类型推断。"
        },
        target_folder_token: {
          type: "string",
          minLength: 1,
          description: "目标文件夹 token。"
        }
      },
      required: ["file_token", "file_type", "target_folder_token"]
    }
  }
];

export class FeishuWriteError extends Error {
  constructor(message, { code, toolName, context } = {}) {
    super(message);
    this.name = "FeishuWriteError";
    this.code = code;
    this.toolName = toolName;
    this.context = sanitizeWriteContext(context);
  }
}

export function isWriteTool(name) {
  return writeToolDefinitions.some((tool) => tool.name === name);
}

export function sanitizeWriteContext(context = {}) {
  return Object.fromEntries(
    Object.entries(context).filter(([key]) => safeContextKeys.has(key))
  );
}

export function isFeishuWriteEnabled(options = {}) {
  const env = options.env ?? process.env;
  return String(env[FEISHU_WRITE_ENABLED_ENV] ?? "").trim().toLowerCase() === "true";
}

export function assertFeishuWriteEnabled(toolName, options = {}) {
  if (!isFeishuWriteEnabled(options)) {
    throw new FeishuWriteError(
      `飞书写入能力默认禁用。请显式设置 ${FEISHU_WRITE_ENABLED_ENV}=true 后再调用 ${toolName}。`,
      {
        code: "FEISHU_WRITE_DISABLED",
        toolName
      }
    );
  }
}

export function validateWriteToolArgs(toolName, args = {}) {
  switch (toolName) {
    case "create_feishu_doc":
      requireString(args.folder_token, "folder_token", toolName);
      requireString(args.title, "title", toolName, {
        maxLength: MAX_DOC_TITLE_LENGTH
      });
      validateOptionalContent(args.content, toolName);
      validateContentType(args.content_type, toolName);
      validateOptionalBoolean(args.index_after_create, "index_after_create", toolName);
      return {
        ...args,
        content_type: args.content_type ?? "plain_text",
        index_after_create: args.index_after_create ?? false
      };

    case "edit_feishu_doc":
      requireString(args.document_id, "document_id", toolName);
      requireEnum(args.operation, "operation", editOperations, toolName);
      requireString(args.content, "content", toolName, {
        maxLength: MAX_WRITE_CONTENT_LENGTH
      });
      validateContentType(args.content_type, toolName);
      validateOptionalBoolean(args.refresh_index, "refresh_index", toolName);

      if (args.operation === "insert") {
        requireString(args.parent_block_id, "parent_block_id", toolName);
        requireInteger(args.index, "index", toolName, { min: 0 });
      }

      if (args.operation === "update_text") {
        requireString(args.block_id, "block_id", toolName);
      }

      return {
        ...args,
        content_type: args.content_type ?? "plain_text",
        refresh_index: args.refresh_index ?? false
      };

    case "create_feishu_folder":
      requireString(args.parent_folder_token, "parent_folder_token", toolName);
      requireFolderName(args.name, toolName);
      return args;

    case "move_feishu_file":
      requireString(args.file_token, "file_token", toolName);
      requireEnum(args.file_type, "file_type", movableFileTypes, toolName);
      requireString(args.target_folder_token, "target_folder_token", toolName);

      if (args.file_token === args.target_folder_token) {
        throw validationError(
          "file_token 不能与 target_folder_token 相同。",
          toolName,
          {
            file_token: args.file_token,
            file_type: args.file_type,
            target_folder_token: args.target_folder_token
          }
        );
      }

      return args;

    default:
      throw new Error(`未知写入 tool: ${toolName}`);
  }
}

function validateOptionalContent(content, toolName) {
  if (content === undefined) {
    return;
  }

  requireString(content, "content", toolName, {
    allowEmpty: true,
    maxLength: MAX_WRITE_CONTENT_LENGTH
  });
}

function validateContentType(contentType, toolName) {
  if (contentType === undefined) {
    return;
  }

  requireEnum(contentType, "content_type", contentTypes, toolName);
}

function validateOptionalBoolean(value, field, toolName) {
  if (value === undefined || typeof value === "boolean") {
    return;
  }

  throw validationError(`${field} 必须是布尔值。`, toolName);
}

function requireFolderName(value, toolName) {
  requireString(value, "name", toolName, {
    maxLength: MAX_FOLDER_NAME_LENGTH
  });

  if (/[\\/:*?"<>|]/.test(value)) {
    throw validationError("name 包含非法文件夹名称字符。", toolName);
  }
}

function requireString(value, field, toolName, options = {}) {
  const allowEmpty = options.allowEmpty ?? false;
  const maxLength = options.maxLength;

  if (typeof value !== "string") {
    throw validationError(`${field} 必须是字符串。`, toolName);
  }

  if (!allowEmpty && value.trim() === "") {
    throw validationError(`${field} 不能为空。`, toolName);
  }

  if (maxLength !== undefined && value.length > maxLength) {
    throw validationError(`${field} 长度不能超过 ${maxLength} 个字符。`, toolName);
  }
}

function requireEnum(value, field, values, toolName) {
  if (!values.includes(value)) {
    throw validationError(`${field} 仅支持: ${values.join(", ")}。`, toolName);
  }
}

function requireInteger(value, field, toolName, options = {}) {
  if (!Number.isInteger(value)) {
    throw validationError(`${field} 必须是整数。`, toolName);
  }

  if (options.min !== undefined && value < options.min) {
    throw validationError(`${field} 不能小于 ${options.min}。`, toolName);
  }
}

function validationError(message, toolName, context) {
  return new FeishuWriteError(message, {
    code: "FEISHU_WRITE_INVALID_ARGUMENTS",
    toolName,
    context
  });
}
