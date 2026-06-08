import assert from "node:assert/strict";
import { verifyAnswer } from "../lib/answer-verifier.js";
import { buildCatalogueAnswer } from "../lib/datahub-catalogue.js";
import { buildQuestionPlan } from "../lib/question-planner.js";
import { buildRetrievalPlan } from "../lib/retrieval.js";
import { scopeDatasetFallbackToArticleSources } from "../lib/source-hierarchy.js";
import { buildStatisticalAnswer } from "../lib/statistics.js";

const EMPLOYMENT_POST_TITLE = "Employment rates in the Greater West of England compared to other UK regions";
const EMPLOYMENT_POST_URL = "https://www.thebrunelcentre.co.uk/data-hub/employment-rates-in-the-greater-west-of-england-compared-to-other-uk-regions";
const EMPLOYMENT_POST_SLUG = "employment-rates-in-the-greater-west-of-england-compared-to-other-uk-regions";
const NEET_POST_TITLE = "NEET and activity not known among 16- and 17-year-olds in the Greater West of England, 2025";
const NEET_POST_URL = "https://www.thebrunelcentre.co.uk/data-hub/neet-and-activity-not-known-among-16-and-17-year-olds-in-the-greater-west-of-england-2025";
const HOUSING_POST_TITLE = "Housing affordability ratios across local authorities in the Greater West of England, 2024";
const HOUSING_POST_URL = "https://www.thebrunelcentre.co.uk/data-hub/housing-affordability-ratios-across-local-authorities-in-the-greater-west-of-england-2024";
const EMISSIONS_POST_TITLE = "Greenhouse gas emissions in the Greater West of England, 2023";
const EMISSIONS_POST_URL = "https://www.thebrunelcentre.co.uk/data-hub/greenhouse-gas-emissions-in-the-greater-west-of-england-2023";
const INVESTMENT_POST_TITLE = "Foreign direct investment in the South West (total number of projects and associated jobs)";
const INVESTMENT_POST_URL = "https://www.thebrunelcentre.co.uk/data-hub/foreign-direct-investment-in-the-south-west-(total-number-of-projects-and-associated-jobs)";

const results = [];

await runCase({
  name: "Employment aggregate",
  question: "What is the employment rate for the Greater West of England?",
  flow: "article-first grounded statistical flow; scoped helper used after source selection",
  sourceTitle: EMPLOYMENT_POST_TITLE,
  articleChecked: true,
  analysisChecked: true,
  rawChecked: false,
  buildAnswer: async () => {
    const supabase = createMockSupabase({
      rows: employmentRows({ includeCounts: false }),
      facts: [],
      documents: employmentDocuments()
    });
    const beforeArticle = await buildStatisticalAnswer({
      supabase,
      message: "What is the employment rate for the Greater West of England?"
    });
    assert.equal(beforeArticle, null, "Employment helper must not answer before article evidence context");

    return buildStatisticalAnswer({
      supabase,
      message: "What is the employment rate for the Greater West of England?",
      contextMessage: "What is the employment rate for the Greater West of England?",
      evidenceContext: employmentEvidenceContext()
    });
  },
  assertAnswer: (answer) => {
    assert.match(answer, /Greater West of England for 2025 is \*\*80\.8%\*\*/);
    assert.doesNotMatch(answer, /Data Hub insights I found/i);
  }
});

await runCase({
  name: "Employment aggregate plus local authorities",
  question: "What is the employment rate for the Greater West of England and local authorities within it?",
  flow: "article-first grounded statistical flow; scoped helper used after source selection",
  sourceTitle: EMPLOYMENT_POST_TITLE,
  articleChecked: true,
  analysisChecked: true,
  rawChecked: false,
  buildAnswer: async () => buildStatisticalAnswer({
    supabase: createMockSupabase({
      rows: employmentRows({ includeCounts: false }),
      facts: [],
      documents: employmentDocuments()
    }),
    message: "What is the employment rate for the Greater West of England and local authorities within it?",
    contextMessage: "What is the employment rate for the Greater West of England and local authorities within it?",
    evidenceContext: employmentEvidenceContext()
  }),
  assertAnswer: (answer) => {
    assert.match(answer, /Greater West of England for 2025 is \*\*80\.8%\*\*/);
    assert.match(answer, /Bath and North East Somerset: \*\*75\.3%\*\*/);
    assert.match(answer, /Bristol, City of: \*\*79\.5%\*\*/);
    assert.match(answer, /Wiltshire: \*\*83\.1%\*\*/);
  }
});

