export function normalizeText(value) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkText(text, options = {}) {
  const maxChars = options.maxChars || 2600;
  const overlapChars = options.overlapChars || 300;
  const clean = normalizeText(text);

  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const chunks = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(start + maxChars, clean.length);
    const nextBreak = clean.lastIndexOf("\n\n", end);

    if (nextBreak > start + maxChars * 0.55) {
      end = nextBreak;
    }

    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push(chunk);

    if (end >= clean.length) break;
    start = Math.max(0, end - overlapChars);
  }

  return chunks;
}
