import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { createOpenAIClient, createSupabaseClient } from "./clients.js";
import { getServerConfig } from "./config.js";
import { normalizeText } from "./text.js";

const DATASET_MAP_PATH = path.join(process.cwd(), "content", "datahub-datasets.json");
const DEFAULT_ZIP_URL = "https://codeload.github.com/thebrunelcentre/Datahub-data/zip/refs/heads/main";
const INSERT_BATCH_SIZE = 500;
const RAW_FACT_LIMIT_PER_WORKBOOK = 20000;
const SOURCE_ROW_FACT_LIMIT_PER_SHEET = 5000;
const SOURCE_DATA_SHEET_NAMES = [
  "data",
  "source data",
  "source",
  "original data",
  "input data",
  "input",
  "lookup",
  "table",
  "tables",
  "detailed data",
  "underlying data",
  "observations",
  "values"
];
const SOURCE_DATA_EXCLUDED_SHEET_NAMES = [
  "metadata",
  "meta",
  "notes",
  "contents",
  "readme",
  "methodology",
  "definitions",
  "analysis",
  "further analysis",
  "chart",
  "charts",
  "summary",
  "pivot",
  "dashboard"
];

export async function loadDatasetMappings() {
  const raw = await fs.readFile(DATASET_MAP_PATH, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

export async function ingestDatasets(options = {}) {
  const config = getServerConfig();
  const openai = createOpenAIClient(config);
  const supabase = createSupabaseClient(config);
  const mappings = await loadDatasetMappings();
  const offset = Math.max(0, Number(options.offset || 0));
  const limit = Number.isFinite(Number(options.limit)) && Number(options.limit) > 0
    ? Number(options.limit)
    : 5;
  const selected = mappings.slice(offset, offset + limit);
  const zip = await downloadDatasetZip(process.env.DATAHUB_ZIP_URL || DEFAULT_ZIP_URL);
  const summary = [];
  const errors = [];

  for (const mapping of selected) {
    try {
      const result = await ingestPostDatasets({ mapping, zip, openai, supabase, embeddingModel: config.embeddingModel });
      summary.push(result);
    } catch (error) {
      errors.push({
        post_slug: mapping.slug,
        title: mapping.title,
        error: error.message
      });
    }
  }

  const nextOffset = offset + selected.length;

  return {
    total_posts: mappings.length,
    offset,
    limit,
    next_offset: nextOffset < mappings.length ? nextOffset : null,
    has_more: nextOffset < mappings.length,
    posts: summary.length,
    failed: errors.length,
    workbooks: summary.reduce((total, item) => total + item.workbooks, 0),
    rows: summary.reduce((total, item) => total + item.rows, 0),
    facts: summary.reduce((total, item) => total + item.facts, 0),
    summary,
    errors
  };
}

async function downloadDatasetZip(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "BrunelCentreDatasetIngest/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download dataset ZIP: ${response.status} ${response.statusText}`);
  }

  const bytes = await response.arrayBuffer();
  return JSZip.loadAsync(bytes);
}

async function ingestPostDatasets({ mapping, zip, openai, supabase, embeddingModel }) {
  const folderPrefix = findZipFolderPrefix(zip, mapping.zip_folder);
  const workbookEntries = Object.values(zip.files)
    .filter((entry) =>
      !entry.dir &&
      entry.name.startsWith(folderPrefix) &&
      entry.name.toLowerCase().endsWith(".xlsx") &&
      !path.basename(entry.name).startsWith("~$")
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!workbookEntries.length) {
    throw new Error(`No .xlsx files found under ${mapping.zip_folder}`);
  }

  let totalRows = 0;
  let totalFacts = 0;

  for (const entry of workbookEntries) {
    const bytes = await entry.async("uint8array");
    const workbook = XLSX.read(bytes, {
      type: "array",
      cellDates: true,
      raw: true
    });
    const parsed = parseWorkbook(workbook, entry.name, mapping);
    const contentHash = createHash({
      metadata: parsed.metadata,
      rows: parsed.rows,
      facts: parsed.facts,
      headers: parsed.headers,
      analysis_sheet: parsed.analysisSheet,
      raw_sheet_names: parsed.rawSheetNames,
      source_data_sheet_names: parsed.sourceDataSheetNames
    });

    const { error: deleteError } = await supabase
      .from("brunel_dataset_files")
      .delete()
      .eq("workbook_path", entry.name);

    if (deleteError) throw deleteError;

    const { data: fileRow, error: fileError } = await supabase
      .from("brunel_dataset_files")
      .insert({
        post_slug: mapping.slug,
        post_title: mapping.title,
        post_url: mapping.post_url,
        github_url: mapping.github_url,
        github_path: mapping.github_path,
        category: mapping.category,
        folder_path: folderPrefix.replace(/\/$/, ""),
        workbook_path: entry.name,
        workbook_name: parsed.workbookName,
        analysis_sheet: parsed.analysisSheet,
        row_count: parsed.rows.length,
        column_count: parsed.headers.length,
        metadata: {
          ...parsed.metadata,
          raw_sheets: parsed.rawSheetNames,
          source_data_sheets: parsed.sourceDataSheetNames,
          raw_fact_count: parsed.facts.length
        },
        content_hash: contentHash,
        updated_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (fileError) throw fileError;

    const datasetFileId = fileRow.id;
    const rowPayloads = parsed.rows.map((row, index) => ({
      dataset_file_id: datasetFileId,
      post_slug: mapping.slug,
      post_title: mapping.title,
      post_url: mapping.post_url,
      workbook_path: entry.name,
      workbook_name: parsed.workbookName,
      row_index: index + 1,
      row_data: row,
      search_text: createRowSearchText(mapping, parsed.workbookName, row)
    }));

    for (let index = 0; index < rowPayloads.length; index += INSERT_BATCH_SIZE) {
      const batch = rowPayloads.slice(index, index + INSERT_BATCH_SIZE);
      const { error: rowError } = await supabase.from("brunel_dataset_rows").insert(batch);
      if (rowError) throw rowError;
    }

    const factPayloads = parsed.facts.map((fact) => ({
      dataset_file_id: datasetFileId,
      post_slug: mapping.slug,
      post_title: mapping.title,
      post_url: mapping.post_url,
      workbook_path: entry.name,
      workbook_name: parsed.workbookName,
      sheet_name: fact.sheet_name,
      geography: fact.geography,
      year: fact.year,
      measure: fact.measure,
      value: fact.value,
      value_text: fact.value_text,
      unit: fact.unit,
      dimensions: fact.dimensions,
      metadata: fact.metadata,
      source_row: fact.source_row,
      source_column: fact.source_column,
      search_text: createFactSearchText(mapping, parsed.workbookName, fact)
    }));

    for (let index = 0; index < factPayloads.length; index += INSERT_BATCH_SIZE) {
      const batch = factPayloads.slice(index, index + INSERT_BATCH_SIZE);
      const { error: factError } = await supabase.from("brunel_dataset_facts").insert(batch);
      if (factError) throw factError;
    }

    const summaryText = createDatasetSummary(mapping, parsed);
    const embedding = await createEmbedding(openai, embeddingModel, summaryText);
    const { error: summaryError } = await supabase.from("brunel_dataset_summaries").insert({
      dataset_file_id: datasetFileId,
      post_slug: mapping.slug,
      post_title: mapping.title,
      post_url: mapping.post_url,
      workbook_path: entry.name,
      workbook_name: parsed.workbookName,
      content: summaryText,
      metadata: {
        category: mapping.category,
        github_url: mapping.github_url,
        analysis_sheet: parsed.analysisSheet,
        raw_sheets: parsed.rawSheetNames,
        source_data_sheets: parsed.sourceDataSheetNames,
        columns: parsed.headers,
        raw_fact_count: parsed.facts.length
      },
      embedding
    });

    if (summaryError) throw summaryError;
    totalRows += parsed.rows.length;
    totalFacts += parsed.facts.length;
  }

  return {
    slug: mapping.slug,
    title: mapping.title,
    workbooks: workbookEntries.length,
    rows: totalRows,
    facts: totalFacts
  };
}

function findZipFolderPrefix(zip, expectedFolder) {
  const normalizedExpected = normalizePath(expectedFolder).replace(/\/$/, "");
  const direct = `${normalizedExpected}/`;

  if (Object.keys(zip.files).some((name) => normalizePath(name).startsWith(direct))) {
    return direct;
  }

  const expectedTail = normalizedExpected.split("/").slice(-3).join("/");
  const match = Object.keys(zip.files)
    .map(normalizePath)
    .find((name) => name.includes(expectedTail) && name.endsWith("/"));

  if (match) return match;
  throw new Error(`Dataset folder not found in ZIP: ${expectedFolder}`);
}

function parseWorkbook(workbook, workbookPath, mapping) {
  const sheetName = chooseAnalysisSheet(workbook.SheetNames);
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true
  });
  const matrix = trimMatrix(rawRows);
  const headerRow = matrix[0] || [];
  const includedColumns = getIncludedColumns(matrix, headerRow);
  const headers = makeHeaders(headerRow, includedColumns);
  const rows = matrix.slice(1)
    .map((row) => objectFromRow(row, headers, includedColumns))
    .filter((row) => Object.values(row).some((value) => value !== null && value !== ""));
  const metadata = parseMetadata(workbook);
  const sourceDataSheets = chooseSourceDataSheets(workbook, sheetName);
  const facts = parseRawFacts(workbook, sourceDataSheets, workbookPath, mapping, metadata);

  return {
    workbookName: path.basename(workbookPath),
    analysisSheet: sheetName,
    rawSheetNames: sourceDataSheets,
    sourceDataSheetNames: sourceDataSheets,
    headers,
    rows,
    facts,
    metadata,
    postTitle: mapping.title
  };
}

function chooseAnalysisSheet(sheetNames) {
  const analysis = sheetNames.find(isAnalysisSheetName);
  if (analysis) return analysis;

  return sheetNames.find((name) => {
    return !isMetadataSheetName(name) && !isExplicitRawSheetName(name) && !isExcludedAnalysisCandidateSheetName(name);
  }) || sheetNames[0];
}

function chooseSourceDataSheets(workbook, analysisSheetName) {
  const hasExplicitAnalysisSheet = workbook.SheetNames.some(isAnalysisSheetName);

  return workbook.SheetNames.filter((name) => {
    if (isExcludedSourceDataSheetName(name)) return false;
    if (isExplicitRawSheetName(name)) return true;
    if (!isCandidateSourceDataSheetName(name)) return false;
    if (hasExplicitAnalysisSheet && name === analysisSheetName) return false;
    return hasDetailedSourceDataStructure(workbook.Sheets[name]);
  });
}

function normalizeSheetName(name) {
  return normalizeText(name)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAnalysisSheetName(name) {
  return normalizeSheetName(name).includes("analysis");
}

function isMetadataSheetName(name) {
  const normalized = normalizeSheetName(name);
  return normalized === "meta" || normalized.includes("metadata");
}

function isExplicitRawSheetName(name) {
  return /\braw\b/.test(normalizeSheetName(name));
}

function isExcludedAnalysisCandidateSheetName(name) {
  const normalized = normalizeSheetName(name);
  return SOURCE_DATA_EXCLUDED_SHEET_NAMES
    .filter((excluded) => excluded !== "analysis")
    .some((excluded) => normalized === excluded || normalized.includes(excluded));
}

function isExcludedSourceDataSheetName(name) {
  const normalized = normalizeSheetName(name);
  return SOURCE_DATA_EXCLUDED_SHEET_NAMES.some((excluded) =>
    normalized === excluded || normalized.includes(excluded)
  );
}

function isCandidateSourceDataSheetName(name) {
  const normalized = normalizeSheetName(name);
  return SOURCE_DATA_SHEET_NAMES.some((candidate) =>
    normalized === candidate || normalized.includes(candidate)
  );
}

function hasDetailedSourceDataStructure(sheet) {
  if (!sheet) return false;

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true
  });
  const matrix = trimMatrix(rows.slice(0, 80));
  if (matrix.length < 2) return false;
  if (findYearHeader(matrix)) return true;

  const headerRowIndex = findLikelyHeaderRow(matrix);
  if (headerRowIndex === null) return false;

  const headers = matrix[headerRowIndex].map((value) => normalizeText(value).toLowerCase());
  const headerText = headers.join(" | ");
  const dataRows = matrix.slice(headerRowIndex + 1).filter((row) =>
    row.filter((value) => value !== null && normalizeText(value) !== "").length >= 2
  );

  if (dataRows.length < 2) return false;

  const hasGeography = /\b(geography|area|local authority|region|district|authority|place|location|la code|la name)\b/.test(headerText);
  const hasTime = /\b(year|date|period|quarter|month)\b/.test(headerText);
  const hasMeasure = /\b(measure|variable|indicator|metric|category)\b/.test(headerText);
  const hasValue = /\b(value|rate|percent|percentage|number|count|total|proportion|estimate)\b|%/.test(headerText);

  return (
    (hasGeography && hasValue) ||
    (hasTime && hasValue) ||
    (hasMeasure && hasValue) ||
    (hasGeography && hasTime && dataRows.length >= 3)
  );
}

