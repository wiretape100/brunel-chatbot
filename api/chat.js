import { createOpenAIClient, createSupabaseClient } from "../lib/clients.js";
import { getServerConfig } from "../lib/config.js";
import { buildCatalogueAnswer } from "../lib/datahub-catalogue.js";
import { applyCors, readJsonBody, sendError } from "../lib/http.js";
import { buildRetrievalPlan, conceptLabel, describeRetrievalPlan, mergeSearchResults, sourceMatchesConcept } from "../lib/retrieval.js";
import { buildStatisticalAnswer } from "../lib/statistics.js";

const RETRIEVAL_EXPANSIONS = [
  {
    name: "Bath and North East Somerset",
    aliases: ["bath", "barh", "banes", "bnes", "b nes", "b and nes", "bath ne somerset", "bath and ne somerset"],
    expansion: "Bath and North East Somerset B&NES local authority"
  },
  {
    name: "Bristol, City of",
    aliases: ["bristol"],
    expansion: "Bristol City of Bristol local authority"
  },
  {
    name: "Gloucestershire",
    aliases: ["glos"],
    expansion: "Gloucestershire local authority"
  },
  {
    name: "South Gloucestershire",
    aliases: ["south glos"],
    expansion: "South Gloucestershire local authority"
  }
];

const SMALL_TALK_RESPONSES = {
  farewell: "Goodbye. You can come back anytime to explore Brunel Centre research and Data Hub insights.",
  thanks: "You're welcome. Let me know if you'd like to explore anything else.",
  greeting: "Hello, I'm the Brunel Centre assistant. I can help with Brunel Centre research, Data Hub insights and the regional economy. What would you like to explore?",
  acknowledgement: "Glad that helped. What would you like to explore next?",
  unclear: "I can help with Brunel Centre research, Data Hub insights and the regional economy. Please ask a question about a topic, place or dataset you'd like to explore."
};

