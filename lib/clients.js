import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export function createOpenAIClient(config) {
  return new OpenAI({
    apiKey: config.openaiApiKey
  });
}

export function createSupabaseClient(config) {
  return createClient(config.supabaseUrl, config.supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
