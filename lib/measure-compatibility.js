const MEASURE_FAMILIES = [
  {
    id: "employmentCount",
    triggers: [/\bemployment\s+count\b/, /\bcount\s+of\s+employment\b/, /\bpeople\s+employed\b/, /\bemployed\s+people\b/, /\bhow\s+many\b.*\bemployed\b/],
    required: [/\b(employment|employed|workforce)\b/, /\b(count|number|total|people|persons|employees|employed)\b/],
    rejected: [/\bneet\b/, /\bactivity\s+not\s+known\b/, /\bcohort\b/, /\bunemployment\b/, /\btraining\b/]
  },
  {
    id: "employmentRate",
    triggers: [/\bemployment\s+rate\b/, /\bemployment\s+rates\b/],
    required: [/\bemployment\b/, /\b(rate|percent|percentage|proportion)\b/],
    rejected: [/\bneet\b/, /\bactivity\s+not\s+known\b/]
  },
  {
    id: "neet",
    triggers: [/\bneet\b/, /\bactivity\s+not\s+known\b/],
    required: [/\b(neet|activity\s+not\s+known|cohort)\b/],
    rejected: [/\bgeneral\s+employment\b/]
  },
  {
    id: "housingAffordability",
    triggers: [/\bhousing\s+affordability\b/, /\baffordability\s+ratio\b/, /\bhouse\s+price\s+to\s+earnings\b/],
    required: [/\b(affordability|house\s+price\s+to\s+earnings|ratio)\b/],
    rejected: [/\bhousing\s+stock\b/, /\bdwellings?\b/, /\bhousebuilding\b/]
  },
  {
    id: "housingStock",
    triggers: [/\bhousing\s+stock\b/, /\bdwellings?\b/, /\bhousebuilding\b/],
    required: [/\b(housing\s+stock|dwellings?|housebuilding|homes)\b/],
    rejected: [/\baffordability\b/, /\bprice\s+to\s+earnings\b/]
  },
  {
    id: "businessCount",
    triggers: [/\bbusiness\s+counts?\b/, /\bcount\s+of\s+businesses\b/, /\bnumber\s+of\s+businesses\b/, /\benterprises?\b/, /\bsites?\b/],
    required: [/\b(business|businesses|enterprise|enterprises|site|sites|establishment|establishments)\b/],
    rejected: [/\b(employee|employees|employment|employed|worker|workers|jobs)\b/]
  },
  {
    id: "employeeCount",
    triggers: [/\bemployee\s+counts?\b/, /\bnumber\s+of\s+employees\b/, /\bemployees?\b/],
    required: [/\b(employee|employees|employment|employed|worker|workers|jobs)\b/],
    rejected: [/\bneet\b/, /\bcohort\b/]
  },
  {
    id: "populationCount",
    triggers: [/\bpopulation\s+of\b/, /\bpopulation\s+count\b/, /\bpopulation\s+counts\b/, /\bhow\s+many\s+people\b/, /\btotal\s+population\b/],
    required: [/\bpopulation\b/],
    rejected: [/\bpopulation\s+change\b/, /\bchange\s+in\s+population\b/, /\bpopulation\s+growth\b/, /\bmigration\b/, /\bbirths?\b/, /\bdeaths?\b/]
  },
  {
    id: "populationChange",
    triggers: [/\bpopulation\s+change\b/, /\bpopulation\s+growth\b/, /\bmigration\b/, /\bbirths?\b/, /\bdeaths?\b/],
    required: [/\b(population\s+change|population\s+growth|migration|births?|deaths?)\b/],
    rejected: []
  },
  {
    id: "emissionsTotal",
    triggers: [/\bemissions?\s+total\b/, /\btotal\s+emissions?\b/, /\bco2\b/, /\bco2e\b/, /\bgreenhouse\s+gas\b/],
    required: [/\b(emissions?|greenhouse\s+gas|co2|co2e|ktco2e|kt\s+co2e)\b/],
    rejected: [/\benergy\s+consumption\b/, /\belectricity\b/, /\bgas\s+consumption\b/]
  },
  {
    id: "energyConsumption",
    triggers: [/\benergy\s+consumption\b/, /\belectricity\b/, /\bgas\s+consumption\b/, /\bfuel\s+type\b/],
    required: [/\b(energy|electricity|gas|fuel|consumption)\b/],
    rejected: [/\bgreenhouse\s+gas\b/, /\bco2e\b/, /\bktco2e\b/]
  },
  {
    id: "gdpGva",
    triggers: [/\bgdp\b/, /\bgva\b/, /\bgross\s+domestic\s+product\b/, /\bgross\s+value\s+added\b/, /\bproductivity\b/],
    required: [/\b(gdp|gva|gross\s+domestic\s+product|gross\s+value\s+added|productivity)\b/],
    rejected: []
  },
  {
    id: "travelTime",
    triggers: [/\btravel\s+time\b/, /\bjourney\s+time\b/, /\bcommuting\b/],
    required: [/\b(travel\s+time|journey\s+time|commuting|travel\s+to\s+work|transport)\b/],
    rejected: []
  },
  {
    id: "healthPrevalence",
    triggers: [/\bprevalence\b/, /\bmortality\b/, /\blife\s+expectancy\b/, /\bhealth\b/],
    required: [/\b(prevalence|mortality|life\s+expectancy|health|obesity|diabetes)\b/],
    rejected: []
  }
];

export function filterCompatibleDatasetItems(items, query) {
  const families = detectRequestedMeasureFamilies(query);
  if (!families.length) return items || [];

  return (items || []).filter((item) =>
    families.some((family) => candidateMatchesRequestedMeasure(item, family))
  );
}

export function detectRequestedMeasureFamilies(query) {
  const clean = normalize(query);
  if (!clean) return [];

  const families = [];
  for (const family of MEASURE_FAMILIES) {
    if (family.triggers.some((pattern) => pattern.test(clean))) {
      families.push(family.id);
    }
  }

  return families;
}

export function candidateMatchesRequestedMeasure(item, familyId) {
  const family = MEASURE_FAMILIES.find((entry) => entry.id === familyId);
  if (!family) return true;

  const text = datasetItemText(item);
  if (!text) return false;

  if (family.rejected.some((pattern) => pattern.test(text))) {
    const hasRequired = family.required.every((pattern) => pattern.test(text));
    return hasRequired && family.id !== "businessCount" && family.id !== "housingAffordability" && family.id !== "populationCount";
  }

  return family.required.every((pattern) => pattern.test(text));
}

export function datasetItemText(item) {
  const parts = [
    item?.title,
    item?.post_title,
    item?.url,
    item?.post_url,
    item?.workbook_name,
    item?.content,
    item?.search_text,
    item?.measure,
    item?.value_text,
    item?.source_row
  ];

  if (item?.row_data && typeof item.row_data === "object") {
    for (const [key, value] of Object.entries(item.row_data)) {
      parts.push(key, value);
    }
  }

  if (item?.dimensions && typeof item.dimensions === "object") {
    for (const [key, value] of Object.entries(item.dimensions)) {
      parts.push(key, value);
    }
  }

  return normalize(parts.filter((part) => part !== null && part !== undefined).join(" "));
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
