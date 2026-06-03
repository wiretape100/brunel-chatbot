import { createOpenAIClient, createSupabaseClient } from "../lib/clients.js";
import { getServerConfig } from "../lib/config.js";
import { applyCors, readJsonBody, sendError } from "../lib/http.js";

const SYSTEM_PROMPT = `
You are Ask the Brunel Centre, a public-friendly economic research assistant.
Answer only from the Brunel Centre context provided by the system.
If the context does not contain enough evidence, say that the available Brunel Centre content does not answer the question yet.
Use clear language for a general public audience.
When you use information from the context, cite the source title in the answer.
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

    const embeddingResponse = await openai.embeddings.create({
      model: config.embeddingModel,
      input: message
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;
    const { data: matches, error: matchError } = await supabase.rpc("match_brunel_documents", {
      query_embedding: queryEmbedding,
      match_count: 5
    });

    if (matchError) throw matchError;

    const sources = dedupeSources(matches || []);

    if (!sources.length) {
      res.status(200).json({
        answer:
          "I do not have enough Brunel Centre content loaded to answer that yet. Try asking about the Strategic Economic Audit, wages, employment rates, GDP, or what the Brunel Centre does.",
        sources: []
      });
      return;
    }

    const context = formatContext(matches);
    const completion = await openai.chat.completions.create({
      model: config.chatModel,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Question: ${message}\n\nBrunel Centre context:\n${context}`
        }
      ]
    });

    const answer = completion.choices?.[0]?.message?.content?.trim();

    res.status(200).json({
      answer: answer || "I could not generate an answer. Please try again.",
      sources
    });
  } catch (error) {
    sendError(res, 500, "Chat request failed.", error.message);
  }
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
