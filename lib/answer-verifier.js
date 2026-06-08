import { planAllowsBackendDetails } from "./question-planner.js";

const GENERIC_UNVERIFIED_ANSWER = "I could not verify that answer against the checked Brunel Centre article and linked data. I could not find the requested value in the article or linked data.";

export function verifyAnswer({ answer, plan, sources = [], datasetSources = [] }) {
  const text = String(answer || "").trim();
  const clean = normalize(text);
  const issues = [];

  if (!text) {
    issues.push("emptyAnswer");
  }

  if (!planAllowsBackendDetails(plan) && exposesBackendDetails(clean)) {
    issues.push("backendDetailsExposed");
  }

  if (!usesOnlyVisibleSourceRecords(text, sources, datasetSources)) {
    issues.push("unsupportedRawSourceReference");
  }

  if (isAggregatePlusBreakdownMissingPart(clean, plan)) {
    issues.push("aggregatePlusBreakdownIncomplete");
  }

  if (isCountRequestReturningWrongMeasure(clean, plan)) {
    issues.push("countRequestWrongMeasure");
  }

  if (isEmploymentCountUsingNeet(clean, plan)) {
    issues.push("employmentCountUsedNeet");
  }

  if (isHousingAffordabilityUsingStock(clean, plan)) {
    issues.push("housingAffordabilityUsedHousingStock");
  }

  if (isEmissionsUsingEnergy(clean, plan)) {
    issues.push("emissionsUsedEnergyConsumption");
  }

  if (hasUnsupportedPercentageAverage(text, plan)) {
    issues.push("unsupportedPercentageAverage");
  }

  return {
    ok: issues.length === 0,
    issues,
    repairedAnswer: issues.length ? repairAnswer({ plan }) : text
  };
}

export function repairAnswer({ plan }) {
  if (plan?.intent === "aggregatePlusBreakdown") {
    return "I could not verify both the aggregate value and the requested breakdown against the checked Brunel Centre article and linked data.";
  }

  if (plan?.intent === "calculationRequest") {
    return "I could not verify a valid calculation from the checked Brunel Centre article and linked data. I will not calculate an aggregate by averaging percentages.";
  }

  if (plan?.intent === "countDetailRequest") {
    return "I could not verify the requested count or detailed value in the checked Brunel Centre article and linked data.";
  }

  return GENERIC_UNVERIFIED_ANSWER;
}

function exposesBackendDetails(clean) {
  return /\b(workbook|workbooks|sheet|sheets|raw data|raw_data|analysis rows?|structured raw facts?|dataset facts?|database tables?|supabase|embeddings?|source row|row index|parser|rpc)\b/.test(clean);
}

function usesOnlyVisibleSourceRecords(answer, sources, datasetSources) {
  const sourceRecords = [...(sources || []), ...(datasetSources || [])].filter((source) => source?.title || source?.url);
  const markdownLinks = [...String(answer || "").matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)];
  if (!markdownLinks.length) return true;

  const allowedUrls = new Set(sourceRecords.map((source) => normalizeUrl(source.url)).filter(Boolean));
  const allowedTitles = new Set(sourceRecords.map((source) => normalize(source.title)).filter(Boolean));

  for (const [, title, url] of markdownLinks) {
    const normalizedUrl = normalizeUrl(url);
    const normalizedTitle = normalize(title);
    if (!allowedUrls.has(normalizedUrl) && !allowedTitles.has(normalizedTitle)) {
      return false;
    }
  }

  return true;
}

function isAggregatePlusBreakdownMissingPart(clean, plan) {
  if (plan?.intent !== "aggregatePlusBreakdown") return false;
  if (hasUnavailableWording(clean)) return false;

  const answerBody = clean.replace(/\bsource\b[\s\S]*$/, "").trim();
  const needsGreaterWest = normalizeList(plan.geography).includes("greater west of england") ||
    /\b(greater west of england|gwe|greater west)\b/.test(normalizeList(plan.topics).join(" "));
  const hasAggregate = !needsGreaterWest || hasValueNearAggregatePhrase(answerBody);
  const hasBreakdown = /\blocal authorit(?:y|ies)\b|\bbath and north east somerset\b|\bbristol\b|\bgloucestershire\b|\bnorth somerset\b|\bsouth gloucestershire\b|\bswindon\b|\bwiltshire\b|\bbreakdown\b|\bby age\b|\bage 16\b|\bage 17\b|\bmale\b|\bfemale\b|\bsector\b|\bindustry\b/.test(answerBody);

  return !hasAggregate || !hasBreakdown;
}

