import fs from "node:fs/promises";
import path from "node:path";
import {
  inferSourceType,
  isAllowedCatalogueUrl,
  normalizeSourceRecord,
  normalizeSourceUrl
} from "./source-utils.js";

const SOURCES_PATH = path.join(process.cwd(), "content", "sources.json");
const DATASET_MAP_PATH = path.join(process.cwd(), "content", "datahub-datasets.json");
const BATCH_SIZE = 8;

const TOPIC_SYNONYMS = {
  housing: ["housing", "house prices", "affordability", "rent", "housing stock", "dwellings", "housebuilding"],
  skills: ["skills", "qualifications", "training", "job-related training", "skill shortages", "workforce development"],
  productivity: ["productivity", "gva", "gross value added", "gdp", "output", "output per hour"],
  employment: ["employment", "labour market", "unemployment", "inactivity", "workforce", "wages", "earnings"],
  environment: ["environment", "emissions", "greenhouse gas", "energy", "sustainability", "land use"],
  health: ["health", "obesity", "diabetes", "rheumatoid arthritis", "mental health", "musculoskeletal", "prevalence"],
  population: ["population", "migration", "age", "demographics", "child poverty", "inequality"],
  transport: ["transport", "commuting", "travel to work", "journey time", "infrastructure"],
  business: ["business", "enterprises", "industry", "sectors", "innovation", "trade", "investment"],
  regionalGrowth: ["policy", "policymakers", "regional growth", "economic strategy", "inclusive growth", "industrial strategy", "evidence", "public policy"]
};

const GROUPS = [
  { key: "economy", label: "Economy and productivity" },
  { key: "employment", label: "Employment and skills" },
  { key: "housing", label: "Housing" },
  { key: "transport", label: "Transport and infrastructure" },
  { key: "environment", label: "Environment and sustainability" },
  { key: "health", label: "Health and population" },
  { key: "business", label: "Business and industry" },
  { key: "regionalGrowth", label: "Policy and regional growth" },
  { key: "other", label: "Other Brunel Centre content" }
];

const TYPE_CONFIG = {
  dataHub: {
    name: "Data Hub insights",
    landingTitle: "Data Hub insights",
    landingUrl: "https://www.thebrunelcentre.co.uk/data-hub",
    marker: "Data Hub insights I found",
    initialIntro: "Here are some Data Hub insights I found for the Greater West of England. This is not the full list. You can ask me to show more or narrow it by topic.",
    topicIntro: (topic) => `Here are some ${topic} Data Hub insights I found for the Greater West of England. This is not the full list. You can ask me to show more or narrow it by topic.`,
    moreIntro: (topic) => topic
      ? `Here are more ${topic} Data Hub insights I found.`
      : "Here are more Data Hub insights I found.",
    cta: "Say \"show more\" to continue, ask for a topic such as housing, skills, productivity, health, transport or environment, or browse all [Data Hub insights](https://www.thebrunelcentre.co.uk/data-hub)."
  },
  research: {
    name: "Brunel Centre research articles",
    landingTitle: "Brunel Centre research",
    landingUrl: "https://www.thebrunelcentre.co.uk/research",
    marker: "Brunel Centre research articles I found",
    initialIntro: "Here are some Brunel Centre research articles I found. This is not the full list. You can ask me to show more or narrow it by topic.",
    topicIntro: (topic) => `Here are some ${topic} Brunel Centre research articles I found. This is not the full list. You can ask me to show more or narrow it by topic.`,
    moreIntro: (topic) => topic
      ? `Here are more ${topic} Brunel Centre research articles I found.`
      : "Here are more Brunel Centre research articles I found.",
    cta: "Say \"show more\" to continue, ask for a topic, or browse all [Brunel Centre research](https://www.thebrunelcentre.co.uk/research)."
  },
  policyRelated: {
    name: "policy articles",
    landingTitle: "Brunel Centre research",
    landingUrl: "https://www.thebrunelcentre.co.uk/research",
    marker: "dedicated set of policy articles",
    initialIntro: "Here are some Brunel Centre policy articles I found. This is not the full list. You can ask me to show more or narrow it by topic.",
    topicIntro: (topic) => `Here are some ${topic} Brunel Centre policy articles I found. This is not the full list. You can ask me to show more or narrow it by topic.`,
    moreIntro: (topic) => topic
      ? `Here are more ${topic} Brunel Centre policy articles I found.`
      : "Here are more Brunel Centre policy articles I found.",
    cta: "Say \"show more\" to continue, ask for a topic, or browse related [Brunel Centre research](https://www.thebrunelcentre.co.uk/research)."
  }
};

