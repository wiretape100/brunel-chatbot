import { getServerConfig } from "../lib/config.js";
import { applyCors, sendError } from "../lib/http.js";
import { ingestSources } from "../lib/ingest.js";

export default async function handler(req, res) {
  applyCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    sendError(res, 405, "Use GET or POST for ingestion.");
    return;
  }

  try {
    const config = getServerConfig();
    const providedSecret = req.query.secret || req.headers["x-ingest-secret"];

    if (!config.ingestSecret || providedSecret !== config.ingestSecret) {
      sendError(res, 401, "Invalid ingest secret.");
      return;
    }

    const result = await ingestSources({
      offset: parsePositiveInteger(req.query.offset, 0),
      limit: parseOptionalPositiveInteger(req.query.limit)
    });

    res.status(200).json({ ok: result.failed === 0, ...result });
  } catch (error) {
    sendError(res, 500, "Ingestion failed.", error.message);
  }
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseOptionalPositiveInteger(value) {
  if (value === undefined || value === null || value === "") return undefined;

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
