import { detectAggregateBreakdownIntent } from "./aggregate-breakdown.js";
import { detectRequestedMeasureFamilies } from "./measure-compatibility.js";
import {
  asksBackendSourceDetails,
  isFollowUpReference,
  isShortOrContextualDetailFollowUp,
  shouldUseHistoryForRetrieval
} from "./retrieval-context.js";
import { extractConcepts } from "./retrieval.js";

const SOURCE_HIERARCHY = ["article", "analysisRows", "structuredRawFacts", "rawRowFallback"];

const TOPIC_LABELS = {
  gdp: "GDP",
  gva: "GVA",
  productivity: "productivity",
  employment: "employment",
  wages: "wages",
  skills: "skills",
  neet: "NEET",
  emissions: "emissions",
  energy: "energy",
  housing: "housing",
  industry: "industry"
};

const MEASURE_TOPIC_LABELS = {
  employmentCount: "employment count",
  employmentRate: "employment rate",
  neet: "NEET",
  housingAffordability: "housing affordability",
  housingStock: "housing stock",
  businessCount: "business counts",
  employeeCount: "employee counts",
  populationCount: "population count",
  populationChange: "population change",
  emissionsTotal: "emissions",
  energyConsumption: "energy consumption",
  gdpGva: "GDP/GVA",
  travelTime: "transport",
  healthPrevalence: "health"
};

export function buildQuestionPlan({ message, history = [] }) {
  const clean = normalize(message);
  const topics = extractTopics(message);
  const measureFamilies = detectRequestedMeasureFamilies(message);
  const aggregateBreakdown = detectAggregateBreakdownIntent(message);
  const isFollowUp = shouldUseHistoryForRetrieval(message) || isFollowUpReference(clean);
  const previousSourceRequired = isFollowUp ||
    isShortOrContextualDetailFollowUp(clean) ||
    asksBackendSourceDetails(clean);
  const calculationNeeded = isCalculationRequest(clean);
  const methodologyRequest = asksMethodology(clean);
  const sourceRequest = !methodologyRequest && asksSource(clean);
  const breakdowns = extractBreakdowns(clean, aggregateBreakdown);
  const geography = extractGeographies(clean);
  const measureRequested = detectMeasureRequested(clean, measureFamilies);

  const plan = {
    intent: detectIntent({
      clean,
      message,
      topics,
      measureFamilies,
      aggregateBreakdown,
      isFollowUp,
      previousSourceRequired,
      calculationNeeded,
      methodologyRequest,
      sourceRequest,
      breakdowns
    }),
    topics,
    indicator: detectIndicator(clean, topics, measureFamilies),
    measureRequested,
    geography: geography.length === 1 ? geography[0] : geography,
    breakdowns,
    period: detectPeriod(message),
    isFollowUp,
    previousSourceRequired,
    sourceHierarchy: SOURCE_HIERARCHY,
    calculationNeeded,
    calculationAllowed: calculationNeeded ? hasValidCalculationSignal(clean) : false,
    clarificationNeeded: needsClarification(clean, topics, measureFamilies),
    reason: buildInternalReason({ clean, topics, measureFamilies, aggregateBreakdown, previousSourceRequired }),
    reasoningEffort: "low"
  };

  plan.reasoningEffort = reasoningEffortForPlan(plan);
  plan.historyTurnsConsidered = Array.isArray(history) ? Math.min(history.length, 8) : 0;

  return plan;
}

export function reasoningEffortForPlan(plan) {
  if (!plan || plan.intent === "smallTalk") return "none";

  if (["catalogueBrowse", "researchCatalogue", "policyEmptyState", "sourceRequest", "unclear"].includes(plan.intent)) {
    return "low";
  }

  if ([
    "aggregatePlusBreakdown",
    "countDetailRequest",
    "calculationRequest",
    "methodologyRequest"
  ].includes(plan.intent)) {
    return "high";
  }

  if ((plan.topics || []).length > 1 || (plan.breakdowns || []).length > 1) return "high";
  if (["exactStatisticLookup", "aggregateLookup", "breakdownLookup"].includes(plan.intent)) return "medium";

  return "low";
}

export function planRequiresRawFacts(plan) {
  return [
    "aggregatePlusBreakdown",
    "countDetailRequest",
    "calculationRequest",
    "methodologyRequest",
    "sourceRequest"
  ].includes(plan?.intent);
}

