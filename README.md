# Orvelis AI

Orvelis is the AI assistant for [Datariot](https://datariot.xyz).

The authenticated `orvelis-ai` Supabase Edge Function serves the web and mobile clients. General chat, daily insights, text analysis and debate prompts use OpenAI Responses with Gemini as a fallback. Deep Dive and video chat use Gemini for supported clips and can fall back to an OpenAI audio transcript. The client identifies each clip by ID. Older releases can still use their original request format.

Configure `OPENAI_API_KEY` and `GEMINI_API_KEY` in the Datariot project's Edge Function Secrets. Default model IDs are `gpt-5.4-mini` and `gemini-3.5-flash-lite`. To select a different compatible model, set `ORVELIS_OPENAI_MODEL` or `ORVELIS_GEMINI_MODEL`.

The gateway sends a supported public clip URL to Gemini, or sends the media to the OpenAI transcription endpoint when the Gemini request fails or isn't available. The gateway resolves the clip from the authenticated user's visible video row and only sends media from approved hosts. When the video and audio are unavailable, the answer identifies the limited evidence.
