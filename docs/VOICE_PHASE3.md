# Voice Phase 3 — Local Speech I/O for Openbentt

**Voice is an input/output modality. It is never an execution pathway and never an approval authority.**

## 1. Selected runtimes and models

### STT: Xenova `whisper-tiny.en` via `@xenova/transformers` + `onnxruntime-node`

* Why: smallest production-quality offline ASR compatible with the existing stack. Both packages were already dependencies (embeddings) and already in the Electron pack list — zero new native modules, zero new bundle weight, cross-platform (Linux/macOS/Windows), CPU-first.
* Model: `Xenova/whisper-tiny.en` — ~75 MB ONNX (Whisper tiny.en, MIT license for the original weights; Xenova conversion under Apache-2.0). English-only tiny model: fastest, lowest memory (~200–300 MB RSS with onnxruntime), weakest on heavy accents — documented honestly below.
* Runtime behavior: lazily loaded on first utterance (`LocalWhisperEngine.load()`), FP32 CPU Execution Provider via `onnxruntime-node` by default. No GPU requirement; if onnxruntime exposes a GPU EP it may be used opportunistically, but nothing depends on it and no global GPU configuration is touched. Idle-unloads after 5 minutes without voice activity.
* Acquisition: downloaded once from Hugging Face Hub into `userData/voice-models` (transformers cache dir override) with user-visible progress, only after the user enables voice and starts a session. Never bundled, never silent, never at launch. Missing/corrupt model → honest DEGRADED/ERROR state, never fake transcription.
* Supported languages: English (tiny.en). No claim of universal language/accent support.

### TTS: OS-native local synthesizer (no model)

* Why: zero bundle, zero download, fully offline, cancellable OS processes on all three platforms.
* Backends: macOS `say` · Linux `espeak-ng` / `espeak` / `spd-say` (probed in that order) · Windows PowerShell `System.Speech` SAPI. Missing backend → clear ERROR directing the user (e.g. install espeak-ng), UI remains text-functional.
* One child process per utterance, SIGTERM → 500 ms → SIGKILL, never orphaned. No audio persisted.

## 2. Architecture

```text
Microphone (renderer getUserMedia, grant-gated)
  ↓ MediaRecorder + decode/downsample to 16 kHz mono PCM16
  ↓ chunked voice:audioChunk IPC (≤256 KiB/chunk, ≤60 s / 1.9 MB total)
  ↓ main-side memory buffer → LocalWhisperEngine → transcript
  ↓ buffer zeroed + discarded
  ↓ renderer harness: decideRoute → createTask(inputSource: voice)
  → OpenCode → OmniRoute → approvals → completion → SQLite/audit
  → summarizeForSpeech(events) → redact → local TTS → speaker
```

Files: `electron/voiceService.mjs` (single coordinator; engines are classes in the same file), `src/lib/agent/voiceCore.mjs` (pure shared core), `src/lib/agent/voiceCapture.ts` (renderer capture), `src/components/agent/VoiceControl.tsx` (UI).

## 3. Audio lifecycle

Capture (renderer) → PCM16 chunks (main memory, bounded) → STT → `Buffer.fill(0)` + session buffer reset → transcript (validated like typed text) → task prompt on Run. Cancel/stop/error/quit all clear buffers. Raw audio is never written to SQLite, events, audit, disk, or browser storage. No recording without an explicit utterance; no always-on listening.

## 4. Microphone permission

Default OFF (`micGrant=false`, `decidePermission` unchanged default-deny). `voice:startSession` (explicit button) → `REQUESTING_PERMISSION` + grant on → renderer `getUserMedia` → `voice:micReady` → READY, or `voice:micDenied` → ERROR + grant off. `navigationPolicy` grants Chromium `media` **only** when the main-side grant callback is true **and** the request is audio-only (video/camera details refused). Grant auto-clears when no live session remains and on quit. UI labels: off / requesting / active / muted / unavailable.

## 5. STT / TTS lifecycle

STT: `transcribe` refuses before load (no silent fake in production); load failure → session ERROR; crash/malformed output → ERROR, never stuck LISTENING (validation inside the fail-closed path — a real bug found by tests, fixed). Idle unload 5 min. TTS: `speak` validates + redacts first; per-utterance child; `stopSpeaking` → INTERRUPTED → READY (barge-in path). Engine crashes → ERROR + event; recovery = new utterance/session; quit kills everything.

## 6. Voice/task integration