export function planAllowsBackendDetails(plan) {
  return ["methodologyRequest", "sourceRequest"].includes(plan?.intent);
}

function detectIntent({
  clean,
  message,
  topics,
  measureFamilies,
  aggregateBreakdown,
  isFollowUp,
  previousSourceRequired,
  calculationNeeded,
  methodologyRequest,
  sourceRequest,
  breakdowns
}) {
  if (isSmallTalk(clean)) return "smallTalk";
  if (isUnclear(clean)) return "unclear";
  if (methodologyRequest) return "methodologyRequest";
  if (sourceRequest) return "sourceRequest";
  if (calculationNeeded) return "calculationRequest";

  const catalogueType = detectCatalogueType(clean);
  if (catalogueType) return catalogueType;
  if (isPolicyEmptyState(clean)) return "policyEmptyState";
  if (aggregateBreakdown.isAggregateBreakdown) return "aggregatePlusBreakdown";
  if (isCountDetailRequest(clean)) return "countDetailRequest";
  if (aggregateBreakdown.wantsAggregate && topics.length && /\b(overall|aggregate|regional|total|combined)\b/.test(clean)) return "aggregateLookup";
  if (aggregateBreakdown.wantsBreakdown || breakdowns.length) return "breakdownLookup";
  if (isStatisticLookup(clean, measureFamilies)) return "exactStatisticLookup";
  if (isFollowUp) return "followUpQuestion";
  if (isNormalQuestion(clean) || topics.length || measureFamilies.length || extractConcepts(message).length) return "normalArticleQuestion";

  return "unclear";
}

function extractTopics(message) {
  const conceptTopics = extractConcepts(message).map((topic) => TOPIC_LABELS[topic] || topic);
  const measureTopics = detectRequestedMeasureFamilies(message).map((family) => MEASURE_TOPIC_LABELS[family] || family);
  const explicitTopics = [];
  const clean = normalize(message);

  if (/\bbusiness(?:es)?\b|\benterprises?\b/.test(clean)) explicitTopics.push("business");
  if (/\binward investment\b|\bforeign direct investment\b|\bfdi\b|\bbusiness investment\b|\binvestment\b/.test(clean)) explicitTopics.push("inward investment");
  if (/\btrade\b|\bexports?\b/.test(clean)) explicitTopics.push("trade");
  if (/\binnovation\b/.test(clean)) explicitTopics.push("innovation");
  if (/\bpopulation\b/.test(clean)) explicitTopics.push("population");
  if (/\btransport\b|\btravel\s+time\b|\bcommut/.test(clean)) explicitTopics.push("transport");
  if (/\bhealth\b|\blife\s+expectancy\b|\bmortality\b|\bprevalence\b/.test(clean)) explicitTopics.push("health");
  if (/\bunemployment\b/.test(clean)) explicitTopics.push("unemployment");
  if (/\bpolicy\b|\bpolicies\b/.test(clean)) explicitTopics.push("policy");
  if (/\bresearch\b|\barticle\b|\barticles\b/.test(clean)) explicitTopics.push("research");
  if (/\bdata\s*hub\b|\bdatahub\b/.test(clean)) explicitTopics.push("Data Hub");

  return unique([...conceptTopics, ...measureTopics, ...explicitTopics]);
}

function detectIndicator(clean, topics, measureFamilies) {
  if (/\bemployment\s+rate\b/.test(clean)) return "employment rate";
  if (/\bemployment\b.*\b(count|number|total|how many)\b|\b(count|number|total|how many)\b.*\bemployment\b/.test(clean)) return "employment count";
  if (/\bneet\b/.test(clean) && /\bactivity\s+not\s+known\b/.test(clean)) return "NEET and activity not known";
  if (/\bneet\b/.test(clean)) return "NEET rate";
  if (/\bhousing\s+affordability\b|\baffordability\s+ratio\b/.test(clean)) return "housing affordability ratio";
  if (/\bgdp\b/.test(clean) && /\bgva\b/.test(clean)) return "GDP and GVA";
  if (/\bgdp\b|\bgross\s+domestic\s+product\b/.test(clean)) return "GDP";
  if (/\bgva\b|\bgross\s+value\s+added\b/.test(clean)) return "GVA";
  if (/\bemissions?\b|\bco2\b|\bgreenhouse\s+gas\b/.test(clean)) return "emissions";
  if (/\bpopulation\b/.test(clean)) return "population";
  if (measureFamilies.length) return MEASURE_TOPIC_LABELS[measureFamilies[0]] || measureFamilies[0];
  return topics[0] || "";
}