function findLikelyHeaderRow(rows) {
  let best = null;
  let bestScore = 0;
  const knownHeaderTerms = [
    "year",
    "date",
    "geography",
    "area",
    "local authority",
    "region",
    "measure",
    "value",
    "rate",
    "percent",
    "number",
    "total",
    "sex",
    "age",
    "sector",
    "industry"
  ];

  rows.slice(0, 35).forEach((row, rowIndex) => {
    const cells = Array.from(row || [])
      .map((value) => normalizeText(value).toLowerCase())
      .filter(Boolean);
    if (!cells.length) return;

    const text = cells.join(" | ");
    const textCellCount = cells.filter((value) => /[a-z]/i.test(value)).length;
    const score = cells.length + textCellCount + knownHeaderTerms.filter((term) => text.includes(term)).length * 3;

    if (score > bestScore) {
      best = rowIndex;
      bestScore = score;
    }
  });

  return best;
}

function trimMatrix(rows) {
  return rows
    .map((row) => Array.from(row || []))
    .filter((row) => row.some((value) => value !== null && String(value).trim() !== ""));
}

function getIncludedColumns(matrix, headerRow) {
  const maxColumns = Math.max(...matrix.map((row) => row.length), 0);
  const included = [];

  for (let column = 0; column < maxColumns; column += 1) {
    const header = headerRow[column];
    const hasHeader = header !== null && String(header || "").trim() !== "";
    const hasData = matrix.slice(1).some((row) => row[column] !== null && String(row[column] || "").trim() !== "");

    if (hasHeader || hasData) included.push(column);
  }

  return included;
}