let cachedSources = null;
let cachedDatasets = null;
const cachedCatalogues = new Map();

export async function buildCatalogueAnswer({ message, history = [] }) {
  const intent = detectCatalogueIntent(message, history);
  if (!intent) return null;
  return buildCatalogueAnswerForIntent(intent, history);
}

export async function buildDataHubCatalogueAnswer({ message, history = [] }) {
  const intent = detectDataHubCatalogueIntent(message, history);
  if (!intent) return null;
  return buildCatalogueAnswerForIntent(intent, history);
}

export function detectDataHubCatalogueIntent(message, history = []) {
  const intent = detectCatalogueIntent(message, history);
  return intent?.type === "dataHub" ? intent : null;
}

export function detectCatalogueIntent(message, history = []) {
  const clean = normalize(message);
  if (!clean) return null;

  const topic = detectTopic(clean);
  const showMore = isShowMoreRequest(clean);

  if (showMore) {
    const previous = detectPreviousCatalogue(history);

    if (/\bdata\s*hub\b/.test(clean)) {
      return {
        type: "dataHub",
        kind: previous?.type === "dataHub" ? "more" : "initial",
        topic: topic || previous?.topic,
        showAllRequested: false
      };
    }

    if (/\b(policy|policies|policy related)\b/.test(clean)) {
      return { type: "policyRelated", kind: "initial", topic, showAllRequested: false };
    }

    if (/\bresearch\b/.test(clean)) {
      return {
        type: "research",
        kind: previous?.type === "research" ? "more" : "initial",
        topic: topic || previous?.topic,
        showAllRequested: false
      };
    }

    if (!previous && topic && /\b(insights|posts|indicators|data)\b/.test(clean)) {
      return {
        type: "dataHub",
        kind: "initial",
        topic,
        showAllRequested: false
      };
    }

    if (previous?.type === "dataHub" || previous?.type === "research") {
      return {
        type: previous.type,
        kind: "more",
        topic: topic || previous.topic,
        showAllRequested: false
      };
    }

    if (previous?.type === "policyRelated") {
      return { type: "policyRelated", kind: "policyMoreClarify", topic: null, showAllRequested: false };
    }

    return { type: null, kind: "showMoreClarify", topic: null, showAllRequested: false };
  }

  if (isPolicyCatalogueRequest(clean)) {
    return { type: "policyRelated", kind: "initial", topic, showAllRequested: false };
  }

  if (isResearchCatalogueRequest(clean)) {
    return { type: "research", kind: "initial", topic, showAllRequested: isShowAllRequest(clean, "research") };
  }

  if (isDataHubCatalogueRequest(clean, topic)) {
    return { type: "dataHub", kind: "initial", topic, showAllRequested: isShowAllRequest(clean, "dataHub") };
  }

  return null;
}

async function buildCatalogueAnswerForIntent(intent, history = []) {
  if (intent.kind === "showMoreClarify") {
    return catalogueResponse(
      "What would you like me to show more of? You can ask for more Data Hub insights, research articles, housing posts, skills posts, productivity posts, health posts or environment posts."
    );
  }

  if (intent.kind === "policyMoreClarify") {
    return catalogueResponse(
      "What would you like me to show more of? I can show Data Hub insights, research articles, or policy-related research topics such as housing, skills, productivity, transport, environment or regional growth."
    );
  }

  if (intent.type === "policyRelated") {
    const policyItems = await loadCatalogue("policyRelated");
    if (!policyItems.length) return catalogueResponse(renderPolicyEmptyState());
  }

  const catalogue = await loadCatalogue(intent.type);
  const filtered = filterByTopic(catalogue, intent.topic);
  const shownUrls = extractShownUrls(history, intent.type);
  const available = intent.kind === "more"
    ? filtered.filter((item) => !shownUrls.has(normalizeSourceUrl(item.url)))
    : filtered;

  if (!available.length) {
    return catalogueResponse(renderNoMoreAnswer(intent.type));
  }

  const batch = selectCatalogueBatch(available, {
    count: BATCH_SIZE,
    topic: intent.topic
  });

  return catalogueResponse(renderCatalogueAnswer({
    type: intent.type,
    batch,
    topic: intent.topic,
    kind: intent.kind,
    totalCount: filtered.length
  }));
}

