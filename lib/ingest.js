import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { createOpenAIClient, createSupabaseClient } from "./clients.js";
import { getServerConfig } from "./config.js";
import { chunkText, normalizeText } from "./text.js";

const SOURCES_PATH = path.join(process.cwd(), "content", "sources.json");

export async function loadSources() {
  const raw = await fs.readFile(SOURCES_PATH, "utf8");
  return JSON.parse(raw);
}

export async function ingestSources(options = {}) {
  const config = getServerConfig();
  const openai = createOpenAIClient(config);
  const supabase = createSupabaseClient(config);
  const allSources = await loadSources();
  const offset = Math.max(0, Number(options.offset || 0));
  const limit = Number.isFinite(Number(options.limit)) && Number(options.limit) > 0
    ? Number(options.limit)
    : allSources.length;
  const sources = allSources.slice(offset, offset + limit);
  const summary = [];
  const errors = [];

  for (const source of sources) {
    try {
      const sourceText = await readSourceText(source);
      const chunks = chunkText(sourceText);

      if (!chunks.length) {
        summary.push({ id: source.id, title: source.title, chunks: 0, skipped: true });
        continue;
      }

      if (source.url) {
        const { error: deleteError } = await supabase
          .from("brunel_documents")
          .delete()
          .eq("url", source.url);

        if (deleteError) throw deleteError;
      }

      const embeddings = await createEmbeddings(openai, config.embeddingModel, chunks);
      const rows = chunks.map((content, index) => ({
        source_type: source.type || "webpage",
        title: source.title,
        url: source.url || null,
        content,
        metadata: {
          source_id: source.id || null,
          tags: source.tags || [],
          chunk_index: index,
          chunk_count: chunks.length
        },
        embedding: embeddings[index]
      }));

      const { error: insertError } = await supabase.from("brunel_documents").insert(rows);
      if (insertError) throw insertError;

      summary.push({ id: source.id, title: source.title, chunks: rows.length });
    } catch (error) {
      errors.push({
        id: source.id || null,
        title: source.title || null,
        url: source.url || null,
        error: error.message
      });
    }
  }

  const nextOffset = offset + sources.length;

  return {
    total_sources: allSources.length,
    offset,
    limit,
    next_offset: nextOffset < allSources.length ? nextOffset : null,
    has_more: nextOffset < allSources.length,
    sources: summary.length,
    failed: errors.length,
    chunks: summary.reduce((total, item) => total + item.chunks, 0),
    summary,
    errors
  };
}

async function readSourceText(source) {
  if (source.content) return normalizeText(source.content);
  if (!source.url) throw new Error(`Source ${source.id || source.title} has no url or content.`);

  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "BrunelCentreChatbotMVP/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${source.url}: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  return htmlToText(html);
}

function htmlToText(html) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, img, iframe, header, footer, nav, form").remove();

  const mainText = $("main").text() || $("body").text();
  return normalizeText(mainText);
}

async function createEmbeddings(openai, model, chunks) {
  const embeddings = [];
  const batchSize = 32;

  for (let index = 0; index < chunks.length; index += batchSize) {
    const batch = chunks.slice(index, index + batchSize);
    const response = await openai.embeddings.create({
      model,
      input: batch
    });

    for (const item of response.data) {
      embeddings.push(item.embedding);
    }
  }

  return embeddings;
}
