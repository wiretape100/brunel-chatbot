# Dataset Measure Audit

Generated from the local ZIP: `C:\Users\sk3626\Downloads\Datahub-data-main (2).zip`

## Scope
- Mapped Data Hub posts inspected: 59
- Mapped posts with matched workbooks in the local ZIP: 59
- Workbook records inspected: 196
- Posts with at least one explicit raw sheet in any matched workbook: 16
- Posts with at least one detailed/source-data sheet in any matched workbook: 20
- Posts with no detailed/source-data sheets in any matched workbook: 39
- Posts with mixed workbook-level detailed/source-data coverage: 3
- Workbooks with an explicit analysis sheet: 194
- Workbooks without an explicit analysis sheet name: 2

## Important Interpretation
This audit samples workbook headers and early rows to describe structure. It is designed to guide parser and answer-logic decisions, not to certify every individual numeric value. The current chatbot dataset ingestion already stores analysis-sheet rows for lookup-style questions. Detailed/source-data sheets include explicit raw sheets plus candidate sheets such as `Data`, `source_data`, `table`, or `observations` when their headers look like detailed data. Raw facts are still only structured when the current parser recognises plain wide year columns.

## Detailed/Source-Data Sheet Structures Detected
- none detected: 137
- tabular_unknown_structure: 36
- long_or_tabular_rows (geography/time/value columns): 9
- tabular_measure_columns (geography plus measure/value columns): 8
- wide_year_columns (2 detected current-parser year columns): 2
- wide_year_columns (5 detected current-parser year columns): 2
- wide_year_columns (3 detected current-parser year columns): 1
- wide_year_columns (4 detected current-parser year columns): 1

## Current Parser Coverage For Detailed/Source-Data Sheets
- not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest: 137
- fallback - searchable source-row snippets should ingest; targeted parser needed for structured calculations: 53
- yes - structured wide-year facts should ingest from detailed/source-data sheets: 6

## Available Measure Types Detected
- rates/percentages/proportions: 84
- time-series values: 57
- confidence intervals: 39
- counts/numbers: 31
- totals: 22
- denominators/base: 19
- emissions/energy totals: 19
- numerators: 11
- ratios/prices: 7
- index values: 5
- currency/value: 1

## Supported Breakdowns Detected
- local authority/geography: 130
- time/year: 62
- age: 54
- sector/industry: 33
- qualification/skills: 22
- transport mode/distance: 20
- fuel/energy type: 19
- deprivation/income: 16
- sex/gender: 14
- occupation: 12
- tenure/housing type: 10
- health outcome: 7
- business size: 3

## Category Workbook Counts
- labour-market: 56
- economy: 43
- housing-and-land-use: 27
- population: 20
- environment: 19
- poverty-and-deprivation: 16
- transport: 10
- health: 5

## Representative Topic Samples
### employment/labour market
- **Education and training participation by characteristics in the Greater West of England, 2025** | workbook `Education and training participation by SEN status aged(16-17), 2025.xlsx`
  - Sheets: metadata; raw_data; analysis_data
  - Analysis: yes (`analysis_data`); Explicit raw: yes (raw_data); Detailed/source-data: yes (raw_data)
  - Detailed/source-data structure: tabular_unknown_structure
  - Measures: confidence intervals; rates/percentages/proportions
  - Breakdowns: age; sex/gender; qualification/skills
  - Parser status: fallback - searchable source-row snippets should ingest; targeted parser needed for structured calculations
- **Employer training activity in the South West of England** | workbook `Establishments providing staff training (%) by industry in the South West, 2023-24.xlsx`
  - Sheets: Metadata; Analysis
  - Analysis: yes (`Analysis`); Explicit raw: no (none); Detailed/source-data: no (none)
  - Detailed/source-data structure: none detected
  - Measures: rates/percentages/proportions
  - Breakdowns: local authority/geography; sector/industry; qualification/skills; time/year
  - Parser status: not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest

### housing
- **Housebuilding activity in the Greater West of England, 2014 onwards** | workbook `Housebuilding, starts by tenure (%), Greater West of England local authority areas.xlsx`
  - Sheets: Metadata; Analysis
  - Analysis: yes (`Analysis`); Explicit raw: no (none); Detailed/source-data: no (none)
  - Detailed/source-data structure: none detected
  - Measures: rates/percentages/proportions; confidence intervals
  - Breakdowns: local authority/geography; occupation; tenure/housing type
  - Parser status: not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest

### business/industry
- **Businesses in the Greater West of England by broad industry groups** | workbook `Private sector enterprises in the Greater West of England by industry group.xlsx`
  - Sheets: Metadata; Data; Analysis
  - Analysis: yes (`Analysis`); Explicit raw: no (none); Detailed/source-data: yes (Data)
  - Detailed/source-data structure: wide_year_columns (3 detected current-parser year columns)
  - Measures: rates/percentages/proportions; counts/numbers; totals
  - Breakdowns: local authority/geography; sector/industry; age
  - Parser status: yes - structured wide-year facts should ingest from detailed/source-data sheets
