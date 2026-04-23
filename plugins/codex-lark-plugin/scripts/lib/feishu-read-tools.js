const readableFileTypes = [
  "doc",
  "docx",
  "sheet",
  "bitable",
  "mindnote",
  "slides",
  "file",
  "folder"
];

const blockContentKeys = [
  "text",
  "heading1",
  "heading2",
  "heading3",
  "heading4",
  "heading5",
  "heading6",
  "bullet",
  "ordered",
  "quote",
  "todo",
  "callout"
];

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value, defaultValue = false) {
  return typeof value === "boolean" ? value : defaultValue;
}

function normalizeInteger(value, defaultValue, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const numeric = Number.isInteger(value) ? value : defaultValue;
  return Math.min(Math.max(numeric, min), max);
}

function createFolderUrl(folderToken) {
  return `https://feishu.cn/drive/folder/${folderToken}`;
}

function createDocxUrl(documentId) {
  return `https://feishu.cn/docx/${documentId}`;
}

function normalizeDriveFile(entry, parentFolderToken, pathParts) {
  const token = normalizeText(entry.token);
  const type = normalizeText(entry.type);
  const name = normalizeText(entry.name) || token;
  const path = [...pathParts, name].filter(Boolean).join("/");

  return {
    token,
    type,
    name,
    url:
      normalizeText(entry.url) ||
      (type === "folder" ? createFolderUrl(token) : ""),
    path,
    parent_folder_token: parentFolderToken,
    owner_id: normalizeText(entry.owner_id),
    modified_time: normalizeText(entry.modified_time),
    shortcut_target_token: normalizeText(entry.shortcut_info?.target_token),
    shortcut_target_type: normalizeText(entry.shortcut_info?.target_type)
  };
}

export async function listFolderFilesPage({ client, folderToken, pageToken, pageSize = 200 }) {
  // 官方文档：GET /open-apis/drive/v1/files
  // Source: https://open.feishu.cn/document/server-docs/docs/drive-v1/folder/list
  const response = await client.request("drive/v1/files", {
    searchParams: {
      folder_token: folderToken,
      page_size: pageSize,
      page_token: pageToken,
      order_by: "EditedTime",
      direction: "DESC"
    },
    context: {
      folder_token: folderToken
    }
  });

  return {
    files: response.data?.files ?? [],
    has_more: Boolean(response.data?.has_more),
    next_page_token: normalizeText(response.data?.next_page_token)
  };
}

export async function listFolderFilesTool({ client, args }) {
  const folderToken = requireString(args.folder_token, "folder_token");
  const recursive = normalizeBoolean(args.recursive, false);
  const maxDepth = normalizeInteger(args.max_depth, recursive ? 5 : 0, {
    min: 0,
    max: 20
  });
  const limit = normalizeInteger(args.limit, 100, { min: 1, max: 1000 });
  const files = [];
  const queue = [
    {
      folderToken,
      pathParts: [],
      depth: 0
    }
  ];
  let truncated = false;

  while (queue.length > 0 && files.length < limit) {
    const current = queue.shift();
    let pageToken;

    do {
      const page = await listFolderFilesPage({
        client,
        folderToken: current.folderToken,
        pageToken,
        pageSize: Math.min(200, limit - files.length)
      });

      for (const entry of page.files) {
        if (files.length >= limit) {
          truncated = true;
          break;
        }

        const normalized = normalizeDriveFile(
          entry,
          current.folderToken,
          current.pathParts
        );
        files.push(normalized);

        if (
          recursive &&
          normalized.type === "folder" &&
          current.depth < maxDepth
        ) {
          queue.push({
            folderToken: normalized.token,
            pathParts: normalized.path ? normalized.path.split("/") : [],
            depth: current.depth + 1
          });
        }
      }

      pageToken = page.has_more && files.length < limit ? page.next_page_token : "";
      truncated = truncated || (page.has_more && files.length >= limit);
    } while (pageToken);
  }

  return {
    folder_token: folderToken,
    recursive,
    max_depth: maxDepth,
    limit,
    total: files.length,
    truncated: truncated || queue.length > 0,
    files
  };
}

function getBlockContent(block) {
  for (const key of blockContentKeys) {
    if (block[key]) {
      return {
        key,
        content: block[key]
      };
    }
  }

  return {
    key: "",
    content: {}
  };
}

function plainTextFromElements(elements = []) {
  return elements
    .map((element) => {
      if (element.text_run) {
        return normalizeText(element.text_run.content);
      }
      if (element.mention_doc) {
        return normalizeText(element.mention_doc.title);
      }
      if (element.mention_user) {
        return normalizeText(element.mention_user.name);
      }
      if (element.equation) {
        return normalizeText(element.equation.content);
      }
      return "";
    })
    .filter(Boolean)
    .join("");
}