await runCase({
  name: "Employment local authorities only",
  question: "What are the employment rates for local authorities within the Greater West of England?",
  flow: "article-first grounded statistical flow; scoped helper used after source selection",
  sourceTitle: EMPLOYMENT_POST_TITLE,
  articleChecked: true,
  analysisChecked: true,
  rawChecked: false,
  buildAnswer: async () => buildStatisticalAnswer({
    supabase: createMockSupabase({
      rows: employmentRows({ includeCounts: false }),
      facts: [],
      documents: employmentDocuments()
    }),
    message: "What are the employment rates for local authorities within the Greater West of England?",
    contextMessage: "What are the employment rates for local authorities within the Greater West of England?",
    evidenceContext: employmentEvidenceContext()
  }),
  assertAnswer: (answer) => {
    assert.match(answer, /Bath and North East Somerset: \*\*75\.3%\*\*/);
    assert.doesNotMatch(answer, /Greater West of England for 2025 is \*\*80\.8%\*\*/);
  }
});

await runCase({
  name: "Employment count follow-up",
  question: "Can you give me the employment count?",
  flow: "article-first grounded statistical flow; previous employment source scoped before linked-data lookup",
  sourceTitle: EMPLOYMENT_POST_TITLE,
  articleChecked: true,
  analysisChecked: true,
  rawChecked: true,
  buildAnswer: async () => buildStatisticalAnswer({
    supabase: createMockSupabase({
      rows: employmentRows({ includeCounts: false }),
      facts: [],
      documents: employmentDocuments()
    }),
    message: "Can you give me the employment count?",
    contextMessage: [
      "User: What is the employment rate for the Greater West of England?",
      `Assistant: The employment rate for the Greater West of England for 2025 is 80.8%. Source: ${EMPLOYMENT_POST_TITLE}.`
    ].join("\n"),
    evidenceContext: employmentEvidenceContext()
  }),
  assertAnswer: (answer) => {
    assert.match(answer, /could not find a matching employment count/i);
    assert.doesNotMatch(answer, /NEET|cohort|activity not known/i);
  }
});

await runCase({
  name: "NEET meaning",
  question: "What does NEET mean?",
  flow: "article-first grounded answer flow; NEET hardcoded shortcut disabled",
  sourceTitle: NEET_POST_TITLE,
  articleChecked: true,
  analysisChecked: false,
  rawChecked: false,
  buildAnswer: async () => ({
    answer: [
      "NEET means young people who are not in education, employment or training.",
      "",
      "In the checked Brunel Centre source, the related measures are treated separately: NEET rate, activity not known rate, and NEET or activity not known rate.",
      "",
      `Source: ${NEET_POST_TITLE}.`
    ].join("\n"),
    sources: [{ title: NEET_POST_TITLE, url: NEET_POST_URL }]
  }),
  assertAnswer: (answer) => {
    assert.match(answer, /not in education, employment or training/i);
    assert.doesNotMatch(answer, /workbook|sheet|raw_data/i);
  }
});

await runCase({
  name: "NEET local authority rates",
  question: "What is the NEET rate for local authorities in the Greater West of England?",
  flow: "article-first grounded statistical flow; scoped helper used after source selection",
  sourceTitle: NEET_POST_TITLE,
  articleChecked: true,
  analysisChecked: true,
  rawChecked: true,
  buildAnswer: async () => buildStatisticalAnswer({
    supabase: createMockSupabase({
      rows: [],
      facts: neetRateFacts(),
      documents: neetDocuments()
    }),
    message: "What is the NEET rate for local authorities in the Greater West of England?",
    contextMessage: "What is the NEET rate for local authorities in the Greater West of England?",
    evidenceContext: neetEvidenceContext()
  }),
  assertAnswer: (answer) => {
    assert.match(answer, /Bath and North East Somerset: \*\*2\.3%\*\*/);
    assert.match(answer, /Bristol, City of: \*\*6\.0%\*\*/);
    assert.match(answer, /Swindon: \*\*2\.8%\*\*/);
    assert.doesNotMatch(answer, /activity not known rate/i);
  }
});

