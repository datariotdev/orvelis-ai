# Orvelis AI

Datariot's AI service, including Gemini and DeepSeek routing, safety rules, prompts and evaluations.

## Architecture
Datariot client → authenticated Supabase Edge Function `orvelis-ai` → Gemini primary → DeepSeek fallback.

The deployed function belongs to the Datariot Supabase project. API keys must be configured as Supabase secrets: `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`.

## Status
The gateway was deployed previously; provider credentials and end-to-end fallback behavior still require verification. The source will be versioned in this repository; production is not changed by repository creation.
