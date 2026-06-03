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

export async function ingestSources() {
  const config = getServerConfig();
  const openai = createOpenAIClient(config);
  const supabase = createSupabaseClient(config);
  const sources = await loadSources();
  const summary = [];

  for (const source of sources) {
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
  }

  return {
    sources: summary.length,
    chunks: summary.reduce((total, item) => total + item.chunks, 0),
    summary
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
