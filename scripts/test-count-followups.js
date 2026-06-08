import assert from "node:assert/strict";
import { verifyAnswer } from "../lib/answer-verifier.js";
import { buildQuestionPlan } from "../lib/question-planner.js";
import { shouldUseHistoryForRetrieval } from "../lib/retrieval-context.js";
import { buildStatisticalAnswer } from "../lib/statistics.js";

const EMPLOYMENT_POST_TITLE = "Employment rates in the Greater West of England compared to other UK regions";
const EMPLOYMENT_POST_URL = "https://www.thebrunelcentre.co.uk/data-hub/employment-rates-in-the-greater-west-of-england-compared-to-other-uk-regions";
const EMPLOYMENT_POST_SLUG = "employment-rates-in-the-greater-west-of-england-compared-to-other-uk-regions";
const SEX_AGE_POST_SLUG = "employment-rates-in-the-greater-west-of-england-by-sex-and-age-2025";

{
  const supabase = createMockSupabase({
    rows: employmentRows({ includeCounts: false }),
    facts: [],
    documents: employmentDocuments()
  });
  const result = await buildStatisticalAnswer({
    supabase,
    message: "What is the employment rate of the Greater West of England?",
    contextMessage: "What is the employment rate of the Greater West of England?"
  });

  assert.ok(result, "Expected deterministic Greater West employment-rate answer");
  assert.match(result.answer, /employment rate for the Greater West of England for 2025 is \*\*80\.8%\*\*/i);
  assert.doesNotMatch(result.answer, /\bwas\s+\*\*?80\.8%/i);
  assert.doesNotMatch(result.answer, /Here are some employment Data Hub insights/i);
  assert.deepEqual(result.sources, [
    {
      title: EMPLOYMENT_POST_TITLE,
      url: EMPLOYMENT_POST_URL,
      similarity: null
    }
  ]);
}

{
  const supabase = createMockSupabase({
    rows: employmentRows({ includeCounts: false }),
    facts: [],
    documents: employmentDocuments()
  });
  const message = "Do you have any numbers on inward investment?";
  const previousEmploymentContext = [
    "User: What is the employment rate of the Greater West of England?",
    `Assistant: The employment rate for the Greater West of England for 2025 is 80.8%. Source: ${EMPLOYMENT_POST_TITLE}.`,
    "User: Can you give me the employment count?",
    "Assistant: I found the employment rate in the Brunel Centre source, but I could not find a matching employment count in the article or linked data for that source."
  ].join("\n");

  assert.equal(shouldUseHistoryForRetrieval(message), false, "Inward investment should reset employment context");
  const result = await buildStatisticalAnswer({
    supabase,
    message,
    contextMessage: message
  });

  assert.equal(result, null, "Inward investment should not trigger deterministic employment fallback");
  assert.match(previousEmploymentContext, /employment rate/i);
}

{
  const supabase = createMockSupabase({
    rows: employmentRows({ includeCounts: false }),
    facts: [],
    documents: employmentDocuments()
  });
  const message = "What's the employment rate for the Greater West of England and also the local authorities within the Greater West of England?";
  const result = await buildStatisticalAnswer({
    supabase,
    message,
    contextMessage: message
  });
  const plan = buildQuestionPlan({ message });
  const verified = verifyAnswer({
    answer: result?.answer,
    plan,
    sources: result?.sources || []
  });

  assert.ok(result, "Expected aggregate-plus-breakdown answer for exact user wording");
  assert.equal(verified.ok, true, "Aggregate-plus-breakdown employment answer should verify");
  assert.doesNotMatch(result.answer, /could not verify both the aggregate value/i);
  assert.match(result.answer, /Greater West of England for 2025 is \*\*80\.8%\*\*/i);
  assert.match(result.answer, /Bath and North East Somerset: \*\*75\.3%\*\*/);
  assert.match(result.answer, /Bristol, City of: \*\*79\.5%\*\*/);
  assert.match(result.answer, /Gloucestershire: \*\*82\.0%\*\*/);
  assert.match(result.answer, /North Somerset: \*\*82\.1%\*\*/);
  assert.match(result.answer, /South Gloucestershire: \*\*82\.9%\*\*/);
  assert.match(result.answer, /Swindon: \*\*76\.9%\*\*/);
  assert.match(result.answer, /Wiltshire: \*\*83\.1%\*\*/);
  assert.equal(result.sources[0].title, EMPLOYMENT_POST_TITLE);
}

