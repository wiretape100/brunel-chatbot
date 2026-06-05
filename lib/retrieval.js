const TOPIC_SYNONYMS = {
  gdp: ["gdp", "gross domestic product", "gdp per head", "economic output"],
  gva: ["gva", "gross value added", "productivity", "gva by industry", "gva by industry group", "current prices", "output by industry"],
  productivity: ["productivity", "labour productivity", "output per hour", "gva per hour worked", "gva"],
  employment: ["employment", "employment rate", "labour market", "workforce"],
  wages: ["wages", "pay", "earnings", "median weekly pay", "gross weekly pay"],
  skills: ["skills", "qualifications", "training", "job-related training", "workforce characteristics"],
  neet: ["neet", "not in education employment or training", "young people", "youth labour market"],
  emissions: ["emissions", "carbon emissions", "greenhouse gas emissions", "co2"],
  energy: ["energy", "energy consumption", "fuel type", "electricity", "gas"],
  housing: ["housing", "house prices", "rent", "affordability", "housing affordability"],
  industry: ["industry", "sector", "sectors", "industry group", "industry groups"]
};

const CONTEXT_PATTERNS = [
  /\b(19|20)\d{2}\b/g,
  /\bgreater west of england\b/gi,
  /\bwest of england\b/gi,
  /\bbath(?: and north east somerset| and ne somerset| ne somerset)?\b/gi,
  /\bbanes\b/gi,
  /\bbristol(?:, city of)?\b/gi,
  /\bgloucestershire\b/gi,
  /\bglos\b/gi,
  /\bnorth somerset\b/gi,
  /\bsouth gloucestershire\b/gi,
  /\bsouth glos\b/gi,
  /\bswindon\b/gi,
  /\bwiltshire\b/gi,
  /\baged?\s+\d{1,2}(?:\s*(?:-|to|and)\s*\d{1,2})?\b/gi,
  /\bmale\b|\bfemale\b|\bsex\b|\bgender\b/gi
];

export function buildRetrievalPlan({ message, primaryQuery }) {
  const concepts = extractConcepts(message);
  const isMultiConcept = concepts.length > 1;

  if (!isMultiConcept && concepts.length === 1) {
    const context = extractContextText(message);
    const concept = concepts[0];
    const searchQueries = uniqueQueries([
      primaryQuery,
      buildConceptQuery(concept, context),
      ...buildSynonymQueries(concept, context)
    ]).slice(0, 8);

    return {
      isMultiConcept: false,
      concepts,
      primaryQuery,
      embeddingQueries: searchQueries,
      searchQueries
    };
  }

  if (!isMultiConcept) {
    return {
      isMultiConcept: false,
      concepts,
      primaryQuery,
      embeddingQueries: [primaryQuery],
      searchQueries: [primaryQuery]
    };
  }

  const context = extractContextText(message);
  const combinedConceptQuery = buildCombinedConceptQuery(concepts, context);
  const conceptQueries = concepts.map((concept) => buildConceptQuery(concept, context));
  const synonymQueries = concepts.flatMap((concept) => buildSynonymQueries(concept, context));
  const searchQueries = uniqueQueries([
    primaryQuery,
    combinedConceptQuery,
    ...conceptQueries,
    ...synonymQueries
  ]).slice(0, 14);

  return {
    isMultiConcept: true,
    concepts,
    primaryQuery,
    embeddingQueries: searchQueries,
    searchQueries
  };
}

export function extractConcepts(message) {
  const clean = normalizeForRetrieval(message);
  if (!clean) return [];

  const matched = [];
  for (const [topic, synonyms] of Object.entries(TOPIC_SYNONYMS)) {
    if (synonyms.some((synonym) => phraseInText(clean, normalizeForRetrieval(synonym)))) {
      matched.push(topic);
    }
  }

  return pruneOverlappingConcepts(matched, clean);
}