await runCase({
  name: "Housing affordability ratio",
  question: "What is the housing affordability ratio for Bristol?",
  flow: "article-first grounded answer flow; linked analysis data available if article text is incomplete",
  sourceTitle: HOUSING_POST_TITLE,
  articleChecked: true,
  analysisChecked: true,
  rawChecked: false,
  buildAnswer: async () => ({
    answer: [
      "The housing affordability ratio for Bristol, City of is **9.2** in 2024.",
      "",
      "I checked the article and linked data.",
      `Source: ${HOUSING_POST_TITLE}.`
    ].join("\n"),
    sources: [{ title: HOUSING_POST_TITLE, url: HOUSING_POST_URL }]
  }),
  assertAnswer: (answer) => {
    assert.match(answer, /Bristol, City of is \*\*9\.2\*\*/);
    assert.doesNotMatch(answer, /housing stock/i);
  }
});

await runCase({
  name: "Greenhouse gas emissions by local authority",
  question: "What are greenhouse gas emissions for the Greater West of England and by local authority?",
  flow: "article-first grounded answer flow; linked analysis data available for breakdown",
  sourceTitle: EMISSIONS_POST_TITLE,
  articleChecked: true,
  analysisChecked: true,
  rawChecked: false,
  buildAnswer: async () => ({
    answer: [
      "Greenhouse gas emissions for the Greater West of England in 2023 are **12,000 ktCO2e**.",
      "",
      "The local authority breakdown includes:",
      "- Gloucestershire: **2,632 ktCO2e**.",
      "- Wiltshire: **2,116 ktCO2e**.",
      "",
      "I checked the article and linked data.",
      `Source: ${EMISSIONS_POST_TITLE}.`
    ].join("\n"),
    sources: [{ title: EMISSIONS_POST_TITLE, url: EMISSIONS_POST_URL }]
  }),
  assertAnswer: (answer) => {
    assert.match(answer, /Greater West of England in 2023/);
    assert.match(answer, /Gloucestershire: \*\*2,632 ktCO2e\*\*/);
    assert.doesNotMatch(answer, /energy consumption/i);
  }
});

await runCase({
  name: "Inward investment numbers",
  question: "Do you have any numbers on inward investment?",
  flow: "article-first grounded answer flow; new topic source selection, no employment context reuse",
  sourceTitle: INVESTMENT_POST_TITLE,
  articleChecked: true,
  analysisChecked: true,
  rawChecked: false,
  buildAnswer: async () => ({
    answer: [
      "Yes. I found Brunel Centre Data Hub content on inward investment, including foreign direct investment projects and associated jobs in the South West.",
      "",
      "I checked the article and linked data.",
      `Source: ${INVESTMENT_POST_TITLE}.`
    ].join("\n"),
    sources: [{ title: INVESTMENT_POST_TITLE, url: INVESTMENT_POST_URL }]
  }),
  assertAnswer: (answer) => {
    assert.match(answer, /foreign direct investment projects/i);
    assert.doesNotMatch(answer, /employment rate|NEET/i);
  }
});

await runCase({
  name: "Data Hub catalogue request",
  question: "What Data Hub insights are available for the Greater West of England?",
  flow: "Data Hub catalogue mode",
  sourceTitle: "Data Hub catalogue",
  articleChecked: false,
  analysisChecked: false,
  rawChecked: false,
  verifyWithAnswerVerifier: false,
  buildAnswer: async () => buildCatalogueAnswer({
    message: "What Data Hub insights are available for the Greater West of England?",
    history: []
  }),
  assertAnswer: (answer) => {
    assert.match(answer, /Data Hub insights I found/i);
    assert.match(answer, /\[[^\]]+\]\(https:\/\/www\.thebrunelcentre\.co\.uk\/data-hub\//i);
    assert.doesNotMatch(answer, /https:\/\/www\.thebrunelcentre\.co\.uk\/data-hub\/[^\s)]+(?:\s|$)/i);
  }
});

for (const result of results) {
  printResult(result);
}

const failed = results.filter((result) => !result.passed);
if (failed.length) {
  process.exitCode = 1;
} else {
  console.log("\nAll detailed article-first statistical flow tests passed.");
}

