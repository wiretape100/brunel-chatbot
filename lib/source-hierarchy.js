import { normalizeSourceUrl } from "./source-utils.js";

export function scopeDatasetFallbackToArticleSources({ matches, datasetSummaries, datasetRows, datasetFacts }) {
  const articlePostUrls = new Set(
    (matches || [])
      .map((match) => match?.url)
      .filter((url) => /\/data-hub\//i.test(String(url || "")))
      .map(normalizeSourceUrl)
      .filter(Boolean)
      .slice(0, 3)
  );

  if (!articlePostUrls.size) {
    return { datasetSummaries, datasetRows, datasetFacts };
  }

  return {
    datasetSummaries: filterItemsByPostUrls(datasetSummaries, articlePostUrls),
    datasetRows: filterItemsByPostUrls(datasetRows, articlePostUrls),
    datasetFacts: filterItemsByPostUrls(datasetFacts, articlePostUrls)
  };
}

function filterItemsByPostUrls(items, postUrls) {
  return (items || []).filter((item) => {
    const postUrl = item?.post_url || item?.url;
    return postUrl && postUrls.has(normalizeSourceUrl(postUrl));
  });
}

export async function fetchLinkedDatasetRows({ supabase, matches, questionPlan, message }) {
  if (!shouldFetchLinkedDataFallback(questionPlan, message)) return [];

  const postUrls = getMatchedDataHubPostUrls(matches);
  if (!postUrls.length) return [];

  const { data, error } = await supabase
    .from("brunel_dataset_rows")
    .select("id, post_title, post_url, workbook_name, row_index, row_data")
    .in("post_url", postUrls)
    .order("row_index", { ascending: true })
    .limit(700);

  if (error) return [];

  return tagLinkedDatasetRows(data || [], "linked-analysis-source-scope");
}

export async function fetchLinkedDatasetFacts({ supabase, matches, questionPlan, message, includeRawFacts }) {
  if (!includeRawFacts || !shouldFetchLinkedDatasetFacts(questionPlan, message)) return [];

  const postUrls = getMatchedDataHubPostUrls(matches);
  if (!postUrls.length) return [];

  const { data, error } = await supabase
    .from("brunel_dataset_facts")
    .select("id, post_title, post_url, workbook_name, sheet_name, geography, year, measure, value, value_text, unit, dimensions, metadata, source_row, source_column")
    .in("post_url", postUrls)
    .order("source_row", { ascending: true })
    .limit(900);

  if (error) return [];

  return tagLinkedDatasetRows(data || [], "linked-raw-source-scope");
}

export function shouldFetchLinkedDataFallback(plan, message) {
  const intent = plan?.intent || "";
  if ([
    "aggregatePlusBreakdown",
    "aggregateLookup",
    "breakdownLookup",
    "exactStatisticLookup",
    "countDetailRequest",
    "calculationRequest",
    "methodologyRequest",
    "sourceRequest"
  ].includes(intent)) {
    return true;
  }

  const clean = normalizePlainText(message);
  return /\b(value|values|figure|figures|statistic|statistics|number|numbers|rate|rates|ratio|ratios|count|counts|total|totals|numerator|denominator|cohort|breakdown|within|local authorit|by area|by age|by sex|by gender|sector|industry|district|districts)\b/.test(clean);
}

export function shouldFetchLinkedDatasetFacts(plan, message) {
  const intent = plan?.intent || "";
  if ([
    "countDetailRequest",
    "calculationRequest",
    "methodologyRequest",
    "sourceRequest"
  ].includes(intent)) {
    return true;
  }

  const clean = normalizePlainText(message);
  return /\b(calculate|calculation|compute|combined|weighted|average|count|counts|number|numbers|total|totals|numerator|denominator|cohort|base|sample size|raw|method|methodology)\b/.test(clean);
}

export function getMatchedDataHubPostUrls(matches) {
  const seen = new Set();
  const urls = [];

  for (const match of matches || []) {
    const url = String(match?.url || "").trim();
    if (!/\/data-hub\//i.test(url)) continue;

    const normalized = normalizeSourceUrl(url);
    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    urls.push(url);
    if (urls.length >= 3) break;
  }

  return urls;
}

export function dedupeDatasetRows(rows) {
  const seen = new Set();
  const deduped = [];

  for (const row of rows || []) {
    const key = [
      normalizeSourceUrl(row?.post_url),
      row?.workbook_name || "",
      row?.row_index ?? "",
      stableJson(row?.row_data || {})
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

export function dedupeDatasetFacts(facts) {
  const seen = new Set();
  const deduped = [];

  for (const fact of facts || []) {
    const key = [
      normalizeSourceUrl(fact?.post_url),
      fact?.workbook_name || "",
      fact?.sheet_name || "",
      fact?.geography || "",
      fact?.year ?? "",
      fact?.measure || "",
      fact?.value ?? fact?.value_text ?? "",
      fact?.source_row ?? "",
      fact?.source_column ?? ""
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(fact);
  }

  return deduped;
}

function tagLinkedDatasetRows(rows, query) {
  return (rows || []).map((row) => ({
    ...row,
    retrieval_query: query,
    retrieval_query_index: 0,
    linked_source_scope: true,
    rank: row.rank ?? 1,
    similarity: row.similarity ?? 1
  }));
}

function stableJson(value) {
  if (!value || typeof value !== "object") return String(value || "");
  return JSON.stringify(Object.keys(value).sort().reduce((accumulator, key) => {
    accumulator[key] = value[key];
    return accumulator;
  }, {}));
}

function normalizePlainText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
