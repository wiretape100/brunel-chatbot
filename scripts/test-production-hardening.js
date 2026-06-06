import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalogueAnswer } from "../lib/datahub-catalogue.js";
import { checkRateLimit, RATE_LIMIT_MESSAGE, resetRateLimitForTests } from "../lib/rate-limit.js";
import {
  inferSourceType,
  isAllowedCatalogueUrl,
  normalizeSourceRecord,
  normalizeSourceUrl,
  normalizeTags,
  urlsMatch,
  validateSourceRegistry
} from "../lib/source-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sources = readJson(path.join(root, "content", "sources.json"));
const datasets = readJson(path.join(root, "content", "datahub-datasets.json"));
const normalizedSources = sources.map(normalizeSourceRecord);

const knownMismatchTitles = [
  "Population change comparisons in the Greater West of England, 1991–2024",
  "Annual change in greenhouse gas emissions in the Greater West of England, 2022–2023",
  "Trends over time in sustained destinations following 16–18 study in the Greater West of England",
  "Education, employment and NEET outcomes among young people in the Greater West of England aged 16–24"
];

for (const title of knownMismatchTitles) {
  const source = normalizedSources.find((item) => item.title === title);
  const dataset = datasets.find((item) => item.title === title);
  assert.ok(source, `Expected source for ${title}`);
  assert.ok(dataset, `Expected dataset mapping for ${title}`);
  assert.ok(urlsMatch(source.url, dataset.post_url), `Expected normalised URL match for ${title}`);
}

{
  const source = normalizedSources.find((item) => item.title === "Commuting between local authorities in the Greater West of England, 2021");
  const dataset = datasets.find((item) => item.title === "Commuting between local authorities in the Greater West of England, 2021");
  assert.ok(source && dataset);
  assert.equal(normalizeSourceUrl(source.url), normalizeSourceUrl(dataset.post_url));
}

assert.deepEqual(normalizeTags({ tags: "research" }), ["research"]);

{
  const strategicAudit = normalizedSources.find((item) => item.id === "research-strategic-economic-audit-of-the-west-of-england");
  assert.ok(strategicAudit);
  assert.ok(Array.isArray(strategicAudit.tags));
  assert.deepEqual(strategicAudit.tags, ["research"]);
  assert.equal(inferSourceType(strategicAudit), "researchArticle");
}

{
  const validation = validateSourceRegistry(sources, datasets);
  assert.equal(validation.ok, true, validation.errors.join("\n"));
}

const genericIds = new Set(["home", "about", "consultancy", "data-hub", "research"]);
for (const source of normalizedSources.filter((item) => genericIds.has(item.id))) {
  assert.ok(!["dataHubPost", "researchArticle", "newsArticle", "policyArticle"].includes(inferSourceType(source)), source.id);
}

{
  const result = await buildCatalogueAnswer({
    message: "What Data Hub insights are available for the Greater West of England?",
    history: []
  });
  const urls = catalogueItemUrls(result.answer);
  assert.ok(urls.length > 0);
  for (const url of urls) {
    const source = normalizedSources.find((item) => normalizeSourceUrl(item.url) === normalizeSourceUrl(url));
    assert.ok(source, url);
    assert.equal(inferSourceType(source), "dataHubPost", url);
    assert.equal(isAllowedCatalogueUrl(url), true, url);
  }
}

{
  const result = await buildCatalogueAnswer({
    message: "Could you list the research articles in the Centre?",
    history: []
  });
  const urls = catalogueItemUrls(result.answer);
  assert.ok(urls.length > 0);
  for (const url of urls) {
    const source = normalizedSources.find((item) => normalizeSourceUrl(item.url) === normalizeSourceUrl(url));
    assert.ok(source, url);
    assert.equal(inferSourceType(source), "researchArticle", url);
    assert.equal(isAllowedCatalogueUrl(url), true, url);
  }
}

{
  const result = await buildCatalogueAnswer({
    message: "Could you list the policy articles from the Brunel Centre?",
    history: []
  });
  assert.ok(!/About the Brunel Centre|Consultancy|The Brunel Centre homepage/.test(result.answer));
}

assert.equal(isAllowedCatalogueUrl("https://www.thebrunelcentre.co.uk/data-hub/example"), true);
assert.equal(isAllowedCatalogueUrl("https://example.com/data-hub/example"), false);
assert.equal(isAllowedCatalogueUrl("http://www.thebrunelcentre.co.uk/data-hub/example"), false);

{
  const widget = fs.readFileSync(path.join(root, "public", "widget.js"), "utf8");
  const start = widget.indexOf("function isSafeLinkUrl");
  const end = widget.indexOf("function renderSources");
  assert.ok(start >= 0 && end > start);
  const isSafeLinkUrl = new Function(`${widget.slice(start, end)}; return isSafeLinkUrl;`)();
  assert.equal(isSafeLinkUrl("https://www.thebrunelcentre.co.uk/research/example"), true);
  assert.equal(isSafeLinkUrl("https://example.com/research/example"), false);
}

{
  resetRateLimitForTests();
  assert.equal(RATE_LIMIT_MESSAGE, "I'm receiving a lot of requests at the moment. Please wait a moment and try again.");
  assert.equal(checkRateLimit("127.0.0.1", { now: 1000, windowMs: 1000, maxRequests: 2 }).allowed, true);
  assert.equal(checkRateLimit("127.0.0.1", { now: 1100, windowMs: 1000, maxRequests: 2 }).allowed, true);
  assert.equal(checkRateLimit("127.0.0.1", { now: 1200, windowMs: 1000, maxRequests: 2 }).allowed, false);
  assert.equal(checkRateLimit("127.0.0.1", { now: 2101, windowMs: 1000, maxRequests: 2 }).allowed, true);
}

console.log("Production hardening tests passed.");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function catalogueItemUrls(answer) {
  return [...String(answer || "").matchAll(/^\s*-\s+\[[^\]]+\]\((https:\/\/www\.thebrunelcentre\.co\.uk\/[^\s)]+)\)/gm)]
    .map((match) => match[1].replace(/%28/g, "(").replace(/%29/g, ")"));
}
