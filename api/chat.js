import { createOpenAIClient, createSupabaseClient } from "../lib/clients.js";
import { getServerConfig } from "../lib/config.js";
import { applyCors, readJsonBody, sendError } from "../lib/http.js";
import { buildStatisticalAnswer } from "../lib/statistics.js";

const SYSTEM_PROMPT = `
You are Ask the Brunel Centre, a public-friendly economic research assistant.
Answer only from the Brunel Centre context provided by the system.
If the context does not contain enough evidence, say that the available Brunel Centre content does not answer the question yet.
Use clear language for a general public audience.
When you use information from the context, cite the source title in the answer.
For ordinary numerical lookup questions, prefer Brunel Centre article context first. If the exact value is not present there, use analysis dataset rows.
For ordinary lookup answers, keep the wording natural and cite the public source title. Do not mention raw sheets, source rows, publishers, or methodology unless the user asks for calculation, counts, methods, or detail.
For specific numerical questions, prefer analysis dataset rows when article context does not include the value. Mention the Data Hub post title, and include the workbook only when helpful.
For calculations, follow official-statistics style discipline: do not add, subtract, or average percentages unless the context explicitly says that method is valid.
For combined rates, use numerator counts divided by denominator counts. If those counts are missing, say the calculation cannot be done from the available content.
When a verified backend calculation is provided, use that result exactly and explain its method. Do not recalculate or alter it.
Keep answers concise unless the user asks for detail.
Do not invent statistics, dates, sources, or policy positions.
`.trim();

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    sendError(res, 405, "Use POST for chat requests.");
    return;
  }

  try {
    const body = readJsonBody(req);
    const message = String(body.message || "").trim();

    if (!message) {
      sendError(res, 400, "Message is required.");
      return;
    }

    const config = getServerConfig();
    const openai = createOpenAIClient(config);
    const supabase = createSupabaseClient(config);
    const includeRawFacts = shouldIncludeRawFacts(message);

    const statisticalAnswer = await buildStatisticalAnswer({ supabase, message });
    if (statisticalAnswer) {
      res.status(200).json(statisticalAnswer);
      return;
    }

    const embeddingResponse = await openai.embeddings.create({
      model: config.embeddingModel,
      input: message
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;
    const [
      { data: matches, error: matchError },
      datasetSummaries,
      datasetRows,
      datasetFacts
    ] = await Promise.all([
      supabase.rpc("match_brunel_documents", {
        query_embedding: queryEmbedding,
        match_count: 5
      }),
      safeRpc(supabase, "match_brunel_dataset_summaries", {
        query_embedding: queryEmbedding,
        match_count: 4
      }),
      safeRpc(supabase, "search_brunel_dataset_rows", {
        query_text: message,
        match_count: 8
      }),
      includeRawFacts ? safeRpc(supabase, "search_brunel_dataset_facts", {
        query_text: message,
        match_count: 12
      }) : Promise.resolve([])
    ]);

    if (matchError) throw matchError;

    const sources = dedupeSources(matches || []);
    const datasetSources = dedupeDatasetSources(datasetSummaries, datasetRows, datasetFacts);

    if (!sources.length && !datasetSummaries.length && !datasetRows.length && !datasetFacts.length) {
      res.status(200).json({
        answer:
          "I do not have enough Brunel Centre content loaded to answer that yet. Try asking about the Strategic Economic Audit, wages, employment rates, GDP, or what the Brunel Centre does.",
        sources: []
      });
      return;
    }

    const context = formatContext(matches);
    const datasetContext = formatDatasetContext(datasetSummaries, datasetRows, datasetFacts, includeRawFacts);
    const completion = await openai.chat.completions.create({
      model: config.chatModel,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `Question: ${message}`,
            "",
            "Brunel Centre article context:",
            context || "No article context found.",
            "",
            "Brunel Centre dataset context:",
            datasetContext || "No dataset context found."
          ].join("\n")
        }
      ]
    });

    const answer = completion.choices?.[0]?.message?.content?.trim();

    res.status(200).json({
      answer: answer || "I could not generate an answer. Please try again.",
      sources: [...sources, ...datasetSources]
    });
  } catch (error) {
    sendError(res, 500, "Chat request failed.", error.message);
  }
}

async function safeRpc(supabase, name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) return [];
  return data || [];
}