function hasValueNearAggregatePhrase(clean) {
  const aggregate = String.raw`(?:greater west of england|gwe|overall|aggregate|regional)`;
  const value = String.raw`(?:\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*%?|\d+(?:\.\d+)?\s*%?)`;
  const between = String.raw`(?:\s+\S+){0,14}\s+`;

  return new RegExp(`${aggregate}${between}${value}\\b`).test(clean) ||
    new RegExp(`\\b${value}${between}${aggregate}`).test(clean);
}

function isCountRequestReturningWrongMeasure(clean, plan) {
  if (plan?.intent !== "countDetailRequest") return false;
  if (hasUnavailableWording(clean)) return false;
  if (/\b(count|counts|number|numbers|total|numerator|denominator|cohort|base|sample size)\b/.test(clean)) return false;
  return /\b\d+(?:\.\d+)?\s*%|\brate\b|\bratio\b/.test(clean);
}

function isEmploymentCountUsingNeet(clean, plan) {
  const wantsEmploymentCount = normalize(plan?.indicator).includes("employment count") ||
    normalizeList(plan?.topics).some((topic) => topic.includes("employment")) && plan?.measureRequested === "count";
  if (!wantsEmploymentCount) return false;
  return /\bneet\b|\bactivity not known\b|\bcohort\b|\byoung people\b/.test(clean);
}

function isHousingAffordabilityUsingStock(clean, plan) {
  const indicator = normalize(plan?.indicator);
  const wantsAffordability = indicator.includes("housing affordability") ||
    normalizeList(plan?.topics).some((topic) => topic.includes("housing affordability")) ||
    /\bhousingaffordability\b/.test(normalizeList(plan?.topics).join(""));
  if (!wantsAffordability) return false;
  return /\bhousing stock\b|\bdwellings?\b|\bhousebuilding\b/.test(clean) && !/\baffordability\b|\bhouse price to earnings\b/.test(clean);
}

function isEmissionsUsingEnergy(clean, plan) {
  const indicator = normalize(plan?.indicator);
  const wantsEmissions = indicator.includes("emissions") ||
    normalizeList(plan?.topics).some((topic) => topic.includes("emissions"));
  if (!wantsEmissions) return false;
  return /\benergy consumption\b|\belectricity\b|\bgas consumption\b/.test(clean) && !/\bemissions?\b|\bco2\b|\bgreenhouse gas\b/.test(clean);
}

function hasUnsupportedPercentageAverage(answer, plan) {
  if (plan?.intent !== "calculationRequest" && !plan?.calculationNeeded) return false;

  const sentences = String(answer || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return sentences.some((sentence) => {
    const clean = normalize(sentence);
    const mentionsAverage = /\b(average|averaged|averaging|simple mean|arithmetic mean)\b/.test(clean);
    const mentionsPercentages = /\b(percentages?|rates?|proportions?)\b/.test(clean);
    const explicitlyRefuses = /\b(do not|does not|did not|will not|cannot|can not|should not|not average|not averaged|i will not)\b/.test(clean);
    return mentionsAverage && mentionsPercentages && !explicitlyRefuses;
  });
}

function hasUnavailableWording(clean) {
  return /\b(could not find|not available|did not find|missing|not found|does not answer|cannot be done|could not verify)\b/.test(clean);
}

function normalizeList(values) {
  if (!Array.isArray(values)) values = values ? [values] : [];
  return values.map((value) => normalize(value)).filter(Boolean);
}

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/&/g, " and ")
    .replace(/'/g, "")
    .replace(/[^a-z0-9%\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
