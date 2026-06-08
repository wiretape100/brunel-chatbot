import { detectAggregateBreakdownIntent } from "./aggregate-breakdown.js";

const RATE_CALCULATIONS = [
  {
    id: "neet_or_activity_not_known_rate",
    label: "NEET or activity not known rate",
    trigger: /neet\s*\/\s*activity|neet\s+and\s+activity\s+not\s+known|neet\s+or\s+activity\s+not\s+known/i,
    numeratorMeasure: "Number NEET/activity not known",
    denominatorMeasure: "Cohort number",
    rateMeasure: "NEET/not known proportion"
  },
  {
    id: "neet_rate",
    label: "NEET rate",
    trigger: /\bneet\b/i,
    exclude: /activity\s+not\s+known|not\s+known\s+rate|neet\s*\/\s*activity/i,
    numeratorMeasure: "Number NEET",
    denominatorMeasure: "Cohort number",
    rateMeasure: "NEET proportion"
  },
  {
    id: "activity_not_known_rate",
    label: "activity not known rate",
    trigger: /activity\s+not\s+known|not\s+known\s+rate/i,
    numeratorMeasure: "Number activity not known",
    denominatorMeasure: "Cohort number",
    rateMeasure: "Activity not known proportion"
  }
];

const RATE_LOOKUP_WORDS = ["rate", "rates", "percentage", "percentages", "percent", "percents", "proportion", "proportions"];
const COMBINED_RATE_WORDS = ["combined", "combine", "weighted", "aggregate", "aggregated", "together"];
const AVERAGE_WORDS = ["average", "averages", "mean"];
const SIMPLE_AVERAGE_WORDS = ["simple", "arithmetic", "unweighted"];
const DETAIL_WORDS = ["count", "counts", "cohort", "numerator", "denominator", "method", "detail", "details"];
const COUNT_DETAIL_WORDS = [
  "count",
  "counts",
  "number",
  "numbers",
  "how many",
  "total",
  "total number",
  "numerator",
  "denominator",
  "base",
  "sample size",
  "people employed",
  "employed people",
  "employment count",
  "count of employment",
  "counts of employment",
  "workforce count"
];
const CALCULATION_WORDS = ["calculate", "calculation", "compute", "computed"];
const EMPLOYMENT_RATE_POST_SLUG = "employment-rates-in-the-greater-west-of-england-compared-to-other-uk-regions";
const EMPLOYMENT_RATE_POST_TITLE = "Employment rates in the Greater West of England compared to other UK regions";
const EMPLOYMENT_RATE_POST_URL = "https://www.thebrunelcentre.co.uk/data-hub/employment-rates-in-the-greater-west-of-england-compared-to-other-uk-regions";
const EMPLOYMENT_RATE_WORKBOOK_HINT = "local authority";
const EMPLOYMENT_RATE_LABEL = "Employment rate - aged 16-64 percent";
const GREATER_WEST_OF_ENGLAND = "Greater West of England";
const GREATER_WEST_LOCAL_AUTHORITIES = [
  "Bath and North East Somerset",
  "Bristol, City of",
  "Gloucestershire",
  "North Somerset",
  "South Gloucestershire",
  "Swindon",
  "Wiltshire"
];
const PROJECT_GEOGRAPHY_ALIASES = {
  "Bath and North East Somerset": ["bath", "banes", "b nes", "b and nes", "bath north east somerset"],
  "Bristol, City of": ["bristol", "city of bristol"],
  Gloucestershire: ["glos"],
  "South Gloucestershire": ["south glos"],
  "North Somerset": ["north somerset"],
  Swindon: ["swindon"],
  Wiltshire: ["wiltshire"],
  "Greater West of England": ["gwe", "greater west"]
};

function createArticleFirstSourceScope(evidenceContext) {
  const selectedSources = evidenceContext?.selectedSources || evidenceContext?.matches || [];
  const postUrls = new Set();
  const postUrlValues = new Set();
  const titles = new Set();

  for (const source of selectedSources || []) {
    const url = source?.url || source?.post_url;
    const title = source?.title || source?.post_title;
    if (url) {
      postUrls.add(normalizeUrl(url));
      postUrlValues.add(String(url).trim().replace(/\/+$/, ""));
    }
    if (title) titles.add(normalizeForMatch(title));
  }

  return {
    articleTextChecked: Boolean(evidenceContext?.articleTextChecked),
    hasSelectedSource: postUrls.size > 0 || titles.size > 0,
    postUrls,
    postUrlValues,
    titles
  };
}

function sourceScopeAllows(sourceScope, expectedUrl, expectedTitle) {
  if (!sourceScope?.articleTextChecked || !sourceScope?.hasSelectedSource) return false;
  if (expectedUrl && sourceScope.postUrls.has(normalizeUrl(expectedUrl))) return true;
  if (expectedTitle && sourceScope.titles.has(normalizeForMatch(expectedTitle))) return true;
  return false;
}

