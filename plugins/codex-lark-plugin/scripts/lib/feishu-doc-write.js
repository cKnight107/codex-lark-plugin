import { FeishuApiError } from "./feishu-client.js";
import { getDocxBlocks } from "./feishu-read-tools.js";

const blockKeysByType = new Map([
  [2, "text"],
  [3, "heading1"],
  [4, "heading2"],
  [5, "heading3"],
  [6, "heading4"],
  [7, "heading5"],
  [8, "heading6"],
  [12, "bullet"],
  [13, "ordered"],
  [15, "quote"]
]);

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createDocxUrl(documentId) {
  return `https://feishu.cn/docx/${documentId}`;
}

function textElements(content) {
  return [
    {
      text_run: {
        content
      }
    }
  ];
}

function textBlock(blockType, content) {
  const key = blockKeysByType.get(blockType);

  if (!key) {
    throw new Error(`不支持的飞书文本块类型: ${blockType}`);
  }

  return {
    block_type: blockType,
    [key]: {
      elements: textElements(content)
    }
  };
}

function dividerBlock() {
  return {
    block_type: 22,
    divider: {}
  };
}

export function contentToBlocks(content, contentType = "plain_text") {
  const normalized = String(content ?? "").replace(/\r\n/g, "\n");

  if (normalizeText(normalized) === "") {
    return [];
  }

  if (contentType === "plain_text") {
    return normalized
      .split(/\n{2,}/)
      .map((paragraph) => normalizeText(paragraph))
      .filter(Boolean)
      .map((paragraph) => textBlock(2, paragraph));
  }

  if (contentType !== "markdown") {
    throw new Error(`不支持的内容类型: ${contentType}`);
  }

  const blocks = [];
  const paragraphLines = [];

  function flushParagraph() {
    const paragraph = normalizeText(paragraphLines.join("\n"));
    paragraphLines.length = 0;

    if (paragraph) {
      blocks.push(textBlock(2, paragraph));
    }
  }

  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push(textBlock(2 + heading[1].length, heading[2].trim()));
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushParagraph();
      blocks.push(dividerBlock());
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      blocks.push(textBlock(12, bullet[1].trim()));
      continue;
    }

    const ordered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (ordered) {
      flushParagraph();
      blocks.push(textBlock(13, ordered[1].trim()));
      continue;
    }

    const quote = /^>\s?(.+)$/.exec(line);
    if (quote) {
      flushParagraph();
      blocks.push(textBlock(15, quote[1].trim()));
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  return blocks;
}

function extractDocument(response, fallbackTitle, fallbackFolderToken) {
  const data = response.data ?? {};
  const document = data.document ?? data;
  const documentId =
    normalizeText(document.document_id) ||
    normalizeText(data.document_id) ||
    normalizeText(document.obj_token);

  if (!documentId) {
    throw new FeishuApiError("飞书创建文档响应缺少 document_id。", {
      requestPath: "docx/v1/documents",
      requestMethod: "POST",
      details: response
    });
  }

  return {
    document_id: documentId,
    title: normalizeText(document.title) || fallbackTitle,
    url: normalizeText(document.url) || createDocxUrl(documentId),
    folder_token:
      normalizeText(document.folder_token) ||
      normalizeText(data.folder_token) ||
      fallbackFolderToken
  };
}

export async function createFeishuDoc({ client, args }) {
  const blocks = contentToBlocks(args.content, args.content_type);

  if (args.dry_run) {
    return {
      operation: "create_feishu_doc",
      dry_run: true,
      folder_token: args.folder_token,
      title: args.title,
      content_type: args.content_type,
      planned_block_count: blocks.length,
      diff: {
        before: null,
        after: {
          title: args.title,
          block_count: blocks.length
        }
      },
      would_write: true
    };
  }

  const response = await client.request("docx/v1/documents", {
    method: "POST",
    body: {
      folder_token: args.folder_token,
      title: args.title
    },
    context: {
      folder_token: args.folder_token
    }
  });
  const document = extractDocument(response, args.title, args.folder_token);

  if (blocks.length === 0) {
    return {
      ...document,
      content_written: false,
      indexed: false
    };
  }

  const blockResponse = await createDocumentBlocks({
    client,
    documentId: document.document_id,
    parentBlockId: document.document_id,
    blocks
  });

  return {
    ...document,
    content_written: true,
    written_block_count: blocks.length,
    created_blocks: blockResponse.data?.children ?? blockResponse.data?.blocks ?? [],
    indexed: false
  };
}

