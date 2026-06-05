import fs from "node:fs/promises";
import path from "node:path";

const SOURCES_PATH = path.join(process.cwd(), "content", "sources.json");
const DATASET_MAP_PATH = path.join(process.cwd(), "content", "datahub-datasets.json");
const BATCH_SIZE = 10;

const TOPIC_SYNONYMS = {
  housing: ["housing", "house prices", "affordability", "rent", "housing stock", "dwellings"],
  skills: ["skills", "qualifications", "training", "job-related training", "skill shortages", "workforce development"],
  productivity: ["productivity", "gva", "gross value added", "gdp", "output", "output per hour"],
  employment: ["employment", "labour market", "unemployment", "inactivity", "workforce", "wages", "earnings"],
  environment: ["environment", "emissions", "greenhouse gas", "energy", "sustainability", "land use"],
  health: ["health", "obesity", "diabetes", "rheumatoid arthritis", "mental health", "musculoskeletal", "prevalence"],
  population: ["population", "migration", "age", "demographics", "child poverty", "inequality"],
  transport: ["transport", "commuting", "travel to work", "journey time", "infrastructure"],
  business: ["business", "enterprises", "industry", "sectors", "innovation", "trade", "investment"]
};

const GROUP_ORDER = [
  "Economy and productivity",
  "Employment and skills",
  "Housing",
  "Transport and infrastructure",
  "Environment and sustainability",
  "Health and population",
  "Business and industry",
  "Other Data Hub insights"
];

let cachedCatalogue = null;

export async function buildDataHubCatalogueAnswer({ message, history = [] }) {
  const intent = detectDataHubCatalogueIntent(message, history);
  if (!intent) return null;

  const catalogue = await loadDataHubCatalogue();
  const filtered = filterByTopic(catalogue, intent.topic);
  const shownUrls = extractShownUrls(history);
  const available = intent.kind === "more"
    ? filtered.filter((item) => !shownUrls.has(item.url))
    : filtered;

  if (!available.length && intent.kind === "more") {
    return {
      answer: "I have shown the Data Hub insights I found for this view. You can narrow by topic, such as housing, skills, productivity, transport, health or environment.",
      sources: []
    };
  }

  const batch = available.slice(0, BATCH_SIZE);
  const sources = batch.map((item) => ({
    title: item.title,
    url: item.url,
    similarity: null
  }));

  return {
    answer: renderCatalogueAnswer({
      batch,
      totalCount: filtered.length,
      topic: intent.topic,
      kind: intent.kind,
      showAllRequested: intent.showAllRequested,
      remainingCount: Math.max(0, available.length - batch.length)
    }),
    sources
  };
}

export function detectDataHubCatalogueIntent(message, history = []) {
  const clean = normalize(message);
  if (!clean) return null;

  const topic = detectTopic(clean);
  const previousCatalogue = hasPreviousCatalogueAnswer(history);
  const showMore =
    /^(show more|more|more posts|more insights|any more|what more|show more data hub posts|show more datahub posts)$/.test(clean) ||
    /\b(show more|more posts|more insights|what more is available|any more)\b/.test(clean);

  if (showMore) {
    return { kind: previousCatalogue ? "more" : "initial", topic, showAllRequested: false };
  }

  const broadCatalogue =
    /\bdata\s*hub\b/.test(clean) &&
    /\b(available|posts|articles|insights|topics|show me|browse|catalogue|catalog|what more)\b/.test(clean);
  const broadInsights =
    /\binsights?\s+(are\s+)?available\b/.test(clean) ||
    /\bwhat\s+topics\s+are\s+in\s+the\s+data\s*hub\b/.test(clean);
  const showAll = /\b(show|list)\s+all\s+data\s*hub\s+(posts|articles|insights)\b/.test(clean);
  const topicCatalogue = topic &&
    (/\bdata\s*hub\b/.test(clean) ||
      /\b(posts|articles|insights|indicators|data)\b/.test(clean) ||
      /^(any|show|what|which)\b/.test(clean));

  if (showAll) return { kind: "initial", topic, showAllRequested: true };
  if (broadCatalogue || broadInsights || topicCatalogue) return { kind: "initial", topic, showAllRequested: false };
  return null;
}

export async function loadDataHubCatalogue() {
  if (cachedCatalogue) return cachedCatalogue;

  const [sourcesRaw, datasetsRaw] = await Promise.all([
    fs.readFile(SOURCES_PATH, "utf8"),
    fs.readFile(DATASET_MAP_PATH, "utf8").catch(() => "[]")
  ]);
  const sources = JSON.parse(sourcesRaw.replace(/^\uFEFF/, ""));
  const datasets = JSON.parse(datasetsRaw.replace(/^\uFEFF/, ""));
  const datasetByUrl = new Map(
    datasets
      .filter((item) => item.post_url)
      .map((item) => [normalizeUrl(item.post_url), item])
  );

  cachedCatalogue = sources
    .filter((source) => isDataHubSource(source))
    .map((source) => {
      const dataset = datasetByUrl.get(normalizeUrl(source.url)) || {};
      const tags = Array.isArray(source.tags) ? source.tags : [];

      return {
        id: source.id || dataset.slug || source.url,
        title: source.title || dataset.title,
        url: source.url || dataset.post_url,
        tags,
        category: dataset.category || tags.find((tag) => tag !== "data-hub") || "data-hub",
        searchText: normalize([
          source.title,
          source.url,
          tags.join(" "),
          dataset.category,
          dataset.title,
          dataset.slug
        ].filter(Boolean).join(" "))
      };
    })
    .filter((item) => item.title && item.url)
    .sort((a, b) => groupRank(a) - groupRank(b) || a.title.localeCompare(b.title));

  return cachedCatalogue;
}

