# Orvelis AI

Text AI for [Datariot](https://datariot.xyz). Web and mobile share the authenticated Supabase Edge Function `orvelis-ai`.

The production text release handles chat, daily insights, analysis of supplied text and debate prompts. Configure `OPENAI_API_KEY` for OpenAI Responses and optionally `GEMINI_API_KEY` as a text fallback in the project's Supabase Edge Function Secrets. Clip-analysis requests receive a clear availability message. The function does not read or send stored clip media or metadata.

Run `node --test tests/text-gateway.test.mjs` on Node 24 to verify routing with mocked APIs.