export async function buildStatisticalAnswer({ supabase, message, contextMessage = message, evidenceContext = null }) {
  const sourceScope = createArticleFirstSourceScope(evidenceContext);
  if (!sourceScope.articleTextChecked || !sourceScope.hasSelectedSource) return null;

  const lookupMessage = contextMessage || message;
  const employmentCountAnswer = await buildEmploymentCountAnswer({ supabase, message, contextMessage: lookupMessage, sourceScope });
  if (employmentCountAnswer) return employmentCountAnswer;

  const employmentOverallRateAnswer = await buildEmploymentOverallRateAnswer({ supabase, message, contextMessage: lookupMessage, sourceScope });
  if (employmentOverallRateAnswer) return employmentOverallRateAnswer;

  const employmentRateAnswer = await buildEmploymentRateAnswer({ supabase, message, contextMessage: lookupMessage, sourceScope });
  if (employmentRateAnswer) return employmentRateAnswer;

  const separateNeetActivityAnswer = await buildSeparateNeetActivityAnswer({ supabase, message, contextMessage: lookupMessage, sourceScope });
  if (separateNeetActivityAnswer) return separateNeetActivityAnswer;

  const calculation = chooseRateCalculation(lookupMessage);
  if (!calculation) return null;
  const wantsBackendAnswer =
    hasRateLookupIntent(lookupMessage) ||
    hasCombinedRateIntent(lookupMessage) ||
    hasAverageIntent(lookupMessage) ||
    hasSimpleAverageIntent(lookupMessage) ||
    hasFuzzyKeyword(lookupMessage, DETAIL_WORDS) ||
    hasFuzzyKeyword(lookupMessage, CALCULATION_WORDS);

  if (!wantsBackendAnswer) return null;

  try {
    const requestedYear = extractYear(message) || extractYear(lookupMessage);
    const directGeographies = await matchRequestedGeographies(supabase, message);
    const geographies = directGeographies.length
      ? directGeographies
      : await matchRequestedGeographies(supabase, lookupMessage);
    const wantsAverage = hasAverageIntent(lookupMessage);
    const wantsSimpleAverage = hasSimpleAverageIntent(lookupMessage);
    const wantsCombinedRate = hasCombinedRateIntent(lookupMessage) || (wantsAverage && geographies.length > 1 && !wantsSimpleAverage);

    if (!geographies.length) {
      return null;
    }

    if (geographies.length < 2 && wantsCombinedRate) {
      return {
        answer: [
          `I cannot calculate a combined ${calculation.label} from that question yet because the areas to combine are not included in the message.`,
          "",
          `Please include the area names in the same question, for example: "Calculate the population-weighted ${calculation.label} for Bristol and Gloucestershire."`,
          "",
          "I will not average percentages or infer missing geographies."
        ].join("\n"),
        sources: []
      };
    }

    const facts = await fetchCalculationFacts({
      supabase,
      geographies,
      requestedYear,
      calculation,
      sourceScope
    });

    const group = chooseBestFactGroup(facts, geographies, requestedYear, lookupMessage, calculation);

    if (!group) {
      return {
        answer: [
          `I cannot calculate the ${calculation.label} from the loaded Brunel Centre datasets because I could not find both required values for every requested area.`,
          "",
          `Required values: ${calculation.numeratorMeasure} and ${calculation.denominatorMeasure}.`,
          `Requested areas: ${geographies.join(", ")}.`,
          requestedYear ? `Requested year: ${requestedYear}.` : "No year was specified, so I looked for a complete latest-year match.",
          "",
          "I will not average percentages or estimate missing counts."
        ].join("\n"),
        sources: []
      };
    }

    if ((wantsCombinedRate || wantsSimpleAverage) && !groupHasCounts(group, geographies, calculation)) {
      return renderCountsMissingAnswer({ calculation, group, geographies, requestedYear, message: lookupMessage });
    }

    if (wantsSimpleAverage) {
      return renderSimpleAverageRejectedAnswer({ calculation, group, geographies, requestedYear, message: lookupMessage });
    }

    if (wantsCombinedRate) {
      return renderCombinedRateAnswer({ calculation, group, geographies, requestedYear, message: lookupMessage });
    }

    return renderIndividualRateAnswer({ calculation, group, geographies, requestedYear, message: lookupMessage });
  } catch (error) {
    if (process.env.DEBUG_BRUNEL_STATS) console.error(error);
    return null;
  }
}

async function buildEmploymentRateAnswer({ supabase, message, contextMessage = message, sourceScope }) {
  const lookupMessage = contextMessage || message;
  if (!isEmploymentRateQuestion(lookupMessage)) return null;
  if (!sourceScopeAllows(sourceScope, EMPLOYMENT_RATE_POST_URL, EMPLOYMENT_RATE_POST_TITLE)) return null;

  try {
    const rows = await fetchEmploymentRateRows(supabase);
    if (!rows.length) return null;

    const directGeographies = matchRequestedEmploymentGeographies(rows, message, { preferAggregate: true });
    const geographies = directGeographies.length
      ? directGeographies
      : matchRequestedEmploymentGeographies(rows, lookupMessage, { preferAggregate: true });

    if (!geographies.length) return null;

    const values = geographies
      .map((geography) => {
        const row = rows.find((item) => employmentGeographyMatches(item.geography, geography));
        return row ? { ...row, geography } : null;
      })
      .filter(Boolean);

    if (!values.length) return null;

    return renderEmploymentRateAnswer(values);
  } catch (error) {
    if (process.env.DEBUG_BRUNEL_STATS) console.error(error);
    return null;
  }
}

async function buildEmploymentCountAnswer({ supabase, message, contextMessage = message, sourceScope }) {
  const lookupMessage = contextMessage || message;
  if (!isEmploymentCountQuestion(message, lookupMessage)) return null;
  if (!sourceScopeAllows(sourceScope, EMPLOYMENT_RATE_POST_URL, EMPLOYMENT_RATE_POST_TITLE)) return null;

  try {
    await fetchEmploymentArticleCountEvidence(supabase);

    const rows = await fetchEmploymentDatasetRows(supabase);
    const rateRows = parseEmploymentRateRows(rows);
    const directGeographies = matchRequestedEmploymentGeographies(rateRows, message);
    const geographies = directGeographies.length
      ? directGeographies
      : matchRequestedEmploymentGeographies(rateRows, lookupMessage);
    const targetGeographies = geographies.length ? geographies : inferEmploymentCountGeographies(message, lookupMessage, rateRows);
    const countKind = detectEmploymentCountKind(message);

    const analysisCounts = extractEmploymentCountsFromAnalysisRows({
      rows,
      geographies: targetGeographies,
      countKind
    });

    if (analysisCounts.length) {
      return renderEmploymentCountAnswer({
        counts: analysisCounts,
        countKind,
        checkedRawFacts: false
      });
    }

    const rawFacts = await fetchEmploymentRawFacts(supabase);
    const rawCounts = extractEmploymentCountsFromRawFacts({
      facts: rawFacts,
      geographies: targetGeographies,
      countKind
    });

    if (rawCounts.length) {
      return renderEmploymentCountAnswer({
        counts: rawCounts,
        countKind,
        checkedRawFacts: true
      });
    }

    return renderEmploymentCountsNotFoundAnswer({
      geographies: targetGeographies,
      message,
      contextMessage: lookupMessage
    });
  } catch {
    return null;
  }
}

async function buildEmploymentOverallRateAnswer({ supabase, message, contextMessage = message, sourceScope }) {
  const lookupMessage = contextMessage || message;
  if (!isEmploymentOverallRateCalculation(message, lookupMessage)) return null;
  if (!sourceScopeAllows(sourceScope, EMPLOYMENT_RATE_POST_URL, EMPLOYMENT_RATE_POST_TITLE)) return null;

  try {
    await fetchEmploymentArticleCountEvidence(supabase);

    const rows = await fetchEmploymentDatasetRows(supabase);
    const rateRows = parseEmploymentRateRows(rows);
    const directGeographies = matchRequestedEmploymentGeographies(rateRows, message);
    const geographies = directGeographies.length
      ? directGeographies
      : matchRequestedEmploymentGeographies(rateRows, lookupMessage);
    const targetGeographies = geographies.length ? geographies : inferEmploymentCountGeographies(message, lookupMessage, rateRows);

    if (!targetGeographies.length) return null;

    const analysisNumerators = extractEmploymentCountsFromAnalysisRows({ rows, geographies: targetGeographies, countKind: "employment" });
    const analysisDenominators = extractEmploymentCountsFromAnalysisRows({ rows, geographies: targetGeographies, countKind: "denominator" });
    if (hasCompleteEmploymentCalculationInputs(targetGeographies, analysisNumerators, analysisDenominators)) {
      return renderEmploymentOverallRateAnswer({
        geographies: targetGeographies,
        numerators: analysisNumerators,
        denominators: analysisDenominators,
        checkedRawFacts: false
      });
    }

    const rawFacts = await fetchEmploymentRawFacts(supabase);
    const rawNumerators = extractEmploymentCountsFromRawFacts({ facts: rawFacts, geographies: targetGeographies, countKind: "employment" });
    const rawDenominators = extractEmploymentCountsFromRawFacts({ facts: rawFacts, geographies: targetGeographies, countKind: "denominator" });
    if (hasCompleteEmploymentCalculationInputs(targetGeographies, rawNumerators, rawDenominators)) {
      return renderEmploymentOverallRateAnswer({
        geographies: targetGeographies,
        numerators: rawNumerators,
        denominators: rawDenominators,
        checkedRawFacts: true
      });
    }

    return renderEmploymentOverallRateNotCalculableAnswer(targetGeographies);
  } catch {
    return null;
  }
}