- **Business sites and employees linked to international trade in the Greater West of England, 2023** | workbook `Comparisons of the extent of local sites linked to trade.xlsx`
  - Sheets: Metadata; Analysis
  - Analysis: yes (`Analysis`); Explicit raw: no (none); Detailed/source-data: no (none)
  - Detailed/source-data structure: none detected
  - Measures: unclear from sampled headers
  - Breakdowns: local authority/geography
  - Parser status: not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest

### health
- **Healthy life expectancy and mortality in the South West of England** | workbook `Healthy life expectancy at birth by local authority in the South West, 202123.xlsx`
  - Sheets: Metadata; Analysis
  - Analysis: yes (`Analysis`); Explicit raw: no (none); Detailed/source-data: no (none)
  - Detailed/source-data structure: none detected
  - Measures: unclear from sampled headers
  - Breakdowns: local authority/geography; sex/gender; health outcome
  - Parser status: not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest

### environment/energy/emissions
- **Annual change in greenhouse gas emissions in the Greater West of England, 2022–2023** | workbook `Annual change in greenhouse gas emissions across local authority areas, 2022 to 2023.xlsx`
  - Sheets: Metadata; analysis_data
  - Analysis: yes (`analysis_data`); Explicit raw: no (none); Detailed/source-data: no (none)
  - Detailed/source-data structure: none detected
  - Measures: emissions/energy totals
  - Breakdowns: local authority/geography; fuel/energy type
  - Parser status: not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest

### population
- **Population change comparisons in the Greater West of England, 1991–2024** | workbook `Population (%) change by area, selected combined authority areas and comparators.xlsx`
  - Sheets: Metadata; raw_data; analysis_data
  - Analysis: yes (`analysis_data`); Explicit raw: yes (raw_data); Detailed/source-data: yes (raw_data)
  - Detailed/source-data structure: tabular_unknown_structure
  - Measures: rates/percentages/proportions; confidence intervals; time-series values
  - Breakdowns: local authority/geography; time/year
  - Parser status: fallback - searchable source-row snippets should ingest; targeted parser needed for structured calculations
- **Components of population change in the Greater West of England, 2011/12 to 2023/24** | workbook `Births and deaths in the Greater West of England, 201112 to 202324.xlsx`
  - Sheets: Metadata; analysis_data
  - Analysis: yes (`analysis_data`); Explicit raw: no (none); Detailed/source-data: no (none)
  - Detailed/source-data structure: none detected
  - Measures: time-series values
  - Breakdowns: local authority/geography; time/year; health outcome
  - Parser status: not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest

### transport
- **Commuting between local authorities in the Greater West of England, 2021** | workbook `Commuting flows between place of residence and workplace, Census 2021_21012026.xlsx`
  - Sheets: Metadata; raw_data; Analysis_data; further_analysis
  - Analysis: yes (`Analysis_data`); Explicit raw: yes (raw_data); Detailed/source-data: yes (raw_data)
  - Detailed/source-data structure: tabular_measure_columns (geography plus measure/value columns)
  - Measures: counts/numbers; confidence intervals; rates/percentages/proportions; totals; time-series values
  - Breakdowns: local authority/geography; transport mode/distance; age; time/year
  - Parser status: fallback - searchable source-row snippets should ingest; targeted parser needed for structured calculations
- **Access to key services in the Greater West of England: schools, town centres and hospitals, 2019** | workbook `Access to key services in the Greater West of England schools, town centres and hospitals.xlsx`
  - Sheets: Metadata; Analysis
  - Analysis: yes (`Analysis`); Explicit raw: no (none); Detailed/source-data: no (none)
  - Detailed/source-data structure: none detected
  - Measures: unclear from sampled headers
  - Breakdowns: local authority/geography; transport mode/distance; time/year
  - Parser status: not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest

### GDP/GVA/productivity
- **Businesses in the Greater West of England by broad industry groups** | workbook `Private sector enterprises in the Greater West of England by industry group.xlsx`
  - Sheets: Metadata; Data; Analysis
  - Analysis: yes (`Analysis`); Explicit raw: no (none); Detailed/source-data: yes (Data)
  - Detailed/source-data structure: wide_year_columns (3 detected current-parser year columns)
  - Measures: rates/percentages/proportions; counts/numbers; totals
  - Breakdowns: local authority/geography; sector/industry; age
  - Parser status: yes - structured wide-year facts should ingest from detailed/source-data sheets
- **Change in GDP across UK regions and local areas in the Greater West of England, 2013 to 2023** | workbook `Real GDP change by region over the latest decade, 2013 to 2023.xlsx`
  - Sheets: Metadata; analysis_data
  - Analysis: yes (`analysis_data`); Explicit raw: no (none); Detailed/source-data: no (none)
  - Detailed/source-data structure: none detected
  - Measures: rates/percentages/proportions
  - Breakdowns: local authority/geography
  - Parser status: not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest

