# Gemini API Guide

This guide explains how to use Gemini as a hosted LLM provider for The CutList.

The app supports Gemini through `LLM_PROVIDER=gemini` and `GEMINI_MODEL=<model-id>`. The implementation sends strict JSON prompts to the Gemini `generateContent` REST API, so only text-output models that can return structured JSON are useful for playlist generation, import extraction, critique, and prompt harness testing.

## Recommended Models

Prefer these free-tier text-output models for The CutList:

| Use | Model from AI Studio table | Why |
| --- | --- | --- |
| Default free-tier prompt testing | Gemini 3.1 Flash Lite | Best free-tier quota in the table: 15 RPM, 250K TPM, 500 RPD. Use this first if AI Studio exposes a working API model ID for it. |
| Quality spot checks | Gemini 3 Flash | Lower free quota, but likely better instruction following and track selection than Lite-class models. Good for occasional harness runs. |
| Stable fallback | Gemini 2.5 Flash | Officially documented, free-tier text-output model. Good fallback when newer preview/free models are unavailable. |
| Cheap baseline | Gemini 2.5 Flash Lite | Useful for quick experiments, though the table only gives 20 RPD. |

The current code default is:

```bash
GEMINI_MODEL=gemini-2.5-flash
```

That default is conservative because `gemini-2.5-flash` is documented as a Gemini API model and has free-tier access. If AI Studio shows a newer free model ID for Gemini 3.1 Flash Lite, prefer that for prompt harness work because the quota is much better.

## Models To Avoid

Do not use these for The CutList’s LLM provider:

- Models with `0 / 0` free-tier quota, such as Pro entries in your free-tier table.
- TTS, image, video, live-audio, embedding, robotics, computer-use, and agent models.
- Image models such as Imagen or Nano Banana. They do not produce the playlist JSON this app expects.
- Embedding models. They are useful for retrieval, not playlist generation.

## Optional Experimental Models

Your table lists Gemma 4 26B and Gemma 4 31B with high free-tier request limits. Treat those as experimental for this app:

- They may be useful for high-volume schema and prompt-shape tests.
- They may be weaker than Gemini Flash models for music taste and exact track selection.
- Only use them if AI Studio exposes a compatible `generateContent` model ID and they reliably return strict JSON.

## Local Configuration

If `GEMINI_API_KEY` is exported in your shell, `.env.local` does not need to contain the key. It can contain only provider/model selection:

```bash
LLM_PROVIDER=gemini
GEMINI_MODEL=gemini-2.5-flash
```

For a newer model, use the exact model ID shown by AI Studio:

```bash
LLM_PROVIDER=gemini
GEMINI_MODEL=<ai-studio-model-id>
```

If the dev server was already running before you exported `GEMINI_API_KEY`, restart it so the process can see the variable.

## Prompt Harness

Run a single fixture against Gemini:

```bash
LLM_PROVIDER=gemini GEMINI_MODEL=gemini-2.5-flash PROMPT_HARNESS_FIXTURE=simple-additions npm run prompt:harness
```

If your API key is exported from `.zshrc`, source it in the same command:

```bash
/bin/zsh -lc 'source ~/.zshrc; LLM_PROVIDER=gemini GEMINI_MODEL=gemini-2.5-flash PROMPT_HARNESS_FIXTURE=simple-additions npm run prompt:harness'
```

Use `gemini-2.5-flash-lite` or the AI Studio model ID for Gemini 3.1 Flash Lite when you want more runs under the free tier.

## Quota Strategy

The prompt harness can consume multiple requests per fixture because it asks for intent JSON and candidate JSON separately. For free-tier testing:

- Use one fixture at a time with `PROMPT_HARNESS_FIXTURE=<id>`.
- Prefer the highest-RPD text-output model available to your account.
- Avoid running the full harness repeatedly on models capped at 20 RPD.
- Keep `LLM_DEBUG_RAW=0` unless debugging malformed model JSON.

## Verification Still Matters

Gemini can propose better candidates than a small local model, but The CutList should still treat every generated track as untrusted until provider verification succeeds. Good Gemini output improves candidate quality; it does not replace iTunes/MusicBrainz verification or deterministic playlist constraints.