function isEmploymentRateQuestion(message) {
  const normalized = normalizeForMatch(message);
  return hasFuzzyKeyword(message, ["employment", "employement"]) &&
    hasRateLookupIntent(message) &&
    !normalized.includes("neet");
}

function isEmploymentCountQuestion(message, lookupMessage) {
  const messageAsksNeet = hasFuzzyKeyword(message, ["neet", "neets"]);
  return hasCountDetailIntent(message) &&
    hasFuzzyKeyword(lookupMessage, ["employment", "employement", "employed", "workforce"]) &&
    !messageAsksNeet;
}

function isEmploymentOverallRateCalculation(message, lookupMessage) {
  const normalizedMessage = normalizeForMatch(message);
  const normalizedLookup = normalizeForMatch(lookupMessage);
  const wantsCalculation =
    hasFuzzyKeyword(message, CALCULATION_WORDS) ||
    hasCombinedRateIntent(message) ||
    hasAverageIntent(message) ||
    /\boverall\b/.test(normalizedMessage);

  return wantsCalculation &&
    hasFuzzyKeyword(lookupMessage, ["employment", "employement", "employed", "workforce"]) &&
    hasRateLookupIntent(lookupMessage) &&
    !normalizedLookup.includes("neet");
}

async function fetchEmploymentRateRows(supabase) {
  const data = await fetchEmploymentDatasetRows(supabase);
  return parseEmploymentRateRows(data);
}

async function fetchEmploymentDatasetRows(supabase) {
  const { data, error } = await supabase
    .from("brunel_dataset_rows")
    .select("post_title,post_url,workbook_name,row_data")
    .eq("post_slug", EMPLOYMENT_RATE_POST_SLUG)
    .limit(1000);

  if (error || !data?.length) return [];
  return data || [];
}

function parseEmploymentRateRows(rows) {
  return (rows || [])
    .filter((row) => normalizeForMatch(row.workbook_name).includes(EMPLOYMENT_RATE_WORKBOOK_HINT))
    .map((row) => {
      const rowData = row.row_data || {};
      const geography = getRowValueByAnyKey(rowData, ["area", "geography", "local authority"]);
      const rate = getRowValueByAllTerms(rowData, ["employment rate", "percent"]);

      return {
        post_title: row.post_title,
        post_url: row.post_url,
        workbook_name: row.workbook_name,
        geography: typeof geography === "string" ? geography : null,
        rate: toFiniteNumber(rate)
      };
    })
    .filter((row) => row.geography && Number.isFinite(row.rate));
}

async function fetchEmploymentArticleCountEvidence(supabase) {
  const { data } = await supabase
    .from("brunel_documents")
    .select("title,url,content")
    .eq("url", EMPLOYMENT_RATE_POST_URL)
    .limit(20);

  return data || [];
}

async function fetchEmploymentRawFacts(supabase) {
  const { data, error } = await supabase
    .from("brunel_dataset_facts")
    .select([
      "post_title",
      "post_url",
      "workbook_name",
      "sheet_name",
      "geography",
      "year",
      "measure",
      "value",
      "value_text",
      "unit",
      "dimensions",
      "metadata"
    ].join(","))
    .eq("post_slug", EMPLOYMENT_RATE_POST_SLUG)
    .limit(4000);

  if (error || !data?.length) return [];
  return data || [];
}

function inferEmploymentCountGeographies(message, lookupMessage, rateRows) {
  const normalized = normalizeForMatch(`${message} ${lookupMessage}`);
  if (isGreaterWestOfEnglandRequest(normalized) || /\blocal\s+authorit/.test(normalized)) {
    const available = new Set((rateRows || []).map((row) => row.geography));
    return GREATER_WEST_LOCAL_AUTHORITIES.filter((geography) => available.has(geography));
  }

  return [];
}

function detectEmploymentCountKind(message) {
  const normalized = normalizeForMatch(message);
  if (/\b(denominator|base|sample\s+size|sample| n )\b/.test(` ${normalized} `)) return "denominator";
  if (/\b(numerator|people\s+employed|employed\s+people|employment\s+count|count\s+of\s+employment|counts\s+of\s+employment|how\s+many|number|numbers|count|counts|total)\b/.test(normalized)) return "employment";
  return "employment";
}

function extractEmploymentCountsFromAnalysisRows({ rows, geographies, countKind }) {
  const candidates = [];

  for (const row of rows || []) {
    const rowData = row.row_data || {};
    const geography = getRowValueByAnyKey(rowData, ["area", "geography", "local authority"]);
    if (!geography || !employmentCountGeographyAllowed(geography, geographies)) continue;

    const count = getEmploymentCountValueFromRow(rowData, countKind);
    if (!count) continue;

    candidates.push({
      geography,
      value: count.value,
      measure: count.measure,
      year: extractYearFromRow(rowData) || null,
      post_title: row.post_title || EMPLOYMENT_RATE_POST_TITLE,
      post_url: row.post_url || EMPLOYMENT_RATE_POST_URL,
      workbook_name: row.workbook_name
    });
  }

  return chooseEmploymentCountRows(candidates, geographies);
}

function extractEmploymentCountsFromRawFacts({ facts, geographies, countKind }) {
  const candidates = [];

  for (const fact of facts || []) {
    if (!fact.geography || !employmentCountGeographyAllowed(fact.geography, geographies)) continue;
    if (!employmentFactMeasureMatches(fact.measure, countKind)) continue;

    const value = toFiniteNumber(fact.value);
    if (!Number.isFinite(value)) continue;

    candidates.push({
      geography: fact.geography,
      value,
      measure: fact.measure,
      year: fact.year || null,
      post_title: fact.post_title || EMPLOYMENT_RATE_POST_TITLE,
      post_url: fact.post_url || EMPLOYMENT_RATE_POST_URL,
      workbook_name: fact.workbook_name,
      sheet_name: fact.sheet_name
    });
  }

  return chooseEmploymentCountRows(candidates, geographies);
}