{
  const supabase = createMockSupabase({
    rows: employmentRows({ includeCounts: false }),
    facts: [],
    documents: employmentDocuments()
  });
  const result = await buildStatisticalAnswer({
    supabase,
    message: "Can you tell me the employment rate of the Greater West of England?",
    contextMessage: "Can you tell me the employment rate of the Greater West of England?"
  });

  assert.ok(result, "Expected deterministic Greater West employment-rate answer for wording variant");
  assert.match(result.answer, /80\.8%/);
  assert.doesNotMatch(result.answer, /Data Hub insights I found/i);
}

{
  const supabase = createMockSupabase({
    rows: employmentRows({ includeCounts: false }),
    facts: [],
    documents: employmentDocuments()
  });
  const message = "What is employment rate of the Greater West of England and could you also provide me with the employment rate of the local authorities located within the Greater West of England as well";
  const result = await buildStatisticalAnswer({
    supabase,
    message,
    contextMessage: message
  });

  assert.ok(result, "Expected aggregate-plus-breakdown employment-rate answer");
  assert.match(result.answer, /Greater West of England for 2025 is \*\*80\.8%\*\*/i);
  assert.match(result.answer, /local authorities within the Greater West of England/i);
  assert.match(result.answer, /Bath and North East Somerset: \*\*75\.3%\*\*/);
  assert.match(result.answer, /Bristol, City of: \*\*79\.5%\*\*/);
  assert.match(result.answer, /Wiltshire: \*\*83\.1%\*\*/);
  assert.doesNotMatch(result.answer, /average/i);
  assert.equal(result.sources[0].title, EMPLOYMENT_POST_TITLE);
}

{
  const supabase = createMockSupabase({
    rows: employmentRows({ includeCounts: false }),
    facts: [],
    documents: employmentDocuments()
  });
  const result = await buildStatisticalAnswer({
    supabase,
    message: "What are the employment rates for local authorities within the Greater West of England?",
    contextMessage: "What are the employment rates for local authorities within the Greater West of England?"
  });

  assert.ok(result, "Expected local-authority-only employment-rate answer");
  assert.match(result.answer, /Bath and North East Somerset: \*\*75\.3%\*\*/);
  assert.doesNotMatch(result.answer, /Greater West of England: \*\*80\.8%\*\*/);
  assert.doesNotMatch(result.answer, /Greater West of England for 2025 is \*\*80\.8%\*\*/);
}

{
  const supabase = createMockSupabase({
    rows: employmentRows({ includeCounts: false }),
    facts: [],
    documents: employmentDocuments()
  });
  const result = await buildStatisticalAnswer({
    supabase,
    message: "Can you give me the counts of the employment?",
    contextMessage: [
      "User: Can you tell what's the employment rate in the greater west of england",
      `Assistant: Using the latest complete year available in the Brunel Centre data (2025). Source: ${EMPLOYMENT_POST_TITLE}.`,
      "User: Can you tell me what's the employment rates of all local authorities within greater west of england?",
      "Assistant: Bath and North East Somerset: 75.3%. Bristol, City of: 79.5%. Gloucestershire: 82.0%. North Somerset: 82.1%. South Gloucestershire: 82.9%. Swindon: 76.9%. Wiltshire: 83.1%."
    ].join("\n")
  });

  assert.ok(result, "Expected deterministic count follow-up answer");
  assert.match(result.answer, /could not find a matching employment count/i);
  assert.doesNotMatch(result.answer, /sex and age/i);
  assert.doesNotMatch(result.answer, /82\.9%|83\.1%/);
  assert.deepEqual(supabase.log.map((item) => item.table), [
    "brunel_documents",
    "brunel_dataset_rows",
    "brunel_dataset_facts"
  ]);
  assert.equal(supabase.log.some((item) => item.table === "brunel_dataset_rows" && item.filters.some((filter) => filter.key === "post_slug" && filter.value === SEX_AGE_POST_SLUG)), false);
}

{
  const supabase = createMockSupabase({
    rows: employmentRows({ includeCounts: false }),
    facts: neetFacts(),
    documents: employmentDocuments()
  });
  const result = await buildStatisticalAnswer({
    supabase,
    message: "Can you also tell me the count of the employment in the Greater West of England?",
    contextMessage: [
      "User: What is the NEET rate of Bristol and Swindon?",
      "Assistant: Bristol, City of: 6.0%. Swindon: 2.8%. Source: NEET and activity not known among 16- and 17-year-olds in the Greater West of England, 2025.",
      "User: Can you tell me the employment rate of the Greater West of England?",
      `Assistant: The employment rate for the Greater West of England for 2025 is 80.8%. Source: ${EMPLOYMENT_POST_TITLE}.`
    ].join("\n")
  });

  assert.ok(result, "Expected source-scoped employment count follow-up answer");
  assert.match(result.answer, /could not find a matching employment count/i);
  assert.match(result.answer, /employment rate/i);
  assert.doesNotMatch(result.answer, /NEET|cohort|young people|activity not known/i);
  assert.doesNotMatch(result.answer, /workbook|sheet|raw_data/i);
  assert.equal(supabase.log.some((item) => item.table === "brunel_dataset_facts" && item.filters.some((filter) => filter.key === "post_slug" && filter.value === EMPLOYMENT_POST_SLUG)), true);
}

