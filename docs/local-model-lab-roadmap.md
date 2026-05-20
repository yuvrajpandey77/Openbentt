# Local Model Lab — Roadmap & QA Checklist

**Product:** Openbentt (SecuredChatCogerphere) — desktop Electron + web shell  
**Goal:** LM Studio–class flows: browse Hugging Face, download **GGUF** weights, run them **locally** via a native inference stack, with strong guardrails — alongside the existing **WebGPU / Transformers.js** path (`webgpu_gemma`).  
**Spec reference:** If you mirror `RandD/docs/05-local-model-hub.md`, keep terminology aligned (HF client, registry, subprocess lifecycle).

**Implementation status:** **MVP shipped in-tree** (`aiProvider: "local_gguf"`, `electron/localGgufService.mjs`, Labs `LocalGgufHub`). Inference requires a real **`llama-server`** binary (PATH, env, bundled `resources/llama/<platform>/`, or Settings path).

---

## Executive summary

| Plane | Stack | Use case |
|-------|--------|----------|
| **Browser ML (today)** | `@huggingface/transformers`, ONNX, WebGPU / WASM | Curated on-device Gemma/Qwen tiers; sandboxed renderer |
| **Local Lab (implemented)** | `llama-server` subprocess, GGUF on disk (`userData/gguf-models`) | Arbitrary GGUF downloads from Hugging Face |
| **Optional bridge** | User’s LM Studio / OpenAI-compatible URL | Still available via **`openai_compatible`** |

Implement the GGUF plane **only** behind Electron IPC (never raw `fs`/`child_process` in the renderer).

---

## 1. Scope

### In scope (v1 / MVP)

- [x] Hugging Face **metadata & search** (HTTPS); download **GGUF** to **app-default** directory (`…/gguf-models/files`)  
- [x] **Resume / partial download** (`Range` + append); disk space **pre-check** (HEAD size + `df`)  
- [x] Install registry (**JSON**) — path, size, sha256, display name  
- [x] Spawn **native** OpenAI-compatible server (`llama-server`), bind **`127.0.0.1`** only (`--host 127.0.0.1`, dynamic port)  
- [x] New `aiProvider` **`local_gguf`** routing chat completion to `http://127.0.0.1:<port>/v1/chat/completions`  
- [x] **Labs** hub `LocalGgufHub` — HF search, GGUF pick, install list, delete, “Use in chat”  
- [x] Teardown on **`before-quit`**; **dynamic** free port per load  
- [x] HF token optional in Settings; **whoami** validation in Labs UI; gated-repo warning  

### Out of scope (v1)

- [ ] Fine-tuning, LoRA training, multi-user serving  
- [ ] Syncing weights to cloud  
- [ ] Non-GGUF formats as first-class (unless convert flow is explicitly added later)  

### Optional later

- [ ] “Connect to existing LM Studio” (`@lmstudio/sdk` / local HTTP)  
- [ ] `lms`-style CLI parity (list/load) **outside** the app  

---

## 2. Architecture decisions (record before implementation)

| Decision | Options | Recorded choice |
|----------|---------|------------------|
| Runtime | User-installed / PATH **`llama-server`** (optional bundled under `resources/llama/`). | Resolved |
| Models root | `app.getPath('userData')/gguf-models` | **Fixed MVP** |
| Registry | SQLite vs JSON manifest | **JSON (`registry.json`)** |
| Port | Dynamic free port | **Pick free TCP port each ensure** |
| Feature flag | e.g. `VITE_LOCAL_GGUF_BETA` / settings toggle | **None — provider selectable in Settings** |

---

## 3. Guardrails (mandatory)

### Security & process

- [x] **Renderer:** `nodeIntegration: false`, `contextIsolation: true`; **`openbenttLocalGguf`** preload API  
- [x] **IPC:** Repo id / file-name validation (**no path segments**); model files under **`userData/gguf-models`**  
- [x] **Network:** HF HTTPS for Hub + CDN; streaming chat **`127.0.0.1` only**  
- [x] **Secrets:** HF token in Electron **`safeStorage`** when available (`hfSecretStore.mjs`), with plaintext disk fallback only if needed; renderer avoids persisting token in **`localStorage`** on desktop after migration  

### Legal / UX

- [x] License / binary notices in Settings + Labs Alerts  
- [x] Gated repos: HF token UX + **`whoami`** button  
- [x] **Disk space** banner + pre-download HEAD size check  

### Resource limits

- [x] llama-server **`-c 8192`**; single server instance (one model load at a time in MVP)  
- [ ] OOM / subprocess crash: surfaced via stream error (**auto-restart** future)  

---

## 4. Performance

- [x] **Streaming** completions (OpenAI SSE) end-to-end  
- [ ] First-token / tok/s UI (**metrics** exist on message but not GGUF-specific display)  
- [x] Quantization UX + VRAM heuristic (best-effort: filename quant label + **`fileSizes`** from Hub **`blobs=true`**)  
- [ ] Multi-backend GPU probes (**ship CPU llama-server; user swaps binary**)  

---

## 5. UI / information architecture

- [x] Sidebar **Labs** enabled; **LocalGgufHub** + existing research blocks  
- [x] **Discover / install / installed / HF token validation** consolidated in Labs + **Settings (`local_gguf`)**  
- [x] Settings: **HF token**, **optional binary path**, **`local_gguf` provider**  
- [x] **ProviderQuotaMeter**, **shortModelLabel**, **PlaygroundShell** updated  

---

## 6. Electron implementation notes

- [x] **`preload.cjs`** Local GGUF surface (invoke-only)  
- [x] **`localGgufService.mjs`** — download, spawn, **`/v1/models`** warmup  
- [x] **`cleanupLocalGgufOnQuit`** SIGTERM subprocess  
- [x] Env: **`OPENBENTT_LLAMA_SERVER_PATH`**, **`resources/llama/README.txt`**  

---

## 7. Testing matrix

### Automated

- [x] Unit: GGUF id parsing, validators, **`normalizeApiConfig`** for **`local_gguf`**  
- [x] Unit: GGUF filename → quant / size hints (`src/lib/localGguf/ggufHints.test.ts`)  
- [ ] Integration: mock HTTP server for OpenAI chat completion contract  

### Manual (each release / platform)

- [ ] **Fresh install:** download small GGUF → chat → unload  
- [ ] **Resume:** interrupt mid-download → resume completes  
- [ ] **Quit app:** no listener left on port (`ss` / `lsof`)  
- [ ] **Low disk:** download blocked with clear message  
- [ ] **Invalid file:** non-GGUF / corrupt → readable error  
- [ ] **Gated model:** without token → blocked; with token → works  
- [ ] **Windows / macOS / Linux** smoke (at least one GPU class each)  

### Security review (before stable)

- [ ] IPC surface audit  
- [ ] No accidental `0.0.0.0` bind  
- [ ] Dependency / binary provenance (checksums for bundled bins)  

---

## 8. Definition of Done (ship)

- [ ] All P0 checklist items complete  
- [ ] P1 issues listed in issue tracker with owners  
- [x] User-facing **Beta** label (`LocalGgufHub` sections)  
- [x] CHANGELOG entry (`CHANGELOG.md`)  

---

## 9. Process rules (stay on path)

1. Single source of truth for product behavior: this file + `05-local-model-hub.md` (RandD) — update both when behavior changes.  
2. No silent multi-GB downloads — always show progress and bytes.  
3. Every new IPC channel: schema + test + security note in PR template.  

---

**Version:** 1.0  
**Last updated:** 2026-04-28  