function employmentCountGeographyAllowed(geography, requestedGeographies) {
  if (!requestedGeographies?.length) return true;
  return requestedGeographies.some((requestedGeography) => employmentGeographyMatches(geography, requestedGeography));
}

function getEmploymentCountValueFromRow(rowData, countKind) {
  const entries = Object.entries(rowData || {});
  const matches = entries
    .map(([key, value]) => ({ key, value: toFiniteNumber(value) }))
    .filter((item) => Number.isFinite(item.value) && employmentCountKeyMatches(item.key, countKind))
    .sort((a, b) => scoreEmploymentCountLabel(b.key, countKind) - scoreEmploymentCountLabel(a.key, countKind));

  if (!matches.length) return null;
  return {
    measure: matches[0].key,
    value: matches[0].value
  };
}

function employmentCountKeyMatches(key, countKind) {
  const normalized = normalizeForMatch(key);
  if (!normalized || /\b(rate|percent|percentage|proportion)\b/.test(normalized)) return false;

  if (countKind === "denominator") {
    return /\b(denominator|base|sample|population|aged\s+16\s+64|working\s+age)\b/.test(normalized);
  }

  return /\b(employment|employed|workforce)\b/.test(normalized) &&
    /\b(number|count|total|people|persons|employees|employed)\b/.test(normalized);
}

function employmentFactMeasureMatches(measure, countKind) {
  const normalized = normalizeForMatch(measure);
  if (!normalized || /\b(rate|percent|percentage|proportion)\b/.test(normalized)) return false;

  if (countKind === "denominator") {
    return /\b(denominator|base|sample|population|aged\s+16\s+64|working\s+age)\b/.test(normalized);
  }

  return /\b(employment|employed|workforce)\b/.test(normalized) &&
    /\b(number|count|total|people|persons|employees|employed)\b/.test(normalized);
}

function scoreEmploymentCountLabel(label, countKind) {
  const normalized = normalizeForMatch(label);
  let score = 0;

  if (countKind === "denominator" && /\b(denominator|base|population)\b/.test(normalized)) score += 20;
  if (countKind === "employment" && /\b(employment|employed)\b/.test(normalized)) score += 20;
  if (/\b(number|count|total)\b/.test(normalized)) score += 5;
  if (/\b(rate|percent|percentage|proportion)\b/.test(normalized)) score -= 100;

  return score;
}

function chooseEmploymentCountRows(candidates, requestedGeographies) {
  if (!candidates.length) return [];
  const latestYear = Math.max(...candidates.map((item) => item.year || 0));
  const filtered = latestYear > 0
    ? candidates.filter((item) => item.year === latestYear || !item.year)
    : candidates;
  const byGeography = new Map();

  for (const item of filtered) {
    const key = normaliseEmploymentGeographyKey(item.geography);
    const existing = byGeography.get(key);
    if (!existing || scoreEmploymentCountLabel(item.measure, "employment") > scoreEmploymentCountLabel(existing.measure, "employment")) {
      byGeography.set(key, item);
    }
  }

  if (requestedGeographies?.length) {
    return requestedGeographies
      .map((geography) => [...byGeography.values()].find((item) => employmentGeographyMatches(item.geography, geography)))
      .filter(Boolean);
  }

  return [...byGeography.values()].slice(0, 12);
}

function normaliseEmploymentGeographyKey(geography) {
  return createGeographyAliases(geography)[0] || normalizeForMatch(geography);
}

function extractYearFromRow(rowData) {
  for (const [key, value] of Object.entries(rowData || {})) {
    if (/\byear\b/i.test(key)) {
      const year = toFiniteNumber(value);
      if (Number.isInteger(year) && year >= 1900 && year <= 2100) return year;
    }
  }

  return null;
}

function renderEmploymentCountAnswer({ counts, countKind, checkedRawFacts }) {
  const source = counts[0];
  const year = source.year;
  const yearLine = year
    ? `Using the latest complete year available in the checked Brunel Centre source (${year}):`
    : "Using the linked Brunel Centre dataset for the employment-rate source:";
  const label = countKind === "denominator"
    ? "denominator/base count"
    : "employment count";
  const lines = counts.map((count) => `- ${count.geography}: **${formatNumber(count.value)}** (${count.measure}).`);

  return {
    answer: [
      yearLine,
      "",
      ...lines,
      "",
      checkedRawFacts
        ? `I checked the article and linked dataset for ${EMPLOYMENT_RATE_POST_TITLE}.`
        : `I checked the article and linked dataset for ${EMPLOYMENT_RATE_POST_TITLE}.`,
      `These are ${label} values, not employment rates.`,
      `Source: ${source.post_title || EMPLOYMENT_RATE_POST_TITLE}.`
    ].join("\n"),
    sources: [
      {
        title: source.post_title || EMPLOYMENT_RATE_POST_TITLE,
        url: source.post_url || EMPLOYMENT_RATE_POST_URL,
        similarity: null
      }
    ]
  };
}

function renderEmploymentCountsNotFoundAnswer({ geographies, message, contextMessage }) {
  const requestedGreaterWest = isGreaterWestOfEnglandRequest(normalizeForMatch(`${message} ${contextMessage}`));
  const geographyText = requestedGreaterWest
    ? ` for ${GREATER_WEST_OF_ENGLAND}`
    : geographies?.length
    ? ` for ${geographies.join(", ")}`
    : "";

  return {
    answer: [
      `I found the employment rate${geographyText} in the Brunel Centre source, but I could not find a matching employment count in the article or linked data for that source.`,
      "",
      "The available figure I found is the employment rate, not an employment count.",
      `Source checked: ${EMPLOYMENT_RATE_POST_TITLE}.`
    ].join("\n"),
    sources: [
      {
        title: EMPLOYMENT_RATE_POST_TITLE,
        url: EMPLOYMENT_RATE_POST_URL,
        similarity: null
      }
    ]
  };
}

function hasCompleteEmploymentCalculationInputs(geographies, numerators, denominators) {
  return geographies.every((geography) => {
    const numerator = findEmploymentCountForGeography(numerators, geography);
    const denominator = findEmploymentCountForGeography(denominators, geography);
    return Number.isFinite(numerator?.value) && Number.isFinite(denominator?.value) && denominator.value > 0;
  });
}

