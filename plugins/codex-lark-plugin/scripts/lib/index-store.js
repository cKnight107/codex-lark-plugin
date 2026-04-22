import fs from "node:fs/promises";
import path from "node:path";

import { loadFixture } from "./fixture-client.js";
import { inferDocType, inferProject } from "./inference.js";
import { defaultIndexPath, resolvePluginPath } from "./path-utils.js";
import { createSummary } from "./text-utils.js";

export function buildIndex(fixture) {
  const documents = (fixture.documents ?? [])
    .map((document) => {
      const project = inferProject(document, fixture.projects ?? []);
      const docType = inferDocType(document, fixture.docTypes ?? []);
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
    source_fixture: fixture.fixturePath,
    projects: fixture.projects ?? [],
    docTypes: fixture.docTypes ?? [],
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
  const fixture = await loadFixture(options);
  let shouldRefresh = options.forceSync ?? false;

  if (!shouldRefresh) {
    try {
      const [indexStat, fixtureStat] = await Promise.all([
        fs.stat(resolvedPath),
        fs.stat(fixture.fixturePath)
      ]);
      shouldRefresh = fixtureStat.mtimeMs > indexStat.mtimeMs;
    } catch {
      shouldRefresh = true;
    }
  }

  if (shouldRefresh) {
    const index = buildIndex(fixture);
    await persistIndex(resolvedPath, index);
    return {
      indexPath: resolvedPath,
      index
    };
  }

  return readIndex({ indexPath: resolvedPath });
}
