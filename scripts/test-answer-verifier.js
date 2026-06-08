import assert from "node:assert/strict";
import { verifyAnswer } from "../lib/answer-verifier.js";
import { buildQuestionPlan } from "../lib/question-planner.js";

const EMPLOYMENT_SOURCE = {
  title: "Employment rates in the Greater West of England compared to other UK regions",
  url: "https://www.thebrunelcentre.co.uk/data-hub/employment-rates-in-the-greater-west-of-england-compared-to-other-uk-regions"
};

{
  const plan = buildQuestionPlan({ message: "Can you give me the employment count?" });
  const result = verifyAnswer({
    answer: "Workbook: employment.xlsx\nSheet: raw_data\nThe employment count is 10,000.",
    plan,
    sources: [EMPLOYMENT_SOURCE]
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.includes("backendDetailsExposed"));
  assert.match(result.repairedAnswer, /could not verify the requested count/i);
}

{
  const plan = buildQuestionPlan({ message: "Which workbook and sheet did that come from?" });
  const result = verifyAnswer({
    answer: "Workbook: employment.xlsx. Sheet: analysis_data.",
    plan,
    sources: [EMPLOYMENT_SOURCE]
  });

  assert.equal(result.ok, true);
}

{
  const plan = buildQuestionPlan({
    message: "What is the employment rate of the Greater West of England and the local authorities within it?"
  });
  const result = verifyAnswer({
    answer: [
      "Using the latest available Brunel Centre source, the employment rate for the Greater West of England for 2025 is **80.8%**.",
      "",
      "The employment rates for local authorities within the Greater West of England are:",
      "",
      "- Bath and North East Somerset: **75.3%**.",
      "- Bristol, City of: **79.5%**.",
      "- Gloucestershire: **82.0%**.",
      "- North Somerset: **82.1%**.",
      "- South Gloucestershire: **82.9%**.",
      "- Swindon: **76.9%**.",
      "- Wiltshire: **83.1%**.",
      "",
      "Source: Employment rates in the Greater West of England compared to other UK regions."
    ].join("\n"),
    plan,
    sources: [EMPLOYMENT_SOURCE]
  });

  assert.equal(result.ok, true);
  assert.equal(result.parts.aggregate.verified, true);
  assert.equal(result.parts.breakdown.verified, true);
}

{
  const plan = buildQuestionPlan({
    message: "What is the employment rate of the Greater West of England and the local authorities within it?"
  });
  const result = verifyAnswer({
    answer: "Bath and North East Somerset: 75.3%. Bristol, City of: 79.5%. Gloucestershire: 82.0%. Source: Employment rates in the Greater West of England compared to other UK regions.",
    plan,
    sources: [EMPLOYMENT_SOURCE]
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.includes("aggregateMissingNotExplained"));
  assert.match(result.repairedAnswer, /Bath and North East Somerset: 75\.3%/);
  assert.match(result.repairedAnswer, /could not find the Greater West of England aggregate value/i);
}

{
  const plan = buildQuestionPlan({
    message: "What is the employment rate of the Greater West of England and the local authorities within it?"
  });
  const result = verifyAnswer({
    answer: "The employment rate for the Greater West of England for 2025 is 80.8%. Source: Employment rates in the Greater West of England compared to other UK regions.",
    plan,
    sources: [EMPLOYMENT_SOURCE]
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.includes("breakdownMissingNotExplained"));
  assert.match(result.repairedAnswer, /80\.8%/);
  assert.match(result.repairedAnswer, /could not find the requested breakdown/i);
}

{
  const plan = buildQuestionPlan({
    message: "What is the employment rate of the Greater West of England and the local authorities within it?"
  });
  const result = verifyAnswer({
    answer: "The available source discusses employment rates, but no requested values were found.",
    plan,
    sources: [EMPLOYMENT_SOURCE]
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.includes("aggregatePlusBreakdownNoVerifiedParts"));
  assert.match(result.repairedAnswer, /do not provide the requested aggregate value or breakdown values/i);
}

{
  const plan = buildQuestionPlan({ message: "Can you give me the employment count?" });
  const result = verifyAnswer({
    answer: "The employment count is based on the NEET cohort of young people.",
    plan,
    sources: [EMPLOYMENT_SOURCE]
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.includes("employmentCountUsedNeet"));
}

{
  const plan = buildQuestionPlan({ message: "Give me housing affordability ratios for all local authorities." });
  const result = verifyAnswer({
    answer: "The linked data gives housing stock and dwelling counts by local authority.",
    plan,
    sources: []
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.includes("housingAffordabilityUsedHousingStock"));
}

{
  const plan = buildQuestionPlan({ message: "Do you have emissions totals for the Greater West of England?" });
  const result = verifyAnswer({
    answer: "The energy consumption value is 123 GWh.",
    plan,
    sources: []
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.includes("emissionsUsedEnergyConsumption"));
}

{
  const plan = buildQuestionPlan({ message: "Calculate the overall rate from local authority percentages." });
  const result = verifyAnswer({
    answer: "The overall rate is 50%, calculated by averaging the local authority percentages.",
    plan,
    sources: []
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.includes("unsupportedPercentageAverage"));
  assert.match(result.repairedAnswer, /will not calculate an aggregate by averaging percentages/i);
}

{
  const plan = buildQuestionPlan({ message: "Calculate the overall rate from local authority percentages." });
  const result = verifyAnswer({
    answer: "I could not verify a valid calculation. I will not average the published percentages.",
    plan,
    sources: []
  });

  assert.equal(result.ok, true);
}

{
  const plan = buildQuestionPlan({ message: "What is the housing affordability ratio for the Greater West of England and local authorities?" });
  const result = verifyAnswer({
    answer: [
      "The housing affordability ratio for the Greater West of England for 2024 is 8.4.",
      "",
      "The local authority breakdown is:",
      "- Bath and North East Somerset: 10.1.",
      "- Bristol, City of: 9.2."
    ].join("\n"),
    plan,
    sources: []
  });

  assert.equal(result.ok, true);
  assert.equal(result.parts.aggregate.verified, true);
  assert.equal(result.parts.breakdown.verified, true);
}

{
  const plan = buildQuestionPlan({ message: "What are greenhouse gas emissions for the Greater West of England and by local authority?" });
  const result = verifyAnswer({
    answer: [
      "Greenhouse gas emissions for the Greater West of England in 2023 are 12,000 ktCO2e.",
      "",
      "The local authority breakdown is:",
      "- Gloucestershire: 2,632 ktCO2e.",
      "- Wiltshire: 2,116 ktCO2e."
    ].join("\n"),
    plan,
    sources: []
  });

  assert.equal(result.ok, true);
  assert.equal(result.parts.aggregate.verified, true);
  assert.equal(result.parts.breakdown.verified, true);
  assert.doesNotMatch(result.repairedAnswer, /energy consumption/i);
}

console.log("Answer verifier tests passed");