function renderEmploymentOverallRateAnswer({ geographies, numerators, denominators, checkedRawFacts }) {
  let numeratorTotal = 0;
  let denominatorTotal = 0;
  const lines = [];

  for (const geography of geographies) {
    const numerator = findEmploymentCountForGeography(numerators, geography);
    const denominator = findEmploymentCountForGeography(denominators, geography);
    numeratorTotal += numerator.value;
    denominatorTotal += denominator.value;
    lines.push(`${geography}: employment count = ${formatNumber(numerator.value)}; denominator/base count = ${formatNumber(denominator.value)}.`);
  }

  const rate = denominatorTotal > 0 ? (numeratorTotal / denominatorTotal) * 100 : null;
  const source = numerators[0] || denominators[0] || {};
  const calculationLine = `(${geographies.map((geography) => formatNumber(findEmploymentCountForGeography(numerators, geography).value)).join(" + ")}) / (${geographies.map((geography) => formatNumber(findEmploymentCountForGeography(denominators, geography).value)).join(" + ")}) * 100 = ${formatPercent(rate)}`;

  return {
    answer: [
      `The population-weighted overall employment rate is **${formatPercent(rate)}**.`,
      "",
      `I checked the article and linked dataset for ${EMPLOYMENT_RATE_POST_TITLE}.`,
      checkedRawFacts
        ? "The calculation uses the available employment counts and denominator/base counts from the linked dataset."
        : "The calculation uses the available employment counts and denominator/base counts from the linked dataset.",
      "",
      ...lines,
      "",
      "Method: combined rate = sum of employment counts divided by sum of denominator/base counts, multiplied by 100. I did not average the published percentages.",
      `Calculation: ${calculationLine}.`,
      "",
      `Source: ${source.post_title || EMPLOYMENT_RATE_POST_TITLE}.`
    ].join("\n"),
    sources: [
      {
        title: source.post_title || EMPLOYMENT_RATE_POST_TITLE,
        url: source.post_url || EMPLOYMENT_RATE_POST_URL,
        similarity: null
      }
    ]
  };
}

function renderEmploymentOverallRateNotCalculableAnswer(geographies) {
  const geographyText = geographies?.length
    ? ` for ${geographies.join(", ")}`
    : "";

  return {
    answer: [
      `I found employment rates${geographyText} in the Brunel Centre source, but I could not calculate an overall employment rate from the local authority data because I could not find both the employment counts and the matching denominator/base counts in the article or linked Data Hub dataset.`,
      "",
      "I will not average the published percentages or estimate missing counts.",
      `Source checked: ${EMPLOYMENT_RATE_POST_TITLE}.`
    ].join("\n"),
    sources: [
      {
        title: EMPLOYMENT_RATE_POST_TITLE,
        url: EMPLOYMENT_RATE_POST_URL,
        similarity: null
      }
    ]
  };
}

function findEmploymentCountForGeography(counts, geography) {
  return (counts || []).find((count) => employmentGeographyMatches(count.geography, geography));
}

function getRowValueByAnyKey(rowData, possibleTerms) {
  const entries = Object.entries(rowData);
  const match = entries.find(([key]) => {
    const normalizedKey = normalizeForMatch(key);
    return possibleTerms.some((term) => normalizedKey.includes(normalizeForMatch(term)));
  });

  return match ? match[1] : null;
}

function getRowValueByAllTerms(rowData, requiredTerms) {
  const entries = Object.entries(rowData);
  const match = entries.find(([key]) => {
    const normalizedKey = normalizeForMatch(key);
    return requiredTerms.every((term) => normalizedKey.includes(normalizeForMatch(term)));
  });

  return match ? match[1] : null;
}

function matchRequestedEmploymentGeographies(rows, message, options = {}) {
  const normalizedMessage = normalizeForMatch(message);
  const rowGeographies = [...new Set(rows.map((row) => row.geography).filter(Boolean))]
    .sort((a, b) => b.length - a.length);

  if (isGreaterWestOfEnglandRequest(normalizedMessage)) {
    const aggregate = rowGeographies.find((geography) => employmentGeographyMatches(geography, GREATER_WEST_OF_ENGLAND));
    const available = new Set(rowGeographies);
    const localAuthorities = GREATER_WEST_LOCAL_AUTHORITIES.filter((geography) => available.has(geography));

    if (detectAggregateBreakdownIntent(message).isAggregateBreakdown) {
      return aggregate ? [aggregate, ...localAuthorities] : localAuthorities;
    }

    if (options.preferAggregate && aggregate && !isLocalAuthorityBreakdownRequest(normalizedMessage)) {
      return [aggregate];
    }

    return localAuthorities;
  }

  const matches = [];
  for (const geography of rowGeographies) {
    if (geography === "England" && /\bwest\s+of\s+england\b/.test(normalizedMessage)) continue;

    const aliases = createGeographyAliases(geography);
    const matched = aliases.some((alias) => alias.length >= 3 && fuzzyPhraseInText(normalizedMessage, alias));
    if (!matched) continue;
    if (matches.includes(geography)) continue;
    matches.push(geography);
  }

  return matches;
}

function isLocalAuthorityBreakdownRequest(normalizedMessage) {
  return /\blocal\s+authorit/.test(normalizedMessage) ||
    /\bbreakdown\b/.test(normalizedMessage) ||
    /\ball\s+local\b/.test(normalizedMessage);
}

function employmentGeographyMatches(rowGeography, requestedGeography) {
  const rowAliases = createGeographyAliases(rowGeography);
  const requestedAliases = createGeographyAliases(requestedGeography);
  return rowAliases.some((rowAlias) => requestedAliases.includes(rowAlias));
}

function renderEmploymentRateAnswer(values) {
  const source = values[0];
  const lines = values.map((row) => `- ${row.geography}: **${formatPercent(row.rate, 1)}**.`);
  const isSingleAggregate = values.length === 1 && employmentGeographyMatches(source.geography, GREATER_WEST_OF_ENGLAND);
  const aggregate = values.find((row) => employmentGeographyMatches(row.geography, GREATER_WEST_OF_ENGLAND));
  const breakdown = values.filter((row) => !employmentGeographyMatches(row.geography, GREATER_WEST_OF_ENGLAND));

  if (isSingleAggregate) {
    return {
      answer: [
        `The employment rate for the Greater West of England for 2025 is **${formatPercent(source.rate, 1)}**.`,
        "",
        "This is the employment rate for people aged 16-64.",
        `Source: ${source.post_title}.`
      ].join("\n"),
      sources: [
        {
          title: source.post_title,
          url: source.post_url,
          similarity: null
        }
      ]
    };
  }

  if (aggregate && breakdown.length) {
    return {
      answer: [
        `Using the latest available Brunel Centre source, the employment rate for the Greater West of England for 2025 is **${formatPercent(aggregate.rate, 1)}**.`,
        "",
        "The employment rate for local authorities within the Greater West of England is:",
        "",
        ...breakdown.map((row) => `- ${row.geography}: **${formatPercent(row.rate, 1)}**.`),
        "",
        "This is the employment rate for people aged 16-64.",
        `Source: ${source.post_title}.`
      ].join("\n"),
      sources: [
        {
          title: source.post_title,
          url: source.post_url,
          similarity: null
        }
      ]
    };
  }

  return {
    answer: [
      "Using the latest complete year available in the Brunel Centre data (2025):",
      "",
      ...lines,
      "",
      "This is the employment rate for people aged 16-64.",
      `Source: ${source.post_title}.`
    ].join("\n"),
    sources: [
      {
        title: source.post_title,
        url: source.post_url,
        similarity: null
      }
    ]
  };
}