async function loadCatalogue(type) {
  if (cachedCatalogues.has(type)) return cachedCatalogues.get(type);

  const { sources, datasets } = await loadSourceData();
  const datasetByUrl = new Map(
    datasets
      .filter((item) => item.post_url)
      .map((item) => [normalizeSourceUrl(item.post_url), item])
  );

  const items = sources
    .filter((source) => sourceMatchesCatalogueType(source, type))
    .map((source) => {
      const dataset = datasetByUrl.get(normalizeSourceUrl(source.url)) || {};
      const tags = Array.isArray(source.tags) ? source.tags : [];
      const category = dataset.category || tags.find((tag) => tag !== "data-hub" && tag !== "research" && tag !== "policy") || "";

      return {
        id: source.id || dataset.slug || source.url,
        title: source.title || dataset.title,
        url: source.url || dataset.post_url,
        tags,
        category,
        type,
        searchText: normalize([
          source.id,
          source.title,
          source.url,
          tags.join(" "),
          dataset.category,
          dataset.title,
          dataset.slug
        ].filter(Boolean).join(" "))
      };
    })
    .filter((item) => item.id && item.title && item.url && isAllowedCatalogueUrl(item.url))
    .sort((a, b) => groupRank(a) - groupRank(b) || a.title.localeCompare(b.title));

  cachedCatalogues.set(type, items);
  return items;
}

async function loadSourceData() {
  if (cachedSources && cachedDatasets) return { sources: cachedSources, datasets: cachedDatasets };

  const [sourcesRaw, datasetsRaw] = await Promise.all([
    fs.readFile(SOURCES_PATH, "utf8"),
    fs.readFile(DATASET_MAP_PATH, "utf8").catch(() => "[]")
  ]);

  cachedSources = JSON.parse(sourcesRaw.replace(/^\uFEFF/, "")).map(normalizeSourceRecord);
  cachedDatasets = JSON.parse(datasetsRaw.replace(/^\uFEFF/, ""));
  return { sources: cachedSources, datasets: cachedDatasets };
}

function renderCatalogueAnswer({ type, batch, topic, kind, totalCount }) {
  const config = TYPE_CONFIG[type];
  const intro = kind === "more"
    ? config.moreIntro(topic)
    : topic
      ? config.topicIntro(topic)
      : config.initialIntro;
  const lines = [intro, ""];

  if (type === "research" && totalCount > 0 && totalCount <= BATCH_SIZE) {
    lines[0] = "Here are the confirmed Brunel Centre research articles I found in the current sources.";
    lines.push("");
  }

  const grouped = groupItems(batch);
  for (const group of GROUPS) {
    const items = grouped.get(group.key);
    if (!items?.length) continue;

    lines.push(`${group.label}:`);
    for (const item of items) {
      lines.push(`- ${markdownLink(item.title, item.url)}`);
    }
    lines.push("");
  }

  lines.push(config.cta);
  return compactLines(lines);
}

function renderPolicyEmptyState() {
  return [
    "I couldn't find a dedicated set of policy articles in the current Brunel Centre sources. You can browse related Brunel Centre research, or ask me about a policy-related topic such as housing, skills, productivity, transport, environment or regional growth.",
    "",
    "Browse related [Brunel Centre research](https://www.thebrunelcentre.co.uk/research)."
  ].join("\n");
}

function renderNoMoreAnswer(type) {
  if (type === "research") {
    return "I have shown the research articles I found for this view. You can narrow it by topic, or browse all [Brunel Centre research](https://www.thebrunelcentre.co.uk/research).";
  }

  if (type === "dataHub") {
    return "I have shown the Data Hub insights I found for this view. You can narrow it by topic, or browse all [Data Hub insights](https://www.thebrunelcentre.co.uk/data-hub).";
  }

  return renderPolicyEmptyState();
}

function catalogueResponse(answer) {
  return {
    answer,
    sources: [],
    suppressSourceLinks: true
  };
}

function sourceMatchesCatalogueType(source, type) {
  if (!source?.url || !isAllowedCatalogueUrl(source.url)) return false;

  const sourceType = inferSourceType(source);
  if (type === "dataHub") return sourceType === "dataHubPost";
  if (type === "research") return sourceType === "researchArticle";
  if (type === "policyRelated") return sourceType === "policyArticle" || sourceType === "policyPage";
  return false;
}

