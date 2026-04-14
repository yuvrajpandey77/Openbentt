# Cogerphere

A **local-first** React chat app for **OpenRouter**: pick free (and custom) models, stream replies, compare **2–4 models** side by side with **latency and token metrics**. Your **API key stays in the browser** (localStorage).

## What this project offers

| Capability | Description |
|------------|-------------|
| **OpenRouter chat** | Uses `https://openrouter.ai/api/v1/chat/completions` with streaming. |
| **Model directory** | Loads models from OpenRouter’s API; highlights **free-tier** models (`:free` / $0-style pricing). |
| **Custom model IDs** | Add any OpenRouter model id (including paid) in Settings. |
| **Tiled comparison** | One user message → parallel requests to multiple models → **grid of answers** with per-model **TTFT**, **total ms**, **tokens** (when the API returns usage). |
| **Chats** | Multiple conversations, titles from the first user message, persist locally. |
| **Specs** | **Specs** button next to the model opens pricing, context, modalities, and link to OpenRouter. |
| **Attachments** | Images, audio, and video (first-frame preview) → multimodal `messages` for OpenRouter. |
| **Charts** | Assistant can output fenced ` ```cogerphere-chart` JSON → **Recharts** bar/line/area in the thread. |
| **Retry / Edit** | **Retry** on the last assistant reply; **Edit** (pencil on user bubble) reloads the composer. |
| **Theme** | **Light (research lab)** default; refined **slate + teal** dark mode in Settings. |
| **Analytics** | Vercel Analytics (if deployed on Vercel). |

### What’s new (vs. a basic OpenRouter chat)

- Dynamic **model list** instead of only a hardcoded dropdown (plus **custom IDs**).
- **Multi-model tiling** for research and comparison.
- **Response metrics** (time-to-first-token, total time, token counts when available).
- **Config normalization** so saved **primary model** and **comparison set** persist correctly.
- **Research-focused** light/dark palettes, **model spec** dialog, **attachments**, **charts**, **retry/edit**, **smoother streaming** (RAF-batched updates).

### Out of scope (by design)

- **Offline / Ollama** — not routed through OpenRouter; would need another backend or base URL.
- **Server-side matplotlib** — charts are rendered in-browser (Recharts) from JSON the model emits.

## Requirements

- **Node.js** 18+ and **npm**
- An **OpenRouter API key** ([openrouter.ai/keys](https://openrouter.ai/keys)) — optional until you send a message; required for API calls.

No other API keys or env vars are required for local use.

## Scripts

```bash
npm install    # dependencies
npm run dev    # dev server (default: http://localhost:8080)
npm run build  # production build
npm run test   # unit tests (Vitest)
npm run lint   # ESLint
```

## Automated tests

```bash
npm run test
```

Covers **pure helpers**: `normalizeApiConfig`, `dedupeModels`, OpenRouter **free-model heuristics**, and label shortening. UI and live API calls are **manual** (see below).

## Manual testing checklist

1. **First run**: Open the app → enter OpenRouter key in the modal or **Settings** → **Save**.
2. **Single model**: Disable comparison → send a message → confirm streaming and **metrics** under the reply.
3. **Model list**: Open model dropdown → list should populate (needs valid key). Try switching models.
4. **Custom model**: Settings → add a model id (e.g. a paid id you have access to) → Save → appears in lists.
5. **Tiled comparison**: **Compare** (or Settings) → enable **Tiled comparison** → select **2–4** models → same prompt → **grid** of answers + per-tile metrics.
6. **Stop**: While streaming, **Stop** → stream aborts.
7. **Persistence**: Reload page → key, model choice, and comparison settings should remain.
8. **Theme**: Toggle dark/light in Settings.
9. **Chats**: New chat, switch chats, delete chat, clear all chats.

## Edit / deploy

Same as any Vite app: edit locally, `npm run build`, deploy the `dist/` folder (e.g. Vercel).

## Stack

Vite, TypeScript, React, shadcn/ui, Tailwind CSS, TanStack Query, React Markdown, Vitest.