function renderCatalogueAnswer({ batch, totalCount, topic, kind, showAllRequested, remainingCount }) {
  const topicText = topic ? `${topic} ` : "";
  const intro = showAllRequested
    ? `There are too many confirmed Data Hub insights to show clearly in one message. I found ${totalCount} ${topicText}Data Hub insights in the current index. Here are the first ${batch.length}.`
    : kind === "more"
      ? `Here are more ${topicText}Data Hub insights I found.`
      : `Here are some ${topicText}Data Hub insights I found for the Greater West of England. This is not the full list. You can ask me to show more or narrow it by topic.`;
  const grouped = groupItems(batch);
  const lines = [intro, ""];

  for (const groupName of GROUP_ORDER) {
    const items = grouped.get(groupName);
    if (!items?.length) continue;

    lines.push(`${groupName}:`);
    items.forEach((item) => {
      lines.push(`- ${item.title} — ${item.url}`);
    });
    lines.push("");
  }

  if (remainingCount > 0) {
    lines.push("Say \"show more\" to continue.");
  } else if (kind === "more") {
    lines.push("I have shown the Data Hub insights I found for this view. You can narrow by topic, such as housing, skills, productivity, transport, health or environment.");
  }

  lines.push("Would you like me to show more, or filter by a topic such as housing, skills, productivity, health, transport or environment?");
  return lines.filter((line, index, all) => line || all[index - 1]).join("\n");
}

function filterByTopic(items, topic) {
  if (!topic) return items;
  const synonyms = TOPIC_SYNONYMS[topic] || [topic];
  return items.filter((item) =>
    synonyms.some((synonym) => phraseInText(item.searchText, normalize(synonym)))
  );
}

function groupItems(items) {
  const groups = new Map();

  for (const item of items) {
    const group = groupForItem(item);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }

  return groups;
}

function groupForItem(item) {
  const text = item.searchText;
  const category = normalize(item.category);

  if (category.includes("transport") || phraseInText(text, "transport") || phraseInText(text, "commuting")) return "Transport and infrastructure";
  if (category.includes("environment") || phraseInText(text, "emissions") || phraseInText(text, "energy") || phraseInText(text, "land use")) return "Environment and sustainability";
  if (category.includes("health") || phraseInText(text, "health") || phraseInText(text, "obesity") || phraseInText(text, "diabetes")) return "Health and population";
  if (category.includes("population") || category.includes("poverty") || phraseInText(text, "population") || phraseInText(text, "child poverty")) return "Health and population";
  if (phraseInText(text, "housing") || phraseInText(text, "house prices") || phraseInText(text, "affordability")) return "Housing";
  if (category.includes("labour") || phraseInText(text, "employment") || phraseInText(text, "skills") || phraseInText(text, "wages") || phraseInText(text, "training")) return "Employment and skills";
  if (category.includes("business") || phraseInText(text, "business") || phraseInText(text, "industry") || phraseInText(text, "sectors") || phraseInText(text, "investment")) return "Business and industry";
  if (category.includes("economy") || phraseInText(text, "gdp") || phraseInText(text, "gva") || phraseInText(text, "productivity")) return "Economy and productivity";
  return "Other Data Hub insights";
}

function groupRank(item) {
  const group = groupForItem(item);
  const index = GROUP_ORDER.indexOf(group);
  return index === -1 ? GROUP_ORDER.length : index;
}

function detectTopic(clean) {
  for (const [topic, synonyms] of Object.entries(TOPIC_SYNONYMS)) {
    if (synonyms.some((synonym) => phraseInText(clean, normalize(synonym)))) {
      return topic;
    }
  }

  return null;
}

function extractShownUrls(history) {
  const urls = new Set();

  for (const item of history || []) {
    if (item?.role !== "assistant") continue;
    const content = String(item.content || "");
    for (const match of content.matchAll(/https:\/\/www\.thebrunelcentre\.co\.uk\/data-hub\/[^\s]+/g)) {
      urls.add(normalizeUrl(match[0]));
    }
  }

  return urls;
}

function hasPreviousCatalogueAnswer(history) {
  return (history || []).some((item) =>
    item?.role === "assistant" &&
    /Data Hub insights I found|show more|narrow by topic/i.test(String(item.content || ""))
  );
}

function isDataHubSource(source) {
  const tags = Array.isArray(source.tags) ? source.tags : [];
  return source?.url &&
    source.url.includes("thebrunelcentre.co.uk/data-hub/") &&
    (source.id?.startsWith("data-hub-") || tags.includes("data-hub"));
}

function phraseInText(cleanText, cleanPhrase) {
  if (!cleanText || !cleanPhrase) return false;
  return new RegExp(`\\b${escapeRegExp(cleanPhrase).replace(/\\s+/g, "\\s+")}\\b`).test(cleanText);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeUrl(url) {
  return String(url || "").replace(/[.,;]+$/, "");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
