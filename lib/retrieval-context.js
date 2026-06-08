export function shouldUseHistoryForRetrieval(message) {
  const clean = normalizePlainText(message);
  if (!clean) return false;

  if (hasNewTopicOverride(clean)) return false;
  if (asksBackendSourceDetails(clean)) return true;
  if (isShortOrContextualDetailFollowUp(clean)) return true;
  if (isStandaloneQuestion(clean)) return false;

  return isFollowUpReference(clean);
}

export function selectRelevantHistoryForRetrieval(message, history) {
  const clean = normalizePlainText(message);
  const items = Array.isArray(history) ? history : [];
  if (hasNewTopicOverride(clean)) return [];
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
  return /^(yes|yeah|yep|that|those|same|also|and for|what about|can you give that|give that|can you do that|do that|can you explain that|explain that|is that)\b/.test(clean) ||
    /\b(as well|that as well|those as well|for that|for them|the same)\b/.test(clean);
}

export function isShortOrContextualDetailFollowUp(clean) {
  const hasDetailLanguage = /\b(count|counts|number|numbers|how many|total|totals|total number|numerator|denominator|base|sample size|people employed|employed people|employment count|count of employment|counts of employment|workforce count|cohort|raw|detail|details|breakdown|local authority breakdown|by age|by sex|by gender|by industry|by sector|by local authority)\b/.test(clean);
  if (!hasDetailLanguage) return false;
  if (hasNewTopicOverride(clean)) return false;

  if (isFollowUpReference(clean)) return true;

  const hasStandaloneTopic = hasExplicitTopicSignal(clean);
  if (hasStandaloneTopic && isStandaloneQuestion(clean)) return false;

  return clean.split(" ").length <= 9 || !hasStandaloneTopic;
}

export function hasNewTopicOverride(message) {
  const clean = normalizePlainText(message);
  if (!clean) return false;
  if (!hasExplicitTopicSignal(clean)) return false;

  const onlyContextualGeography = /^(what about|and for|also for)\s+(bath|barh|banes|bnes|bristol|gloucestershire|glos|north somerset|south gloucestershire|south glos|swindon|wiltshire|stroud|cotswold|cheltenham|gloucester|forest of dean|tewkesbury|202\d|19\d\d|20\d\d)\??$/.test(clean);
  if (onlyContextualGeography) return false;

  return isStandaloneQuestion(clean) ||
    /\b(on|about|for|around|regarding)\s+(inward investment|investment|foreign direct investment|fdi|business investment|trade|exports?|innovation|housing|population|emissions?|energy|gdp|gva|productivity|health|transport|skills?|wages?|unemployment|neet)\b/.test(clean) ||
    /^(what about|and what about|do you have|have you got|can you check|could you check|show me|give me|tell me)\b/.test(clean);
}

function isStandaloneQuestion(clean) {
  return /\b(what|which|where|when|why|how|who|tell me|show me|give me|could you|can you|do they|does it|does the|is there|are there|i want to know|would love to know)\b/.test(clean) &&
    (hasExplicitTopicSignal(clean) || /\b(data|datahub|policy|policies|news|latest|recent|research|article|articles|rate|rates|percent|percentage)\b/.test(clean));
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

function hasExplicitTopicSignal(clean) {
  return /\b(inward investment|investment|foreign direct investment|fdi|business investment|trade|exports?|innovation|housing|population|emissions?|greenhouse gas|co2|co2e|energy|gdp|gva|gross domestic product|gross value added|productivity|health|transport|travel time|commuting|skills?|training|wages?|earnings|unemployment|neet|employment|employed|workforce|business(?:es)?|industry|sectors?|affordability|research|data hub)\b/.test(clean);
}
