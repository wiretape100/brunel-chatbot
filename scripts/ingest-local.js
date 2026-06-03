import "dotenv/config";
import { ingestSources } from "../lib/ingest.js";

try {
  const result = await ingestSources();
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