function isDataHubCatalogueRequest(clean, topic) {
  if (isSpecificValueQuestion(clean)) return false;

  const broadCatalogue =
    /\bdata\s*hub\b/.test(clean) &&
    /\b(available|posts|articles|insights|topics|show me|browse|catalogue|catalog|what more|list)\b/.test(clean);
  const broadInsights =
    /\binsights?\s+(are\s+)?available\b/.test(clean) ||
    /\bwhat\s+topics\s+are\s+in\s+the\s+data\s*hub\b/.test(clean);
  const topicCatalogue = topic &&
    (/\bdata\s*hub\b/.test(clean) && /\b(available|posts|articles|insights|topics|show|browse|catalogue|catalog|list)\b/.test(clean) ||
      /\b(show|list|browse|find)\b.*\b(posts|articles|insights|indicators)\b/.test(clean) ||
      /\b(what|which)\b.*\b(data|posts|articles|insights|indicators|topics)\b.*\b(available|have|there|exist)\b/.test(clean) ||
      /\b(posts|articles|insights|indicators)\s+(are\s+)?available\b/.test(clean));

  return broadCatalogue || broadInsights || topicCatalogue;
}

function isSpecificValueQuestion(clean) {
  if (/\b(show|list|browse|find)\b.*\b(posts|articles|insights|indicators|topics|catalogue|catalog)\b/.test(clean)) return false;
  if (/\b(data\s*hub|research)\b.*\b(available|posts|articles|insights|topics|catalogue|catalog|browse|list)\b/.test(clean)) return false;

  return /\b(what\s+is|what\s+s|what\s+was|how\s+much|how\s+many|tell\s+me\s+the\s+(rate|count|value)|give\s+me\s+the\s+value|calculate|compare\s+values|by\s+local\s+authority|exact\s+value)\b/.test(clean) ||
    /\b(rate|rates|ratio|ratios|percentage|percent|count|counts|number|numbers|total|value|values|gdp|gva)\b/.test(clean) &&
      /\b(what|how|tell|give|calculate|compare|can|could)\b/.test(clean);
}

function isResearchCatalogueRequest(clean) {
  if (!/\bresearch\b/.test(clean)) return false;
  if (/\b(policy|policies|policy related)\b/.test(clean)) return false;

  return /\b(list|show|available|articles|article|posts|post|browse|catalogue|catalog|centre|center|brunel centre research|what research)\b/.test(clean);
}

function isPolicyCatalogueRequest(clean) {
  if (!/\b(policy|policies|policy related|policy related)\b/.test(clean)) return false;
  return /\b(list|show|available|articles|article|posts|post|research|do you have|could you|what policy)\b/.test(clean);
}

function isShowMoreRequest(clean) {
  return /^(show more|more|any more|what more|more posts|more insights|more research|more articles|show more data hub posts|show more datahub posts)$/.test(clean) ||
    /\b(show more|more posts|more insights|more research|more articles|what more is available|any more)\b/.test(clean);
}

function isShowAllRequest(clean, type) {
  if (type === "dataHub") return /\b(show|list)\s+all\s+data\s*hub\s+(posts|articles|insights)\b/.test(clean);
  if (type === "research") return /\b(show|list)\s+all\s+(research\s+)?(posts|articles)\b/.test(clean);
  return false;
}

function detectPreviousCatalogue(history) {
  const lastAssistant = [...(history || [])].reverse().find((item) => item?.role === "assistant");
  if (!lastAssistant) return null;

  const content = String(lastAssistant.content || "");
  const clean = normalize(content);
  const topic = extractPreviousTopic(content);

  if (clean.includes("i couldn t find a dedicated set of policy articles") || clean.includes("i couldnt find a dedicated set of policy articles")) {
    return { type: "policyRelated", topic };
  }

  if (hasCatalogueItemLinks(content, "data-hub") && clean.includes("data hub insights i found")) {
    return { type: "dataHub", topic };
  }

  if (hasCatalogueItemLinks(content, "research") && clean.includes("brunel centre research articles i found")) {
    return { type: "research", topic };
  }

  return null;
}

function hasCatalogueItemLinks(content, section) {
  return new RegExp(`\\]\\(https://www\\.thebrunelcentre\\.co\\.uk/${section}/[^\\s)]+\\)`).test(content);
}

function extractPreviousTopic(content) {
  const firstLine = normalize(String(content || "").split(/\n/).find((line) => line.trim()) || "");
  for (const topic of Object.keys(TOPIC_SYNONYMS)) {
    if (
      firstLine.includes(`some ${topic} data hub`) ||
      firstLine.includes(`more ${topic} data hub`) ||
      firstLine.includes(`some ${topic} brunel centre research`) ||
      firstLine.includes(`more ${topic} brunel centre research`)
    ) {
      return topic;
    }
  }
  return null;
}

function filterByTopic(items, topic) {
  if (!topic) return items;
  const synonyms = TOPIC_SYNONYMS[topic] || [topic];
  return items.filter((item) =>
    synonyms.some((synonym) => phraseInText(item.searchText, normalize(synonym)))
  );
}