function makeHeaders(headerRow, includedColumns) {
  const seen = new Map();

  return includedColumns.map((column, index) => {
    const raw = String(headerRow[column] || "").trim();
    let base = raw || (index === 0 ? "label" : `value_${index + 1}`);
    base = normalizeText(base).replace(/\s+/g, " ");

    const count = seen.get(base) || 0;
    seen.set(base, count + 1);

    return count ? `${base} ${count + 1}` : base;
  });
}

function objectFromRow(row, headers, includedColumns) {
  const object = {};

  headers.forEach((header, index) => {
    object[header] = normalizeCellValue(row[includedColumns[index]]);
  });

  return object;
}

function normalizeCellValue(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const text = normalizeText(value);
  return text || null;
}

function parseMetadata(workbook) {
  const sheetName = workbook.SheetNames.find((name) => name.toLowerCase().includes("meta"));
  if (!sheetName) return {};

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: false
  });
  const metadata = {};

  for (const row of rows) {
    const key = normalizeText(row?.[0]);
    const value = normalizeText(row?.[1]);

    if (!key || !value) continue;
    metadata[key.replace(/:$/, "")] = value;
  }

  return metadata;
}

function parseRawFacts(workbook, rawSheets, workbookPath, mapping, metadata) {
  const facts = [];

  for (const sheetName of rawSheets) {
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      raw: true
    });

    let sheetFacts = parseWideYearFacts(rawRows, sheetName, workbookPath, mapping, metadata);
    if (!sheetFacts.length) {
      sheetFacts = parseSourceDataRowFacts(rawRows, sheetName, workbookPath, mapping, metadata);
    }
    facts.push(...sheetFacts);

    if (facts.length >= RAW_FACT_LIMIT_PER_WORKBOOK) {
      return facts.slice(0, RAW_FACT_LIMIT_PER_WORKBOOK);
    }
  }

  return facts;
}

