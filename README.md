# Openbentt

A **local-first** React app for **OpenRouter**: pick free (and custom) models, stream replies, compare **2–4 models** side by side with **latency and token metrics**. Your **API key stays in the browser** (localStorage).

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
| **Charts** | Assistant can output fenced ` ```openbentt-chart` JSON → **Recharts** bar/line/area in the thread. Legacy ` ```cogerphere-chart` fences are still parsed. |
| **Workspaces** | **Notebook** (LaTeX/PDF), **Research labs**, **LaTeX preview**, **Benchmark**, **WebGPU** — route-aware system prompts. |
| **Retry / Edit** | **Retry** on the last assistant reply; **Edit** (pencil on user bubble) reloads the composer. |
| **Thread tools (Home)** | **Search** the current chat, **Export .md** (full conversation), **Shortcuts** sheet; composer **Snippets** (saved prompts, local only). |
| **Theme** | Light default; dark mode in Settings. |
| **Analytics** | Vercel Analytics (if deployed on Vercel). |

### Branding note

The product name is **Openbentt**. Older localStorage keys and chart fences may still use the legacy `cogerphere-*` prefix; the app migrates storage on first load.

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

## Docker

```bash
npm run docker:build
docker compose up --build
```

Service name: **openbentt** (see `docker-compose.yml`).

## Stack

Vite, TypeScript, React, shadcn/ui, Tailwind CSS, TanStack Query, React Markdown, Vitest.

See **`PRODUCTION_CHECKLIST.md`** for a pre-release verification list.

## Open source

This repo is suitable for **public open source**: there is **no server-side login** in the app; users bring their own **OpenRouter** key (stored in the browser). Before publishing:

- Add a **`LICENSE`** file (e.g. MIT) with your copyright line.
- Do **not** commit `.env` files with real API keys; use **`.env.example`** as a template.
- Review **third-party scripts** and analytics (e.g. Vercel Analytics) for your policy.

## SEO & social previews

Build injects **canonical**, **Open Graph**, **Twitter Card**, **theme-color**, **Web App Manifest**, **`robots.txt`**, and **JSON-LD** (`WebApplication`). For best link previews on Slack/X/LinkedIn, set at build time:

```bash
export VITE_PUBLIC_SITE_URL=https://your.domain
npm run build
```

See `.env.example`. **Lighthouse “SEO”** is usually **100** on a static deploy with a real `<title>`, meta description, crawlable document, and valid `robots.txt`; scores can vary with route structure and third-party scripts—verify in Chrome DevTools → Lighthouse on your production URL.