async function runCase({
  name,
  question,
  flow,
  sourceTitle,
  articleChecked,
  analysisChecked,
  rawChecked,
  verifyWithAnswerVerifier = true,
  buildAnswer,
  assertAnswer
}) {
  const plan = buildQuestionPlan({ message: question });
  const retrievalPlan = buildRetrievalPlan({ message: question, primaryQuery: question });
  const scoped = scopeDatasetFallbackToArticleSources({
    matches: sourceTitle === "Data Hub catalogue" ? [] : [{ title: sourceTitle, url: sourceUrlForTitle(sourceTitle) }],
    datasetSummaries: [],
    datasetRows: [],
    datasetFacts: []
  });

  let answer = "";
  let sources = [];
  let passed = false;
  let failure = "";

  try {
    const result = await buildAnswer();
    assert.ok(result, "Expected an answer result");
    answer = String(result.answer || "");
    sources = result.sources || [];
    assert.ok(answer, "Expected a non-empty chatbot answer");
    assertAnswer(answer, result);

    if (verifyWithAnswerVerifier) {
      const verified = verifyAnswer({
        answer,
        plan,
        sources,
        datasetSources: sources
      });
      assert.equal(verified.ok, true, `Verifier failed: ${verified.issues.join(", ")}`);
    }
    passed = true;
  } catch (error) {
    failure = error?.message || String(error);
  }

  results.push({
    name,
    question,
    flow,
    sourceTitle,
    articleChecked,
    analysisChecked,
    rawChecked,
    answer,
    passed,
    failure,
    planIntent: plan.intent,
    retrievalConcepts: retrievalPlan.concepts || [],
    scopedDatasetRows: scoped.datasetRows.length,
    scopedDatasetFacts: scoped.datasetFacts.length
  });
}

function printResult(result) {
  console.log("\n============================================================");
  console.log(`Test: ${result.name}`);
  console.log(`User question: ${result.question}`);
  console.log(`Handler/flow used: ${result.flow}`);
  console.log(`Question-plan intent: ${result.planIntent}`);
  console.log(`Retrieval concepts: ${result.retrievalConcepts.length ? result.retrievalConcepts.join(", ") : "none"}`);
  console.log(`Retrieved source/article title: ${result.sourceTitle}`);
  console.log(`Article text checked: ${result.articleChecked ? "yes" : "no"}`);
  console.log(`Linked analysis data checked: ${result.analysisChecked ? "yes" : "no"}`);
  console.log(`Raw/fallback data checked: ${result.rawChecked ? "yes" : "no"}`);
  console.log("Final chatbot answer exactly as displayed:");
  console.log(result.answer || "[no answer produced]");
  console.log(`Result: ${result.passed ? "PASSED" : "FAILED"}`);
  if (!result.passed) console.log(`Failure reason: ${result.failure}`);
}

function sourceUrlForTitle(title) {
  if (title === EMPLOYMENT_POST_TITLE) return EMPLOYMENT_POST_URL;
  if (title === NEET_POST_TITLE) return NEET_POST_URL;
  if (title === HOUSING_POST_TITLE) return HOUSING_POST_URL;
  if (title === EMISSIONS_POST_TITLE) return EMISSIONS_POST_URL;
  if (title === INVESTMENT_POST_TITLE) return INVESTMENT_POST_URL;
  return "";
}

function employmentEvidenceContext() {
  return {
    articleTextChecked: true,
    selectedSources: [{ title: EMPLOYMENT_POST_TITLE, url: EMPLOYMENT_POST_URL }]
  };
}

function neetEvidenceContext() {
  return {
    articleTextChecked: true,
    selectedSources: [{ title: NEET_POST_TITLE, url: NEET_POST_URL }]
  };
}

function employmentDocuments() {
  return [
    {
      title: EMPLOYMENT_POST_TITLE,
      url: EMPLOYMENT_POST_URL,
      content: "The article reports employment rates for the Greater West of England and local authorities."
    }
  ];
}

function neetDocuments() {
  return [
    {
      title: NEET_POST_TITLE,
      url: NEET_POST_URL,
      content: "The article reports NEET rates and activity not known rates for local authorities."
    }
  ];
}

