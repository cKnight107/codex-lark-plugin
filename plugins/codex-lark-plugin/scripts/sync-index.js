import { ensureIndex } from "./lib/index-store.js";

const { indexPath, index } = await ensureIndex({ forceSync: true });

process.stdout.write(
  `${JSON.stringify(
    {
      indexPath,
      generatedAt: index.generated_at,
      documents: index.documents.length,
      projects: index.projects.length,
      docTypes: index.docTypes.length
    },
    null,
    2
  )}\n`
);
