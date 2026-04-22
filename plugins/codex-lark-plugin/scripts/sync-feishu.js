import process from "node:process";

import { ensureIndex } from "./lib/index-store.js";

process.env.LARK_DOCS_SOURCE ??= "feishu";

const { indexPath, index } = await ensureIndex({ forceSync: true });

process.stdout.write(
  `${JSON.stringify(
    {
      indexPath,
      sourceType: index.source_type,
      sourceSignature: index.source_signature,
      generatedAt: index.generated_at,
      documents: index.documents.length,
      projects: index.projects.length,
      docTypes: index.docTypes.length
    },
    null,
    2
  )}\n`
);
