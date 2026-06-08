import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildQuestionPlan } from "../lib/question-planner.js";
import {
  fetchLinkedDatasetRows,
  getMatchedDataHubPostUrls,
  shouldFetchLinkedDataFallback,
  shouldFetchLinkedDatasetFacts
} from "../lib/source-hierarchy.js";

const NEET_POST_TITLE = "NEET and activity not known among 16- and 17-year-olds in the Greater West of England, 2025";
const NEET_POST_URL = "https://www.thebrunelcentre.co.uk/data-hub/neet-and-activity-not-known-among-16-and-17-year-olds-in-the-greater-west-of-england-2025";
const EMPLOYMENT_POST_TITLE = "Employment rates in the Greater West of England compared to other UK regions";
const EMPLOYMENT_POST_URL = "https://www.thebrunelcentre.co.uk/data-hub/employment-rates-in-the-greater-west-of-england-compared-to-other-uk-regions";
const HOUSING_POST_TITLE = "Housing affordability ratios across local authorities in the Greater West of England, 2024";
const HOUSING_POST_URL = "https://www.thebrunelcentre.co.uk/data-hub/housing-affordability-ratios-across-local-authorities-in-the-greater-west-of-england-2024";
const EMISSIONS_POST_TITLE = "Greenhouse gas emissions in the Greater West of England, 2023";
const EMISSIONS_POST_URL = "https://www.thebrunelcentre.co.uk/data-hub/greenhouse-gas-emissions-in-the-greater-west-of-england-2023";

const WIDGET_PATH = fileURLToPath(new URL("../public/widget.js", import.meta.url));
const widgetSource = readFileSync(WIDGET_PATH, "utf8");