function parseSourceDataRowFacts(rows, sheetName, workbookPath, mapping, metadata) {
  const matrix = trimMatrix(rows);
  const headerRowIndex = findLikelyHeaderRow(matrix);
  if (headerRowIndex === null) return [];

  const headerRow = matrix[headerRowIndex] || [];
  const bodyMatrix = matrix.slice(headerRowIndex);
  const includedColumns = getIncludedColumns(bodyMatrix, headerRow);
  const headers = makeHeaders(headerRow, includedColumns);
  const facts = [];

  for (let rowOffset = 1; rowOffset < bodyMatrix.length; rowOffset += 1) {
    const row = bodyMatrix[rowOffset];
    const rowObject = objectFromRow(row, headers, includedColumns);
    const populatedEntries = Object.entries(rowObject)
      .filter(([, value]) => value !== null && value !== "");

    if (populatedEntries.length < 2) continue;

    const measure = findSourceRowMeasure(rowObject);
    const value = findSourceRowNumericValue(rowObject);
    const rowText = populatedEntries
      .slice(0, 40)
      .map(([key, entryValue]) => `${key}: ${entryValue}`)
      .join("; ");

    facts.push({
      sheet_name: sheetName,
      geography: findSourceRowGeography(rowObject),
      year: findSourceRowYear(rowObject),
      measure,
      value,
      value_text: rowText.slice(0, 4000),
      unit: inferUnit(measure),
      dimensions: createSourceRowDimensions(rowObject),
      metadata: {
        ...createFactMetadata(metadata, workbookPath),
        parser: "source_row_fallback"
      },
      source_row: headerRowIndex + rowOffset + 1,
      source_column: null
    });

    if (facts.length >= SOURCE_ROW_FACT_LIMIT_PER_SHEET) return facts;
  }

  return facts;
}

