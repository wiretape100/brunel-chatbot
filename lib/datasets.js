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
      headers: parsed.headers,
      analysis_sheet: parsed.analysisSheet
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
        metadata: parsed.metadata,
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
        columns: parsed.headers
      },
      embedding
    });

    if (summaryError) throw summaryError;
    totalRows += parsed.rows.length;
  }

  return {
    slug: mapping.slug,
    title: mapping.title,
    workbooks: workbookEntries.length,
    rows: totalRows
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

  return {
    workbookName: path.basename(workbookPath),
    analysisSheet: sheetName,
    headers,
    rows,
    metadata,
    postTitle: mapping.title
  };
}

function chooseAnalysisSheet(sheetNames) {
  const analysis = sheetNames.find((name) => name.toLowerCase().includes("analysis"));
  if (analysis) return analysis;

  return sheetNames.find((name) => {
    const lower = name.toLowerCase();
    return !lower.includes("meta") && !lower.includes("raw");
  }) || sheetNames[0];
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

function createRowSearchText(mapping, workbookName, row) {
  const rowText = Object.entries(row)
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");

  return normalizeText(`${mapping.title}. ${workbookName}. ${rowText}`);
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
    `Columns: ${parsed.headers.join(", ")}`,
    `Rows available: ${parsed.rows.length}`,
    ...metadataLines,
    "Sample analysis rows:",
    ...sampleRows
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
