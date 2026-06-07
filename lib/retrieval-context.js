export function shouldUseHistoryForRetrieval(message) {
  const clean = normalizePlainText(message);
  if (!clean) return false;

  if (asksBackendSourceDetails(clean)) return true;
  if (isShortOrContextualDetailFollowUp(clean)) return true;
  if (isStandaloneQuestion(clean)) return false;

  return isFollowUpReference(clean);
}

export function selectRelevantHistoryForRetrieval(message, history) {
  const clean = normalizePlainText(message);
  const items = Array.isArray(history) ? history : [];
  if (!items.length) return [];

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.role !== "assistant") continue;
    if (isNonSubstantiveAssistantContent(item.content)) continue;

    const start = index > 0 && items[index - 1]?.role === "user" ? index - 1 : index;
    const selected = items.slice(start, index + 1);

    if (isShortOrContextualDetailFollowUp(clean) || isFollowUpReference(clean) || asksBackendSourceDetails(clean)) {
      return selected;
    }

    return [];
  }

  return [];
}

export function asksBackendSourceDetails(clean) {
  return /\b(workbook|workbooks|sheet|sheets|raw data|source file|source files|which data source|what data source)\b/.test(clean);
}

export function isFollowUpReference(clean) {
  return /^(yes|yeah|yep|that|those|same|also|and for|what about|can you give that|give that|can you do that|do that|is that)\b/.test(clean) ||
    /\b(as well|that as well|those as well|for that|for them|the same)\b/.test(clean);
}

export function isShortOrContextualDetailFollowUp(clean) {
  const hasDetailLanguage = /\b(count|counts|number|numbers|how many|total|totals|total number|numerator|denominator|base|sample size|people employed|employed people|employment count|count of employment|counts of employment|workforce count|cohort|raw|detail|details|breakdown|local authority breakdown|by age|by sex|by gender|by industry|by sector|by local authority)\b/.test(clean);
  if (!hasDetailLanguage) return false;

  if (isFollowUpReference(clean)) return true;

  const hasStandaloneTopic = /\b(neet|employment|employed|workforce|gdp|gva|population|housing|affordability|transport|commuting|emissions|energy|productivity|skills|wages|business|industry|health|research|data hub)\b/.test(clean);
  if (hasStandaloneTopic && isStandaloneQuestion(clean)) return false;

  return clean.split(" ").length <= 9 || !hasStandaloneTopic;
}

function isStandaloneQuestion(clean) {
  return /\b(what|which|where|when|why|how|who|tell me|show me|give me|could you|can you|do they|does it|does the|is there|are there|i want to know|would love to know)\b/.test(clean) &&
    /\b(neet|employment|gdp|gva|wage|wages|population|housing|transport|commuting|emissions|energy|productivity|skills|sectors|business|industry|health|data|datahub|policy|policies|news|latest|recent|research|article|articles|rate|rates|percent|percentage)\b/.test(clean);
}

function isNonSubstantiveAssistantContent(content) {
  const clean = normalizePlainText(content);
  return /^(hello|hi|you re welcome|youre welcome|glad that helped|no problem|goodbye|okay|i can help with brunel centre research)/.test(clean);
}

function normalizePlainText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
