import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import { loadDocumentSource, resolveDataSourceConfig } from "./data-source.js";
import { inferDocType, inferProject } from "./inference.js";
import { defaultIndexPath, resolvePluginPath } from "./path-utils.js";
import { createSummary } from "./text-utils.js";

function buildSourceState(config) {
  if (config.sourceType === "sample") {
    return {
      sourceType: "sample",
      fixturePath: resolvePluginPath(config.fixturePath, undefined)
    };
  }

  return {
    sourceType: "feishu",
    appId: config.appId,
    syncRoots: [...(config.syncRoots ?? [])].map((entry) => ({
      type: entry.type,
      token: entry.token
    }))
  };
}

function createSourceSignature(sourceState) {
  return createHash("sha256")
    .update(JSON.stringify(sourceState))
    .digest("hex");
}

function buildSourceMetadata(config) {
  const state = buildSourceState(config);

  return {
    state,
    signature: createSourceSignature(state)
  };
}

function isSameSource(index, sourceMetadata) {
  return (
    index?.source_signature === sourceMetadata.signature &&
    index?.source_type === sourceMetadata.state.sourceType
  );
}

function normalizeRevision(revision) {
  if (!revision?.timestamp || typeof revision.content !== "string") {
    return null;
  }

  return {
    timestamp: revision.timestamp,
    content: revision.content
  };
}

function mergeDocumentRevisions(document, previousDocument) {
  const previousRevisions = (previousDocument?.revisions ?? [])
    .map(normalizeRevision)
    .filter(Boolean)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));

  const currentSnapshot = {
    timestamp: document.updated_at,
    content: document.body ?? ""
  };

  if (previousRevisions.length === 0) {
    return [currentSnapshot];
  }

  const merged = [...previousRevisions];
  const latest = merged.at(-1);

  if (latest.content === currentSnapshot.content) {
    if (latest.timestamp !== currentSnapshot.timestamp) {
      merged[merged.length - 1] = currentSnapshot;
    }
    return merged;
  }

  const hasExactSnapshot = merged.some(
    (revision) =>
      revision.timestamp === currentSnapshot.timestamp &&
      revision.content === currentSnapshot.content
  );

  if (!hasExactSnapshot) {
    merged.push(currentSnapshot);
  }

  return merged;
}

function mergeFeishuSnapshotRevisions(sourceData, previousIndex, sourceMetadata) {
  if (
    sourceMetadata.state.sourceType !== "feishu" ||
    !previousIndex ||
    !isSameSource(previousIndex, sourceMetadata)
  ) {
    return sourceData;
  }

  const previousDocumentsById = new Map(
    (previousIndex.documents ?? []).map((document) => [document.doc_id, document])
  );

  return {
    ...sourceData,
    documents: (sourceData.documents ?? []).map((document) => ({
      ...document,
      revisions: mergeDocumentRevisions(
        document,
        previousDocumentsById.get(document.doc_id)
      )
    }))
  };
}

export function buildIndex(sourceData, options = {}) {
  const sourceMetadata =
    options.sourceMetadata ??
    buildSourceMetadata({
      sourceType: sourceData.sourceType ?? "sample",
      fixturePath: sourceData.fixturePath,
      appId: sourceData.appId,
      syncRoots: sourceData.syncRoots
    });
  const documents = (sourceData.documents ?? [])
    .map((document) => {
      const project = inferProject(document, sourceData.projects ?? []);
      const docType = inferDocType(document, sourceData.docTypes ?? []);
      const confidence = Number(
        ((project.confidence + docType.confidence) / 2).toFixed(2)
      );

      return {
        doc_id: document.doc_id,
        title: document.title,
        project_id: project.value,
        doc_type: docType.value,
        author: document.author,
        updated_at: document.updated_at,
        summary: createSummary(document.body),
        url: document.url,
        source_path: document.source_path,
        body: document.body,
        revisions: document.revisions ?? [],
        inference_source: `${project.source};${docType.source}`,
        inference_confidence: confidence
      };
    })
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));

  return {
    generated_at: new Date().toISOString(),
    source_fixture: sourceMetadata.state.fixturePath ?? null,
    source_type: sourceMetadata.state.sourceType,
    source_signature: sourceMetadata.signature,
    source: sourceMetadata.state,
    projects: sourceData.projects ?? [],
    docTypes: sourceData.docTypes ?? [],
    documents
  };
}

export async function persistIndex(indexPath, index) {
  const resolvedPath = resolvePluginPath(indexPath, defaultIndexPath);
  const directory = path.dirname(resolvedPath);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(resolvedPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return resolvedPath;
}

export async function readIndex(options = {}) {
  const resolvedPath = resolvePluginPath(
    options.indexPath ?? process.env.LARK_INDEX_PATH,
    defaultIndexPath
  );
  const raw = await fs.readFile(resolvedPath, "utf8");
  return {
    indexPath: resolvedPath,
    index: JSON.parse(raw)
  };
}

export async function ensureIndex(options = {}) {
  const resolvedPath = resolvePluginPath(
    options.indexPath ?? process.env.LARK_INDEX_PATH,
    defaultIndexPath
  );
  const config = resolveDataSourceConfig(options);
  const sourceMetadata = buildSourceMetadata(config);
  let shouldRefresh = options.forceSync ?? false;
  let existingIndex = null;

  if (!shouldRefresh) {
    try {
      const [{ index }, indexStat] = await Promise.all([
        readIndex({ indexPath: resolvedPath }),
        fs.stat(resolvedPath)
      ]);
      existingIndex = index;

      if (!isSameSource(index, sourceMetadata)) {
        shouldRefresh = true;
      } else if (sourceMetadata.state.sourceType === "sample") {
        const sourceStat = await fs.stat(sourceMetadata.state.fixturePath);
        shouldRefresh = sourceStat.mtimeMs > indexStat.mtimeMs;
      } else {
        shouldRefresh = false;
      }
    } catch {
      shouldRefresh = true;
    }
  }

  if (shouldRefresh) {
    if (!existingIndex) {
      try {
        const { index } = await readIndex({ indexPath: resolvedPath });
        existingIndex = index;
      } catch {
        existingIndex = null;
      }
    }

    const sourceData = await loadDocumentSource(options);
    const mergedSourceData = mergeFeishuSnapshotRevisions(
      sourceData,
      existingIndex,
      sourceMetadata
    );
    const index = buildIndex(mergedSourceData, { sourceMetadata });
    await persistIndex(resolvedPath, index);
    return {
      indexPath: resolvedPath,
      index
    };
  }

  if (existingIndex) {
    return {
      indexPath: resolvedPath,
      index: existingIndex
    };
  }

  return readIndex({ indexPath: resolvedPath });
}