export async function editFeishuDoc({ client, args }) {
  if (args.dry_run) {
    return previewEditFeishuDoc({ client, args });
  }

  if (args.operation === "update_text") {
    const beforeBlock = await readBlockIfNeeded({
      client,
      documentId: args.document_id,
      blockId: args.block_id,
      documentRevisionId: args.document_revision_id,
      required:
        args.expected_old_text !== undefined || args.verify_after_write
    });

    if (
      args.expected_old_text !== undefined &&
      beforeBlock?.plain_text !== args.expected_old_text
    ) {
      throw new Error(
        `目标块原文本与 expected_old_text 不一致，已拒绝写入。block_id=${args.block_id}`
      );
    }

    const response = await client.request(
      `docx/v1/documents/${args.document_id}/blocks/${args.block_id}`,
      {
        method: "PATCH",
        searchParams: {
          document_revision_id: args.document_revision_id || "-1"
        },
        body: {
          update_text_elements: {
            elements: textElements(args.content)
          }
        },
        context: {
          document_id: args.document_id,
          block_id: args.block_id,
          operation: args.operation,
          content_type: args.content_type
        }
      }
    );
    const afterBlock = args.verify_after_write
      ? await requireDocxBlock({
          client,
          documentId: args.document_id,
          blockId: args.block_id,
          documentRevisionId: args.document_revision_id
        })
      : null;
    const verified = args.verify_after_write
      ? afterBlock.plain_text === args.content
      : false;

    return {
      document_id: args.document_id,
      operation: args.operation,
      block_id: args.block_id,
      updated: true,
      diff: {
        before: beforeBlock?.plain_text ?? null,
        after: args.content
      },
      verified,
      response: response.data ?? {}
    };
  }

  const blocks = contentToBlocks(args.content, args.content_type);
  const parentBlockId = args.parent_block_id || args.document_id;
  const response = await createDocumentBlocks({
    client,
    documentId: args.document_id,
    parentBlockId,
    blocks,
    index: args.operation === "insert" ? args.index : undefined,
    operation: args.operation,
    contentType: args.content_type,
    documentRevisionId: args.document_revision_id
  });
  const createdBlocks = response.data?.children ?? response.data?.blocks ?? [];
  const createdBlockIds = createdBlocks
    .map((block) => normalizeText(block.block_id))
    .filter(Boolean);
  const verified = args.verify_after_write
    ? await verifyCreatedBlocks({
        client,
        documentId: args.document_id,
        blockIds: createdBlockIds,
        documentRevisionId: args.document_revision_id
      })
    : false;

  return {
    document_id: args.document_id,
    operation: args.operation,
    parent_block_id: parentBlockId,
    inserted_at: args.operation === "insert" ? args.index : undefined,
    written_block_count: blocks.length,
    created_blocks: createdBlocks,
    diff: {
      before: null,
      after: blocks.map((block) => blockPlainText(block)).join("\n")
    },
    verified
  };
}

async function createDocumentBlocks({
  client,
  documentId,
  parentBlockId,
  blocks,
  index,
  operation = "append",
  contentType = "plain_text",
  documentRevisionId
}) {
  const body = {
    children: blocks
  };

  if (Number.isInteger(index)) {
    body.index = index;
  }

  return client.request(
    `docx/v1/documents/${documentId}/blocks/${parentBlockId}/children`,
    {
      method: "POST",
      searchParams: {
        document_revision_id: documentRevisionId || "-1"
      },
      body,
      context: {
        document_id: documentId,
        parent_block_id: parentBlockId,
        operation,
        content_type: contentType
      }
    }
  );
}

async function previewEditFeishuDoc({ client, args }) {
  if (args.operation === "update_text") {
    const beforeBlock = await readBlockIfNeeded({
      client,
      documentId: args.document_id,
      blockId: args.block_id,
      documentRevisionId: args.document_revision_id,
      required: true
    });

    return {
      document_id: args.document_id,
      operation: args.operation,
      block_id: args.block_id,
      dry_run: true,
      would_write: beforeBlock?.plain_text !== args.content,
      diff: {
        before: beforeBlock?.plain_text ?? null,
        after: args.content
      },
      verified: false
    };
  }

  const blocks = contentToBlocks(args.content, args.content_type);
  const parentBlockId = args.parent_block_id || args.document_id;

  return {
    document_id: args.document_id,
    operation: args.operation,
    parent_block_id: parentBlockId,
    inserted_at: args.operation === "insert" ? args.index : undefined,
    dry_run: true,
    would_write: blocks.length > 0,
    planned_block_count: blocks.length,
    diff: {
      before: null,
      after: blocks.map((block) => blockPlainText(block)).join("\n")
    },
    verified: false
  };
}

async function readBlockIfNeeded({
  client,
  documentId,
  blockId,
  documentRevisionId,
  required
}) {
  if (!required) {
    return null;
  }

  return requireDocxBlock({
    client,
    documentId,
    blockId,
    documentRevisionId
  });
}

async function requireDocxBlock({
  client,
  documentId,
  blockId,
  documentRevisionId
}) {
  let pageToken;

  do {
    const result = await getDocxBlocks({
      client,
      args: {
        document_id: documentId,
        page_size: 500,
        page_token: pageToken,
        document_revision_id: documentRevisionId
      }
    });
    const found = result.blocks.find((block) => block.block_id === blockId);

    if (found) {
      return found;
    }

    pageToken = result.has_more ? result.next_page_token : "";
  } while (pageToken);

  throw new Error(`未找到目标块: ${blockId}`);
}

async function verifyCreatedBlocks({
  client,
  documentId,
  blockIds,
  documentRevisionId
}) {
  if (blockIds.length === 0) {
    return false;
  }

  const remaining = new Set(blockIds);
  let pageToken;

  do {
    const result = await getDocxBlocks({
      client,
      args: {
        document_id: documentId,
        page_size: 500,
        page_token: pageToken,
        document_revision_id: documentRevisionId
      }
    });

    for (const block of result.blocks) {
      remaining.delete(block.block_id);
    }

    pageToken = result.has_more && remaining.size > 0 ? result.next_page_token : "";
  } while (pageToken);

  return remaining.size === 0;
}

function blockPlainText(block) {
  const key = blockKeysByType.get(block.block_type);
  const elements = key && block[key]?.elements;

  if (!Array.isArray(elements)) {
    return "";
  }

  return elements
    .map((element) => normalizeText(element.text_run?.content))
    .filter(Boolean)
    .join("");
}