`submitVoiceTask(transcript, opts)` → `submitHarnessTask({...opts, prompt: transcript, inputSource: "voice"})`. Same classifier, same `createTask`, same policy, same approvals. `inputSource` persisted via v14 `agent_tasks.input_source` (TEXT/VOICE metadata only). No `voiceTaskRunner`, no `voicePermissionManager`, no parallel engine.

## 7. Permission interaction

Voice can never approve. `voiceService.mjs` contains zero calls to `respondToPermission/approveAction/consumeApprovalForExecution/proposeAction/createTask/taskStore` (statically asserted in tests). Spoken "yes/okay/allow it" is just another transcript. Permission requests trigger the visual dialog plus an optional spoken notice ("Openbentt needs your permission…"). Verified by malicious-transcript E2E (denied, files intact).

## 8. Privacy controls

Memory-only audio; transcripts validated then treated as task input under existing retention/redaction; event payloads redacted including spoken-form secrets (`api key is X` — added after a privacy test caught the gap); no uploads (statically asserted: no `fetch(`/`http` in voiceService); no cloud fallback; no recording without consent.

## 9. Security threat model (see also THREAT_MODEL.md)

* Malicious transcript → classified + approval-gated like typed text.
* "Yes" speech → no authority.
* Oversized/stale/wrong-state audio → rejected, bounded.
* STT-injected instruction text → `[UNTRUSTED]`-equivalent handling via existing harness (transcript is prompt data, never policy).
* TTS speaks redacted summaries only; never raw tool output, keys, or env.
* Hijacked mic grant impossible from renderer (main-side flag, audio-only).
* Crash → explicit ERROR/adopted states; destructive steps never replayed.

## 10. Resource usage

Bounds: ≤4 sessions, ≤256 KiB/chunk, ≤60 s/1.9 MB per utterance, ≤4000-char transcripts, ≤500-char speech, one TTS child at a time, 5-min STT idle unload, ≤3 OmniRoute restarts (unchanged). Measured harness overhead on dev machine (Linux, Node v24, **fake engines** — i.e. everything except model inference):

* `startVoiceSession`: ~0.5 ms
* 3 s utterance STT finalize (buffer→Float32→fake transcribe→validate→event): ~3.8 ms
* TTS dispatch (fake): ~0.5 ms
* Heap delta across full session lifecycle: ~2.3 MB (buffers zeroed/freed)

Real `whisper-tiny.en` CPU inference was **not** benchmarked here (model download is user-consented and out of scope for CI); expect roughly real-time-or-faster on modern desktop CPU for short utterances, first-load dominated by the ~75 MB fetch. No figures are fabricated — re-measure on target hardware before quoting latency SLAs.

## 11. Packaging

`voiceCore.mjs` added to `build.files` + pack-files gate (main imports it). The Whisper model is **not** bundled — cached post-consent under `userData/voice-models`. TTS uses OS binaries (no bundling). Bridge count unchanged (7; voice methods extend `openbenttAgent`).

## 12. Failure recovery matrix (all tested)

STT crash / malformed output / TTS crash / missing TTS backend / mic denied / mic disappears (denied path) / OpenCode crash / OmniRoute crash / provider unavailable / quit mid-session or mid-speech / model missing (transcribe-before-load) / GPU absent (CPU default). None produce false success, orphan processes, stuck LISTENING/SPEAKING, hidden mic, or privileged replay.

## 13. Testing

* `electron/voiceService.test.mjs` — 13 passed.
* `electron/voiceChain.test.mjs` — 6 passed (chat, coding chain, malicious, cancel, recovery, privacy).
* `src/lib/agent/voiceCore.test.ts` — 14 passed.
* Full `test:electron` — 187 passed. Vitest agent files — 39 passed. Full vitest: only pre-existing baseline failures (10 collect-error files + 1 flaky timeout, identical on clean tree). Lint 0 errors, security/pack gates pass, build + CSP pass, tsc clean for voice files, e2e 5 passed / 4 skipped.

## 14. Known limitations / production risks

1. Real-model accuracy/latency unverified in CI (fake engines); first-run downloads ~75 MB — needs UX copy + progress already wired, but real-device testing required.
2. English-only tiny model; accents/noise degrade gracefully (empty transcript → ERROR, retry) but UX wording should set expectations.
3. Renderer capture needs `MediaRecorder` + Web Audio (Electron Chromium ✓); headless/test envs report "unsupported" cleanly.
4. VAD-lite is renderer energy-based; main enforces hard bounds regardless.
5. No cloud voice path by design; noisy environments have no server fallback.
6. `Bearer`-style partial redaction remnant is pre-existing baseline behavior, untouched.