const SYSTEM_PROMPT = `
You are Ask the Brunel Centre, a public-friendly economic research assistant.
Answer only from the Brunel Centre context provided by the system.
If the context does not contain enough evidence, say that the available Brunel Centre content does not answer the question yet.
If a requested figure is not available, do not start with "yes". Start directly with what is missing, then say what related evidence is available.
Use the recent conversation only to understand follow-up references such as "that", "those", "yes", "separate rates", or "is that for Bristol?". Do not introduce a new topic from history unless it is needed to resolve the current question.
For geography wording, treat "Bath", "B&NES", "BANES", and close misspellings as Bath and North East Somerset. Treat "Glos" as Gloucestershire and "South Glos" as South Gloucestershire. In answers, use the official geography name when possible.
Use clear language for a general public audience.
When you use information from the context, cite the source title in the answer.
For ordinary numerical lookup questions, use Brunel Centre article context first. If the exact value is not present there, use the analysis dataset rows fallback.
The dataset fallback contains analysis-sheet rows unless raw facts are explicitly provided for calculation/count/method questions.
For ordinary lookup answers, keep the wording natural and cite the public source title. Do not mention raw sheets, source rows, workbook internals, publishers, or methodology unless the user asks for calculation, counts, methods, or detail.
For specific numerical questions, use analysis dataset rows only when article context does not include the value. Mention the Data Hub post title, and include the workbook only when helpful.
Do not conflate different measure labels. In particular, "NEET rate" and "NEET or activity not known rate" are different measures. If the user asks for NEET rate, use NEET-only values. If the available row is "NEET/Not known", name it that way.
Do not offer extra calculations or follow-up options unless the user asks for them or they are needed to clarify an ambiguity.
For calculations, follow official-statistics style discipline: do not add, subtract, or average percentages unless the context explicitly says that method is valid.
For combined rates, use numerator counts divided by denominator counts. If those counts are missing, say the calculation cannot be done from the available content.
When a verified backend calculation is provided, use that result exactly and explain its method. Do not recalculate or alter it.
For policy questions, first interpret "policy" as Brunel Centre policy insights, research, or policy-relevant evidence. If the user is asking for a formal government policy launch and the context does not show one, say that clearly.
For latest or upcoming news questions, use News page or Featured News context when available, and include dates. Do not claim there is no news feed if the context contains homepage Featured News.
For multi-topic questions, count the requested topics correctly. Say "all three topics", "two of the three topics", "one of the three topics", or similar based on the confirmed topic-source map. Do not say "both topics" unless the user asked about exactly two topics.
For multi-topic questions, cover each requested topic under its own heading. Use the confirmed topic-source map first. Only list a source title as confirmed if it has a URL/source record in that map.
If a topic has only a possible unlinked match, say: "I found a possible matching title in the retrieved results, but I do not have a source link for it."
If one part is not found, say "I found sources for [X], but I did not find a directly relevant Brunel Centre source for [Y] in the retrieved results." Do not turn a retrieval miss into a claim that Brunel Centre has no content on that topic.
Do not use vague source wording such as "Source titles: the Brunel Centre data hub posts above."
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
    const history = sanitizeHistory(body.history);

    if (!message) {
      sendError(res, 400, "Message is required.");
      return;
    }

    const smallTalkIntent = classifySmallTalk(message);
    if (smallTalkIntent) {
      res.status(200).json({
        answer: SMALL_TALK_RESPONSES[smallTalkIntent],
        sources: []
      });
      return;
    }

    const catalogueAnswer = await buildCatalogueAnswer({ message, history });
    if (catalogueAnswer) {
      res.status(200).json(catalogueAnswer);
      return;
    }

    if (isGreetingOnly(message)) {
      res.status(200).json({
        answer: "Hi — how can I help with Brunel Centre research or data?",
        sources: []
      });
      return;
    }

    if (isAcknowledgementOnly(message)) {
      res.status(200).json({
        answer: "Okay. You can ask about a Data Hub figure, a Brunel Centre research article, policy insights, or recent news.",
        sources: []
      });
      return;
    }

    const neetExplanation = buildNeetExplanationAnswer(message, history);
    if (neetExplanation) {
      res.status(200).json(neetExplanation);
      return;
    }

    const config = getServerConfig();
    const openai = createOpenAIClient(config);
    const supabase = createSupabaseClient(config);
    const includeRawFacts = shouldIncludeRawFacts(message);
    const useHistoryForRetrieval = shouldUseHistoryForRetrieval(message);
    const retrievalQuery = buildRetrievalQuery(message, history);
    const retrievalPlan = buildRetrievalPlan({ message, primaryQuery: retrievalQuery });
    const promptHistory = useHistoryForRetrieval
      ? formatHistory(history)
      : "Not used because the current question is a new topic.";

    if (shouldUseStatisticalBackend(message)) {
      const statisticalContextMessage = shouldUseHistoryForStatisticalFollowUp(message)
        ? retrievalQuery
        : message;
      const statisticalAnswer = await buildStatisticalAnswer({
        supabase,
        message,
        contextMessage: statisticalContextMessage
      });
      if (statisticalAnswer) {
        res.status(200).json(statisticalAnswer);
        return;
      }
    }

    const embeddingResponse = await openai.embeddings.create({
      model: config.embeddingModel,
      input: retrievalPlan.embeddingQueries
    });

    const queryEmbeddings = embeddingResponse.data.map((item) => item.embedding);
    const [
      documentGroups,
      datasetSummaryGroups,
      datasetRowGroups,
      datasetFactGroups
    ] = await Promise.all([
      Promise.all(queryEmbeddings.map((queryEmbedding, index) =>
        requiredRpc(supabase, "match_brunel_documents", {
          query_embedding: queryEmbedding,
          match_count: retrievalPlan.isMultiConcept ? 6 : 5
        }).then((rows) => tagRetrievedRows(rows, retrievalPlan.embeddingQueries[index], index))
      )),
      Promise.all(queryEmbeddings.map((queryEmbedding, index) =>
        safeRpc(supabase, "match_brunel_dataset_summaries", {
          query_embedding: queryEmbedding,
          match_count: retrievalPlan.isMultiConcept ? 6 : 4
        }).then((rows) => tagRetrievedRows(rows, retrievalPlan.embeddingQueries[index], index))
      )),
      Promise.all(retrievalPlan.searchQueries.map((queryText, index) =>
        safeRpc(supabase, "search_brunel_dataset_rows", {
          query_text: queryText,
          match_count: retrievalPlan.isMultiConcept ? 8 : 8
        }).then((rows) => tagRetrievedRows(rows, queryText, index))
      )),
      includeRawFacts ? Promise.all(retrievalPlan.searchQueries.map((queryText, index) =>
        safeRpc(supabase, "search_brunel_dataset_facts", {
          query_text: queryText,
          match_count: retrievalPlan.isMultiConcept ? 12 : 12
        }).then((rows) => tagRetrievedRows(rows, queryText, index))
      )) : Promise.resolve([])
    ]);

    const matches = mergeSearchResults(documentGroups, {
      concepts: retrievalPlan.concepts,
      query: message,
      limit: retrievalPlan.isMultiConcept ? 10 : 5
    });
    const datasetSummaries = mergeSearchResults(datasetSummaryGroups, {
      concepts: retrievalPlan.concepts,
      query: message,
      limit: retrievalPlan.isMultiConcept ? 8 : 4
    });
    const datasetRows = mergeSearchResults(datasetRowGroups, {
      concepts: retrievalPlan.concepts,
      query: message,
      limit: retrievalPlan.isMultiConcept ? 12 : 8
    });
    const datasetFacts = mergeSearchResults(datasetFactGroups, {
      concepts: retrievalPlan.concepts,
      query: message,
      limit: retrievalPlan.isMultiConcept ? 16 : 12
    });

    const sources = dedupeSources(matches || []);
    const datasetSources = dedupeDatasetSources(datasetSummaries, datasetRows, datasetFacts);

    if (!sources.length && !datasetSummaries.length && !datasetRows.length && !datasetFacts.length) {
      const fallbackAnswer = retrievalPlan.isMultiConcept
        ? "I did not find directly relevant Brunel Centre sources in the retrieved results for those topics. Try asking about one topic at a time, or include the specific place, year, or dataset you want to explore."
        : "I do not have enough Brunel Centre content loaded to answer that yet. Try asking about the Strategic Economic Audit, wages, employment rates, GDP, or what the Brunel Centre does.";
      res.status(200).json({
        answer: fallbackAnswer,
        sources: []
      });
      return;
    }

    const context = formatContext(matches);
    const datasetContext = formatDatasetContext(datasetSummaries, datasetRows, datasetFacts, includeRawFacts);
    const topicSourceContext = formatTopicSourceContext(retrievalPlan, [
      ...(matches || []),
      ...(datasetSummaries || []),
      ...(datasetRows || []),
      ...(datasetFacts || [])
    ]);
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
            "Recent conversation:",
            promptHistory || "No recent conversation.",
            "",
            "Retrieval strategy:",
            describeRetrievalPlan(retrievalPlan) || "Standard single-topic retrieval was used.",
            "",
            "Confirmed topic-source map:",
            topicSourceContext || "Not applicable.",
            "",
            "Brunel Centre article context:",
            context || "No article context found.",
            "",
            "Analysis dataset fallback context. Use this only if the article context does not contain the exact value, or if the user asks for calculation/counts/method detail:",
            datasetContext || "No dataset context found."
          ].join("\n")
        }
      ]
    });

    const answer = completion.choices?.[0]?.message?.content?.trim();

    const allSources = [...sources, ...datasetSources];
    const visibleSources = filterSourcesForAnswer(answer, allSources);

    res.status(200).json({
      answer: answer || "I could not generate an answer. Please try again.",
      sources: visibleSources
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

async function requiredRpc(supabase, name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data || [];
}

function tagRetrievedRows(rows, query, queryIndex) {
  return (rows || []).map((row) => ({
    ...row,
    retrieval_query: query,
    retrieval_query_index: queryIndex
  }));
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .map((item) => ({
      role: item.role,
      content: String(item.content || "").replace(/\s+/g, " ").trim().slice(0, 1200)
    }))
    .filter((item) => item.content)
    .slice(-8);
}

function formatHistory(history) {
  return history
    .map((item) => `${item.role === "user" ? "User" : "Assistant"}: ${item.content}`)
    .join("\n");
}

function buildRetrievalQuery(message, history) {
  const expandedMessage = expandRetrievalQuery(message);
  if (!shouldUseHistoryForRetrieval(message)) return expandedMessage;

  const recent = history.slice(-6)
    .map((item) => `${item.role}: ${item.content}`)
    .join("\n");

  return recent
    ? `${recent}\ncurrent user question: ${expandedMessage}`
    : expandedMessage;
}

function expandRetrievalQuery(message) {
  const clean = normalizePlainText(message);
  const additions = [];

  for (const item of RETRIEVAL_EXPANSIONS) {
    const matched = item.aliases.some((alias) => phraseInText(clean, normalizePlainText(alias)));
    if (matched) additions.push(item.expansion);
  }

  if (phraseInText(clean, "greater west of england") || phraseInText(clean, "gwe")) {
    additions.push(
      "Greater West of England Bath and North East Somerset Bristol Gloucestershire North Somerset South Gloucestershire Swindon Wiltshire local authorities"
    );
  }

  if (/\b(news|latest|recent|upcoming|announcement|announcements)\b/.test(clean)) {
    additions.push("The Brunel Centre News Featured News latest news recent news announcements homepage");
  }

  if (/\b(policy|policies|policy insight|policy insights|launch|released|release)\b/.test(clean)) {
    additions.push("Brunel Centre policy insights policy-relevant research Strategic Economic Audit consultancy government decision making");
  }

  if (/\b(datahub|data hub)\b/.test(clean)) {
    additions.push("Data Hub landing page data sectors topics themes publicly accessible data");
  }

  return additions.length
    ? `${message}\nSearch expansions: ${[...new Set(additions)].join("; ")}`
    : message;
}

function shouldUseHistoryForRetrieval(message) {
  const clean = normalizePlainText(message);
  if (!clean) return false;

  if (isStandaloneQuestion(clean)) return false;

  return isFollowUpReference(clean);
}

function shouldUseHistoryForStatisticalFollowUp(message) {
  const clean = String(message || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return false;
  if (/\b(age|aged|male|female|sex|gender|split|breakdown|by|explain|difference|differences|definition|define|meaning|basically|mean|means)\b/.test(clean)) return false;

  return isFollowUpReference(clean);
}

function isStandaloneQuestion(clean) {
  return /\b(what|which|where|when|why|how|who|tell me|show me|give me|could you|can you|do they|does it|does the|is there|are there|i want to know|would love to know)\b/.test(clean) &&
    /\b(neet|employment|gdp|wage|wages|population|housing|transport|emissions|productivity|skills|sectors|data|datahub|policy|policies|news|latest|recent|research|article|articles|rate|rates|percent|percentage)\b/.test(clean);
}

function isFollowUpReference(clean) {
  return /^(yes|yeah|yep|that|those|same|also|and for|what about|can you give that|give that|can you do that|do that|is that)\b/.test(clean) ||
    /\b(as well|that as well|those as well|for that|for them|the same)\b/.test(clean);
}

function phraseInText(cleanText, cleanPhrase) {
  if (!cleanText || !cleanPhrase) return false;
  return new RegExp(`\\b${escapeRegExp(cleanPhrase).replace(/\\s+/g, "\\s+")}\\b`).test(cleanText);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildNeetExplanationAnswer(message, history) {
  const clean = normalizePlainText(message);
  const recent = normalizePlainText(formatHistory(history));
  const asksNeetMeaning =
    /\b(what is|what are|what does|what do|meaning of|define|definition|basically)\b/.test(clean) &&
    /\bneet\b/.test(clean);
  const asksDifference =
    /\b(explain|difference|differences|different)\b/.test(clean) &&
    (/\bneet\b/.test(clean) || /\bneet\b/.test(recent));

  if (!asksNeetMeaning && !asksDifference) return null;

  return {
    answer: [
      "NEET means young people who are not in education, employment or training.",
      "",
      "In this Brunel Centre dataset, the measures are separate:",
      "",
      "- **NEET rate**: the proportion of 16- and 17-year-olds recorded as NEET.",
      "- **Activity not known rate**: the proportion whose education, employment or training status is not known.",
      "- **NEET or activity not known rate**: a combined measure that counts both groups together.",
      "",
      "So the NEET rates you asked for Bristol and Swindon are NEET-only values, not the combined \"NEET or activity not known\" values.",
      "",
      "Source: NEET and activity not known among 16- and 17-year-olds in the Greater West of England, 2025."
    ].join("\n"),
    sources: []
  };
}

function normalizePlainText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function formatTopicSourceContext(retrievalPlan, items) {
  if (!retrievalPlan?.isMultiConcept || !retrievalPlan.concepts?.length) return "";

  const topicSections = [];
  const foundTopics = [];
  const missingTopics = [];

  for (const concept of retrievalPlan.concepts) {
    const label = conceptLabel(concept);
    const matches = (items || []).filter((item) => sourceMatchesConcept(item, concept));
    const confirmed = dedupeTopicSources(matches.filter((item) => getSourceUrl(item)));
    const possible = dedupeTopicSources(matches.filter((item) => !getSourceUrl(item)));

    if (confirmed.length) {
      foundTopics.push(label);
    } else {
      missingTopics.push(label);
    }

    const lines = [`${label}:`];

    if (confirmed.length) {
      lines.push("Confirmed linked sources:");
      confirmed.slice(0, 3).forEach((source) => {
        lines.push(`- ${source.title} | ${source.url}`);
      });
    }

    if (possible.length) {
      lines.push("Possible unlinked matches:");
      possible.slice(0, 2).forEach((source) => {
        lines.push(`- ${source.title}`);
      });
    }

    if (!confirmed.length && !possible.length) {
      lines.push("- No directly relevant source was found in the retrieved results.");
    }

    topicSections.push(lines.join("\n"));
  }

  const total = retrievalPlan.concepts.length;
  const found = foundTopics.length;

  return [
    `Requested topic count: ${total}.`,
    `Confirmed linked topic count: ${found}.`,
    `Coverage phrase to use: ${coveragePhrase(found, total)}.`,
    foundTopics.length ? `Topics with confirmed linked sources: ${foundTopics.join(", ")}.` : "Topics with confirmed linked sources: none.",
    missingTopics.length ? `Topics without confirmed linked sources: ${missingTopics.join(", ")}.` : "Topics without confirmed linked sources: none.",
    "Use the topic headings below. Do not list a source as confirmed unless it appears under Confirmed linked sources with a URL.",
    "",
    ...topicSections
  ].join("\n");
}

function dedupeTopicSources(items) {
  const seen = new Set();
  const sources = [];

  for (const item of items || []) {
    const title = getSourceTitle(item);
    const url = getSourceUrl(item);
    const key = url || title;
    if (!title || !key || seen.has(key)) continue;
    seen.add(key);
    sources.push({ title, url });
  }

  return sources;
}

function getSourceTitle(item) {
  return item?.title || item?.post_title || item?.workbook_name || "";
}

function getSourceUrl(item) {
  return item?.url || item?.post_url || "";
}

function coveragePhrase(found, total) {
  if (found === total) return `all ${numberWord(total)} topics`;
  if (found === 0) return `none of the ${numberWord(total)} topics`;
  return `${numberWord(found)} of the ${numberWord(total)} topics`;
}

function numberWord(value) {
  const words = {
    1: "one",
    2: "two",
    3: "three",
    4: "four",
    5: "five",
    6: "six"
  };

  return words[value] || String(value);
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

function filterSourcesForAnswer(answer, allSources) {
  const sources = (allSources || []).filter((source) => source?.url);
  if (!sources.length) return [];

  const cleanAnswer = normalizePlainText(answer);
  if (!cleanAnswer) return sources.slice(0, 2);

  const matched = [];
  const seen = new Set();

  for (const source of sources) {
    const title = normalizePlainText(source.title);
    if (!title) continue;

    const titleTokens = title.split(" ").filter((token) => token.length > 3);
    const tokenMatches = titleTokens.filter((token) => cleanAnswer.includes(token)).length;
    const enoughTokenMatches = titleTokens.length > 0 && tokenMatches >= Math.min(3, titleTokens.length);

    if (!cleanAnswer.includes(title) && !enoughTokenMatches) continue;

    const key = source.url || source.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    matched.push(source);
  }

  return matched.length ? matched : sources.slice(0, 2);
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

function shouldUseStatisticalBackend(message) {
  return /\b(calculate|calculation|compute|computed|combined|combine|weighted|average|aggregate|aggregated|cohort|count|counts|numerator|denominator|method|raw)\b/i.test(message);
}

function classifySmallTalk(message) {
  const raw = String(message || "").trim();
  const clean = normalizeSmallTalk(raw);
  if (!clean) return isUnclearShortInput(clean, raw) ? "unclear" : null;
  if (isLikelyRealQuestion(clean)) return null;

  if (isFarewell(clean)) return "farewell";
  if (isThanks(clean)) return "thanks";
  if (isAcknowledgement(clean)) return "acknowledgement";
  if (isGreeting(clean, raw)) return "greeting";
  if (isUnclearShortInput(clean, raw)) return "unclear";
  return null;
}

function normalizeSmallTalk(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/'/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyRealQuestion(clean) {
  if (clean.split(" ").length <= 3) return false;

  return /\b(what|which|where|when|why|how|who|can|could|would|tell|show|give|explain|summarise|summarize|compare|list|find|get|provide|source|sources|breakdown|rate|rates|data|research|article|hub|wage|wages|employment|neet|gdp|emissions|productivity|skills|sectors|housing|transport|policy|news|economy|economic|regional)\b/.test(clean);
}

function isFarewell(clean) {
  return /^(bye|goodbye|see you|see ya|talk later|thanks bye|thank you bye|ok bye|okay bye)$/.test(clean);
}

function isThanks(clean) {
  return /^(thanks|thank you|thankyou|cheers|many thanks|thanks a lot|thank you very much)$/.test(clean);
}

function isGreeting(clean, raw) {
  if (/[?]{2,}/.test(raw)) return false;
  return /^(hi|hii|hello|hey|hiya|helo|heelo|good morning|good afternoon|good evening)$/.test(clean);
}

function isAcknowledgement(clean) {
  return /^(ok|okay|cool|fine|great|thats great|that is great|brilliant|perfect|nice|nice one|good|good to know|sounds good|got it|understood|makes sense|thats helpful|that is helpful|very helpful|helpful|excellent|amazing|alright|all right|no problem|great thanks|thats great thanks|that is great thanks|perfect thanks|brilliant thanks|thanks thats helpful|thanks that is helpful|okay thanks|ok thanks|cool thanks)$/.test(clean);
}

function isUnclearShortInput(clean, raw) {
  const compactRaw = raw.replace(/\s+/g, "");
  if (/^[?.!]+$/.test(compactRaw)) return true;
  if (/^\.+$/.test(compactRaw)) return true;
  if (/[?]{2,}/.test(raw) && clean.split(" ").length <= 2) return true;
  if (/^(help|what|huh|eh|erm|um|random)$/.test(clean)) return true;

  return clean.length <= 2;
}

function isGreetingOnly(message) {
  const clean = String(message || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return /^(hi|hello|hey|hiya|good morning|good afternoon|good evening|thanks|thank you)$/.test(clean);
}

function isAcknowledgementOnly(message) {
  const clean = String(message || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return /^(ok|okay|alright|all right|fine|great|cool|got it|understood|no problem|sounds good)$/.test(clean);
}