function chooseRateCalculation(message) {
  const hasNeet = hasFuzzyKeyword(message, ["neet", "neets"]);
  const hasActivityNotKnown = hasFuzzyPhrase(message, "activity not known");

  if (hasCombinedNeetNotKnownIntent(message)) {
    return RATE_CALCULATIONS.find((calculation) => calculation.id === "neet_or_activity_not_known_rate");
  }

  if (hasActivityNotKnown) {
    return RATE_CALCULATIONS.find((calculation) => calculation.id === "activity_not_known_rate");
  }

  if (hasNeet) {
    return RATE_CALCULATIONS.find((calculation) => calculation.id === "neet_rate");
  }

  for (const calculation of RATE_CALCULATIONS) {
    if (!calculation.trigger.test(message)) continue;
    if (calculation.exclude?.test(message)) continue;
    return calculation;
  }

  return null;
}

function hasCombinedNeetNotKnownIntent(message) {
  const normalized = normalizeForMatch(message);
  const hasNeet = hasFuzzyKeyword(message, ["neet", "neets"]);
  const hasActivityNotKnown = hasFuzzyPhrase(message, "activity not known");
  const hasCombinedLanguage =
    normalized.includes("neet or activity not known") ||
    normalized.includes("neet not known") ||
    normalized.includes("neet activity not known") ||
    normalized.includes("neet and activity not known combined") ||
    normalized.includes("combined neet and activity not known") ||
    normalized.includes("neet activity combined");

  if (hasCombinedLanguage) return true;
  return hasNeet && hasActivityNotKnown && hasCombinedRateIntent(message) && !wantsSeparateNeetAndActivityRates(message);
}

function wantsSeparateNeetAndActivityRates(message) {
  const normalized = normalizeForMatch(message);
  const hasNeet = hasFuzzyKeyword(message, ["neet", "neets"]);
  const hasActivityNotKnown = hasFuzzyPhrase(message, "activity not known");
  const hasRate = hasRateLookupIntent(message);
  const separateRateWords =
    normalized.includes("neet rate") ||
    normalized.includes("neet rates") ||
    normalized.includes("activity not known rate") ||
    normalized.includes("activity not know rate") ||
    normalized.includes("activity not known rates") ||
    normalized.includes("activity not know rates");

  return hasNeet && hasActivityNotKnown && hasRate && separateRateWords && !normalized.includes(" or ");
}

async function buildSeparateNeetActivityAnswer({ supabase, message, contextMessage = message, sourceScope }) {
  const lookupMessage = contextMessage || message;
  if (!wantsSeparateNeetAndActivityRates(lookupMessage)) return null;

  try {
    const requestedYear = extractYear(message) || extractYear(lookupMessage);
    const directGeographies = await matchRequestedGeographies(supabase, message);
    const geographies = directGeographies.length
      ? directGeographies
      : await matchRequestedGeographies(supabase, lookupMessage);
    if (!geographies.length) return null;

    const neetCalculation = RATE_CALCULATIONS.find((calculation) => calculation.id === "neet_rate");
    const activityCalculation = RATE_CALCULATIONS.find((calculation) => calculation.id === "activity_not_known_rate");
    const neetFacts = await fetchCalculationFacts({ supabase, geographies, requestedYear, calculation: neetCalculation, sourceScope });
    const activityFacts = await fetchCalculationFacts({ supabase, geographies, requestedYear, calculation: activityCalculation, sourceScope });
    const neetGroup = chooseBestFactGroup(neetFacts, geographies, requestedYear, lookupMessage, neetCalculation);
    const activityGroup = chooseBestFactGroup(activityFacts, geographies, requestedYear, lookupMessage, activityCalculation);

    if (!neetGroup || !activityGroup) return null;

    return renderSeparateNeetActivityAnswer({
      geographies,
      requestedYear,
      neetCalculation,
      activityCalculation,
      neetGroup,
      activityGroup
    });
  } catch {
    return null;
  }
}

