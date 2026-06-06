export const BRUNEL_ORIGIN = "https://www.thebrunelcentre.co.uk";

const GENERIC_PAGE_TITLES = new Set([
  "about the brunel centre",
  "accessibility",
  "consultancy",
  "contact",
  "governance",
  "privacy policy",
  "research strategy",
  "support",
  "terms",
  "terms and conditions",
  "terms conditions",
  "the brunel centre homepage"
]);

const GENERIC_PAGE_PATHS = new Set([
  "/",
  "/about-us",
  "/accessibility",
  "/consultancy",
  "/contact",
  "/governance",
  "/privacy",
  "/privacy-policy",
  "/support",
  "/terms",
  "/terms-and-conditions"
]);

export function normalizeTags(value) {
  const tags = value && typeof value === "object" && !Array.isArray(value)
    ? value.tags
    : value;

  if (Array.isArray(tags)) {
    return tags.map(normalizeTag).filter(Boolean);
  }

  if (typeof tags === "string") {
    return tags
      .split(/[|,]/)
      .map(normalizeTag)
      .filter(Boolean);
  }

  if (tags && typeof tags === "object") {
    return Object.values(tags).map(normalizeTag).filter(Boolean);
  }

  return [];
}

export function normalizeSourceRecord(source) {
  return {
    ...source,
    tags: normalizeTags(source)
  };
}

export function normalizeSourceUrl(url) {
  const parsed = parseUrl(url);
  if (!parsed) return "";

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const pathname = normalizeUrlPath(parsed.pathname);
  return `${host}${pathname}`;
}

export function urlsMatch(left, right) {
  const normalizedLeft = normalizeSourceUrl(left);
  const normalizedRight = normalizeSourceUrl(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

export function isAllowedCatalogueUrl(url) {
  const parsed = parseUrl(url);
  return Boolean(
    parsed &&
      parsed.protocol === "https:" &&
      parsed.hostname.toLowerCase() === "www.thebrunelcentre.co.uk" &&
      normalizeUrlPath(parsed.pathname).startsWith("/")
  );
}

export function inferSourceType(source) {
  const normalized = normalizeSourceRecord(source || {});
  const parsed = parseUrl(normalized.url);
  const tags = normalized.tags;
  const path = parsed ? normalizeUrlPath(parsed.pathname) : "";
  const title = normalizeText(normalized.title);
  const id = String(normalized.id || "");

  if (!parsed || !isBrunelHost(parsed.hostname)) return "otherPage";

  if (path === "/data-hub") return "dataHubLanding";
  if (path.startsWith("/data-hub/") && (id.startsWith("data-hub-") || tags.includes("data-hub"))) {
    return "dataHubPost";
  }

  if (path === "/research") return "researchLanding";
  if (path.startsWith("/research/") && id !== "research" && tags.includes("research")) {
    return "researchArticle";
  }

  if (GENERIC_PAGE_TITLES.has(title) || GENERIC_PAGE_PATHS.has(path)) {
    return path === "/consultancy" ? "otherPage" : "sitePage";
  }

  if (path === "/policy" || path === "/policies") return "policyPage";
  if (
    path.startsWith("/policy/") ||
    path.startsWith("/policies/") ||
    id.startsWith("policy") ||
    tags.includes("policy") ||
    tags.includes("policy-insight") ||
    tags.includes("policy-insights")
  ) {
    return "policyArticle";
  }

  if (path === "/news") return "otherPage";
  if (path.startsWith("/news/")) return "newsArticle";

  return "otherPage";
}

export function isGenericPageSource(source) {
  const type = inferSourceType(source);
  return type === "sitePage" || type === "otherPage";
}

export function validateSourceRegistry(sources, datasets = []) {
  const normalizedSources = (sources || []).map(normalizeSourceRecord);
  const errors = [];
  const warnings = [];

  for (const source of normalizedSources) {
    const type = inferSourceType(source);

    if (!source.id) errors.push("Source is missing id.");
    if (!source.title) errors.push(`Source ${source.id || source.url || "unknown"} is missing title.`);
    if (!source.url) errors.push(`Source ${source.id || source.title || "unknown"} is missing url.`);
    if (source.url && !parseUrl(source.url)) errors.push(`Source ${source.id || source.title || source.url} has an invalid URL.`);
    if (!type) errors.push(`Source ${source.id || source.title || source.url} does not have an inferred source type.`);

    if (isGenericPageSource(source) && ["dataHubPost", "researchArticle", "newsArticle", "policyArticle"].includes(type)) {
      errors.push(`Generic page ${source.id || source.title} was classified as an article source.`);
    }
  }

  const sourceUrls = new Map();
  for (const source of normalizedSources) {
    const normalizedUrl = normalizeSourceUrl(source.url);
    if (!normalizedUrl) continue;
    if (!sourceUrls.has(normalizedUrl)) sourceUrls.set(normalizedUrl, []);
    sourceUrls.get(normalizedUrl).push(source);
  }

  for (const dataset of datasets || []) {
    const normalizedUrl = normalizeSourceUrl(dataset.post_url);
    if (!normalizedUrl) {
      errors.push(`Dataset mapping ${dataset.slug || dataset.title || "unknown"} has an invalid post_url.`);
      continue;
    }

    if (!sourceUrls.has(normalizedUrl)) {
      errors.push(`Dataset mapping ${dataset.slug || dataset.title || dataset.post_url} does not match a source URL after normalisation.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    sources: normalizedSources.map((source) => ({
      ...source,
      sourceType: inferSourceType(source)
    }))
  };
}

function normalizeTag(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseUrl(url) {
  try {
    return new URL(String(url || "").trim());
  } catch {
    return null;
  }
}

function isBrunelHost(hostname) {
  const clean = String(hostname || "").toLowerCase();
  return clean === "www.thebrunelcentre.co.uk" || clean === "thebrunelcentre.co.uk";
}

function normalizeUrlPath(pathname) {
  let path = safeDecode(String(pathname || "/"));
  path = path
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\/{2,}/g, "/")
    .toLowerCase();

  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/+$/, "");
  return path || "/";
}

function safeDecode(value) {
  let output = value;
  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURI(output);
      if (decoded === output) break;
      output = decoded;
    } catch {
      break;
    }
  }
  return output;
}
