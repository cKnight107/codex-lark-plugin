import {
  createFeishuClientForTool,
  createFeishuClientForWrite
} from "./data-source.js";
import { createFeishuDoc, editFeishuDoc } from "./feishu-doc-write.js";
import {
  createFeishuFolder,
  moveFeishuFile
} from "./feishu-drive-write.js";
import {
  getDocxBlocks,
  getFileMeta,
  listFolderFilesTool
} from "./feishu-read-tools.js";
import {
  assertFeishuWriteEnabled,
  isWriteTool,
  validateWriteToolArgs,
  writeToolDefinitions
} from "./feishu-write-contract.js";
import { ensureIndex } from "./index-store.js";
import { diffParagraphs, normalizeText, tokenize } from "./text-utils.js";

const readToolDefinitions = [
  {
    name: "list_project_docs",
    description: "按项目列出文档，默认按更新时间倒序。",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "项目 ID" },
        limit: { type: "number", minimum: 1, maximum: 50, default: 10 }
      },
      required: ["project"]
    }
  },
  {
    name: "search_docs",
    description: "按关键词检索文档，可选项目和文档类型过滤。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "检索关键词" },
        project: { type: "string" },
        doc_type: { type: "string" },
        limit: { type: "number", minimum: 1, maximum: 20, default: 5 }
      },
      required: ["query"]
    }
  },
  {
    name: "get_doc_summary",
    description: "根据文档 ID 或 URL 获取摘要与元数据。",
    inputSchema: {
      type: "object",
      properties: {
        doc_id: { type: "string" },
        url: { type: "string" }
      }
    }
  },
  {
    name: "list_recent_docs",
    description: "列出最近更新的文档。",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        days: { type: "number", minimum: 1, maximum: 90, default: 7 },
        limit: { type: "number", minimum: 1, maximum: 50, default: 10 }
      }
    }
  },
  {
    name: "compare_doc_changes",
    description: "比较文档两个 revision 之间的变化。",
    inputSchema: {
      type: "object",
      properties: {
        doc_id: { type: "string" },
        from: { type: "string", description: "起始时间戳，可选" },
        to: { type: "string", description: "结束时间戳，可选" }
      },
      required: ["doc_id"]
    }
  },
  {
    name: "list_folder_files",
    description: "按 folder_token 列出飞书云空间文件夹内容，可选递归返回路径。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        folder_token: {
          type: "string",
          minLength: 1,
          description: "目标飞书文件夹 token。"
        },
        recursive: {
          type: "boolean",
          default: false,
          description: "是否递归列出子文件夹。"
        },
        max_depth: {
          type: "integer",
          minimum: 0,
          maximum: 20,
          default: 0,
          description: "递归最大深度；recursive=false 时忽略。"
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          default: 100,
          description: "最多返回文件数量。"
        }
      },
      required: ["folder_token"]
    }
  },
  {
    name: "get_docx_blocks",
    description: "分页读取新版飞书 docx 文档块，返回 block_id、类型、纯文本、elements 和父块信息。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        document_id: {
          type: "string",
          minLength: 1,
          description: "目标 docx 文档 ID。"
        },
        page_size: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          default: 100
        },
        page_token: {
          type: "string"
        },
        document_revision_id: {
          type: "string",
          description: "可选文档版本 ID，用于读取指定版本块结构。"
        }
      },
      required: ["document_id"]
    }
  },
  {
    name: "get_file_meta",
    description: "按 token 或飞书 URL 获取文件元信息，包含类型、标题、链接和所有者等字段。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        token: {
          type: "string",
          description: "文件 token；也可使用 file_token。"
        },
        file_token: {
          type: "string",
          description: "文件 token。"
        },
        url: {
          type: "string",
          description: "飞书文件 URL，可用于推断 token 和 file_type。"
        },
        file_type: {
          type: "string",
          enum: [
            "doc",
            "docx",
            "sheet",
            "bitable",
            "mindnote",
            "slides",
            "file",
            "folder"
          ],
          description: "文件类型；无法从 token 或 URL 推断时必填。"
        },
        with_url: {
          type: "boolean",
          default: true,
          description: "是否要求飞书返回 URL。"
        }
      }
    }
  }
];

export const toolDefinitions = [...readToolDefinitions, ...writeToolDefinitions];
const atomicReadToolNames = new Set([
  "list_folder_files",
  "get_docx_blocks",
  "get_file_meta"
]);

function slimDocument(document) {
  return {
    doc_id: document.doc_id,
    title: document.title,
    project_id: document.project_id,
    doc_type: document.doc_type,
    author: document.author,
    updated_at: document.updated_at,
    summary: document.summary,
    url: document.url,
    inference_source: document.inference_source,
    inference_confidence: document.inference_confidence
  };
}

function filterDocuments(documents, project, docType) {
  return documents.filter((document) => {
    if (project && document.project_id !== project) {
      return false;
    }

    if (docType && document.doc_type !== docType) {
      return false;
    }

    return true;
  });
}

function scoreDocument(document, query) {
  const normalizedQuery = normalizeText(query);
  const tokens = tokenize(query);
  const title = normalizeText(document.title);
  const body = normalizeText(document.body);
  const summary = normalizeText(document.summary);
  let score = 0;

  if (title.includes(normalizedQuery)) {
    score += 8;
  }

  if (body.includes(normalizedQuery)) {
    score += 4;
  }

  for (const token of tokens) {
    if (title.includes(token)) {
      score += 3;
    }

    if (body.includes(token) || summary.includes(token)) {
      score += 1;
    }
  }

  return score;
}

