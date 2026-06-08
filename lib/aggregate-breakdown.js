export function detectAggregateBreakdownIntent(message) {
  const clean = normalize(message);
  if (!clean) {
    return {
      isAggregateBreakdown: false,
      wantsAggregate: false,
      wantsBreakdown: false
    };
  }

  const wantsAggregate = /\b(greater\s+west\s+of\s+england|gwe|greater\s+west|overall|aggregate|regional|region|total)\b/.test(clean);
  const wantsBreakdown = /\b(local\s+authorit(?:y|ies)|constituent\s+areas?|areas?\s+within|within\s+the\s+greater\s+west|breakdown|by\s+area|by\s+local\s+authorit(?:y|ies)|districts?|age\s+groups?|by\s+age|sex|gender|by\s+sex|by\s+gender|sectors?|industries?|by\s+industry|fuel\s+types?|tenure\s+groups?)\b/.test(clean);
  const connector = /\b(and|also|as\s+well|with|plus|alongside|could\s+you\s+also|also\s+provide|provide\s+me\s+with|and\s+could\s+you\s+also)\b/.test(clean);

  return {
    isAggregateBreakdown: wantsAggregate && wantsBreakdown && connector,
    wantsAggregate,
    wantsBreakdown
  };
}

export function aggregateBreakdownInstruction(message) {
  const intent = detectAggregateBreakdownIntent(message);
  if (!intent.isAggregateBreakdown) return "";

  return [
    "Aggregate-plus-breakdown request detected.",
    "Return the aggregate value first, then the requested breakdown values.",
    "For Greater West of England, look for an aggregate row/article value labelled Greater West of England, GWE, Greater West, regional aggregate, combined geography or overall.",
    "Then look for breakdown rows such as local authorities, constituent areas, districts, age groups, sex/gender groups, sectors, industries, fuel types or tenure groups as requested.",
    "Use the same public source, year/period, measure and population definition where possible.",
    "Do not silently omit either part. If the aggregate or the breakdown is missing, say exactly which part was not found in the checked Brunel Centre article and linked data.",
    "Do not calculate an aggregate from percentages unless valid matching numerators and denominators are available. Do not average percentages."
  ].join("\n");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
