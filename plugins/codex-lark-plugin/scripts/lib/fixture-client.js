import fs from "node:fs/promises";

import { defaultFixturePath, resolvePluginPath } from "./path-utils.js";

export async function loadFixture(options = {}) {
  const fixturePath = resolvePluginPath(
    options.fixturePath ?? process.env.LARK_DOCS_FIXTURE,
    defaultFixturePath
  );
  const raw = await fs.readFile(fixturePath, "utf8");
  const parsed = JSON.parse(raw);

  return {
    fixturePath,
    projects: parsed.projects ?? [],
    docTypes: parsed.docTypes ?? [],
    documents: parsed.documents ?? []
  };
}