function detectMeasureRequested(clean, measureFamilies) {
  if (/\b(rate|rates|percentage|percent|proportion)\b/.test(clean)) return "rate";
  if (/\b(count|counts|number|numbers|how many|total|totals)\b/.test(clean)) return "count";
  if (/\bdenominator|cohort|base|sample size\b/.test(clean)) return "denominator";
  if (/\bnumerator\b/.test(clean)) return "numerator";
  if (/\bratio|ratios\b/.test(clean)) return "ratio";
  if (/\bgdp\b|\bgva\b|\bvalue|values\b/.test(clean)) return "value";
  if (/\bmethod|methodology|workbook|sheet\b/.test(clean)) return "methodology";
  if (/\bsource|sources|link|links\b/.test(clean)) return "source";
  if (measureFamilies.includes("emissionsTotal")) return "total";
  if (measureFamilies.includes("populationCount")) return "count";
  return "general";
}

function extractGeographies(clean) {
  const matches = [];
  const patterns = [
    ["Greater West of England", /\b(greater\s+west\s+of\s+england|gwe|greater\s+west)\b/],
    ["Bath and North East Somerset", /\b(bath|barh|banes|bnes|b\s+nes|bath\s+and\s+ne\s+somerset|bath\s+and\s+north\s+east\s+somerset)\b/],
    ["Bristol, City of", /\bbristol\b/],
    ["Gloucestershire", /\b(gloucestershire|gloucstershire|glos)\b/],
    ["North Somerset", /\bnorth\s+somerset\b/],
    ["South Gloucestershire", /\b(south\s+gloucestershire|south\s+glos)\b/],
    ["Swindon", /\bswindon\b/],
    ["Wiltshire", /\bwiltshire\b/],
    ["Stroud", /\bstroud\b/],
    ["Cotswold", /\bcotswold\b/],
    ["Cheltenham", /\bcheltenham\b/],
    ["Gloucester", /\bgloucester\b/],
    ["Forest of Dean", /\bforest\s+of\s+dean\b/],
    ["Tewkesbury", /\btewkesbury\b/],
    ["England", /\bengland\b/]
  ];

  for (const [label, pattern] of patterns) {
    if (pattern.test(clean)) matches.push(label);
  }

  const uniqueMatches = unique(matches);
  if (uniqueMatches.includes("Greater West of England")) {
    return uniqueMatches.filter((match) => match !== "England");
  }

  return uniqueMatches;
}

function extractBreakdowns(clean, aggregateBreakdown) {
  const breakdowns = [];
  if (/\blocal\s+authorit(?:y|ies)\b|\bconstituent\s+areas?\b|\bby\s+area\b|\bwithin\b/.test(clean)) {
    breakdowns.push("local authorities");
  }
  if (/\bage|aged|age\s+group|by\s+age\b/.test(clean)) breakdowns.push("age");
  if (/\bsex|gender|male|female|by\s+sex|by\s+gender\b/.test(clean)) breakdowns.push("sex");
  if (/\bsector|sectors|industry|industries|by\s+industry\b/.test(clean)) breakdowns.push("sector/industry");
  if (/\bfuel\s+type|fuel\b/.test(clean)) breakdowns.push("fuel type");
  if (/\btenure\b/.test(clean)) breakdowns.push("tenure");
  if (/\bdistrict|districts\b/.test(clean)) breakdowns.push("districts");

  if (aggregateBreakdown.wantsBreakdown && !breakdowns.length) breakdowns.push("breakdown");
  return unique(breakdowns);
}

function detectPeriod(message) {
  const years = String(message || "").match(/\b(19|20)\d{2}\b/g);
  if (years?.length) return unique(years).join(", ");
  if (/\blatest|current|recent|newest|most\s+recent\b/i.test(message)) return "latest available";
  return "latest available";
}

