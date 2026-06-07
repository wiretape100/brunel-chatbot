import assert from "node:assert/strict";
import {
  buildCatalogueAnswer,
  buildDataHubCatalogueAnswer,
  detectDataHubCatalogueIntent
} from "../lib/datahub-catalogue.js";

function urlsFromAnswer(answer, section) {
  return [...String(answer || "").matchAll(new RegExp(`\\]\\((https://www\\.thebrunelcentre\\.co\\.uk/${section}/[^\\s)]+)\\)`, "g"))]
    .map((match) => normalizeUrl(match[1]));
}

function markdownLinksFromAnswer(answer) {
  return [...String(answer || "").matchAll(/\[([^\]]+)\]\((https:\/\/www\.thebrunelcentre\.co\.uk\/[^\s)]+)\)/g)]
    .map((match) => ({ title: match[1], url: normalizeUrl(match[2]) }));
}

function normalizeUrl(url) {
  return String(url || "")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")")
    .replace(/[.,;]+$/, "");
}

function assertCataloguePresentation(result) {
  assert.equal(result.suppressSourceLinks, true, "Catalogue answers should suppress bottom source links");
  assert.equal(result.sources.length, 0, "Catalogue answers should not append duplicate source cards");
  assert.ok(!/—\s*https?:\/\//.test(result.answer), "Raw URLs should not be displayed after a dash");
  assert.ok(!/â€”\s*https?:\/\//.test(result.answer), "Mojibake dash raw URLs should not be displayed");
  assert.ok(!/-\s*https?:\/\//.test(result.answer), "Raw URL-only bullets should not be displayed");
  assert.ok(markdownLinksFromAnswer(result.answer).length > 0, "Expected clickable Markdown links");
}

{
  const valueQuestions = [
    "What is the employment rate of the Greater West of England?",
    "Can you tell me the employment rate of the Greater West of England?",
    "What is the housing affordability ratio in Bristol?",
    "What is the GDP of the Greater West of England?",
    "What is the GVA by industry?",
    "What is the NEET rate?",
    "What is the emissions total by local authority?",
    "What is the population of Wiltshire?",
    "What are business counts by industry?",
    "What is the average travel time?",
    "How many people were employed?",
    "What are the local authority values?"
  ];

  for (const message of valueQuestions) {
    assert.equal(
      detectDataHubCatalogueIntent(message),
      null,
      `Specific value question should not trigger Data Hub catalogue mode: ${message}`
    );
    assert.equal(
      await buildCatalogueAnswer({ message, history: [] }),
      null,
      `Specific value question should not return a catalogue answer: ${message}`
    );
  }
}

{
  const intent = detectDataHubCatalogueIntent("What Data Hub insights are available for the Greater West of England?");
  assert.equal(intent.kind, "initial");
  assert.equal(intent.type, "dataHub");

  const result = await buildCatalogueAnswer({
    message: "What Data Hub insights are available for the Greater West of England?",
    history: []
  });

  assert.ok(result.answer.includes("Here are some Data Hub insights I found"));
  assert.ok(result.answer.includes("This is not the full list"));
  assert.ok(/show more/i.test(result.answer));
  assert.ok(/narrow it by topic/i.test(result.answer));
  assert.ok(/\[Data Hub insights\]\(https:\/\/www\.thebrunelcentre\.co\.uk\/data-hub\)/.test(result.answer));
  assertCataloguePresentation(result);
  assert.ok(urlsFromAnswer(result.answer, "data-hub").length <= 8, "Expected first Data Hub batch to stay concise");
}

{
  const first = await buildDataHubCatalogueAnswer({
    message: "What Data Hub insights are available for the Greater West of England?",
    history: []
  });
  const second = await buildCatalogueAnswer({
    message: "show more",
    history: [
      { role: "user", content: "What Data Hub insights are available for the Greater West of England?" },
      { role: "assistant", content: first.answer }
    ]
  });
  const firstUrls = new Set(urlsFromAnswer(first.answer, "data-hub"));
  const secondUrls = urlsFromAnswer(second.answer, "data-hub");
  assert.ok(secondUrls.length > 0, "Expected second Data Hub batch URLs");
  assert.ok(secondUrls.every((url) => !firstUrls.has(url)), "Data Hub show more should not repeat first batch URLs");
  assertCataloguePresentation(second);
}

{
  const result = await buildCatalogueAnswer({ message: "Show housing Data Hub posts", history: [] });
  assert.ok(/housing|affordability|house|dwellings/i.test(result.answer), result.answer);
  assert.ok(!/Training and workforce development/i.test(result.answer), "Housing filter should not include unrelated skills post");
  assertCataloguePresentation(result);
}

{
  const result = await buildCatalogueAnswer({ message: "Show employment Data Hub posts", history: [] });
  assert.ok(/employment|skills|labour|training|wages/i.test(result.answer), result.answer);
  assertCataloguePresentation(result);
}

{
  const result = await buildCatalogueAnswer({ message: "Could you list the research articles in the Centre?", history: [] });
  assert.ok(result.answer.includes("Here are some Brunel Centre research articles I found"));
  assert.ok(!/does not yet provide a full list/i.test(result.answer), "Research catalogue should not use poor fallback wording");
  assert.ok(!/one by one/i.test(result.answer), "Research catalogue should not offer to list one by one");
  assert.ok(/\[Brunel Centre research\]\(https:\/\/www\.thebrunelcentre\.co\.uk\/research\)/.test(result.answer));
  assert.ok(urlsFromAnswer(result.answer, "research").length <= 8, "Expected first research batch to stay concise");
  assertCataloguePresentation(result);
}

{
  const first = await buildCatalogueAnswer({
    message: "Could you list the research articles in the Centre?",
    history: []
  });
  const second = await buildCatalogueAnswer({
    message: "more articles",
    history: [
      { role: "user", content: "Could you list the research articles in the Centre?" },
      { role: "assistant", content: first.answer }
    ]
  });
  const firstUrls = new Set(urlsFromAnswer(first.answer, "research"));
  const secondUrls = urlsFromAnswer(second.answer, "research");
  assert.ok(secondUrls.length > 0, "Expected second research batch URLs");
  assert.ok(secondUrls.every((url) => !firstUrls.has(url)), "Research show more should not repeat first batch URLs");
  assertCataloguePresentation(second);
}

{
  const result = await buildCatalogueAnswer({ message: "What skills research is available?", history: [] });
  assert.ok(/skills|training|workforce|education/i.test(result.answer), result.answer);
  assertCataloguePresentation(result);
}

{
  const result = await buildCatalogueAnswer({
    message: "Could you list the policy articles from the Brunel Centre?",
    history: []
  });
  assert.ok(result.answer.includes("I couldn't find a dedicated set of policy articles"));
  assert.ok(/\[Brunel Centre research\]\(https:\/\/www\.thebrunelcentre\.co\.uk\/research\)/.test(result.answer));
  assert.ok(!/About the Brunel Centre|Consultancy|The Brunel Centre homepage/.test(result.answer));
  assert.equal(result.suppressSourceLinks, true);
  assert.equal(result.sources.length, 0);
}

{
  const policy = await buildCatalogueAnswer({
    message: "Could you list the policy articles from the Brunel Centre?",
    history: []
  });
  const more = await buildCatalogueAnswer({
    message: "show more",
    history: [{ role: "assistant", content: policy.answer }]
  });
  assert.ok(/What would you like me to show more of/.test(more.answer));
  assert.ok(/policy-related research topics/.test(more.answer));
}

{
  const result = await buildCatalogueAnswer({ message: "show more", history: [] });
  assert.ok(/What would you like me to show more of/.test(result.answer));
  assert.equal(result.suppressSourceLinks, true);
  assert.equal(result.sources.length, 0);
}

{
  const result = await buildCatalogueAnswer({
    message: "show more",
    history: [
      {
        role: "assistant",
        content: "Hello, I'm the Brunel Centre assistant. I can help with Brunel Centre research, Data Hub insights and the regional economy. What would you like to explore?"
      }
    ]
  });
  assert.ok(/What would you like me to show more of/.test(result.answer));
  assert.ok(!/Here are more Brunel Centre research articles/i.test(result.answer));
}

{
  const catalogue = await buildCatalogueAnswer({
    message: "Could you list the research articles in the Centre?",
    history: []
  });
  const acknowledgementThenMore = await buildCatalogueAnswer({
    message: "show more",
    history: [
      { role: "assistant", content: catalogue.answer },
      { role: "user", content: "that's great" },
      { role: "assistant", content: "Glad that helped. What would you like to explore next?" }
    ]
  });
  assert.ok(/What would you like me to show more of/.test(acknowledgementThenMore.answer));
  assert.ok(!/Here are more Brunel Centre research articles/i.test(acknowledgementThenMore.answer));
}

{
  const result = await buildCatalogueAnswer({ message: "Show more Data Hub posts", history: [] });
  assert.ok(result.answer.includes("Here are some Data Hub insights I found"));
  assertCataloguePresentation(result);
}

{
  const result = await buildCatalogueAnswer({ message: "Show more Data Hub insights", history: [] });
  assert.ok(result.answer.includes("Here are some Data Hub insights I found"));
  assertCataloguePresentation(result);
}

{
  const result = await buildCatalogueAnswer({ message: "Show more research articles", history: [] });
  assert.ok(result.answer.includes("Here are some Brunel Centre research articles I found"));
  assertCataloguePresentation(result);
}

{
  const result = await buildCatalogueAnswer({ message: "Show more productivity insights", history: [] });
  assert.ok(result.answer.includes("productivity Data Hub insights"));
  assertCataloguePresentation(result);
}

console.log("Catalogue tests passed.");
