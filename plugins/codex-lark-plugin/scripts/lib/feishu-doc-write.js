import { FeishuApiError } from "./feishu-client.js";

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
  const blocks = contentToBlocks(args.content, args.content_type);

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
  if (args.operation === "update_text") {
    const response = await client.request(
      `docx/v1/documents/${args.document_id}/blocks/${args.block_id}`,
      {
        method: "PATCH",
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

    return {
      document_id: args.document_id,
      operation: args.operation,
      block_id: args.block_id,
      updated: true,
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
    contentType: args.content_type
  });

  return {
    document_id: args.document_id,
    operation: args.operation,
    parent_block_id: parentBlockId,
    inserted_at: args.operation === "insert" ? args.index : undefined,
    written_block_count: blocks.length,
    created_blocks: response.data?.children ?? response.data?.blocks ?? []
  };
}

async function createDocumentBlocks({
  client,
  documentId,
  parentBlockId,
  blocks,
  index,
  operation = "append",
  contentType = "plain_text"
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
        document_revision_id: "-1"
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