function detectCatalogueType(clean) {
  const browse = /\b(show|list|browse|what|which|more|available|catalogue|catalog)\b/.test(clean);
  if (!browse) return null;
  if (/\bdata\s*hub\b|\bdatahub\b|\binsights?\b/.test(clean)) return "catalogueBrowse";
  if (/\bresearch\b|\barticles?\b|\bposts?\b/.test(clean)) return "researchCatalogue";
  return null;
}

function isPolicyEmptyState(clean) {
  return /\b(policy|policies|policy\s+insights?|policy\s+launch|released)\b/.test(clean) &&
    /\b(is\s+there|are\s+there|do\s+you\s+have|launched?|released?|policy)\b/.test(clean);
}

function asksMethodology(clean) {
  return /\b(method|methodology|workbook|workbooks|sheet|sheets|raw\s+data|source\s+file|source\s+files|which\s+data\s+source|what\s+data\s+source|how\s+was\s+this\s+calculated|how\s+did\s+you\s+calculate)\b/.test(clean);
}

function asksSource(clean) {
  return /\b(source|sources|citation|citations|link|links|where\s+did\s+that\s+come\s+from|where\s+is\s+that\s+from)\b/.test(clean);
}

function isCalculationRequest(clean) {
  return /\b(calculate|calculation|compute|computed|combined|combine|weighted|weighted\s+average|average|overall\s+rate|aggregate\s+rate)\b/.test(clean);
}

function hasValidCalculationSignal(clean) {
  return /\b(numerator|denominator|cohort|base|counts?|number|numbers|population|weighted)\b/.test(clean) &&
    !/\b(simple\s+average|average\s+of\s+percentages|average\s+the\s+percentages)\b/.test(clean);
}

function isCountDetailRequest(clean) {
  return /\b(count|counts|number|numbers|how\s+many|total|totals|total\s+number|numerator|denominator|base|sample\s+size|cohort|detail|details)\b/.test(clean);
}

function isStatisticLookup(clean, measureFamilies) {
  return measureFamilies.length > 0 ||
    /\b(rate|rates|ratio|ratios|percentage|percent|proportion|gdp|gva|emissions?|co2|population|value|values|count|counts|number|numbers|total)\b/.test(clean);
}

function isNormalQuestion(clean) {
  return /\b(what|which|where|when|why|how|who|tell|show|give|explain|summarise|summarize|compare|list|find|get|provide|do\s+you|does|is\s+there|are\s+there)\b/.test(clean);
}

function isSmallTalk(clean) {
  if (!clean) return false;
  return /^(hi|hii|hello|hey|hiya|helo|heelo|good\s+morning|good\s+afternoon|good\s+evening|thanks|thank\s+you|thankyou|cheers|many\s+thanks|bye|goodbye|see\s+you|ok|okay|cool|fine|great|thats\s+great|that\s+is\s+great|brilliant|perfect|nice|nice\s+one|good|good\s+to\s+know|sounds\s+good|got\s+it|understood|makes\s+sense|thats\s+helpful|that\s+is\s+helpful|very\s+helpful|helpful|excellent|amazing|alright|all\s+right|no\s+problem)(\s+thanks)?$/.test(clean);
}

function isUnclear(clean) {
  if (!clean) return true;
  if (/^[?.!]+$/.test(clean)) return true;
  if (/^(help|what|huh|eh|erm|um|random)$/.test(clean)) return true;
  return clean.length <= 2;
}

function needsClarification(clean, topics, measureFamilies) {
  if (isUnclear(clean)) return true;
  if (/\b(which|what)\s+(data|numbers?|figures?)\b/.test(clean) && !topics.length && !measureFamilies.length) return true;
  return false;
}

function buildInternalReason({ clean, topics, measureFamilies, aggregateBreakdown, previousSourceRequired }) {
  const parts = [];
  if (topics.length) parts.push(`topics:${topics.join("|")}`);
  if (measureFamilies.length) parts.push(`measureFamilies:${measureFamilies.join("|")}`);
  if (aggregateBreakdown.isAggregateBreakdown) parts.push("aggregatePlusBreakdown");
  if (previousSourceRequired) parts.push("historyContextRequired");
  if (!parts.length) parts.push(clean ? "generalQuestion" : "emptyQuestion");
  return parts.join("; ");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/&/g, " and ")
    .replace(/'/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  const seen = new Set();
  const output = [];
  for (const value of values || []) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}
