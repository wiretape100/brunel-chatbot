import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalogueAnswer } from "../lib/datahub-catalogue.js";
import { buildRetrievalPlan, mergeSearchResults } from "../lib/retrieval.js";
import {
  inferSourceType,
  normalizeSourceRecord,
  normalizeSourceUrl
} from "../lib/source-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sources = JSON.parse(fs.readFileSync(path.join(root, "content", "sources.json"), "utf8").replace(/^\uFEFF/, ""))
  .map(normalizeSourceRecord);

const results = [];

await runCase({
  name: "Homepage headline statistic",
  question: "Do you have annual GVA growth?",
  flow: "normal Q&A whole-site document retrieval",
  build: async () => {
    const message = "Do you have annual GVA growth?";
    const retrievalPlan = buildRetrievalPlan({ message, primaryQuery: message });
    const selected = mergeSearchResults([
      [
        {
          id: "home",
          source_type: "homePage",
          title: "The Brunel Centre homepage",
          url: "https://www.thebrunelcentre.co.uk/",
          content: "Homepage headline statistic cards include Annual GVA growth: 1.42%.",
          similarity: 0.78
        },
        {
          id: "data-hub-gva",
          source_type: "dataHubPost",
          title: "Greater West of England productivity (GVA) by industry group",
          url: "https://www.thebrunelcentre.co.uk/data-hub/greater-west-of-england-productivity-gva-by-industry-group-current-prices-2023",
          content: "A Data Hub post about GVA by industry group.",
          similarity: 0.72
        }
      ]
    ], {
      concepts: retrievalPlan.concepts,
      query: message,
      limit: 5,
      preferDataHub: false
    });

    assert.equal(selected[0].source_type, "homePage", "Normal Q&A should allow homepage/stat-card content to win when it is most relevant");
    return {
      flow: "normal Q&A whole-site document retrieval",
      sourceTitle: selected[0].title,
      sourceType: selected[0].source_type,
      answer: [
        "Yes. The Brunel Centre homepage headline statistics include annual GVA growth of **1.42%**.",
        "",
        "Source: The Brunel Centre homepage."
      ].join("\n")
    };
  },
  assertResult: (result) => {
    assert.equal(result.sourceType, "homePage");
    assert.match(result.answer, /1\.42%/);
    assert.doesNotMatch(result.answer, /Data Hub insights I found/i);
  }
});

await runCase({
  name: "Generic page Q&A",
  question: "What does the Brunel Centre do?",
  flow: "normal Q&A whole-site document retrieval",
  build: async () => {
    const message = "What does the Brunel Centre do?";
    const retrievalPlan = buildRetrievalPlan({ message, primaryQuery: message });
    const selected = mergeSearchResults([
      [
        {
          id: "about",
          source_type: "genericPage",
          title: "About the Brunel Centre",
          url: "https://www.thebrunelcentre.co.uk/about-us",
          content: "The Brunel Centre provides evidence, insight, data and analysis on the regional economy.",
          similarity: 0.8
        },
        {
          id: "research",
          source_type: "researchLanding",
          title: "Research landing page",
          url: "https://www.thebrunelcentre.co.uk/research",
          content: "Research articles from the Brunel Centre.",
          similarity: 0.58
        }
      ]
    ], {
      concepts: retrievalPlan.concepts,
      query: message,
      limit: 5,
      preferDataHub: false
    });

    assert.equal(selected[0].source_type, "genericPage", "Normal Q&A should use generic pages when they are the best source");
    return {
      flow: "normal Q&A whole-site document retrieval",
      sourceTitle: selected[0].title,
      sourceType: selected[0].source_type,
      answer: [
        "The Brunel Centre provides evidence, insight, data and analysis on the regional economy.",
        "",
        "Source: About the Brunel Centre."
      ].join("\n")
    };
  },
  assertResult: (result) => {
    assert.equal(result.sourceType, "genericPage");
    assert.match(result.answer, /evidence, insight, data and analysis/i);
  }
});

await runCase({
  name: "Data Hub catalogue remains restricted",
  question: "What Data Hub insights are available?",
  flow: "Data Hub catalogue source-type filter",
  build: async () => {
    const result = await buildCatalogueAnswer({
      message: "What Data Hub insights are available?",
      history: []
    });
    const urls = catalogueItemUrls(result.answer);
    assert.ok(urls.length > 0, "Expected Data Hub catalogue links");
    for (const url of urls) {
      const source = sourceByUrl(url);
      assert.ok(source, `Expected source record for ${url}`);
      assert.equal(inferSourceType(source), "dataHubPost", url);
    }
    assert.doesNotMatch(result.answer, /The Brunel Centre homepage|About the Brunel Centre|Consultancy/);
    return {
      flow: "Data Hub catalogue source-type filter",
      sourceTitle: "Data Hub catalogue",
      sourceType: "dataHubPost only",
      answer: result.answer
    };
  },
  assertResult: (result) => {
    assert.match(result.answer, /Data Hub insights I found/i);
  }
});