export function mergeSearchResults(resultGroups, options = {}) {
  const concepts = options.concepts || [];
  const limit = options.limit || 8;
  const query = options.query || "";
  const preferDataHub = options.preferDataHub !== false;
  const byKey = new Map();

  for (const group of resultGroups || []) {
    for (const item of group || []) {
      const key = item.url || item.post_url || item.title || item.post_title || item.id;
      if (!key) continue;

      const scored = {
        ...item,
        retrieval_score: scoreItem(item, { concepts, query, preferDataHub })
      };
      const existing = byKey.get(key);
      if (!existing || scored.retrieval_score > existing.retrieval_score) {
        byKey.set(key, scored);
      }
    }
  }

  const ranked = [...byKey.values()].sort((a, b) => b.retrieval_score - a.retrieval_score);
  const selected = [];
  const selectedKeys = new Set();

  if (concepts.length > 1) {
    for (const concept of concepts) {
      const conceptMatch = ranked.find((item) => !selectedKeys.has(itemKey(item)) && itemMatchesConcept(item, concept));
      if (conceptMatch) {
        selected.push(conceptMatch);
        selectedKeys.add(itemKey(conceptMatch));
      }
    }
  }

  for (const item of ranked) {
    if (selected.length >= limit) break;
    const key = itemKey(item);
    if (selectedKeys.has(key)) continue;
    selected.push(item);
    selectedKeys.add(key);
  }

  return selected;
}

export function describeRetrievalPlan(plan) {
  if (!plan?.isMultiConcept) return "";

  return [
    "Multi-topic retrieval was used.",
    `Requested concepts: ${plan.concepts.join(", ")}.`,
    "The search covered the full original query, the combined concept phrase, each concept separately, and synonym expansions.",
    "When answering, cover each requested concept that has retrieved Brunel Centre evidence. If one concept is not found in the retrieved results, say that it was not found in the retrieved results rather than saying Brunel Centre has no content on it."
  ].join("\n");
}

function buildCombinedConceptQuery(concepts, context) {
  return withContext(concepts.map(displayConcept).join(" and "), context);
}

function buildConceptQuery(concept, context) {
  const synonyms = TOPIC_SYNONYMS[concept] || [concept];
  return withContext(uniqueQueries([displayConcept(concept), ...synonyms]).join(" "), context);
}

function buildSynonymQueries(concept, context) {
  return (TOPIC_SYNONYMS[concept] || [concept])
    .map((synonym) => withContext(synonym, context));
}

function withContext(query, context) {
  return context ? `${query} ${context}` : query;
}

function extractContextText(message) {
  const found = [];

  for (const pattern of CONTEXT_PATTERNS) {
    for (const match of String(message || "").matchAll(pattern)) {
      found.push(match[0]);
    }
  }

  return uniqueQueries(found).join(" ");
}

function pruneOverlappingConcepts(concepts, clean) {
  const pruned = [...concepts];

  if (pruned.includes("gva") && pruned.includes("productivity")) {
    const explicitProductivity = /\bproductivity\b/.test(clean);
    const explicitGva = /\bgva\b|\bgross\s+value\s+added\b/.test(clean);
    if (explicitGva && !explicitProductivity) {
      return pruned.filter((concept) => concept !== "productivity");
    }
  }

  return pruned;
}

function scoreItem(item, { concepts, query, preferDataHub }) {
  const base = Number(item.similarity || item.rank || 0);
  const text = itemText(item);
  let score = base;

  if (preferDataHub && /data-hub/.test(text)) score += 0.08;
  if (/\bresearch\b/.test(normalizeForRetrieval(query)) && /research/.test(text)) score += 0.04;

  for (const concept of concepts) {
    if (itemMatchesConcept(item, concept)) score += 0.12;
  }

  return score;
}

function itemMatchesConcept(item, concept) {
  const text = itemText(item);
  return (TOPIC_SYNONYMS[concept] || [concept])
    .some((synonym) => phraseInText(text, normalizeForRetrieval(synonym)));
}

function itemText(item) {
  return normalizeForRetrieval([
    item.title,
    item.post_title,
    item.url,
    item.post_url,
    item.workbook_name,
    item.content,
    item.search_text
  ].filter(Boolean).join(" "));
}

function itemKey(item) {
  return item.url || item.post_url || item.title || item.post_title || item.id;
}

function displayConcept(concept) {
  if (concept === "gdp") return "GDP";
  if (concept === "gva") return "GVA";
  if (concept === "neet") return "NEET";
  return concept;
}

function uniqueQueries(queries) {
  const seen = new Set();
  const output = [];

  for (const query of queries) {
    const value = String(query || "").replace(/\s+/g, " ").trim();
    const key = normalizeForRetrieval(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }

  return output;
}

function phraseInText(cleanText, cleanPhrase) {
  if (!cleanText || !cleanPhrase) return false;
  return new RegExp(`\\b${escapeRegExp(cleanPhrase).replace(/\\s+/g, "\\s+")}\\b`).test(cleanText);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeForRetrieval(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
