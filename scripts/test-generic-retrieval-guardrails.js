import assert from "node:assert/strict";
import {
  candidateMatchesRequestedMeasure,
  detectRequestedMeasureFamilies,
  filterCompatibleDatasetItems
} from "../lib/measure-compatibility.js";
import {
  selectRelevantHistoryForRetrieval,
  shouldUseHistoryForRetrieval
} from "../lib/retrieval-context.js";

{
  assert.deepEqual(detectRequestedMeasureFamilies("What is the housing affordability ratio in Bristol?"), ["housingAffordability"]);
  assert.deepEqual(detectRequestedMeasureFamilies("What are business counts by industry?"), ["businessCount"]);
  assert.deepEqual(detectRequestedMeasureFamilies("What is the emissions total by local authority?"), ["emissionsTotal"]);
  assert.deepEqual(detectRequestedMeasureFamilies("What is the population of Wiltshire?"), ["populationCount"]);
}

{
  assert.equal(
    candidateMatchesRequestedMeasure(
      item("NEET and activity not known among 16- and 17-year-olds", "Number NEET Cohort number"),
      "employmentCount"
    ),
    false,
    "Employment count requests must not match NEET cohorts"
  );
  assert.equal(
    candidateMatchesRequestedMeasure(
      item("Employment rates in the Greater West of England", "Number of people employed"),
      "employmentCount"
    ),
    true,
    "Employment count requests should match employed people counts"
  );
}

{
  assert.equal(
    candidateMatchesRequestedMeasure(
      item("Energy consumption in the Greater West of England", "Electricity and gas consumption by local authority"),
      "emissionsTotal"
    ),
    false,
    "Emissions total requests must not match energy consumption unless emissions are present"
  );
  assert.equal(
    candidateMatchesRequestedMeasure(
      item("Greenhouse gas emissions in the Greater West of England, 2023", "CO2e ktCO2e emissions total"),
      "emissionsTotal"
    ),
    true,
    "Emissions total requests should match greenhouse gas emissions"
  );
}

{
  assert.equal(
    candidateMatchesRequestedMeasure(
      item("Spatial distribution of housing stock in the Greater West of England, 2024", "Dwellings housing stock"),
      "housingAffordability"
    ),
    false,
    "Housing affordability requests must not match housing stock"
  );
  assert.equal(
    candidateMatchesRequestedMeasure(
      item("Housing affordability ratios across local authorities in the Greater West of England, 2024", "House price to earnings ratio"),
      "housingAffordability"
    ),
    true,
    "Housing affordability requests should match affordability ratios"
  );
}

{
  assert.equal(
    candidateMatchesRequestedMeasure(
      item("Population change comparisons in the Greater West of England, 1991-2024", "Population change growth"),
      "populationCount"
    ),
    false,
    "Population count requests must not match population change"
  );
  assert.equal(
    candidateMatchesRequestedMeasure(
      item("Population projections at local authority level in the Greater West of England, 2022-2047", "Total population"),
      "populationCount"
    ),
    true,
    "Population count requests should match population totals"
  );
}

{
  assert.equal(
    candidateMatchesRequestedMeasure(
      item("Business sites and employees linked to international trade", "Number of employees"),
      "businessCount"
    ),
    false,
    "Business count requests must not match employee counts unless employees are requested"
  );
  assert.equal(
    candidateMatchesRequestedMeasure(
      item("Businesses in the Greater West of England by broad industry groups", "Private sector enterprises business count"),
      "businessCount"
    ),
    true,
    "Business count requests should match businesses or enterprises"
  );
}

{
  const filtered = filterCompatibleDatasetItems(
    [
      item("Energy consumption in the Greater West of England", "Electricity and gas consumption"),
      item("Greenhouse gas emissions in the Greater West of England, 2023", "CO2e emissions total")
    ],
    "What is the emissions total by local authority?"
  );
  assert.equal(filtered.length, 1);
  assert.match(filtered[0].post_title, /Greenhouse gas emissions/i);
}

{
  const history = [
    { role: "user", content: "What is the housing affordability ratio in Bristol?" },
    { role: "assistant", content: "Bristol: 8.4. Source: Housing affordability ratios across local authorities in the Greater West of England, 2024." },
    { role: "user", content: "What is the emissions total in the Greater West of England?" },
    { role: "assistant", content: "The total greenhouse gas emissions figure is in Greenhouse gas emissions in the Greater West of England, 2023." }
  ];

  assert.equal(shouldUseHistoryForRetrieval("What are the totals?"), true);
  const relevant = selectRelevantHistoryForRetrieval("What are the totals?", history);
  const query = `${relevant.map((item) => item.content).join("\n")}\nWhat are the totals?`;

  assert.match(query, /Greenhouse gas emissions/i);
  assert.doesNotMatch(query, /Housing affordability/i);
}

{
  const history = [
    { role: "user", content: "What is the housing affordability ratio in Bristol?" },
    { role: "assistant", content: "Bristol: 8.4. Source: Housing affordability ratios across local authorities in the Greater West of England, 2024." }
  ];

  assert.equal(
    shouldUseHistoryForRetrieval("What is the emissions total by local authority?"),
    false,
    "Standalone emissions question should not inherit housing context"
  );
  const query = "What is the emissions total by local authority?";
  assert.doesNotMatch(query, /Housing affordability/i);
}

console.log("Generic retrieval guardrail tests passed.");

function item(title, text) {
  return {
    post_title: title,
    title,
    workbook_name: title,
    content: text,
    row_data: {
      Measure: text,
      Value: 1
    },
    measure: text
  };
}