export function normalizeDocxBlock(block) {
  const { key, content } = getBlockContent(block);
  const elements = Array.isArray(content.elements) ? content.elements : [];

  return {
    block_id: normalizeText(block.block_id),
    block_type: block.block_type,
    content_key: key,
    plain_text: plainTextFromElements(elements),
    elements,
    parent_id:
      normalizeText(block.parent_id) ||
      normalizeText(block.parent_block_id),
    children: Array.isArray(block.children) ? block.children : []
  };
}

export async function getDocxBlocks({ client, args }) {
  const documentId = requireString(args.document_id, "document_id");
  const pageSize = normalizeInteger(args.page_size, 100, { min: 1, max: 500 });

  // 官方文档：GET /open-apis/docx/v1/documents/:document_id/blocks
  const response = await client.request(`docx/v1/documents/${documentId}/blocks`, {
    searchParams: {
      page_size: pageSize,
      page_token: normalizeText(args.page_token),
      document_revision_id: normalizeText(args.document_revision_id)
    },
    context: {
      document_id: documentId
    }
  });
  const blocks = response.data?.items ?? response.data?.blocks ?? [];

  return {
    document_id: documentId,
    page_size: pageSize,
    has_more: Boolean(response.data?.has_more),
    next_page_token: normalizeText(response.data?.page_token || response.data?.next_page_token),
    blocks: blocks.map(normalizeDocxBlock)
  };
}

export async function getDocxRawContent({ client, args }) {
  const documentId = requireString(args.document_id, "document_id");

  // 官方文档：GET /open-apis/docx/v1/documents/:document_id/raw_content
  // Source: https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/raw_content
  const response = await client.request(
    `docx/v1/documents/${documentId}/raw_content`,
    {
      context: {
        document_id: documentId
      }
    }
  );

  return {
    document_id: documentId,
    content: normalizeText(response.data?.content)
  };
}

export function inferFileFromUrl(url) {
  const normalized = normalizeText(url);

  if (!normalized) {
    return {};
  }

  const patterns = [
    { file_type: "docx", pattern: /\/docx\/([^/?#]+)/ },
    { file_type: "doc", pattern: /\/docs?\/([^/?#]+)/ },
    { file_type: "sheet", pattern: /\/sheets\/([^/?#]+)/ },
    { file_type: "bitable", pattern: /\/base\/([^/?#]+)/ },
    { file_type: "mindnote", pattern: /\/mindnotes?\/([^/?#]+)/ },
    { file_type: "slides", pattern: /\/slides\/([^/?#]+)/ },
    { file_type: "folder", pattern: /\/drive\/folder\/([^/?#]+)/ }
  ];

  for (const { file_type, pattern } of patterns) {
    const match = pattern.exec(normalized);
    if (match) {
      return {
        token: match[1],
        file_type
      };
    }
  }

  return {};
}

function inferFileTypeFromToken(token) {
  if (/^dox/i.test(token)) {
    return "docx";
  }
  if (/^doc/i.test(token)) {
    return "doc";
  }
  if (/^sht/i.test(token)) {
    return "sheet";
  }
  if (/^fld/i.test(token)) {
    return "folder";
  }
  return "";
}

export async function getFileMeta({ client, args }) {
  const inferred = inferFileFromUrl(args.url);
  const token =
    normalizeText(args.token) ||
    normalizeText(args.file_token) ||
    normalizeText(inferred.token);

  if (!token) {
    throw new Error("get_file_meta 需要提供 token、file_token 或 url。");
  }

  const fileType =
    normalizeText(args.file_type) ||
    normalizeText(inferred.file_type) ||
    inferFileTypeFromToken(token);

  if (!readableFileTypes.includes(fileType)) {
    throw new Error(
      `file_type 仅支持: ${readableFileTypes.join(", ")}；无法从 token/url 推断时请显式传入 file_type。`
    );
  }

  // 官方文档：POST /open-apis/drive/v1/metas/batch_query
  const response = await client.request("drive/v1/metas/batch_query", {
    method: "POST",
    body: {
      request_docs: [
        {
          doc_token: token,
          doc_type: fileType
        }
      ],
      with_url: args.with_url ?? true
    },
    context: {
      file_token: token,
      file_type: fileType
    }
  });
  const meta = response.data?.metas?.[0] ?? {};

  return {
    token,
    file_token: normalizeText(meta.doc_token) || token,
    file_type: normalizeText(meta.doc_type) || fileType,
    title: normalizeText(meta.title),
    url: normalizeText(meta.url) || (fileType === "docx" ? createDocxUrl(token) : ""),
    owner_id: normalizeText(meta.owner_id),
    create_time: normalizeText(meta.create_time),
    latest_modify_user: normalizeText(meta.latest_modify_user),
    latest_modify_time: normalizeText(meta.latest_modify_time),
    permission_status: normalizeText(meta.permission_status),
    raw: meta
  };
}

function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} 不能为空。`);
  }

  return value.trim();
}