## Raw Parser Limitations / Warnings
- **Child poverty before housing costs in the Greater West of England (Children, aged 0-15)** / `Child poverty before housing costs (0-15).xlsx`: none detected (not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest)
- **Child poverty before housing costs in the Greater West of England (Children, aged 0-15)** / `Child poverty geographic comparisons BHC (aged 0-15).xlsx`: none detected (not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest)
- **Child poverty before housing costs in the Greater West of England (Children, aged 0-15)** / `Recent trends in child poverty before housing costs (0-15).xlsx`: none detected (not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest)
- **Child poverty before housing costs in the Greater West of England (Dependent children, aged 0-19)** / `Child poverty before housing costs (0-19).xlsx`: none detected (not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest)
- **Child poverty before housing costs in the Greater West of England (Dependent children, aged 0-19)** / `Child poverty geographic comparisons BHC (0-19).xlsx`: none detected (not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest)
- **Child poverty before housing costs in the Greater West of England (Dependent children, aged 0-19)** / `Recent trends in child poverty BHC (0-19).xlsx`: none detected (not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest)
- **Commuting between local authorities in the Greater West of England, 2021** / `Commuting flows between place of residence and workplace, Census 2021_21012026.xlsx`: tabular_measure_columns (geography plus measure/value columns) (fallback - searchable source-row snippets should ingest; targeted parser needed for structured calculations)
- **Commuting between local authorities in the Greater West of England, 2021** / `Commuting flows by place of residence and workplace (counts), Census 2021.xlsx`: tabular_measure_columns (geography plus measure/value columns) (fallback - searchable source-row snippets should ingest; targeted parser needed for structured calculations)
- **Travel to work in the Greater West of England: Distance travelled and mode of transport, 2021** / `Distance travelled to work by local authority, 2021.xlsx`: long_or_tabular_rows (geography/time/value columns) (fallback - searchable source-row snippets should ingest; targeted parser needed for structured calculations)
- **Travel to work in the Greater West of England: Distance travelled and mode of transport, 2021** / `Distance travelled to work, % of workers, national comparisons, 2021.xlsx`: long_or_tabular_rows (geography/time/value columns) (fallback - searchable source-row snippets should ingest; targeted parser needed for structured calculations)
- **Travel to work in the Greater West of England: Distance travelled and mode of transport, 2021** / `Distance travelled to work, GWE, 2011 and 2021.xlsx`: long_or_tabular_rows (geography/time/value columns) (fallback - searchable source-row snippets should ingest; targeted parser needed for structured calculations)
- **Travel to work in the Greater West of England: Distance travelled and mode of transport, 2021** / `Travel to work by local authority, 2021.xlsx`: tabular_unknown_structure (fallback - searchable source-row snippets should ingest; targeted parser needed for structured calculations)
- **Travel to work in the Greater West of England: Distance travelled and mode of transport, 2021** / `Travel to work by mode, 2011 and 2021.xlsx`: tabular_unknown_structure (fallback - searchable source-row snippets should ingest; targeted parser needed for structured calculations)
- **Travel time to major employment centres in the Greater West of England, 2019** / `access_to_major_employment_centres.xlsx`: none detected (not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest)
- **Access to key services in the Greater West of England: schools, town centres and hospitals, 2019** / `Access to key services in the Greater West of England schools, town centres and hospitals.xlsx`: none detected (not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest)
- **Access to key services in the Greater West of England: schools, town centres and hospitals, 2019** / `transport_related_social_exclusion_17022026.xlsx`: none detected (not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest)
- **Child poverty after housing costs in the West of England area, 2023/24** / `Child poverty after housing costs.xlsx`: none detected (not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest)
- **Child poverty after housing costs in the West of England area, 2023/24** / `Child poverty geographic comparisons AHC (dependent children).xlsx`: none detected (not applicable for raw facts - no detailed/source-data sheet detected; analysis rows still ingest)

## Practical Guidance For Chatbot Behaviour
- Keep the current article-first, analysis-second, raw-third hierarchy.
- Do not claim a raw value is unavailable until article context and analysis-sheet rows have also been checked.
- Do not force count logic across all datasets. Many datasets expose rates, percentages, ratios, prices, index values, emissions totals, or wide time-series values without explicit numerator/denominator columns.
- For calculation questions, only calculate where the needed numerator/denominator/count fields are clearly present and matched to the requested geography, year, measure, and breakdown.
- Where detailed/source-data sheets exist but are not plain wide-year layouts, the safest next parser improvement is a fallback searchable source-row snippet store, plus targeted parsers for common long/tidy geography-year-measure-value structures.

## Detailed Inventory
See `dataset_measure_inventory.csv` for the per-workbook audit fields requested: title, URL, workbook, sheets, analysis/raw/source-data availability, source-data structure, key columns, measures, breakdowns, counts, numerator/denominator flags, confidence interval flags, parser status, and warnings.