function parseWideYearFacts(rows, sheetName, workbookPath, mapping, metadata) {
  const yearHeader = findYearHeader(rows);
  if (!yearHeader) return [];

  const facts = [];
  const { rowIndex: headerRowIndex, yearColumns } = yearHeader;
  const firstYearColumn = yearColumns[0].column;
  const measureColumn = firstYearColumn - 1;
  let currentDimensions = [];
  let currentGeography = null;

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = Array.from(rows[rowIndex] || []);
    const measure = normalizeText(row[measureColumn]);

    if (!measure) continue;

    const dimensionValues = row
      .slice(0, measureColumn)
      .map(normalizeCellValue)
      .filter((value) => value !== null && value !== "");

    if (dimensionValues.length) {
      currentDimensions = dimensionValues;
      currentGeography = guessGeography(dimensionValues);
    }

    if (!currentGeography && currentDimensions.length) {
      currentGeography = guessGeography(currentDimensions);
    }

    for (const { column, year } of yearColumns) {
      const rawValue = row[column];
      const normalizedValue = normalizeCellValue(rawValue);
      if (normalizedValue === null || normalizedValue === "") continue;

      const numericValue = typeof normalizedValue === "number" ? normalizedValue : null;
      const valueText = numericValue === null ? String(normalizedValue) : null;

      facts.push({
        sheet_name: sheetName,
        geography: currentGeography,
        year,
        measure,
        value: numericValue,
        value_text: valueText,
        unit: inferUnit(measure),
        dimensions: createDimensionObject(currentDimensions),
        metadata: createFactMetadata(metadata, workbookPath),
        source_row: rowIndex + 1,
        source_column: column + 1
      });

      if (facts.length >= RAW_FACT_LIMIT_PER_WORKBOOK) return facts;
    }
  }

  return facts;
}

