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
    answer: "Bath and North East Somerset: 75.3%. Bristol, City of: 79.5%. Source: Employment rates in the Greater West of England compared to other UK regions.",
    plan,
    sources: [EMPLOYMENT_SOURCE]
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.includes("aggregatePlusBreakdownIncomplete"));
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

console.log("Answer verifier tests passed");
