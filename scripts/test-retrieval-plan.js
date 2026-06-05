import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRetrievalPlan, extractConcepts, mergeSearchResults } from "../lib/retrieval.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function planFor(message) {
  return buildRetrievalPlan({ message, primaryQuery: message });
}

function queryText(plan) {
  return plan.searchQueries.join("\n").toLowerCase();
}

function assertIncludesAll(value, terms) {
  for (const term of terms) {
    assert.ok(value.includes(term), `Expected query plan to include "${term}".\n\n${value}`);
  }
}

{
  const sources = JSON.parse(fs.readFileSync(path.join(root, "content", "sources.json"), "utf8").replace(/^\uFEFF/, ""));
  const source = sources.find((item) =>
    item.url === "https://www.thebrunelcentre.co.uk/data-hub/greater-west-of-england-productivity-(gva)-by-industry-group-(current-prices)-2023"
  );
  assert.ok(source, "GVA/productivity by industry group page should be present in content/sources.json");
}

{
  const plan = planFor("Want to explore the data related to GDP and GVA");
  const text = queryText(plan);
  assert.deepEqual(extractConcepts("Want to explore the data related to GDP and GVA"), ["gdp", "gva"]);
  assert.equal(plan.isMultiConcept, true);
  assertIncludesAll(text, ["gdp", "gva", "gross domestic product", "gross value added", "gdp per head", "gva by industry group", "productivity"]);

  const merged = mergeSearchResults([
    [{ title: "Gross domestic product (GDP) in the Greater West of England", url: "/data-hub/gdp", similarity: 0.9 }],
    [{ title: "Greater West of England productivity (GVA) by industry group (current prices), 2023", url: "/data-hub/gva", similarity: 0.82 }]
  ], { concepts: plan.concepts, query: "GDP and GVA", limit: 2 });
  assert.equal(merged.length, 2);
  assert.ok(merged.some((item) => item.title.includes("GDP")));
  assert.ok(merged.some((item) => item.title.includes("GVA")));
}

{
  const plan = planFor("Do you have GVA data?");
  const text = queryText(plan);
  assert.equal(plan.isMultiConcept, false);
  assertIncludesAll(text, ["gva", "gross value added", "gva by industry group", "current prices"]);
}

{
  const plan = planFor("Show me productivity by industry");
  assertIncludesAll(queryText(plan), ["productivity", "gva", "industry"]);
}

{
  const plan = planFor("Show me employment and wages");
  assert.equal(plan.isMultiConcept, true);
  assertIncludesAll(queryText(plan), ["employment", "employment rate", "wages", "earnings"]);
}

{
  const plan = planFor("Tell me about skills and productivity");
  assert.equal(plan.isMultiConcept, true);
  assertIncludesAll(queryText(plan), ["skills", "qualifications", "productivity", "gva"]);
}

{
  const plan = planFor("Compare emissions and energy consumption");
  assert.equal(plan.isMultiConcept, true);
  assertIncludesAll(queryText(plan), ["emissions", "greenhouse gas emissions", "energy consumption", "electricity"]);
}

{
  const plan = planFor("What does the Strategic Economic Audit say about sectors and productivity?");
  assert.equal(plan.isMultiConcept, true);
  assertIncludesAll(queryText(plan), ["sector", "productivity"]);
}

console.log("Retrieval plan tests passed.");
