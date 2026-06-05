import assert from "node:assert/strict";
import { buildDataHubCatalogueAnswer, detectDataHubCatalogueIntent } from "../lib/datahub-catalogue.js";

function urlsFromAnswer(answer) {
  return [...String(answer || "").matchAll(/\]\((https:\/\/www\.thebrunelcentre\.co\.uk\/data-hub\/[^\s)]+)\)/g)]
    .map((match) => normalizeUrl(match[1]));
}

function markdownLinksFromAnswer(answer) {
  return [...String(answer || "").matchAll(/\[([^\]]+)\]\((https:\/\/www\.thebrunelcentre\.co\.uk\/data-hub\/[^\s)]+)\)/g)]
    .map((match) => ({ title: match[1], url: normalizeUrl(match[2]) }));
}

function normalizeUrl(url) {
  return String(url || "")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")")
    .replace(/[.,;]+$/, "");
}

function assertConfirmedSources(result) {
  assert.ok(result.sources.length > 0, "Expected confirmed source records");
  for (const source of result.sources) {
    assert.ok(source.title, "Source should have a title");
    assert.ok(source.url?.startsWith("https://www.thebrunelcentre.co.uk/data-hub/"), `Invalid source URL: ${source.url}`);
  }
}

{
  const intent = detectDataHubCatalogueIntent("What Data Hub insights are available for the Greater West of England?");
  assert.equal(intent.kind, "initial");
  const result = await buildDataHubCatalogueAnswer({
    message: "What Data Hub insights are available for the Greater West of England?",
    history: []
  });
  assert.ok(result.answer.includes("Here are some"));
  assert.ok(result.answer.includes("This is not the full list"));
  assert.ok(/show more/i.test(result.answer));
  assert.ok(/filter/i.test(result.answer));
  assertConfirmedSources(result);
  assert.equal(result.sources.length, 8, "Expected first catalogue batch to stay concise");
  assert.ok(!/—\s*https?:\/\//.test(result.answer), "Raw URLs should not be displayed after a dash");
  assert.ok(!/-\s*https?:\/\//.test(result.answer), "Raw URL-only bullets should not be displayed");
  assert.ok(markdownLinksFromAnswer(result.answer).length > 0, "Expected clickable Markdown links in answer text");
}

{
  const first = await buildDataHubCatalogueAnswer({
    message: "What Data Hub insights are available for the Greater West of England?",
    history: []
  });
  const second = await buildDataHubCatalogueAnswer({
    message: "show more",
    history: [
      { role: "user", content: "What Data Hub insights are available for the Greater West of England?" },
      { role: "assistant", content: first.answer }
    ]
  });
  const firstUrls = new Set(urlsFromAnswer(first.answer));
  const secondUrls = urlsFromAnswer(second.answer);
  assert.ok(secondUrls.length > 0, "Expected second batch URLs");
  assert.ok(secondUrls.every((url) => !firstUrls.has(url)), "Show more should not repeat first batch URLs");
}

{
  const first = await buildDataHubCatalogueAnswer({
    message: "What Data Hub insights are available for the Greater West of England?",
    history: []
  });
  const second = await buildDataHubCatalogueAnswer({
    message: "What more is available?",
    history: [{ role: "assistant", content: first.answer }]
  });
  const firstUrls = new Set(urlsFromAnswer(first.answer));
  assert.ok(urlsFromAnswer(second.answer).every((url) => !firstUrls.has(url)));
}

{
  const result = await buildDataHubCatalogueAnswer({ message: "Show housing Data Hub posts", history: [] });
  assertConfirmedSources(result);
  assert.ok(/housing|affordability|house/i.test(result.answer), result.answer);
  assert.ok(!/Training and workforce development/i.test(result.answer), "Housing filter should not include unrelated skills post");
}

{
  const result = await buildDataHubCatalogueAnswer({ message: "Any skills posts?", history: [] });
  assertConfirmedSources(result);
  assert.ok(/skills|training|workforce/i.test(result.answer), result.answer);
}

{
  const result = await buildDataHubCatalogueAnswer({ message: "Show all Data Hub posts", history: [] });
  assert.ok(/too many|first/i.test(result.answer), result.answer);
  assert.ok(/show more/i.test(result.answer), result.answer);
  assertConfirmedSources(result);
}

console.log("Data Hub catalogue tests passed.");
