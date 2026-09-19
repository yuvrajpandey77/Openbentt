# PHASE 9 AUDIT — Openbentt Repository (pre-implementation)

Date: 2026-09-17. Scope: Openbentt standalone desktop app. Cobentt is
OUT OF SCOPE (screenshots used as UX reference only; no code import,
no product switcher).

## 1. Entry & routing (A–E)

- Electron `START_PATH = "/projects"` (`electron/main.mjs`); `/` on desktop
  redirects to `/projects` (`src/App.tsx` → `RootMarketingOrElectronRedirect`).
- **Default landing surface = ProjectsHubPage** (`src/pages/ProjectsHubPage.tsx`),
  mounted under `AppShell` WITHOUT `AppLayout` (no sidebar/chat chrome).
  `NotebookStudioPage` (`/notebook`) is the same: full-screen studio shell.
- **Chat route = `/chat`** (desktop only), rendering `HomeChatArea`
  (message list only) inside `AppLayout`, which adds the global `ChatInput`
  footer + `Sidebar`. So Chat DOES exist as a surface, but it is NOT the
  default and is unreachable without knowing where it lives.
- **No `/library` route exists.** Sidebar items `Artifacts` (`/artifacts`),
  `Code` (`/code`) point at non-existent routes; `Customize` points at `#`.
  These are dead controls (spec §92 failure in current tree).
- Workspace routes (`/labs`, `/write`, `/benchmark`, `/webgpu`) render inside
  `AppLayout` with a split-pane chat + workspace panel. Projects/Notebook do
  NOT share this shell → **the "three applications" feeling**: Projects shell
  vs Notebook shell vs AppLayout shell (different backgrounds, headers,
  navigation, composer presence).
- **Root cause of the split**: two chrome roots (`AppShell`-only pages vs
  `AppLayout` pages) + Projects-first default + dead sidebar destinations.

## 2. Model selection & local models (F–G, N–O)

- Selection lives in `ChatInput` (model dropdown: OpenRouter catalogue,
  WebGPU on-device, GGUF registry entries, generic OpenAI-compatible
  endpoint) and `SetupPage` (provider cards: ondevice / openrouter /
  local-server / local_gguf). No single global model picker component.
- **Ollama support today = generic `openai_compatible` provider**: base URL
  field + `probeOllamaModels()` hitting `/v1/models` only
  (`src/lib/modelManager/ollamaProbe.ts`). No native Ollama API usage:
  no `/api/version`, no `/api/tags` metadata, no `/api/ps`, no `/api/pull`,
  no install guidance, no download progress. `buildModelManagerSnapshot`
  SKIPS the probe unless `aiProvider === "openai_compatible"`, so Ollama
  models are invisible in every other provider mode.
- **GGUF/llama.cpp** (`electron/localGgufService.mjs` + `src/lib/localGguf/*`):
  full pipeline exists (HF search → registry download with resume →
  `llama-server` binary resolve → `ensureServer` health check → streaming
  via `streamLocalGguf`). Root-cause audit findings:
  1. Binary resolution depends on a downloadable `llama-server` resource
     (`resources/llama/<platform>`) or a manually configured path; when the
     resource is absent the UI surfaces low-level path/config errors.
  2. `ensureServer` spawns a long-lived local process and health-checks it;
     failure modes (port taken, binary missing, spawn failure) surface as
     technical errors in provider setup, blocking ordinary users.
  3. Normal users must understand GGUF repos/files/revisions/quants to get
     ANY local model — this is the UX break, not necessarily a code bug.
  Decision: keep GGUF fully working behind **Advanced**; default path becomes
  Ollama (spec §31/§45 option B with honest status + repair where cheap).
- New (unwired) `electron/ollamaService.mjs` + `ollamaService.test.mjs`
  provide loopback-only status/tags/ps/pull/install-info IPC. Must still be:
  registered in `main.mjs`, bridged in `preload.cjs`, consumed by renderer.

## 3. Authentication (H)

- **No authentication exists.** Sidebar profile is hardcoded (`"Yuvraj"`,
  `"Free plan"` in `src/components/Sidebar.tsx`). No session, no signup,
  no login, no route guard. `@clerk/clerk-react` is a declared dependency
  (unused). No Clerk publishable key is configured (`VITE_CLERK_PUBLISHABLE_KEY`
  absent). Web marketing routes are public; desktop routes are wide open.
- No auth-related IPC, storage, or guards to preserve — greenfield Clerk
  integration with publishable-key-only renderer config.

## 4. Persistence (I)

- Renderer `localStorage`: `openbentt-chats`, `openbentt-current-chat-id`,
  `openbentt-api-config` (non-secret projection; secrets migrate to desktop
  vault — see `src/lib/privacy/desktopSecrets.ts`), sidebar/panel flags,
  privacy prefs. Legacy `cogerphere-*` keys migrated once at startup.
- SQLite (`electron/researchDb.mjs`): research projects, drafts, knowledge,
  chat logs, embeddings meta, jobs, snapshots — Phase 4–8 state. Must not be
  reset; Phase 9 additions must be additive (new `app_state` keys only).
- OS secure storage: `secretVault` (`provider_api_key`, `brave_search_api_key`)
  via `safeStorage` + file fallback mode 0700; `hfSecretStore`,
  `zoteroSecretStore` same pattern. Clerk session: keep in Clerk's own
  storage; persist only non-sensitive product prefs locally.

## 5. IPC & security boundaries (J–K)

- `electron/preload.cjs`: `openbenttDesktop`, `openbenttLocalGguf`,
  `openbenttSecrets`, `openbenttZotero`, `openbenttResearch` (incl. Phase 7
  `connectorAuth`/`mcp` metadata-only + Phase 8 `actions`/`sync`/`workflows`/
  `agents`/`mcpserver` allowlisted ops). No generic exec channel — invariant
  holds. New Ollama bridge must follow the same pattern
  (`openbenttOllama` with 5 narrow methods).
- Trust chain intact: model → Phase 5 tool registry (`toolCore.mjs`) →
  Phase 6 runtime (`agent/*`) → Phase 7 connector security
  (`connectorSecurity.ts`) → Phase 8 action gate/approvals/audit. Phase 9
  adds no new execution path: Ollama service manages provider *availability*
  only; chat still streams through `aiStream`/`agentRuntime`.

## 6. Components (L–M)

- Reusable as-is: `ChatMessages`, `ChatInput`, `ChatContainer`,
  `AssistantContent`, `MarkdownCodeBlock`, `ModelDownloadProgressBar`,
  `AppSettingsDialog`/`SettingsPanel`, `ui/*` primitives, `CommandMenu`
  (`cmdk` dep present — check `CapabilitiesSheet`/shortcuts sheet),
  `ErrorBoundary`/`FeatureErrorBoundary`, toasts (`sonner` + `use-toast`).
- Visually inconsistent / to fix: `Sidebar` (dead items, hardcoded profile,
  no Library/Documents/Slides/Sheets/Deep Research/Websites nav, no local-AI
  status); `ProjectsHubPage` + `NotebookStudioPage` shells; `SetupPage`
  (provider-first instead of account-first); no onboarding, no auth screens,
  no global task/status center, no global model picker, no command palette
  wiring, no empty-state system for chat home.

## 7. What must remain untouched

Phase 4 RAG (`researchSources`, knowledge stores), Phase 5 tools, Phase 6
agent runtime, Phase 7 connectors/MCP, Phase 8 actions/approvals/sync/
workflows/audit, SQLite schema content, secret vaults, navigation policy,
updater, GGUF advanced pipeline. UI work sits ON TOP via adapters.