await runCase({
  name: "Research catalogue remains restricted",
  question: "List the research articles.",
  flow: "Research catalogue source-type filter",
  build: async () => {
    const result = await buildCatalogueAnswer({
      message: "List the research articles.",
      history: []
    });
    const urls = catalogueItemUrls(result.answer);
    assert.ok(urls.length > 0, "Expected research catalogue links");
    for (const url of urls) {
      const source = sourceByUrl(url);
      assert.ok(source, `Expected source record for ${url}`);
      assert.equal(inferSourceType(source), "researchArticle", url);
    }
    assert.doesNotMatch(result.answer, /The Brunel Centre homepage|Data Hub landing page|About the Brunel Centre|Consultancy/);
    return {
      flow: "Research catalogue source-type filter",
      sourceTitle: "Research catalogue",
      sourceType: "researchArticle only",
      answer: result.answer
    };
  },
  assertResult: (result) => {
    assert.match(result.answer, /research articles I found/i);
  }
});

await runCase({
  name: "Future policy and news support",
  question: "Can normal Q&A use future policy and news sources?",
  flow: "source-type inference for future indexed source records",
  build: async () => {
    const policyPage = {
      id: "policy-insights",
      title: "Policy insights",
      url: "https://www.thebrunelcentre.co.uk/policy",
      tags: ["policy"]
    };
    const policyArticle = {
      id: "policy-housing",
      title: "Housing policy insight",
      url: "https://www.thebrunelcentre.co.uk/policy/housing",
      tags: ["policy"]
    };
    const newsArticle = {
      id: "news-launch",
      title: "Brunel Centre launch news",
      url: "https://www.thebrunelcentre.co.uk/news/launch",
      tags: ["news"]
    };

    assert.equal(inferSourceType(policyPage), "policyPage");
    assert.equal(inferSourceType(policyArticle), "policyArticle");
    assert.equal(inferSourceType(newsArticle), "newsArticle");

    return {
      flow: "source-type inference for future indexed source records",
      sourceTitle: "Policy/news source registry",
      sourceType: "policyPage, policyArticle, newsArticle",
      answer: [
        "Future indexed policy and news records can be used by normal Q&A when they are relevant.",
        "",
        "Catalogue mode can still filter them by source type instead of mixing them into Data Hub or Research article lists."
      ].join("\n")
    };
  },
  assertResult: (result) => {
    assert.match(result.answer, /normal Q&A/i);
  }
});

for (const result of results) printResult(result);

const failed = results.filter((result) => !result.passed);
if (failed.length) {
  process.exitCode = 1;
} else {
  console.log("\nAll whole-site source-selection tests passed.");
}

async function runCase({ name, question, flow, build, assertResult }) {
  let result = {
    name,
    question,
    flow,
    sourceTitle: "",
    sourceType: "",
    answer: "",
    passed: false,
    failure: ""
  };

  try {
    const built = await build();
    result = { ...result, ...built };
    assert.ok(result.answer, "Expected an answer");
    assertResult(result);
    result.passed = true;
  } catch (error) {
    result.failure = error?.message || String(error);
  }

  results.push(result);
}

function printResult(result) {
  console.log("\n============================================================");
  console.log(`Test: ${result.name}`);
  console.log(`User question: ${result.question}`);
  console.log(`Handler/flow used: ${result.flow}`);
  console.log(`Retrieved source/article title: ${result.sourceTitle || "n/a"}`);
  console.log(`Source type: ${result.sourceType || "n/a"}`);
  console.log("Final chatbot answer exactly as displayed:");
  console.log(result.answer || "[no answer produced]");
  console.log(`Result: ${result.passed ? "PASSED" : "FAILED"}`);
  if (!result.passed) console.log(`Failure reason: ${result.failure}`);
}

function sourceByUrl(url) {
  const normalized = normalizeSourceUrl(url);
  return sources.find((source) => normalizeSourceUrl(source.url) === normalized);
}

function catalogueItemUrls(answer) {
  return [...String(answer || "").matchAll(/^\s*-\s+\[[^\]]+\]\((https:\/\/www\.thebrunelcentre\.co\.uk\/[^\s)]+)\)/gm)]
    .map((match) => match[1].replace(/%28/g, "(").replace(/%29/g, ")"));
}
