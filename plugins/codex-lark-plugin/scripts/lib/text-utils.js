export function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return [];
  }

  const segments = normalized
    .split(/[\s,.;:!?/|()[\]{}"'`~!@#$%^&*+=<>，。；：！？、【】（）《》]+/u)
    .filter(Boolean);

  const unique = new Set(segments);
  unique.add(normalized);
  return [...unique];
}

export function createSummary(body, maxLength = 120) {
  const compact = String(body ?? "").replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1)}…`;
}

export function diffParagraphs(beforeContent, afterContent) {
  const toParagraphs = (value) =>
    String(value ?? "")
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean);

  const beforeParagraphs = toParagraphs(beforeContent);
  const afterParagraphs = toParagraphs(afterContent);
  const beforeSet = new Set(beforeParagraphs);
  const afterSet = new Set(afterParagraphs);

  return {
    added: afterParagraphs.filter((line) => !beforeSet.has(line)),
    removed: beforeParagraphs.filter((line) => !afterSet.has(line))
  };
}
