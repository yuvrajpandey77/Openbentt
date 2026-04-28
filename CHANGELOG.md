# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- **Desktop — Hugging Face token:** Electron `safeStorage` (with restricted-permissions file fallback) via `electron/hfSecretStore.mjs`; IPC `hfSecret:*` and Settings/Labs UI to store, validate, and clear without persisting plaintext in `localStorage` when possible.
- **Local GGUF Labs:** Quantization label and rough minimum VRAM hints for selected GGUF files (Hub `blobs=true` metadata for file sizes); Beta badges; gated-repo and token validation aligned with OS-stored credentials.
- **Inference:** `llama-server` stderr capture on warmup failures; Hugging Face model listing uses `?blobs=true` for per-file sizes.

### Changed

- **Local GGUF hub:** `addFromHf` / downloads use the stored HF token from the main process when the renderer does not pass a token; shared React Query key `hf-secret-status` for Settings and Labs.
