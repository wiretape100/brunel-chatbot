import { planAllowsBackendDetails } from "./question-planner.js";

const GENERIC_UNVERIFIED_ANSWER = "I could not verify that answer against the checked Brunel Centre article and linked data. I could not find the requested value in the article or linked data.";

export function verifyAnswer({ answer, plan, sources = [], datasetSources = [] }) {
  const text = String(answer || "").trim();
  const clean = normalize(text);
  const issues = [];
  const aggregateBreakdown = assessAggregatePlusBreakdownAnswer(text, plan);

  if (!text) {
    issues.push("emptyAnswer");
  }

  if (!planAllowsBackendDetails(plan) && exposesBackendDetails(clean)) {
    issues.push("backendDetailsExposed");
  }

  if (!usesOnlyVisibleSourceRecords(text, sources, datasetSources)) {
    issues.push("unsupportedRawSourceReference");
  }

  if (aggregateBreakdown) {
    if (!aggregateBreakdown.aggregate.verified && !aggregateBreakdown.breakdown.verified) {
      issues.push("aggregatePlusBreakdownNoVerifiedParts");
    } else if (!aggregateBreakdown.aggregate.verified && !aggregateBreakdown.aggregate.missingExplained) {
      issues.push("aggregateMissingNotExplained");
    } else if (!aggregateBreakdown.breakdown.verified && !aggregateBreakdown.breakdown.missingExplained) {
      issues.push("breakdownMissingNotExplained");
    }
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
    parts: aggregateBreakdown || undefined,
    repairedAnswer: issues.length ? repairAnswer({ plan, answer: text, aggregateBreakdown }) : text
  };
}

export function repairAnswer({ plan, answer = "", aggregateBreakdown = null }) {
  if (plan?.intent === "aggregatePlusBreakdown") {
    return repairAggregatePlusBreakdownAnswer(answer, aggregateBreakdown);
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

function assessAggregatePlusBreakdownAnswer(answer, plan) {
  if (plan?.intent !== "aggregatePlusBreakdown") return null;

  const body = stripSourceSection(answer);
  const aggregateVerified = hasAggregateValue(body, plan);
  const breakdownVerified = hasBreakdownValues(body, plan);

  return {
    aggregate: {
      requested: true,
      verified: aggregateVerified,
      value: aggregateVerified ? "present in answer" : "",
      source: "",
      missingExplained: hasMissingExplanation(body, "aggregate")
    },
    breakdown: {
      requested: true,
      verified: breakdownVerified,
      values: breakdownVerified ? ["present in answer"] : [],
      source: "",
      missingExplained: hasMissingExplanation(body, "breakdown")
    }
  };
}

function repairAggregatePlusBreakdownAnswer(answer, aggregateBreakdown) {
  const text = String(answer || "").trim();

  if (aggregateBreakdown?.aggregate.verified && !aggregateBreakdown.breakdown.verified) {
    const note = "I found the aggregate value, but I could not find the requested breakdown in the checked Brunel Centre source and linked data.";
    return appendMissingNote(text, note);
  }

  if (!aggregateBreakdown?.aggregate.verified && aggregateBreakdown?.breakdown.verified) {
    const note = "I found the requested breakdown, but I could not find the Greater West of England aggregate value in the checked Brunel Centre source and linked data.";
    return appendMissingNote(text, note);
  }

  return "The checked Brunel Centre source and linked data do not provide the requested aggregate value or breakdown values.";
}

function hasAggregateValue(answerBody, plan) {
  const text = normalizeAnswerText(answerBody);
  const aggregateLabels = aggregateLabelsForPlan(plan);
  const segments = splitAnswerSegments(text);

  return segments.some((segment) =>
    aggregateLabels.some((label) => segment.includes(label)) &&
    extractMeaningfulNumbers(segment).length > 0
  );
}

function hasBreakdownValues(answerBody, plan) {
  const text = normalizeAnswerText(answerBody);
  const breakdowns = normalizeList(plan?.breakdowns);
  const wantsLocalAuthorities = breakdowns.includes("local authorities") ||
    /\blocal authorit(?:y|ies)\b|\bby local authorit(?:y|ies)\b/.test(text);

  if (wantsLocalAuthorities) {
    const matchedAreas = localAuthorityLabels().filter((label) => {
      const segment = segmentAround(text, label);
      return segment.includes(label) && extractMeaningfulNumbers(segment).length > 0;
    });

    return matchedAreas.length >= 2;
  }

  const genericPatterns = [
    /\bage\s+\d{1,2}\b/,
    /\bmale\b/,
    /\bfemale\b/,
    /\bsector\b/,
    /\bindustry\b/,
    /\bfuel\b/,
    /\btenure\b/,
    /\bdistrict\b/,
    /\barea\b/
  ];

  const segmentsWithBreakdownValues = splitAnswerSegments(text).filter((segment) =>
    genericPatterns.some((pattern) => pattern.test(segment)) &&
    extractMeaningfulNumbers(segment).length > 0
  );

  return segmentsWithBreakdownValues.length >= 2 ||
    (/\bbreakdown\b|\bby\s+(age|sex|gender|sector|industry|fuel|tenure|area)\b/.test(text) && segmentsWithBreakdownValues.length >= 1);
}

function aggregateLabelsForPlan(plan) {
  const labels = ["overall", "aggregate", "regional aggregate", "region"];
  const geographies = normalizeList(plan?.geography);

  if (geographies.includes("greater west of england") || !geographies.length) {
    labels.push("greater west of england", "gwe", "greater west");
  } else {
    labels.push(...geographies);
  }

  return [...new Set(labels)];
}

function localAuthorityLabels() {
  return [
    "bath and north east somerset",
    "bristol city of",
    "bristol",
    "gloucestershire",
    "north somerset",
    "south gloucestershire",
    "swindon",
    "wiltshire"
  ];
}

function hasMissingExplanation(answerBody, part) {
  const text = normalizeAnswerText(answerBody);
  const missing = /\b(could not find|not found|not available|did not find|does not provide|do not provide|missing|could not verify)\b/.test(text);
  if (!missing) return false;

  if (part === "aggregate") {
    return /\b(aggregate|greater west of england|gwe|overall|regional)\b/.test(text);
  }

  return /\b(breakdown|local authorit(?:y|ies)|by age|by sex|by gender|sector|industry|fuel|tenure)\b/.test(text);
}

function stripSourceSection(answer) {
  return String(answer || "")
    .replace(/\bsource\s*:[\s\S]*$/i, "")
    .trim();
}

function splitAnswerSegments(text) {
  return String(text || "")
    .split(/\n+|(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function segmentAround(text, label) {
  const index = text.indexOf(label);
  if (index < 0) return "";
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + label.length + 120);
  return text.slice(start, end);
}

function extractMeaningfulNumbers(text) {
  return [...String(text || "").matchAll(/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?%?|\b\d+(?:\.\d+)?%?/g)]
    .map((match) => match[0])
    .filter((value) => !isStandaloneYear(value));
}

function isStandaloneYear(value) {
  const clean = String(value || "").replace(/,/g, "");
  return /^(19|20)\d{2}$/.test(clean);
}

function appendMissingNote(answer, note) {
  if (!answer) return note;
  if (normalizeAnswerText(answer).includes(normalizeAnswerText(note))) return answer;
  return `${answer}\n\n${note}`;
}

function normalizeAnswerText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/&/g, " and ")
    .replace(/'/g, "")
    .replace(/[^a-z0-9%.,\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