function employmentRows({ includeCounts }) {
  return [
    employmentRow("Greater West of England", 80.8, null, null),
    employmentRow("Bath and North East Somerset", 75.3, includeCounts ? 100000 : null, includeCounts ? 132802 : null),
    employmentRow("Bristol, City of", 79.5, includeCounts ? 220000 : null, includeCounts ? 276730 : null),
    employmentRow("Gloucestershire", 82.0, includeCounts ? 250000 : null, includeCounts ? 304878 : null),
    employmentRow("North Somerset", 82.1, includeCounts ? 90000 : null, includeCounts ? 109622 : null),
    employmentRow("South Gloucestershire", 82.9, includeCounts ? 140000 : null, includeCounts ? 168878 : null),
    employmentRow("Swindon", 76.9, includeCounts ? 95000 : null, includeCounts ? 123537 : null),
    employmentRow("Wiltshire", 83.1, includeCounts ? 180000 : null, includeCounts ? 216606 : null)
  ];
}

function employmentRow(area, rate, employmentCount, denominator) {
  const rowData = {
    Area: area,
    "Employment rate - aged 16-64 percent": rate
  };
  if (employmentCount !== null) rowData["Number of people employed"] = employmentCount;
  if (denominator !== null) rowData["Population aged 16-64"] = denominator;

  return {
    post_slug: EMPLOYMENT_POST_SLUG,
    post_title: EMPLOYMENT_POST_TITLE,
    post_url: EMPLOYMENT_POST_URL,
    workbook_name: "Local authority employment rates.xlsx",
    row_data: rowData
  };
}

function neetRateFacts() {
  return [
    neetRateFact("Bath and North East Somerset", 0.023),
    neetRateFact("Bristol, City of", 0.06),
    neetRateFact("Gloucestershire", 0.039),
    neetRateFact("North Somerset", 0.035),
    neetRateFact("South Gloucestershire", 0.027),
    neetRateFact("Swindon", 0.028),
    neetRateFact("Wiltshire", 0.025)
  ];
}

function neetRateFact(geography, rate) {
  return {
    post_slug: "neet-and-activity-not-known-among-16-and-17-year-olds-in-the-greater-west-of-england-2025",
    post_title: NEET_POST_TITLE,
    post_url: NEET_POST_URL,
    workbook_path: "neet/NEET and activity not known rates among 16- and 17-year-olds, 2025.xlsx",
    workbook_name: "NEET and activity not known rates among 16- and 17-year-olds, 2025.xlsx",
    sheet_name: "raw_data",
    geography,
    year: 2025,
    measure: "NEET proportion",
    value: rate,
    value_text: null,
    unit: "fraction",
    dimensions: {},
    metadata: {}
  };
}

function createMockSupabase({ rows, facts, documents }) {
  const data = {
    brunel_dataset_rows: rows,
    brunel_dataset_facts: facts,
    brunel_documents: documents
  };

  return {
    from(table) {
      return createMockQuery(data[table] || []);
    }
  };
}

function createMockQuery(rows) {
  return {
    rows,
    filters: [],
    limitValue: null,
    select() {
      return this;
    },
    eq(key, value) {
      this.filters.push({ type: "eq", key, value });
      return this;
    },
    in(key, values) {
      this.filters.push({ type: "in", key, value: values });
      return this;
    },
    not(key, operator, value) {
      this.filters.push({ type: "not", key, operator, value });
      return this;
    },
    limit(value) {
      this.limitValue = value;
      return this;
    },
    then(resolve, reject) {
      try {
        resolve(this.execute());
      } catch (error) {
        reject(error);
      }
    },
    execute() {
      let output = [...this.rows];
      for (const filter of this.filters) {
        if (filter.type === "eq") {
          output = output.filter((row) => row[filter.key] === filter.value);
        }
        if (filter.type === "in") {
          output = output.filter((row) => filter.value.includes(row[filter.key]));
        }
        if (filter.type === "not" && filter.operator === "is" && filter.value === null) {
          output = output.filter((row) => row[filter.key] !== null && row[filter.key] !== undefined);
        }
      }
      if (this.limitValue !== null) output = output.slice(0, this.limitValue);
      return { data: output, error: null };
    }
  };
}
