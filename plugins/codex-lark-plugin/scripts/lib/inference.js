import { normalizeText } from "./text-utils.js";

function pickBestMatch(catalog, haystack) {
  let bestMatch = null;

  for (const item of catalog) {
    let score = 0;
    const matches = [];

    for (const keyword of item.keywords ?? []) {
      const normalizedKeyword = normalizeText(keyword);

      if (!normalizedKeyword) {
        continue;
      }

      if (haystack.includes(normalizedKeyword)) {
        score += normalizedKeyword.length > 4 ? 3 : 2;
        matches.push(keyword);
      }
    }

    const normalizedName = normalizeText(item.name ?? item.project_id ?? item.doc_type);

    if (normalizedName && haystack.includes(normalizedName)) {
      score += 4;
      matches.push(item.name ?? item.project_id ?? item.doc_type);
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        item,
        score,
        matches
      };
    }
  }

  return bestMatch;
}

function buildHaystack(document) {
  return normalizeText(
    [
      document.title,
      document.body,
      document.source_path,
      document.url
    ].join(" ")
  );
}

function buildInference(sourceType, fallback, match, document) {
  if (!match || match.score <= 0) {
    return {
      value: fallback,
      source: `${sourceType}:no-keyword-match:${document.source_path ?? "unknown"}`,
      confidence: 0.2
    };
  }

  const confidence = Math.min(0.95, 0.45 + match.score * 0.08);

  return {
    value: sourceType === "project" ? match.item.project_id : match.item.doc_type,
    source: `${sourceType}:${match.matches.join("|")}`,
    confidence: Number(confidence.toFixed(2))
  };
}

export function inferProject(document, projects) {
  const haystack = buildHaystack(document);
  const match = pickBestMatch(projects, haystack);
  return buildInference("project", "unknown-project", match, document);
}

export function inferDocType(document, docTypes) {
  const haystack = buildHaystack(document);
  const match = pickBestMatch(docTypes, haystack);
  return buildInference("doc_type", "other", match, document);
}