function formatContext(matches) {
  return matches
    .map((match, index) => {
      const label = index + 1;
      return [
        `[${label}] ${match.title}`,
        match.url ? `URL: ${match.url}` : null,
        `Similarity: ${Number(match.similarity || 0).toFixed(3)}`,
        match.content
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n---\n\n");
}

function formatDatasetContext(summaries, rows, facts, includeRawFacts) {
  const parts = [];

  if (summaries?.length) {
    parts.push("Dataset summaries:");
    parts.push(
      summaries
        .map((summary, index) => {
          return [
            `[Dataset summary ${index + 1}] ${summary.post_title}`,
            `Workbook: ${summary.workbook_name}`,
            summary.post_url ? `URL: ${summary.post_url}` : null,
            `Similarity: ${Number(summary.similarity || 0).toFixed(3)}`,
            formatSummaryContent(summary.content, includeRawFacts)
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n---\n\n")
    );
  }

  if (rows?.length) {
    parts.push("Exact dataset rows:");
    parts.push(
      rows
        .map((row, index) => {
          const rowData = Object.entries(row.row_data || {})
            .filter(([, value]) => value !== null && value !== "")
            .slice(0, 12)
            .map(([key, value]) => `${key}: ${value}`)
            .join("; ");

          return [
            `[Dataset row ${index + 1}] ${row.post_title}`,
            `Workbook: ${row.workbook_name}`,
            row.post_url ? `URL: ${row.post_url}` : null,
            `Row: ${row.row_index}`,
            rowData
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n---\n\n")
    );
  }

  if (facts?.length) {
    parts.push("Raw dataset facts:");
    parts.push(
      facts
        .map((fact, index) => {
          const value = formatFactValue(fact);
          const dimensions = Object.entries(fact.dimensions || {})
            .filter(([, item]) => item !== null && item !== "")
            .slice(0, 8)
            .map(([key, item]) => `${key}: ${item}`)
            .join("; ");

          return [
            `[Dataset fact ${index + 1}] ${fact.post_title}`,
            `Workbook: ${fact.workbook_name}`,
            `Sheet: ${fact.sheet_name}`,
            fact.post_url ? `URL: ${fact.post_url}` : null,
            fact.geography ? `Geography: ${fact.geography}` : null,
            fact.year ? `Year: ${fact.year}` : null,
            `Measure: ${fact.measure}`,
            `Value: ${value}`,
            fact.source_row ? `Source row: ${fact.source_row}` : null,
            dimensions ? `Dimensions: ${dimensions}` : null
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n---\n\n")
    );
  }

  return parts.join("\n\n");
}

function dedupeSources(matches) {
  const seen = new Set();
  const sources = [];

  for (const match of matches) {
    const key = match.url || match.title;
    if (!key || seen.has(key)) continue;

    seen.add(key);
    sources.push({
      title: match.title,
      url: match.url,
      similarity: match.similarity
    });
  }

  return sources;
}

function dedupeDatasetSources(summaries, rows, facts) {
  const seen = new Set();
  const sources = [];

  for (const item of [...(summaries || []), ...(rows || []), ...(facts || [])]) {
    const key = item.post_url || item.post_title || item.workbook_name;
    if (!key || seen.has(key)) continue;

    seen.add(key);
    sources.push({
      title: item.post_title || item.workbook_name,
      url: item.post_url,
      similarity: item.similarity || item.rank || null
    });
  }

  return sources;
}

function formatFactValue(fact) {
  const rawValue = fact.value !== null && fact.value !== undefined ? Number(fact.value) : null;

  if (Number.isFinite(rawValue) && fact.unit === "fraction") {
    return `${rawValue} (${(rawValue * 100).toFixed(2)}%)`;
  }

  if (Number.isFinite(rawValue)) return String(rawValue);
  return fact.value_text || "";
}

function formatSummaryContent(content, includeRawFacts) {
  if (includeRawFacts) return content;

  return String(content || "")
    .replace(/\n?Raw sheets:.*$/gm, "")
    .replace(/\n?Raw facts available:.*$/gm, "")
    .replace(/\nSample raw facts:[\s\S]*$/m, "")
    .trim();
}

function shouldIncludeRawFacts(message) {
  return /\b(calculate|calculation|compute|combined|combine|weighted|average|aggregate|cohort|count|counts|numerator|denominator|method|raw|detail|details)\b/i.test(message);
}