function extractYear(message) {
  const match = String(message).match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

async function matchRequestedGeographies(supabase, message) {
  const { data, error } = await supabase
    .from("brunel_dataset_facts")
    .select("geography")
    .not("geography", "is", null)
    .limit(2000);

  if (error || !data?.length) return [];

  const normalizedMessage = normalizeForMatch(message);
  const geographies = [...new Set(data.map((row) => row.geography).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  const matches = [];
  const greaterWestRequested = isGreaterWestOfEnglandRequest(normalizedMessage);

  if (greaterWestRequested) {
    const available = new Set(geographies);
    return GREATER_WEST_LOCAL_AUTHORITIES.filter((geography) => available.has(geography));
  }

  for (const geography of geographies) {
    if (geography === "England" && /\bwest\s+of\s+england\b/.test(normalizedMessage)) continue;

    const aliases = createGeographyAliases(geography);
    const matched = aliases.some((alias) => alias.length >= 3 && fuzzyPhraseInText(normalizedMessage, alias));
    if (!matched) continue;

    if (matches.some((existing) => existing === geography)) continue;
    matches.push(geography);
  }

  return matches;
}

function createGeographyAliases(geography) {
  const normalized = normalizeForMatch(geography);
  const beforeComma = normalizeForMatch(String(geography).split(",")[0]);
  const withoutCityOf = beforeComma.replace(/\bcity\s+of\b/g, "").replace(/\s+/g, " ").trim();
  const projectAliases = PROJECT_GEOGRAPHY_ALIASES[geography] || [];

  return [...new Set([normalized, beforeComma, withoutCityOf, ...projectAliases.map(normalizeForMatch)].filter(Boolean))];
}

function isGreaterWestOfEnglandRequest(normalizedMessage) {
  return /\bgreater\s+west\s+of\s+england\b/.test(normalizedMessage) ||
    /\bgwe\b/.test(normalizedMessage);
}

function hasRateLookupIntent(message) {
  return hasFuzzyKeyword(message, RATE_LOOKUP_WORDS);
}

function hasCountDetailIntent(message) {
  const normalized = normalizeForMatch(message);
  return COUNT_DETAIL_WORDS.some((term) => {
    const normalizedTerm = normalizeForMatch(term);
    if (!normalizedTerm) return false;
    if (normalizedTerm.includes(" ")) return normalized.includes(normalizedTerm);
    return tokenizeForMatch(normalized).some((token) => wordsAreClose(token, normalizedTerm));
  });
}

function hasCombinedRateIntent(message) {
  const normalized = normalizeForMatch(message);
  return COMBINED_RATE_WORDS.some((word) => normalized.split(" ").includes(word)) ||
    normalized.includes("population weighted");
}

function hasAverageIntent(message) {
  return hasExactKeyword(message, AVERAGE_WORDS);
}

function hasSimpleAverageIntent(message) {
  return hasAverageIntent(message) && hasExactKeyword(message, SIMPLE_AVERAGE_WORDS);
}

async function fetchCalculationFacts({ supabase, geographies, requestedYear, calculation, sourceScope }) {
  if (!sourceScope?.postUrlValues?.size) return [];

  let query = supabase
    .from("brunel_dataset_facts")
    .select([
      "post_title",
      "post_url",
      "workbook_path",
      "workbook_name",
      "sheet_name",
      "geography",
      "year",
      "measure",
      "value",
      "value_text",
      "unit",
      "dimensions",
      "metadata",
      "source_row",
      "source_column"
    ].join(","))
    .in("geography", geographies)
    .in("measure", [calculation.numeratorMeasure, calculation.denominatorMeasure, calculation.rateMeasure])
    .limit(2000);

  if (sourceScope?.postUrlValues?.size) {
    query = query.in("post_url", [...sourceScope.postUrlValues]);
  }

  if (requestedYear) {
    query = query.eq("year", requestedYear);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function chooseBestFactGroup(facts, geographies, requestedYear, message, calculation) {
  const groups = new Map();

  for (const fact of facts) {
    const factValue = toFiniteNumber(fact.value);
    if (!Number.isFinite(factValue)) continue;
    const normalizedFact = { ...fact, value: factValue };

    const key = [normalizedFact.workbook_path, normalizedFact.sheet_name, normalizedFact.year].join("||");
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        workbook_path: normalizedFact.workbook_path,
        workbook_name: normalizedFact.workbook_name,
        sheet_name: normalizedFact.sheet_name,
        year: normalizedFact.year,
        post_title: normalizedFact.post_title,
        post_url: normalizedFact.post_url,
        metadata: normalizedFact.metadata || {},
        byGeography: new Map()
      });
    }

    const group = groups.get(key);
    if (!group.byGeography.has(normalizedFact.geography)) {
      group.byGeography.set(normalizedFact.geography, {});
    }

    group.byGeography.get(normalizedFact.geography)[normalizedFact.measure] = normalizedFact;
  }

  const validGroups = [...groups.values()]
    .map((group) => ({
      ...group,
      rows: geographies.map((geography) => group.byGeography.get(geography)).filter(Boolean)
    }))
    .filter((group) => {
      if (requestedYear && group.year !== requestedYear) return false;

      return geographies.every((geography) => {
        const row = group.byGeography.get(geography);
        if (!row) return false;

        const numerator = row[calculation.numeratorMeasure]?.value;
        const denominator = row[calculation.denominatorMeasure]?.value;
        const rate = row[calculation.rateMeasure]?.value;
        const hasCounts = Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0;
        const hasRate = Number.isFinite(rate);
        return hasCounts || hasRate;
      });
    });

  validGroups.sort((a, b) => scoreFactGroup(b, message) - scoreFactGroup(a, message));

  return validGroups[0] || null;
}

function scoreFactGroup(group, message) {
  let score = Number(group.year || 0);
  const workbook = String(group.workbook_name || "").toLowerCase();
  const normalizedMessage = String(message || "").toLowerCase();

  if (workbook.includes("by age") && !/\bage|16|17/.test(normalizedMessage)) score -= 10;
  if (workbook.includes("among 16- and 17-year-olds")) score += 3;
  if (workbook.includes("rates")) score += 2;

  return score;
}

function groupHasCounts(group, geographies, calculation) {
  return geographies.every((geography) => {
    const facts = group.byGeography.get(geography);
    const numerator = facts?.[calculation.numeratorMeasure]?.value;
    const denominator = facts?.[calculation.denominatorMeasure]?.value;
    return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0;
  });
}

function renderCountsMissingAnswer({ calculation, group, geographies, requestedYear, message }) {
  const yearNote = requestedYear
    ? `For ${group.year}:`
    : `Using the latest complete year available in the Brunel Centre data (${group.year}):`;
  const lines = geographies.map((geography) => {
    const facts = group.byGeography.get(geography);
    const publishedRate = facts?.[calculation.rateMeasure]?.value;
    return Number.isFinite(publishedRate)
      ? `- ${geography}: **${formatPercent(publishedRate * 100, 1)}**.`
      : `- ${geography}: rate available, but not in a format I can calculate from.`;
  });

  return {
    answer: [
      `I can give the individual ${calculation.label}s, but I cannot calculate a combined rate from the checked Brunel Centre article and linked dataset because the required numerator and denominator counts are not available.`,
      "",
      yearNote,
      "",
      ...lines,
      "",
      shouldShowBackendDetails(message)
        ? `Source: ${group.post_title}, workbook "${group.workbook_name}", sheet "${group.sheet_name}".`
        : `Source: ${group.post_title}.`
    ].join("\n"),
    sources: [
      {
        title: group.post_title,
        url: group.post_url,
        similarity: null
      }
    ]
  };
}

function renderCombinedRateAnswer({ calculation, group, geographies, requestedYear, message }) {
  let numeratorTotal = 0;
  let denominatorTotal = 0;
  const lines = [];

  for (const geography of geographies) {
    const facts = group.byGeography.get(geography);
    const numerator = facts[calculation.numeratorMeasure];
    const denominator = facts[calculation.denominatorMeasure];

    numeratorTotal += numerator.value;
    denominatorTotal += denominator.value;

    lines.push(
      `${geography}: ${calculation.numeratorMeasure} = ${formatNumber(numerator.value)}; ${calculation.denominatorMeasure} = ${formatNumber(denominator.value)}.`
    );
  }

  const rate = denominatorTotal > 0 ? (numeratorTotal / denominatorTotal) * 100 : null;
  const calculationLine = `(${geographies.map((geography) => formatNumber(group.byGeography.get(geography)[calculation.numeratorMeasure].value)).join(" + ")}) / (${geographies.map((geography) => formatNumber(group.byGeography.get(geography)[calculation.denominatorMeasure].value)).join(" + ")}) * 100 = ${formatPercent(rate)}`;
  const yearNote = requestedYear
    ? `Year: ${group.year}.`
    : `No year was specified, so I used the latest complete year available in the Brunel Centre data: ${group.year}.`;

  const sourceLines = shouldShowBackendDetails(message)
    ? [
        `Data Hub post: ${group.post_title}`,
        `Workbook: ${group.workbook_name}`,
        `Sheet: ${group.sheet_name}`,
        group.metadata?.publisher ? `Publisher: ${group.metadata.publisher}` : null,
        group.metadata?.dataset ? `Source dataset: ${group.metadata.dataset}` : null,
        group.metadata?.publication_date ? `Publication date: ${group.metadata.publication_date}` : null
      ].filter(Boolean)
    : [
        `Source: ${group.post_title}.`,
        "I checked the article and linked dataset."
      ];

  return {
    answer: [
      `Yes. The population-weighted combined ${calculation.label} is **${formatPercent(rate)}**.`,
      "",
      ...sourceLines,
      yearNote,
      "",
      "Method: combined rate = sum of the numerator counts divided by sum of the denominator counts, multiplied by 100. I did not average the published percentages.",
      "",
      ...lines,
      "",
      `Calculation: ${calculationLine}.`
    ].join("\n"),
    sources: [
      {
        title: group.post_title,
        url: group.post_url,
        similarity: null
      }
    ]
  };
}

function renderIndividualRateAnswer({ calculation, group, geographies, requestedYear, message }) {
  const yearNote = requestedYear
    ? `For ${group.year}:`
    : `Using the latest complete year available in the Brunel Centre data (${group.year}):`;
  const wantsDetail = hasFuzzyKeyword(message, DETAIL_WORDS);
  const lines = geographies.map((geography) => {
    const facts = group.byGeography.get(geography);
    const numerator = facts[calculation.numeratorMeasure];
    const denominator = facts[calculation.denominatorMeasure];
    const publishedRate = facts[calculation.rateMeasure]?.value;
    const calculatedRate = denominator?.value > 0 ? (numerator.value / denominator.value) * 100 : null;
    const rate = Number.isFinite(publishedRate) ? publishedRate * 100 : calculatedRate;

    if (wantsDetail && Number.isFinite(numerator?.value) && Number.isFinite(denominator?.value)) {
      return `- ${geography}: **${formatPercent(rate, 1)}** (${formatNumber(numerator.value)} ${formatNumeratorLabel(calculation)} out of a cohort of ${formatNumber(denominator.value)}).`;
    }

    return `- ${geography}: **${formatPercent(rate, 1)}**.`;
  });

  return {
    answer: [
      yearNote,
      "",
      ...lines,
      "",
      shouldShowBackendDetails(message)
        ? `Source: ${group.post_title}, workbook "${group.workbook_name}", sheet "${group.sheet_name}".`
        : `Source: ${group.post_title}.`
    ].filter(Boolean).join("\n"),
    sources: [
      {
        title: group.post_title,
        url: group.post_url,
        similarity: null
      }
    ]
  };
}

function renderSeparateNeetActivityAnswer({
  geographies,
  requestedYear,
  neetCalculation,
  activityCalculation,
  neetGroup,
  activityGroup
}) {
  const year = requestedYear || neetGroup.year || activityGroup.year;
  const yearNote = requestedYear
    ? `For ${year}:`
    : `Using the latest complete year available in the Brunel Centre data (${year}):`;
  const lines = [];

  for (const geography of geographies) {
    const neetRate = getRatePercent(neetGroup, neetCalculation, geography);
    const activityRate = getRatePercent(activityGroup, activityCalculation, geography);
    lines.push(
      `${geography}:`,
      `- NEET rate: **${formatPercent(neetRate, 1)}**.`,
      `- Activity not known rate: **${formatPercent(activityRate, 1)}**.`,
      ""
    );
  }

  return {
    answer: [
      yearNote,
      "",
      ...lines.slice(0, -1),
      "",
      `Source: ${neetGroup.post_title || activityGroup.post_title}.`
    ].join("\n"),
    sources: [
      {
        title: neetGroup.post_title || activityGroup.post_title,
        url: neetGroup.post_url || activityGroup.post_url,
        similarity: null
      }
    ]
  };
}

function getRatePercent(group, calculation, geography) {
  const facts = group.byGeography.get(geography);
  const publishedRate = facts?.[calculation.rateMeasure]?.value;
  if (Number.isFinite(publishedRate)) return publishedRate * 100;

  const numerator = facts?.[calculation.numeratorMeasure]?.value;
  const denominator = facts?.[calculation.denominatorMeasure]?.value;
  if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
    return (numerator / denominator) * 100;
  }

  return null;
}

function renderSimpleAverageRejectedAnswer({ calculation, group, geographies, requestedYear, message }) {
  const weighted = renderCombinedRateAnswer({ calculation, group, geographies, requestedYear, message });
  return {
    answer: [
      `For an overall ${calculation.label}, I’ll use the population-weighted calculation from the available cohort counts.`,
      "",
      weighted.answer
    ].join("\n"),
    sources: weighted.sources
  };
}

function shouldShowBackendDetails(message) {
  const normalized = normalizeForMatch(message);
  return /\b(workbook|workbooks|sheet|sheets|raw\s+data|source\s+file|source\s+files|which\s+data\s+source|what\s+data\s+source)\b/.test(normalized);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2
  }).format(value);
}