function findSourceRowMeasure(rowObject) {
  const measureEntry = findEntryByHeader(rowObject, [
    "measure",
    "measure name",
    "measure names",
    "variable",
    "indicator",
    "metric",
    "category"
  ]);

  if (measureEntry) return String(measureEntry[1]);
  return "Source data row";
}

function findSourceRowNumericValue(rowObject) {
  const valueEntry = findEntryByHeader(rowObject, [
    "measure value",
    "measure values",
    "value",
    "rate",
    "percent",
    "percentage",
    "proportion",
    "count",
    "number",
    "total",
    "estimate"
  ], true);

  return valueEntry ? valueEntry[1] : null;
}

function findSourceRowGeography(rowObject) {
  const entry = findEntryByHeader(rowObject, [
    "geography",
    "area",
    "local authority",
    "la name",
    "region",
    "district",
    "authority",
    "place",
    "location"
  ]);

  return entry ? String(entry[1]) : null;
}

function findSourceRowYear(rowObject) {
  const explicitYearEntry = findEntryByHeader(rowObject, [
    "year",
    "date",
    "period",
    "quarter",
    "month",
    "time"
  ]);

  if (explicitYearEntry) {
    const parsed = parseYear(explicitYearEntry[1]);
    if (parsed) return parsed;
  }

  for (const [key, value] of Object.entries(rowObject)) {
    const parsedFromKey = parseYear(key);
    if (parsedFromKey && value !== null && value !== "") return parsedFromKey;
    const parsedFromValue = parseYear(value);
    if (parsedFromValue) return parsedFromValue;
  }

  return null;
}

function findEntryByHeader(rowObject, terms, numericOnly = false) {
  for (const entry of Object.entries(rowObject)) {
    const [key, value] = entry;
    if (value === null || value === "") continue;
    if (numericOnly && typeof value !== "number") continue;

    const normalizedKey = normalizeText(key).toLowerCase();
    if (terms.some((term) => normalizedKey.includes(term))) return entry;
  }

  return null;
}

function createSourceRowDimensions(rowObject) {
  return Object.fromEntries(
    Object.entries(rowObject)
      .filter(([, value]) => value !== null && value !== "")
      .slice(0, 40)
  );
}

function findYearHeader(rows) {
  let best = null;

  rows.slice(0, 25).forEach((row, rowIndex) => {
    const yearColumns = Array.from(row || [])
      .map((value, column) => ({ column, year: parseYear(value) }))
      .filter((item) => item.year);

    if (yearColumns.length < 2) return;
    if (!best || yearColumns.length > best.yearColumns.length) {
      best = { rowIndex, yearColumns };
    }
  });

  return best;
}

function parseYear(value) {
  if (value instanceof Date) return value.getFullYear();

  if (typeof value === "number" && Number.isInteger(value) && value >= 1900 && value <= 2100) {
    return value;
  }

  const text = normalizeText(value);
  if (/^(19|20)\d{2}$/.test(text)) return Number(text);

  return null;
}

function guessGeography(dimensionValues) {
  if (!dimensionValues.length) return null;
  return String(dimensionValues[dimensionValues.length - 1]);
}