function selectCatalogueBatch(items, { count, topic }) {
  if (topic || items.length <= count) return items.slice(0, count);

  const grouped = groupItems(items);
  const queues = GROUPS.map((group) => [...(grouped.get(group.key) || [])]);
  const batch = [];

  while (batch.length < count) {
    let added = false;
    for (const queue of queues) {
      if (!queue.length || batch.length >= count) continue;
      batch.push(queue.shift());
      added = true;
    }
    if (!added) break;
  }

  return batch;
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
  const tags = Array.isArray(item.tags) ? item.tags.map((tag) => normalize(tag)).join(" ") : "";
  const combined = `${text} ${category} ${tags}`;

  if (phraseInText(combined, "population") || phraseInText(combined, "child poverty") || phraseInText(combined, "migration") || phraseInText(combined, "inequality")) return "health";
  if (phraseInText(combined, "housing") || phraseInText(combined, "house prices") || phraseInText(combined, "affordability") || phraseInText(combined, "dwellings") || phraseInText(combined, "housebuilding")) return "housing";
  if (phraseInText(combined, "transport") || phraseInText(combined, "commuting") || phraseInText(combined, "travel to work") || phraseInText(combined, "journey time") || phraseInText(combined, "infrastructure")) return "transport";
  if (phraseInText(combined, "environment") || phraseInText(combined, "emissions") || phraseInText(combined, "greenhouse gas") || phraseInText(combined, "energy") || phraseInText(combined, "sustainability") || phraseInText(combined, "land use")) return "environment";
  if (phraseInText(combined, "health") || phraseInText(combined, "obesity") || phraseInText(combined, "diabetes") || phraseInText(combined, "mental health") || phraseInText(combined, "prevalence")) return "health";
  if (phraseInText(combined, "employment") || phraseInText(combined, "skills") || phraseInText(combined, "wages") || phraseInText(combined, "training") || phraseInText(combined, "labour market") || phraseInText(combined, "earnings")) return "employment";
  if (phraseInText(combined, "business") || phraseInText(combined, "industry") || phraseInText(combined, "sectors") || phraseInText(combined, "investment") || phraseInText(combined, "innovation") || phraseInText(combined, "trade")) return "business";
  if (phraseInText(combined, "policy") || phraseInText(combined, "regional growth") || phraseInText(combined, "industrial strategy")) return "regionalGrowth";
  if (phraseInText(combined, "economy") || phraseInText(combined, "gdp") || phraseInText(combined, "gva") || phraseInText(combined, "productivity") || phraseInText(combined, "growth")) return "economy";
  return "other";
}

function groupRank(item) {
  const key = groupForItem(item);
  const index = GROUPS.findIndex((group) => group.key === key);
  return index === -1 ? GROUPS.length : index;
}

function detectTopic(clean) {
  for (const [topic, synonyms] of Object.entries(TOPIC_SYNONYMS)) {
    if (synonyms.some((synonym) => phraseInText(clean, normalize(synonym)))) {
      return topic;
    }
  }

  return null;
}

function extractShownUrls(history, type) {
  const urls = new Set();

  for (const item of history || []) {
    if (item?.role !== "assistant") continue;
    const content = String(item.content || "");
    for (const match of content.matchAll(/https:\/\/www\.thebrunelcentre\.co\.uk\/(?:data-hub|research|policy)[^\s)]+/g)) {
      const url = normalizeSourceUrl(match[0]);
      if (urlMatchesType(url, type)) urls.add(url);
    }
  }

  return urls;
}

function urlMatchesType(url, type) {
  if (type === "dataHub") return url.includes("/data-hub/");
  if (type === "research") return url.includes("/research/");
  if (type === "policyRelated") return url.includes("/policy");
  return false;
}

function compactLines(lines) {
  return lines.filter((line, index, all) => line || all[index - 1]).join("\n");
}

function markdownLink(title, url) {
  if (!isAllowedCatalogueUrl(url)) return escapeMarkdownLinkText(title);
  return `[${escapeMarkdownLinkText(title)}](${markdownUrl(url)})`;
}

function escapeMarkdownLinkText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function markdownUrl(url) {
  return String(url || "")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function phraseInText(cleanText, cleanPhrase) {
  if (!cleanText || !cleanPhrase) return false;
  return new RegExp(`\\b${escapeRegExp(cleanPhrase).replace(/\s+/g, "\\s+")}\\b`).test(cleanText);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
