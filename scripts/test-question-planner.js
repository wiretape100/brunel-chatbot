import assert from "node:assert/strict";
import { buildQuestionPlan, planRequiresRawFacts, reasoningEffortForPlan } from "../lib/question-planner.js";

{
  const plan = buildQuestionPlan({
    message: "What is the employment rate of the Greater West of England?"
  });

  assert.equal(plan.intent, "exactStatisticLookup");
  assert.notEqual(plan.intent, "catalogueBrowse");
  assert.equal(plan.indicator, "employment rate");
  assert.equal(plan.measureRequested, "rate");
  assert.equal(plan.geography, "Greater West of England");
  assert.deepEqual(plan.sourceHierarchy, ["article", "analysisRows", "structuredRawFacts", "rawRowFallback"]);
}

{
  const plan = buildQuestionPlan({
    message: "What is the employment rate of the Greater West of England and the local authorities within it?"
  });

  assert.equal(plan.intent, "aggregatePlusBreakdown");
  assert.equal(plan.indicator, "employment rate");
  assert.ok(plan.breakdowns.includes("local authorities"));
  assert.equal(plan.geography, "Greater West of England");
  assert.equal(plan.reasoningEffort, "high");
  assert.equal(planRequiresRawFacts(plan), true);
}

{
  const history = [
    { role: "user", content: "What is the employment rate of the Greater West of England?" },
    { role: "assistant", content: "The employment rate for the Greater West of England for 2025 is 80.8%. Source: Employment rates in the Greater West of England compared to other UK regions." }
  ];
  const plan = buildQuestionPlan({
    message: "Can you give me the count?",
    history
  });

  assert.equal(plan.intent, "countDetailRequest");
  assert.equal(plan.measureRequested, "count");
  assert.equal(plan.previousSourceRequired, true);
  assert.equal(plan.reasoningEffort, "high");
}

{
  const plan = buildQuestionPlan({
    message: "Give me housing affordability ratios for all local authorities."
  });

  assert.equal(plan.intent, "breakdownLookup");
  assert.equal(plan.indicator, "housing affordability ratio");
  assert.equal(plan.measureRequested, "ratio");
  assert.ok(plan.breakdowns.includes("local authorities"));
  assert.notEqual(plan.intent, "catalogueBrowse");
}

{
  const plan = buildQuestionPlan({
    message: "Show GDP and GVA data."
  });

  assert.equal(plan.intent, "exactStatisticLookup");
  assert.ok(plan.topics.includes("GDP"));
  assert.ok(plan.topics.includes("GVA"));
  assert.equal(plan.reasoningEffort, "high");
}

{
  const plan = buildQuestionPlan({
    message: "Which workbook and sheet did that come from?",
    history: [
      { role: "user", content: "What is the NEET rate of Bristol?" },
      { role: "assistant", content: "Bristol, City of: 6.0%." }
    ]
  });

  assert.equal(plan.intent, "methodologyRequest");
  assert.equal(plan.previousSourceRequired, true);
  assert.equal(plan.measureRequested, "methodology");
  assert.equal(plan.reasoningEffort, "high");
}

{
  const plan = buildQuestionPlan({
    message: "Calculate the overall rate from local authority percentages."
  });

  assert.equal(plan.intent, "calculationRequest");
  assert.equal(plan.calculationNeeded, true);
  assert.equal(plan.calculationAllowed, false);
  assert.equal(plan.reasoningEffort, "high");
}

{
  const plan = buildQuestionPlan({ message: "Hello" });
  assert.equal(plan.intent, "smallTalk");
  assert.equal(reasoningEffortForPlan(plan), "none");
}

{
  const plan = buildQuestionPlan({
    message: "Do you have any numbers on inward investment?",
    history: [
      { role: "user", content: "What is the employment rate of the Greater West of England?" },
      { role: "assistant", content: "The employment rate is 80.8%." }
    ]
  });

  assert.equal(plan.previousSourceRequired, false);
  assert.equal(plan.isFollowUp, false);
  assert.ok(plan.topics.includes("inward investment"));
  assert.equal(plan.measureRequested, "count");
}

console.log("Question planner tests passed");
