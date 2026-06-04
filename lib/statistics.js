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
const CALCULATION_WORDS = ["calculate", "calculation", "compute", "computed"];

export async function buildStatisticalAnswer({ supabase, message }) {
  const calculation = chooseRateCalculation(message);
  if (!calculation) return null;
  const wantsBackendAnswer =
    hasRateLookupIntent(message) ||
    hasCombinedRateIntent(message) ||
    hasAverageIntent(message) ||
    hasSimpleAverageIntent(message) ||
    hasFuzzyKeyword(message, DETAIL_WORDS) ||
    hasFuzzyKeyword(message, CALCULATION_WORDS);

  if (!wantsBackendAnswer) return null;

  try {
    const requestedYear = extractYear(message);
    const geographies = await matchRequestedGeographies(supabase, message);
    const wantsAverage = hasAverageIntent(message);
    const wantsSimpleAverage = hasSimpleAverageIntent(message);
    const wantsCombinedRate = hasCombinedRateIntent(message) || (wantsAverage && geographies.length > 1 && !wantsSimpleAverage);

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
      calculation
    });

    const group = chooseBestFactGroup(facts, geographies, requestedYear, message, calculation);

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
      return renderCountsMissingAnswer({ calculation, group, geographies, requestedYear });
    }

    if (wantsSimpleAverage) {
      return renderSimpleAverageRejectedAnswer({ calculation, group, geographies, requestedYear });
    }

    if (wantsCombinedRate) {
      return renderCombinedRateAnswer({ calculation, group, geographies, requestedYear });
    }

    return renderIndividualRateAnswer({ calculation, group, geographies, requestedYear, message });
  } catch {
    return null;
  }
}

function chooseRateCalculation(message) {
  const hasNeet = hasFuzzyKeyword(message, ["neet", "neets"]);
  const hasActivityNotKnown = hasFuzzyPhrase(message, "activity not known");

  if (hasNeet && hasActivityNotKnown) {
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

  for (const geography of geographies) {
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

  return [...new Set([normalized, beforeComma, withoutCityOf].filter(Boolean))];
}

function hasRateLookupIntent(message) {
  return hasFuzzyKeyword(message, RATE_LOOKUP_WORDS);
}

function hasCombinedRateIntent(message) {
  return hasFuzzyKeyword(message, COMBINED_RATE_WORDS) || hasFuzzyPhrase(message, "population weighted");
}

function hasAverageIntent(message) {
  return hasFuzzyKeyword(message, AVERAGE_WORDS);
}

function hasSimpleAverageIntent(message) {
  return hasAverageIntent(message) && hasFuzzyKeyword(message, SIMPLE_AVERAGE_WORDS);
}

async function fetchCalculationFacts({ supabase, geographies, requestedYear, calculation }) {
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

function renderCountsMissingAnswer({ calculation, group, geographies, requestedYear }) {
  const yearNote = requestedYear
    ? `For ${group.year}:`
    : `Using the latest complete year available in the matched workbook (${group.year}):`;
  const lines = geographies.map((geography) => {
    const facts = group.byGeography.get(geography);
    const publishedRate = facts?.[calculation.rateMeasure]?.value;
    return Number.isFinite(publishedRate)
      ? `- ${geography}: **${formatPercent(publishedRate * 100, 1)}**.`
      : `- ${geography}: rate available, but not in a format I can calculate from.`;
  });

  return {
    answer: [
      `I can give the individual ${calculation.label}s, but I cannot calculate a combined rate from this dataset because the required numerator and denominator counts are not available in the loaded raw data.`,
      "",
      yearNote,
      "",
      ...lines,
      "",
      `Source: ${group.post_title}, workbook "${group.workbook_name}", sheet "${group.sheet_name}".`
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

function renderCombinedRateAnswer({ calculation, group, geographies, requestedYear }) {
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
    : `No year was specified, so I used the latest complete year available in the matched workbook: ${group.year}.`;

  const sourceLines = [
    `Data Hub post: ${group.post_title}`,
    `Workbook: ${group.workbook_name}`,
    `Sheet: ${group.sheet_name}`,
    group.metadata?.publisher ? `Publisher: ${group.metadata.publisher}` : null,
    group.metadata?.dataset ? `Source dataset: ${group.metadata.dataset}` : null,
    group.metadata?.publication_date ? `Publication date: ${group.metadata.publication_date}` : null
  ].filter(Boolean);

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
    : `Using the latest complete year available in the matched workbook (${group.year}):`;
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
      wantsDetail
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

function renderSimpleAverageRejectedAnswer({ calculation, group, geographies, requestedYear }) {
  const weighted = renderCombinedRateAnswer({ calculation, group, geographies, requestedYear });
  return {
    answer: [
      `For an overall ${calculation.label}, I’ll use the population-weighted calculation from the available cohort counts.`,
      "",
      weighted.answer
    ].join("\n"),
    sources: weighted.sources
  };
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
