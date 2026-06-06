import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  inferSourceType,
  normalizeSourceRecord,
  normalizeSourceUrl,
  validateSourceRegistry
} from "../lib/source-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const sources = readJson(path.join(root, "content", "sources.json")).map(normalizeSourceRecord);
const datasets = readJson(path.join(root, "content", "datahub-datasets.json"));
const validation = validateSourceRegistry(sources, datasets);
const errors = [...validation.errors];

for (const source of sources) {
  const sourceType = inferSourceType(source);

  if (source.url?.includes("/data-hub/") && source.id?.startsWith("data-hub-") && sourceType !== "dataHubPost") {
    errors.push(`Data Hub source ${source.id} was not classified as dataHubPost.`);
  }

  if (source.url?.includes("/research/") && source.id !== "research" && source.tags.includes("research") && sourceType !== "researchArticle") {
    errors.push(`Research source ${source.id} was not classified as researchArticle.`);
  }

  if (["dataHubPost", "researchArticle", "newsArticle", "policyArticle"].includes(sourceType) && isGenericPageTitle(source.title)) {
    errors.push(`Generic page ${source.id || source.title} was classified as ${sourceType}.`);
  }
}

const sourceUrlIndex = new Map(
  sources
    .filter((source) => source.url)
    .map((source) => [normalizeSourceUrl(source.url), source])
);

for (const dataset of datasets) {
  const match = sourceUrlIndex.get(normalizeSourceUrl(dataset.post_url));
  if (!match) {
    errors.push(`Dataset mapping ${dataset.slug || dataset.title} does not match any source URL after normalisation.`);
  }
}

if (errors.length) {
  console.error("Source validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const counts = countBy(sources.map((source) => inferSourceType(source)));
console.log("Source validation passed.");
console.log(`Sources: ${sources.length}`);
console.log(`Dataset mappings: ${datasets.length}`);
for (const [sourceType, count] of Object.entries(counts).sort()) {
  console.log(`${sourceType}: ${count}`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function countBy(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function isGenericPageTitle(title) {
  return /^(about the brunel centre|consultancy|the brunel centre homepage|contact|privacy|privacy policy|terms|terms and conditions|accessibility|governance)$/i.test(String(title || "").trim());
}
