export function getServerConfig() {
  const config = {
    openaiApiKey: process.env.OPENAI_API_KEY,
    chatModel: process.env.OPENAI_CHAT_MODEL || "gpt-4.1-mini",
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
    ingestSecret: process.env.INGEST_SECRET
  };

  const missing = Object.entries({
    OPENAI_API_KEY: config.openaiApiKey,
    SUPABASE_URL: config.supabaseUrl,
    SUPABASE_SECRET_KEY: config.supabaseKey
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return config;
}