function requireDocument(documents, args) {
  const document = documents.find(
    (item) => item.doc_id === args.doc_id || item.url === args.url
  );

  if (!document) {
    throw new Error("未找到匹配的文档。");
  }

  return document;
}

function pickRevision(revisions, cursor) {
  const ordered = [...revisions].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp)
  );

  if (ordered.length === 0) {
    return null;
  }

  if (!cursor) {
    return ordered.at(-1);
  }

  const exact = ordered.find((item) => item.timestamp === cursor);

  if (exact) {
    return exact;
  }

  const targetTime = new Date(cursor).getTime();
  const previous = ordered.filter(
    (item) => new Date(item.timestamp).getTime() <= targetTime
  );

  return previous.at(-1) ?? ordered[0];
}

export async function executeTool(name, args = {}, options = {}) {
  if (isWriteTool(name)) {
    return executeWriteTool(name, args, options);
  }

  if (atomicReadToolNames.has(name)) {
    return executeAtomicReadTool(name, args, options);
  }

  const { index } = await ensureIndex(options);
  const documents = index.documents ?? [];

  switch (name) {
    case "list_project_docs": {
      const limit = args.limit ?? 10;
      return {
        total: filterDocuments(documents, args.project).length,
        documents: filterDocuments(documents, args.project)
          .slice(0, limit)
          .map(slimDocument)
      };
    }

    case "search_docs": {
      const limit = args.limit ?? 5;
      const filtered = filterDocuments(documents, args.project, args.doc_type);
      return {
        total: filtered.length,
        documents: filtered
          .map((document) => ({
            ...slimDocument(document),
            match_score: scoreDocument(document, args.query)
          }))
          .filter((document) => document.match_score > 0)
          .sort((left, right) => right.match_score - left.match_score)
          .slice(0, limit)
      };
    }

    case "get_doc_summary": {
      const document = requireDocument(documents, args);
      return slimDocument(document);
    }

    case "list_recent_docs": {
      const days = args.days ?? 7;
      const now = new Date(options.now ?? Date.now());
      const threshold = now.getTime() - days * 24 * 60 * 60 * 1000;
      const filtered = filterDocuments(documents, args.project).filter(
        (document) => new Date(document.updated_at).getTime() >= threshold
      );

      return {
        total: filtered.length,
        documents: filtered
          .slice(0, args.limit ?? 10)
          .map(slimDocument)
      };
    }

    case "compare_doc_changes": {
      const document = requireDocument(documents, args);
      const latest = pickRevision(document.revisions, args.to);
      const baselineCursor =
        args.from !== undefined
          ? args.from
          : document.revisions.length >= 2
            ? document.revisions.at(-2)?.timestamp
            : null;
      const baseline = baselineCursor
        ? pickRevision(document.revisions, baselineCursor)
        : null;

      if (!latest || !baseline) {
        if (index.source_type === "feishu") {
          throw new Error(
            "真实飞书模式下该文档当前只有 1 个本地同步快照，至少完成两次同步后才能比较差异。"
          );
        }
        throw new Error("文档缺少足够的 revision 数据，无法比较。");
      }

      const diff = diffParagraphs(baseline.content, latest.content);

      return {
        doc_id: document.doc_id,
        title: document.title,
        from: baseline.timestamp,
        to: latest.timestamp,
        added_paragraphs: diff.added,
        removed_paragraphs: diff.removed,
        summary: `新增 ${diff.added.length} 段，删除 ${diff.removed.length} 段。`
      };
    }

    default:
      throw new Error(`未知 tool: ${name}`);
  }
}

async function executeAtomicReadTool(name, args = {}, options = {}) {
  const client =
    options.feishuClient ??
    (await createFeishuClientForTool(options, options.env ?? process.env));

  switch (name) {
    case "list_folder_files":
      return listFolderFilesTool({ client, args });

    case "get_docx_blocks":
      return getDocxBlocks({ client, args });

    case "get_file_meta":
      return getFileMeta({ client, args });

    default:
      throw new Error(`未知原子读 tool: ${name}`);
  }
}

async function executeWriteTool(name, args = {}, options = {}) {
  assertFeishuWriteEnabled(name, options);
  const normalizedArgs = validateWriteToolArgs(name, args);
  const client =
    options.feishuClient ??
    (await createFeishuClientForWrite(options, options.env ?? process.env));

  switch (name) {
    case "create_feishu_doc": {
      const result = await createFeishuDoc({
        client,
        args: normalizedArgs
      });

      if (normalizedArgs.index_after_create) {
        await ensureIndex({ ...options, forceSync: true });
        return {
          ...result,
          indexed: true
        };
      }

      return result;
    }

    case "edit_feishu_doc": {
      const result = await editFeishuDoc({
        client,
        args: normalizedArgs
      });

      if (normalizedArgs.refresh_index) {
        await ensureIndex({ ...options, forceSync: true });
        return {
          ...result,
          indexed: true
        };
      }

      return {
        ...result,
        indexed: false
      };
    }

    case "create_feishu_folder":
      return createFeishuFolder({
        client,
        args: normalizedArgs
      });

    case "move_feishu_file":
      return moveFeishuFile({
        client,
        args: normalizedArgs
      });

    default:
      throw new Error(`未知写入 tool: ${name}`);
  }
}