function createDimensionObject(dimensionValues) {
  const dimensions = {};

  dimensionValues.forEach((value, index) => {
    dimensions[`dimension_${index + 1}`] = value;
  });

  return dimensions;
}

function createFactMetadata(metadata, workbookPath) {
  return {
    publisher: metadata.Publisher || null,
    dataset: metadata.Dataset || metadata["ONS dataset"] || null,
    tables: metadata.Tables || metadata["ONS tables"] || null,
    publication_date: metadata["Publication date"] || metadata["ONS publication date"] || null,
    last_updated: metadata["Last updated"] || null,
    source_link: metadata.Link || metadata["ONS link"] || null,
    workbook_path: workbookPath
  };
}

function inferUnit(measure) {
  const lower = measure.toLowerCase();
  if (lower.includes("proportion") || lower.includes("rate") || lower.includes("percent")) return "fraction";
  if (lower.includes("number") || lower.includes("count") || lower.includes("cohort")) return "count";
  return null;
}

function createRowSearchText(mapping, workbookName, row) {
  const rowText = Object.entries(row)
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");

  return normalizeText(`${mapping.title}. ${workbookName}. ${rowText}`);
}

function createFactSearchText(mapping, workbookName, fact) {
  const dimensionText = Object.values(fact.dimensions || {}).join("; ");
  const value = fact.value !== null && fact.value !== undefined ? fact.value : fact.value_text;

  return normalizeText([
    mapping.title,
    workbookName,
    fact.sheet_name,
    fact.geography,
    fact.year,
    fact.measure,
    value,
    fact.unit,
    dimensionText,
    fact.metadata?.publisher,
    fact.metadata?.dataset
  ].filter(Boolean).join(". "));
}

function createDatasetSummary(mapping, parsed) {
  const metadataLines = [
    ["Publisher", parsed.metadata.Publisher],
    ["Dataset", parsed.metadata.Dataset || parsed.metadata["ONS dataset"]],
    ["Tables", parsed.metadata.Tables || parsed.metadata["ONS tables"]],
    ["Publication date", parsed.metadata["Publication date"] || parsed.metadata["ONS publication date"]],
    ["Last updated", parsed.metadata["Last updated"]],
    ["Geography", parsed.metadata["Geography used for analysis"]],
    ["Data information", parsed.metadata["Data information"] || parsed.metadata["Data information:"]],
    ["Source link", parsed.metadata.Link || parsed.metadata["ONS link"]]
  ]
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`);

  const sampleRows = parsed.rows.slice(0, 12).map((row, index) => {
    const values = Object.entries(row)
      .filter(([, value]) => value !== null && value !== "")
      .slice(0, 8)
      .map(([key, value]) => `${key}: ${value}`)
      .join("; ");

    return `Row ${index + 1}: ${values}`;
  });

  return normalizeText([
    `Data Hub post: ${mapping.title}`,
    `Public URL: ${mapping.post_url}`,
    `Workbook: ${parsed.workbookName}`,
    `Analysis sheet: ${parsed.analysisSheet}`,
    parsed.sourceDataSheetNames.length ? `Detailed/source-data sheets: ${parsed.sourceDataSheetNames.join(", ")}` : null,
    `Columns: ${parsed.headers.join(", ")}`,
    `Rows available: ${parsed.rows.length}`,
    `Raw facts available: ${parsed.facts.length}`,
    ...metadataLines,
    "Sample analysis rows:",
    ...sampleRows,
    "Sample raw facts:",
    ...parsed.facts.slice(0, 12).map((fact, index) => {
      const value = fact.value !== null && fact.value !== undefined ? fact.value : fact.value_text;
      return `Fact ${index + 1}: geography: ${fact.geography}; year: ${fact.year}; measure: ${fact.measure}; value: ${value}; unit: ${fact.unit}; sheet: ${fact.sheet_name}`;
    })
  ].join("\n"));
}

async function createEmbedding(openai, model, input) {
  const response = await openai.embeddings.create({
    model,
    input
  });

  return response.data[0].embedding;
}

function createHash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}
