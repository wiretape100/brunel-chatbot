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