{
  const supabase = createMockSupabase({
    rows: employmentRows({ includeCounts: true }),
    facts: [],
    documents: employmentDocuments()
  });
  const result = await buildStatisticalAnswer({
    supabase,
    message: "Can you give me the employment counts by local authority?",
    contextMessage: "Can you give me the employment counts by local authority?"
  });

  assert.ok(result);
  assert.match(result.answer, /employment count/i);
  assert.match(result.answer, /Bath and North East Somerset: \*\*100,000\*\*/);
  assert.match(result.answer, /Wiltshire: \*\*180,000\*\*/);
  assert.doesNotMatch(result.answer, /employment rate only/i);
}

{
  const supabase = createMockSupabase({
    rows: employmentRows({ includeCounts: false }),
    facts: employmentFacts(),
    documents: employmentDocuments()
  });
  const result = await buildStatisticalAnswer({
    supabase,
    message: "How many people were employed in the Greater West of England?",
    contextMessage: "How many people were employed in the Greater West of England?"
  });

  assert.ok(result);
  assert.match(result.answer, /employment count/i);
  assert.match(result.answer, /Bristol, City of: \*\*220,000\*\*/);
  assert.doesNotMatch(result.answer, /79\.5%/);
}

{
  const supabase = createMockSupabase({
    rows: employmentRows({ includeCounts: true }),
    facts: [],
    documents: employmentDocuments()
  });
  const result = await buildStatisticalAnswer({
    supabase,
    message: "What is the employment rate by sex and age?",
    contextMessage: "What is the employment rate by sex and age?"
  });

  assert.equal(result, null, "Sex-and-age employment rate questions should continue to the normal grounded answer flow");
}

{
  const supabase = createMockSupabase({
    rows: employmentRows({ includeCounts: false }),
    facts: [],
    documents: employmentDocuments()
  });
  const result = await buildStatisticalAnswer({
    supabase,
    message: "Can you calculate the overall employment rate from the local authority data?",
    contextMessage: "Can you calculate the overall employment rate from the local authority data?"
  });

  assert.ok(result);
  assert.match(result.answer, /could not calculate an overall employment rate/i);
  assert.match(result.answer, /will not average the published percentages/i);
}

{
  const supabase = createMockSupabase({
    rows: employmentRows({ includeCounts: true }),
    facts: [],
    documents: employmentDocuments()
  });
  const result = await buildStatisticalAnswer({
    supabase,
    message: "Can you calculate the overall employment rate from the local authority data?",
    contextMessage: "Can you calculate the overall employment rate from the local authority data?"
  });

  assert.ok(result);
  assert.match(result.answer, /population-weighted overall employment rate/i);
  assert.match(result.answer, /I did not average the published percentages/i);
}

{
  const supabase = createMockSupabase({
    rows: [],
    facts: neetFacts(),
    documents: []
  });
  const result = await buildStatisticalAnswer({
    supabase,
    message: "Which workbook and sheet did the NEET rate for Bristol come from?",
    contextMessage: "Which workbook and sheet did the NEET rate for Bristol come from?"
  });

  assert.ok(result);
  assert.match(result.answer, /workbook "NEET and activity not known rates among 16- and 17-year-olds, 2025\.xlsx"/i);
  assert.match(result.answer, /sheet "raw_data"/i);
}

console.log("Count follow-up tests passed.");

function employmentDocuments() {
  return [
    {
      title: EMPLOYMENT_POST_TITLE,
      url: EMPLOYMENT_POST_URL,
      content: "The article reports employment rates for the Greater West of England and local authorities."
    }
  ];
}

function employmentRows({ includeCounts }) {
  return [
    row("Greater West of England", 80.8, null, null),
    row("Bath and North East Somerset", 75.3, includeCounts ? 100000 : null, includeCounts ? 132802 : null),
    row("Bristol, City of", 79.5, includeCounts ? 220000 : null, includeCounts ? 276730 : null),
    row("Gloucestershire", 82.0, includeCounts ? 250000 : null, includeCounts ? 304878 : null),
    row("North Somerset", 82.1, includeCounts ? 90000 : null, includeCounts ? 109622 : null),
    row("South Gloucestershire", 82.9, includeCounts ? 140000 : null, includeCounts ? 168878 : null),
    row("Swindon", 76.9, includeCounts ? 95000 : null, includeCounts ? 123537 : null),
    row("Wiltshire", 83.1, includeCounts ? 180000 : null, includeCounts ? 216606 : null),
    {
      post_slug: SEX_AGE_POST_SLUG,
      post_title: "Employment rates in the Greater West of England by sex and age, 2025",
      post_url: "https://www.thebrunelcentre.co.uk/data-hub/employment-rates-in-the-greater-west-of-england-by-sex-and-age-2025",
      workbook_name: "Employment rates by sex and age.xlsx",
      row_data: {
        Area: "Bristol, City of",
        "Employment rate - aged 16-64 percent": 79.5
      }
    }
  ];
}

