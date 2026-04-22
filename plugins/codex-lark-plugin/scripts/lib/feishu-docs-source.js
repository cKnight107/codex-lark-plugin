function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toIsoTimestamp(value) {
  if (value === undefined || value === null || value === "") {
    return new Date(0).toISOString();
  }

  if (typeof value === "number") {
    return new Date(value < 10_000_000_000 ? value * 1000 : value).toISOString();
  }

  const normalized = normalizeText(value);

  if (/^\d+$/.test(normalized)) {
    const numeric = Number(normalized);
    return new Date(
      normalized.length <= 10 ? numeric * 1000 : numeric
    ).toISOString();
  }

  return new Date(normalized).toISOString();
}

function buildPath(parts) {
  return parts.filter(Boolean).join("/");
}

function createRevision(updatedAt, content) {
  return [
    {
      timestamp: updatedAt,
      content
    }
  ];
}

function createDocxUrl(docId) {
  return `https://feishu.cn/docx/${docId}`;
}

function createWikiUrl(nodeToken) {
  return `https://feishu.cn/wiki/${nodeToken}`;
}

function upsertDocument(documentsById, document) {
  const existing = documentsById.get(document.doc_id);

  if (!existing || document.updated_at > existing.updated_at) {
    documentsById.set(document.doc_id, document);
  }
}

async function fetchDocxContent(client, documentId, context = {}) {
  // 官方文档：GET /open-apis/docx/v1/documents/:document_id/raw_content
  // Source: https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/raw_content
  const response = await client.request(
    `docx/v1/documents/${documentId}/raw_content`,
    {
      context: {
        document_id: documentId,
        ...context
      }
    }
  );

  return normalizeText(response.data?.content);
}

async function listFolderFiles(client, folderToken) {
  const files = [];
  let pageToken;

  do {
    // 官方文档：GET /open-apis/drive/v1/files
    // Source: https://open.feishu.cn/document/server-docs/docs/drive-v1/folder/list
    const response = await client.request("drive/v1/files", {
      searchParams: {
        folder_token: folderToken,
        page_size: 200,
        page_token: pageToken,
        order_by: "EditedTime",
        direction: "DESC"
      },
      context: {
        folder_token: folderToken
      }
    });

    files.push(...(response.data?.files ?? []));
    pageToken = response.data?.has_more ? response.data?.next_page_token : null;
  } while (pageToken);

  return files;
}

async function listWikiChildren(client, spaceId, parentNodeToken) {
  const items = [];
  let pageToken;

  do {
    // 官方文档：GET /open-apis/wiki/v2/spaces/:space_id/nodes
    // Source: https://open.feishu.cn/document/server-docs/docs/wiki-v2/space-node/list
    const response = await client.request(`wiki/v2/spaces/${spaceId}/nodes`, {
      searchParams: {
        parent_node_token: parentNodeToken,
        page_size: 50,
        page_token: pageToken
      },
      context: {
        space_id: spaceId,
        parent_node_token: parentNodeToken
      }
    });

    items.push(...(response.data?.items ?? []));
    pageToken = response.data?.has_more ? response.data?.page_token : null;
  } while (pageToken);

  return items;
}

async function getWikiNode(client, token) {
  // 官方文档：GET /open-apis/wiki/v2/spaces/get_node
  // Source: https://open.feishu.cn/document/server-docs/docs/wiki-v2/space-node/get_node
  const response = await client.request("wiki/v2/spaces/get_node", {
    searchParams: {
      token
    },
    context: {
      wiki_token: token
    }
  });

  return response.data?.node;
}

function normalizeFolderDocEntry(entry, pathParts, content) {
  const docId =
    entry.type === "shortcut" ? entry.shortcut_info?.target_token : entry.token;
  const updatedAt = toIsoTimestamp(entry.modified_time);
  const url =
    entry.type === "shortcut" && entry.shortcut_info?.target_type === "docx"
      ? createDocxUrl(docId)
      : normalizeText(entry.url) || createDocxUrl(docId);

  return {
    doc_id: docId,
    title: normalizeText(entry.name) || docId,
    author: normalizeText(entry.owner_id),
    updated_at: updatedAt,
    url,
    source_path: buildPath(pathParts),
    body: content,
    revisions: createRevision(updatedAt, content)
  };
}

function normalizeWikiDocNode(node, pathParts, content) {
  const updatedAt = toIsoTimestamp(node.obj_edit_time);

  return {
    doc_id: node.obj_token,
    title: normalizeText(node.title) || node.obj_token,
    author: normalizeText(node.owner) || normalizeText(node.creator),
    updated_at: updatedAt,
    url: createWikiUrl(node.node_token),
    source_path: buildPath(pathParts),
    body: content,
    revisions: createRevision(updatedAt, content)
  };
}

async function collectFolderRootDocuments(client, root, documentsById) {
  const rootLabel = normalizeText(root.label) || `folder:${root.token}`;
  const queue = [{ token: root.token, pathParts: [rootLabel] }];

  while (queue.length > 0) {
    const current = queue.shift();
    const files = await listFolderFiles(client, current.token);

    for (const entry of files) {
      if (entry.type === "folder") {
        queue.push({
          token: entry.token,
          pathParts: [...current.pathParts, normalizeText(entry.name) || entry.token]
        });
        continue;
      }

      const isDocx =
        entry.type === "docx" ||
        (entry.type === "shortcut" && entry.shortcut_info?.target_type === "docx");

      if (!isDocx) {
        continue;
      }

      const docId =
        entry.type === "shortcut" ? entry.shortcut_info?.target_token : entry.token;
      const pathParts = [...current.pathParts, normalizeText(entry.name) || docId];
      const content = await fetchDocxContent(client, docId, {
        folder_token: current.token
      });

      upsertDocument(
        documentsById,
        normalizeFolderDocEntry(entry, pathParts, content)
      );
    }
  }
}

async function collectWikiRootDocuments(client, root, documentsById) {
  const rootNode = await getWikiNode(client, root.token);

  if (!rootNode) {
    return;
  }

  const rootLabel =
    normalizeText(root.label) || normalizeText(rootNode.title) || `wiki:${root.token}`;
  const queue = [
    {
      node: rootNode,
      pathParts: [rootLabel]
    }
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    const node = current.node;

    if (node.obj_type === "docx" && node.obj_token) {
      const content = await fetchDocxContent(client, node.obj_token, {
        wiki_node_token: node.node_token
      });

      upsertDocument(
        documentsById,
        normalizeWikiDocNode(node, current.pathParts, content)
      );
    }

    if (!node.has_child || !node.space_id || !node.node_token) {
      continue;
    }

    const children = await listWikiChildren(client, node.space_id, node.node_token);

    for (const child of children) {
      queue.push({
        node: child,
        pathParts: [...current.pathParts, normalizeText(child.title) || child.obj_token]
      });
    }
  }
}

export async function loadFeishuDocuments({ client, syncRoots }) {
  const documentsById = new Map();

  for (const root of syncRoots ?? []) {
    if (root.type === "folder") {
      await collectFolderRootDocuments(client, root, documentsById);
      continue;
    }

    if (root.type === "wiki") {
      await collectWikiRootDocuments(client, root, documentsById);
      continue;
    }
  }

  return [...documentsById.values()].sort((left, right) =>
    right.updated_at.localeCompare(left.updated_at)
  );
}