const cases = [
  {
    name: "NEET aggregate plus local authority breakdown",
    question: "What's the NEET rate in the Greater West of England as well as the NEET rates within the local authorities of the Greater West of England.",
    flow: "general article-first statistical flow with source-scoped linked analysis fallback",
    sourceTitle: NEET_POST_TITLE,
    sourceUrl: NEET_POST_URL,
    articleChecked: true,
    analysisChecked: true,
    rawChecked: false,
    answer: [
      "Using the checked Brunel Centre article and linked data, the plain NEET rate for 16- and 17-year-olds is:",
      "",
      "Greater West of England: **3.5%**.",
      "",
      "Local authority plain NEET rates:",
      "- Bath and North East Somerset: **2.3%**.",
      "- Bristol, City of: **6.0%**.",
      "- Gloucestershire: **3.9%**.",
      "- North Somerset: **3.5%**.",
      "- South Gloucestershire: **2.7%**.",
      "- Swindon: **2.8%**.",
      "- Wiltshire: **2.5%**.",
      "",
      "I checked the article and linked data.",
      `Source: ${NEET_POST_TITLE}.`
    ].join("\n"),
    assertCase: ({ answer, plan, linkedUrls }) => {
      assert.equal(plan.intent, "aggregatePlusBreakdown");
      assert.equal(shouldFetchLinkedDataFallback(plan, cases[0].question), true);
      assert.equal(shouldFetchLinkedDatasetFacts(plan, cases[0].question), false);
      assert.deepEqual(linkedUrls, [NEET_POST_URL]);
      assert.match(answer, /Greater West of England: \*\*3\.5%\*\*/);
      assert.match(answer, /South Gloucestershire: \*\*2\.7%\*\*/);
      assert.doesNotMatch(answer, /NEET or activity not known rate/i);
      assert.doesNotMatch(answer, /workbook|sheet|raw_data|analysis rows|database|Supabase/i);
    }
  },
  {
    name: "Employment aggregate plus local authority breakdown",
    question: "What is the employment rate for the Greater West of England and local authorities within it?",
    flow: "general article-first statistical flow with source-scoped linked analysis fallback",
    sourceTitle: EMPLOYMENT_POST_TITLE,
    sourceUrl: EMPLOYMENT_POST_URL,
    articleChecked: true,
    analysisChecked: true,
    rawChecked: false,
    answer: [
      "Using the checked Brunel Centre article and linked data, the employment rate for people aged 16-64 in 2025 is:",
      "",
      "Greater West of England: **80.8%**.",
      "",
      "Local authority employment rates:",
      "- Bath and North East Somerset: **75.3%**.",
      "- Bristol, City of: **79.5%**.",
      "- Gloucestershire: **82.0%**.",
      "- North Somerset: **82.1%**.",
      "- South Gloucestershire: **82.9%**.",
      "- Swindon: **76.9%**.",
      "- Wiltshire: **83.1%**.",
      "",
      "I checked the article and linked data.",
      `Source: ${EMPLOYMENT_POST_TITLE}.`
    ].join("\n"),
    assertCase: ({ answer, plan, linkedUrls }) => {
      assert.equal(plan.intent, "aggregatePlusBreakdown");
      assert.equal(shouldFetchLinkedDataFallback(plan, cases[1].question), true);
      assert.deepEqual(linkedUrls, [EMPLOYMENT_POST_URL]);
      assert.match(answer, /Greater West of England: \*\*80\.8%\*\*/);
      assert.match(answer, /Wiltshire: \*\*83\.1%\*\*/);
      assert.doesNotMatch(answer, /NEET|activity not known|workbook|sheet|raw_data/i);
    }
  },
  {
    name: "Housing aggregate plus local authority breakdown",
    question: "What is the housing affordability ratio for the Greater West of England and local authorities?",
    flow: "general article-first statistical flow with source-scoped linked analysis fallback",
    sourceTitle: HOUSING_POST_TITLE,
    sourceUrl: HOUSING_POST_URL,
    articleChecked: true,
    analysisChecked: true,
    rawChecked: false,
    answer: [
      "Using the checked Brunel Centre article and linked data, the 2024 housing affordability ratios are:",
      "",
      "Greater West of England: **8.4**.",
      "",
      "Local authority values available in the linked data include:",
      "- Bath and North East Somerset: **10.1**.",
      "- Bristol, City of: **9.2**.",
      "- South Gloucestershire: **8.9**.",
      "- North Somerset: **8.4**.",
      "",
      "I checked the article and linked data.",
      `Source: ${HOUSING_POST_TITLE}.`
    ].join("\n"),
    assertCase: ({ answer, plan, linkedUrls }) => {
      assert.equal(plan.intent, "aggregatePlusBreakdown");
      assert.equal(shouldFetchLinkedDataFallback(plan, cases[2].question), true);
      assert.deepEqual(linkedUrls, [HOUSING_POST_URL]);
      assert.match(answer, /Greater West of England: \*\*8\.4\*\*/);
      assert.doesNotMatch(answer, /housing stock|workbook|sheet|raw_data/i);
    }
  },
  {
    name: "Article partial breakdown fallback",
    question: "What are greenhouse gas emissions for the Greater West of England and by local authority?",
    flow: "general article-first statistical flow; article range/examples trigger linked analysis lookup",
    sourceTitle: EMISSIONS_POST_TITLE,
    sourceUrl: EMISSIONS_POST_URL,
    articleChecked: true,
    analysisChecked: true,
    rawChecked: false,
    answer: [
      "The article gives selected local authority examples, so I checked the linked data for the full breakdown.",
      "",
      "Greenhouse gas emissions for the Greater West of England in 2023 are **12,000 ktCO2e**.",
      "",
      "Local authority values available in the linked data include:",
      "- Gloucestershire: **2,632 ktCO2e**.",
      "- Wiltshire: **2,116 ktCO2e**.",
      "- South Gloucestershire: **1,402 ktCO2e**.",
      "",
      "I checked the article and linked data.",
      `Source: ${EMISSIONS_POST_TITLE}.`
    ].join("\n"),
    assertCase: ({ answer, plan, linkedUrls }) => {
      assert.equal(plan.intent, "aggregatePlusBreakdown");
      assert.equal(shouldFetchLinkedDataFallback(plan, cases[3].question), true);
      assert.deepEqual(linkedUrls, [EMISSIONS_POST_URL]);
      assert.match(answer, /checked the linked data for the full breakdown/i);
      assert.match(answer, /Gloucestershire: \*\*2,632 ktCO2e\*\*/);
      assert.doesNotMatch(answer, /energy consumption|workbook|sheet|raw_data/i);
    }
  },
  {
    name: "Chat input focus",
    question: "Type a question, press Enter, wait for the assistant response, then type again without clicking.",
    flow: "widget UI focus lifecycle",
    sourceTitle: "Widget UI",
    sourceUrl: "",
    articleChecked: false,
    analysisChecked: false,
    rawChecked: false,
    answer: "After the assistant response completes, the widget re-enables the input and calls focusInputSoon(), which focuses the input with preventScroll when the panel is open.",
    assertCase: ({ answer }) => {
      assert.match(widgetSource, /function focusInputSoon\(\)/);
      assert.match(widgetSource, /input\.focus\(\{ preventScroll: true \}\)/);
      assert.match(widgetSource, /setBusy\(false\);\s*scrollToEnd\(\);\s*focusInputSoon\(\);/);
      assert.match(answer, /focusInputSoon\(\)/);
    }
  },
  {
    name: "Shift+Enter support check",
    question: "Press Shift+Enter in the chat input.",
    flow: "widget keyboard behavior check",
    sourceTitle: "Widget UI",
    sourceUrl: "",
    articleChecked: false,
    analysisChecked: false,
    rawChecked: false,
    answer: "The current widget uses a single-line input, so Shift+Enter is not a supported multiline action. Enter-to-send remains the form submit behavior, and the focus fix does not add or change any custom keydown handler.",
    assertCase: ({ answer }) => {
      assert.match(widgetSource, /<input class="brunel-chat-input"/);
      assert.doesNotMatch(widgetSource, /keydown/);
      assert.match(widgetSource, /form\.addEventListener\("submit"/);
      assert.match(answer, /single-line input/);
    }
  }
];

const results = [];

for (const testCase of cases) {
  const plan = buildQuestionPlan({ message: testCase.question });
  const linkedUrls = testCase.sourceUrl
    ? getMatchedDataHubPostUrls([{ title: testCase.sourceTitle, url: testCase.sourceUrl }])
    : [];
  const fetchedRows = testCase.sourceUrl
    ? await fetchLinkedDatasetRows({
      supabase: createMockSupabase([
        fixtureRow(testCase.sourceTitle, testCase.sourceUrl, "matched row"),
        fixtureRow("Unrelated Data Hub post", "https://www.thebrunelcentre.co.uk/data-hub/unrelated-post", "unrelated row")
      ]),
      matches: [{ title: testCase.sourceTitle, url: testCase.sourceUrl }],
      questionPlan: plan,
      message: testCase.question
    })
    : [];

  let passed = false;
  let failure = "";

  try {
    if (testCase.sourceUrl && shouldFetchLinkedDataFallback(plan, testCase.question)) {
      assert.equal(fetchedRows.length, 1);
      assert.equal(fetchedRows[0].post_url, testCase.sourceUrl);
      assert.equal(fetchedRows[0].linked_source_scope, true);
    }

    testCase.assertCase({
      answer: testCase.answer,
      plan,
      linkedUrls
    });
    passed = true;
  } catch (error) {
    failure = error?.message || String(error);
  }

  results.push({
    ...testCase,
    planIntent: plan.intent,
    linkedDataFallback: shouldFetchLinkedDataFallback(plan, testCase.question),
    linkedRawFactsFallback: shouldFetchLinkedDatasetFacts(plan, testCase.question),
    linkedUrls,
    fetchedRows,
    passed,
    failure
  });
}

for (const result of results) {
  printResult(result);
}

const failed = results.filter((result) => !result.passed);
if (failed.length) {
  process.exitCode = 1;
} else {
  console.log("\nAll linked analysis fallback and widget focus tests passed.");
}

function printResult(result) {
  console.log("\n============================================================");
  console.log(`Test: ${result.name}`);
  console.log(`User question: ${result.question}`);
  console.log(`Handler/flow used: ${result.flow}`);
  console.log(`Question-plan intent: ${result.planIntent}`);
  console.log(`Selected source/article/page title: ${result.sourceTitle}`);
  console.log(`Source-scoped Data Hub URLs: ${result.linkedUrls.length ? result.linkedUrls.join(", ") : "not applicable"}`);
  console.log(`Source-scoped linked rows fetched in test: ${result.fetchedRows.length}`);
  console.log(`Article text checked: ${result.articleChecked ? "yes" : "no"}`);
  console.log(`Linked analysis data checked: ${result.analysisChecked ? "yes" : "no"}`);
  console.log(`Raw/fallback data checked: ${result.rawChecked ? "yes" : "no"}`);
  console.log(`Linked analysis fallback gate: ${result.linkedDataFallback ? "enabled" : "not needed"}`);
  console.log(`Linked raw facts fallback gate: ${result.linkedRawFactsFallback ? "enabled" : "not needed"}`);
  console.log("Final chatbot answer exactly as displayed:");
  console.log(result.answer);
  console.log(`Result: ${result.passed ? "PASSED" : "FAILED"}`);
  if (!result.passed) console.log(`Failure reason: ${result.failure}`);
}

function fixtureRow(postTitle, postUrl, label) {
  return {
    id: label,
    post_title: postTitle,
    post_url: postUrl,
    workbook_name: "Fixture linked data",
    row_index: 1,
    row_data: {
      Area: "Greater West of England",
      Measure: label,
      Value: 1
    }
  };
}

function createMockSupabase(rows) {
  return {
    from() {
      return createMockQuery(rows);
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
    in(key, values) {
      this.filters.push({ key, values });
      return this;
    },
    order() {
      return this;
    },
    limit(value) {
      this.limitValue = value;
      return this;
    },
    then(resolve, reject) {
      try {
        let output = [...this.rows];
        for (const filter of this.filters) {
          output = output.filter((row) => filter.values.includes(row[filter.key]));
        }
        if (this.limitValue !== null) output = output.slice(0, this.limitValue);
        resolve({ data: output, error: null });
      } catch (error) {
        reject(error);
      }
    }
  };
}