function formatPercent(value, decimalPlaces = 2) {
  if (value === null || !Number.isFinite(value)) return "not calculable";

  return `${new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces
  }).format(value)}%`;
}

function formatNumeratorLabel(calculation) {
  if (calculation.id === "neet_rate") return "NEET";
  if (calculation.id === "activity_not_known_rate") return "activity not known";
  if (calculation.id === "neet_or_activity_not_known_rate") return "NEET or activity not known";
  return calculation.numeratorMeasure.toLowerCase();
}

function hasFuzzyKeyword(message, keywords) {
  const tokens = tokenizeForMatch(message);

  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeForMatch(keyword);
    return tokens.some((token) => wordsAreClose(token, normalizedKeyword));
  });
}

function hasExactKeyword(message, keywords) {
  const tokens = tokenizeForMatch(message);
  return keywords.some((keyword) => tokens.includes(normalizeForMatch(keyword)));
}

function hasFuzzyPhrase(message, phrase) {
  return fuzzyPhraseInText(normalizeForMatch(message), normalizeForMatch(phrase));
}

function fuzzyPhraseInText(normalizedText, normalizedPhrase) {
  if (!normalizedText || !normalizedPhrase) return false;
  if (normalizedText.includes(normalizedPhrase)) return true;

  const textTokens = normalizedText.split(" ").filter(Boolean);
  const phraseTokens = normalizedPhrase.split(" ").filter(Boolean);

  if (!textTokens.length || !phraseTokens.length) return false;

  if (phraseTokens.length === 1) {
    const phraseToken = phraseTokens[0];
    return textTokens.some((token) => wordsAreClose(token, phraseToken));
  }

  for (let index = 0; index <= textTokens.length - phraseTokens.length; index += 1) {
    const window = textTokens.slice(index, index + phraseTokens.length);
    const allClose = phraseTokens.every((token, tokenIndex) => wordsAreClose(window[tokenIndex], token));
    if (allClose) return true;
  }

  return false;
}

function tokenizeForMatch(value) {
  return normalizeForMatch(value).split(" ").filter(Boolean);
}

function wordsAreClose(actual, expected) {
  if (!actual || !expected) return false;
  if (actual === expected) return true;
  if (expected.length < 4 || actual.length < 3) return false;

  const distance = levenshteinDistance(actual, expected);
  const allowedDistance = expected.length >= 10 ? 2 : 1;
  return distance <= allowedDistance;
}

function levenshteinDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array(right.length + 1).fill(0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost
      );
    }

    for (let index = 0; index <= right.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
}

function normalizeUrl(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\/+$/, "");
}

function normalizeForMatch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toFiniteNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return Number.NaN;
}