function row(area, rate, employmentCount, denominator) {
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

function employmentFacts() {
  return [
    fact("Bath and North East Somerset", "Number of people employed", 100000),
    fact("Bristol, City of", "Number of people employed", 220000),
    fact("Gloucestershire", "Number of people employed", 250000),
    fact("North Somerset", "Number of people employed", 90000),
    fact("South Gloucestershire", "Number of people employed", 140000),
    fact("Swindon", "Number of people employed", 95000),
    fact("Wiltshire", "Number of people employed", 180000)
  ];
}

function fact(geography, measure, value) {
  return {
    post_slug: EMPLOYMENT_POST_SLUG,
    post_title: EMPLOYMENT_POST_TITLE,
    post_url: EMPLOYMENT_POST_URL,
    workbook_name: "Local authority employment rates.xlsx",
    sheet_name: "raw_data",
    geography,
    year: 2025,
    measure,
    value,
    value_text: null,
    unit: "count",
    dimensions: {}
  };
}

function neetFacts() {
  return [
    {
      post_slug: "neet-and-activity-not-known-among-16-and-17-year-olds-in-the-greater-west-of-england-2025",
      post_title: "NEET and activity not known among 16- and 17-year-olds in the Greater West of England, 2025",
      post_url: "https://www.thebrunelcentre.co.uk/data-hub/neet-and-activity-not-known-among-16-and-17-year-olds-in-the-greater-west-of-england-2025",
      workbook_path: "neet/NEET and activity not known rates among 16- and 17-year-olds, 2025.xlsx",
      workbook_name: "NEET and activity not known rates among 16- and 17-year-olds, 2025.xlsx",
      sheet_name: "raw_data",
      geography: "Bristol, City of",
      year: 2025,
      measure: "NEET proportion",
      value: 0.06,
      value_text: null,
      unit: "fraction",
      dimensions: {},
      metadata: {}
    },
    {
      post_slug: "neet-and-activity-not-known-among-16-and-17-year-olds-in-the-greater-west-of-england-2025",
      post_title: "NEET and activity not known among 16- and 17-year-olds in the Greater West of England, 2025",
      post_url: "https://www.thebrunelcentre.co.uk/data-hub/neet-and-activity-not-known-among-16-and-17-year-olds-in-the-greater-west-of-england-2025",
      workbook_path: "neet/NEET and activity not known rates among 16- and 17-year-olds, 2025.xlsx",
      workbook_name: "NEET and activity not known rates among 16- and 17-year-olds, 2025.xlsx",
      sheet_name: "raw_data",
      geography: "Bristol, City of",
      year: 2025,
      measure: "Number NEET",
      value: 579,
      value_text: null,
      unit: "count",
      dimensions: {},
      metadata: {}
    },
    {
      post_slug: "neet-and-activity-not-known-among-16-and-17-year-olds-in-the-greater-west-of-england-2025",
      post_title: "NEET and activity not known among 16- and 17-year-olds in the Greater West of England, 2025",
      post_url: "https://www.thebrunelcentre.co.uk/data-hub/neet-and-activity-not-known-among-16-and-17-year-olds-in-the-greater-west-of-england-2025",
      workbook_path: "neet/NEET and activity not known rates among 16- and 17-year-olds, 2025.xlsx",
      workbook_name: "NEET and activity not known rates among 16- and 17-year-olds, 2025.xlsx",
      sheet_name: "raw_data",
      geography: "Bristol, City of",
      year: 2025,
      measure: "Cohort number",
      value: 9690,
      value_text: null,
      unit: "count",
      dimensions: {},
      metadata: {}
    }
  ];
}

function createMockSupabase({ rows, facts, documents }) {
  const data = {
    brunel_dataset_rows: rows,
    brunel_dataset_facts: facts,
    brunel_documents: documents
  };
  const log = [];

  return {
    log,
    from(table) {
      return createMockQuery(table, data[table] || [], log);
    }
  };
}

function createMockQuery(table, rows, log) {
  return {
    table,
    rows,
    log,
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
      this.log.push({
        table: this.table,
        filters: this.filters
      });

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
