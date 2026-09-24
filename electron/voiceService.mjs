/**
 * Phase 3 — Local voice service: mic capture coordination + STT + TTS
 * (Electron main only).
 *
 * Pipeline: microphone (renderer capture) → bounded PCM16 IPC chunks →
 * memory buffer → local STT → transcript → renderer harness → existing
 * agent runtime → agent events → concise summary → local TTS → speaker.
 *
 * Security invariants (Phases 1–2 preserved, voice adds no authority):
 * - Voice is a modality, not an execution pathway. This module NEVER calls
 *   respondToPermission / approveAction / task execution. Transcripts are
 *   untrusted input validated exactly like typed text.
 * - Renderer keeps nodeIntegration:false, contextIsolation:true, sandbox:true.
 *   Narrow `voice:*` IPC only; no fs/child_process/process/net to renderer.
 * - Microphone default OFF. Chromium 'media' grants are gated by an explicit
 *   main-side grant that exists only while a voice session is active
 *   (see navigationPolicy voice grant hook). No background listening.
 * - Raw audio lives in memory only, bounded (60s 16k mono PCM16 ≈ 1.9MB),
 *   discarded after transcription/cancel/stop. Never SQLite/events/audit/disk.
 * - STT/TTS run locally by default. No uploads, no cloud fallback.
 * - TTS input is secret-redacted; summaries are event-derived, never invented.
 * - Bounded engines, idle unload, no orphan processes, no infinite restarts.
 */
import { spawn, execFile } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { createLogger } from "./log.mjs";
import { assertSafeId } from "./ipcValidate.mjs";
import {
  TRANSCRIPT_LIMITS,
  VOICE_AUDIO,
  isValidVoiceTransition,
  summarizeForSpeech,
  validateAudioChunk,
  validateSpeechText,
  validateTranscript,
} from "../src/lib/agent/voiceCore.mjs";
import { redactSecretsFromText } from "../src/lib/agent/openCodeCore.mjs";

const log = createLogger("voice");

export const VOICE_STT_MODEL_ID = "Xenova/whisper-tiny.en";
export const VOICE_IDLE_UNLOAD_MS = 5 * 60 * 1000;
const MAX_SESSIONS = VOICE_AUDIO.maxSessions;

const state = {
  sessions: new Map(),
  micGrant: false,
  engines: { stt: null, tts: null },
  idleTimer: null,
};

let voiceEventTarget = null;
export function setVoiceEventTarget(win) {
  voiceEventTarget = win ?? null;
}

function nowIso() {
  return new Date().toISOString();
}

function newVoiceSessionId() {
  return `vsess_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`.slice(0, 64);
}

function emitVoiceEvent(sessionId, type, payload = {}) {
  const evt = {
    eventId: `vevt_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`,
    sessionId,
    timestamp: nowIso(),
    type,
    payload,
  };
  try {
    voiceEventTarget?.webContents?.send("voice:event", evt);
  } catch { /* window may be gone */ }
  return evt;
}

function setSessionState(sess, next, error) {
  const from = sess.state;
  if (from === next) return true;
  if (!isValidVoiceTransition(from, next)) {
    log.warn("voice illegal transition refused", { from, next });
    return false;
  }
  sess.state = next;
  sess.updatedAt = nowIso();
  if (error !== undefined) sess.lastError = error ? String(error).slice(0, 300) : undefined;
  return true;
}

function getSessionOrThrow(sessionId) {
  assertSafeId(sessionId, "voice session id");
  const sess = state.sessions.get(sessionId);
  if (!sess) throw new Error("Voice session not found");
  return sess;
}

/* ---------------- mic grant (navigationPolicy hook) ---------------- */

/** True only while ≥1 live voice session holds the mic. Default OFF. */
export function isMicGrantActive() {
  return state.micGrant === true;
}

function refreshMicGrant() {
  const live = [...state.sessions.values()].some((s) => !["OFF", "STOPPING", "ERROR"].includes(s.state));
  state.micGrant = live;
}

/* ---------------- STT engines ---------------- */

export class FakeSttEngine {
  constructor() {
    this.nextTranscript = "hello world";
    this.nextError = null;
    this.calls = [];
    this.loaded = false;
  }
  async load() {
    this.loaded = true;
    return { ok: true, fake: true };
  }
  async unload() {
    this.loaded = false;
    return { ok: true };
  }
  async transcribe(_pcm, _sampleRate) {
    this.calls.push({ at: nowIso() });
    if (this.nextError) throw new Error(this.nextError);
    return this.nextTranscript;
  }
}

/**
 * Local Whisper STT via the already-bundled @xenova/transformers +
 * onnxruntime-node stack. Lazily loaded on first use; CPU by default with
 * GPU EP only if onnxruntime reports it (never required, never configured
 * globally). Model cache lives under userData (transformers cache dir),
 * never in the app bundle.
 */
export class LocalWhisperEngine {
  constructor(app, modelId = VOICE_STT_MODEL_ID) {
    this.app = app;
    this.modelId = modelId;
    this.pipeline = null;
    this.loading = null;
  }
  cacheDir() {
    try {
      return path.join(this.app.getPath("userData"), "voice-models");
    } catch {
      return undefined;
    }
  }
  async load(onProgress) {
    if (this.pipeline) return { ok: true, cached: true };
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      const dir = this.cacheDir();
      if (dir) {
        try {
          env.cacheDir = dir;
        } catch { /* use default cache */ }
      }
      const opts = {
        progress_callback: (p) => {
          try {
            onProgress?.({ status: p?.status ?? "downloading", file: p?.file ?? "", progress: p?.progress });
          } catch { /* observer must not break load */ }
        },
      };
      try {
        this.pipeline = await pipeline("automatic-speech-recognition", this.modelId, opts);
      } catch (err) {
        // "Unsupported model type" (and similar) almost always means a
        // stale/partial model cache: a previous interrupted download left
        // files the loader can't map. Wipe and retry once before failing.
        const msg = err instanceof Error ? err.message : String(err ?? "");
        if (/unsupported model type|config\.json|unexpected|invalid/i.test(msg)) {
          log.info("STT load failed — clearing voice-models cache and retrying once", { msg: msg.slice(0, 160) });
          await clearSttCache(this.app).catch(() => {});
          onProgress?.({ status: "retrying", file: "", progress: 0 });
          this.pipeline = await pipeline("automatic-speech-recognition", this.modelId, opts);
        } else {
          throw err;
        }
      }
      return { ok: true, model: this.modelId };
    })();
    try {
      return await this.loading;
    } finally {
      this.loading = null;
    }
  }
  async unload() {
    this.pipeline = null;
    return { ok: true };
  }
  async transcribe(pcmFloat32, sampleRate = VOICE_AUDIO.sampleRate) {
    if (!this.pipeline) throw new Error("STT model is not loaded. Enable voice to load it.");
    if (!(pcmFloat32 instanceof Float32Array) || pcmFloat32.length === 0) {
      throw new Error("Invalid audio for transcription");
    }
    const out = await this.pipeline(pcmFloat32, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: "english",
      task: "transcribe",
    });
    const text = typeof out?.text === "string" ? out.text : String(out?.text ?? "");
    return validateTranscript(text);
  }
}

/* ---------------- TTS engines ---------------- */

export class FakeTtsEngine {
  constructor() {
    this.spoken = [];
    this.failNext = null;
    this.speaking = false;
  }
  async speak(text) {
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      throw new Error(err);
    }
    this.speaking = true;
    this.spoken.push({ text, at: nowIso() });
    return { ok: true, fake: true };
  }
  async stop() {
    this.speaking = false;
    return { ok: true };
  }
}

/**
 * OS-native local TTS (no model download, fully offline):
 * macOS `say`, Linux espeak-ng/espeak/spd-say, Windows PowerShell SAPI.
 * One cancellable child per utterance; never orphaned.
 */
export class OsTtsEngine {
  constructor() {
    this.child = null;
    this.backend = null;
  }
  async detectBackend() {
    if (this.backend) return this.backend;
    if (process.platform === "darwin") {
      this.backend = { kind: "say" };
      return this.backend;
    }
    if (process.platform === "win32") {
      this.backend = { kind: "sapi" };
      return this.backend;
    }
    for (const bin of ["espeak-ng", "espeak", "spd-say"]) {
      const found = await new Promise((resolve) => {
        execFile(bin, ["--version"], { timeout: 4000, windowsHide: true }, (err) => resolve(!err));
      });
      if (found) {
        this.backend = { kind: bin };
        return this.backend;
      }
    }
    throw new Error("No local speech synthesizer found. Install espeak-ng for offline voice output.");
  }
  async speak(text) {
    const clean = validateSpeechText(text);
    await this.stop().catch(() => {});
    const backend = await this.detectBackend();
    return new Promise((resolve, reject) => {
      let child;
      try {
        if (backend.kind === "say") {
          child = spawn("say", [clean], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
        } else if (backend.kind === "sapi") {
          const escaped = clean.replace(/'/g, "''").slice(0, 500);
          child = spawn(
            "powershell",
            ["-NoProfile", "-Command", `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak('${escaped}');`],
            { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
          );
        } else if (backend.kind === "spd-say") {
          child = spawn("spd-say", ["-t", "female1", clean], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
        } else {
          child = spawn(backend.kind, [clean], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
        }
      } catch (err) {
        reject(err instanceof Error ? err : new Error("TTS spawn failed"));
        return;
      }
      this.child = child;
      let stderr = "";
      child.stderr?.on("data", (d) => {
        stderr = `${stderr}${String(d)}`.slice(-2000);
      });
      child.on("error", (err) => {
        if (this.child === child) this.child = null;
        reject(err instanceof Error ? err : new Error("TTS failed"));
      });
      child.on("exit", (code) => {
        if (this.child === child) this.child = null;
        if (code === 0) resolve({ ok: true, backend: backend.kind });
        else reject(new Error(`Local speech failed (exit ${code})${stderr ? `: ${redactSecretsFromText(stderr).slice(0, 160)}` : ""}`));
      });
    });
  }
  async stop() {
    const child = this.child;
    this.child = null;
    if (child && !child.killed) {
      try {
        child.kill("SIGTERM");
        await new Promise((r) => setTimeout(r, 500));
        if (!child.killed) {
          try { child.kill("SIGKILL"); } catch { /* noop */ }
        }
      } catch { /* best effort */ }
    }
    return { ok: true };
  }
}

export function setVoiceEngines({ stt, tts } = {}) {
  if (stt !== undefined) state.engines.stt = stt;
  if (tts !== undefined) state.engines.tts = tts;
}

function sttEngine(app) {
  if (!state.engines.stt) state.engines.stt = new LocalWhisperEngine(app);
  return state.engines.stt;
}

function ttsEngine() {
  if (!state.engines.tts) state.engines.tts = new OsTtsEngine();
  return state.engines.tts;
}

function scheduleIdleUnload() {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => {
    const busy = [...state.sessions.values()].some((s) => ["LISTENING", "TRANSCRIBING", "THINKING", "SPEAKING"].includes(s.state));
    if (!busy && state.engines.stt && !(state.engines.stt instanceof FakeSttEngine)) {
      state.engines.stt.unload?.().catch(() => {});
    }
  }, VOICE_IDLE_UNLOAD_MS);
  state.idleTimer.unref?.();
}

/* ---------------- sessions ---------------- */

export function startVoiceSession(app, { mode = "push-to-talk" } = {}) {
  void app;
  if (state.sessions.size >= MAX_SESSIONS) throw new Error("Too many voice sessions");
  if (!["push-to-talk", "auto"].includes(mode)) throw new Error("Invalid voice mode");
  const id = newVoiceSessionId();
  const now = nowIso();
  const sess = {
    id,
    mode,
    state: "REQUESTING_PERMISSION",
    mic: "requesting",
    utteranceId: null,
    audioParts: [],
    audioBytes: 0,
    transcript: null,
    createdAt: now,
    updatedAt: now,
    lastError: undefined,
  };
  state.sessions.set(id, sess);
  refreshMicGrant();
  emitVoiceEvent(id, "voice.mic.requested", { message: "Microphone requesting permission." });
  return { ...sess, audioParts: undefined };
}

export function noteMicReady(app, sessionId) {
  // Overload-tolerant: IPC passes (sessionId) positionally via wrapper below.
  if (sessionId === undefined && typeof app === "string") {
    sessionId = app;
    app = undefined;
  }
  const sess = getSessionOrThrow(sessionId);
  if (!setSessionState(sess, "READY")) throw new Error(`Cannot ready voice session from ${sess.state}`);
  sess.mic = "active";
  refreshMicGrant();
  emitVoiceEvent(sess.id, "voice.mic.active", { message: "Microphone active." });
  // Repair: warm the STT engine NOW (background) so the first utterance does
  // not fail with "model is not loaded". Progress streams as voice events.
  void ensureSttLoaded(app, sess.id).catch(() => {});
  return publicSession(sess);
}

/** Engine readiness snapshot for diagnostics (no side effects). */
export function sttStatus() {
  const eng = state.engines.stt;
  return {
    model: "Xenova/whisper-tiny.en",
    loaded: Boolean(eng?.pipeline),
    loading: Boolean(eng?.loading),
    fake: eng instanceof FakeSttEngine,
  };
}

export function ttsStatus() {
  try {
    const eng = ttsEngine();
    return { backend: eng?.backend ?? eng?.constructor?.name ?? "unknown", ok: true };
  } catch (err) {
    return { backend: "none", ok: false, error: err instanceof Error ? err.message.slice(0, 200) : "unknown" };
  }
}

/**
 * Wipe the downloaded STT model cache (userData/voice-models). Used for
 * self-healing after a corrupt/partial download, and exposed to
 * Diagnostics as a manual "clear + retry" action.
 */
export async function clearSttCache(app) {
  let dir = null;
  try {
    dir = path.join(app.getPath("userData"), "voice-models");
  } catch {
    return { ok: false, reason: "no-user-data" };
  }
  const { default: fsp } = await import("node:fs/promises");
  await fsp.rm(dir, { recursive: true, force: true });
  log.info("cleared STT model cache", { dir });
  return { ok: true };
}

/**
 * Ensure the STT model is loaded (downloads once to userData/voice-models).
 * Idempotent across concurrent callers; progress via voice.stt.progress.
 */
export async function ensureSttLoaded(app, sessionId) {
  const eng = sttEngine(app);
  if (eng.pipeline) return { ok: true, cached: true };
  const emit = (payload) => {
    try {
      if (sessionId) emitVoiceEvent(sessionId, "voice.stt.progress", payload);
    } catch { /* observer-safe */ }
  };
  emit({ message: "Loading speech model…", progress: 0 });
  try {
    const res = await eng.load((p) => emit({
      message: `Loading speech model (${p?.file ?? ""})`.slice(0, 160),
      status: p?.status,
      file: p?.file,
      progress: typeof p?.progress === "number" ? Math.round(p.progress) : undefined,
    }));
    emit({ message: "Speech model ready.", progress: 100 });
    return res;
  } catch (err) {
    emit({ message: "Speech model failed to load." });
    throw new Error(err instanceof Error ? err.message.slice(0, 200) : "STT load failed");
  }
}

export function noteMicDenied(sessionId, reason) {
  const sess = getSessionOrThrow(sessionId);
  setSessionState(sess, "ERROR", reason ?? "Microphone permission denied.");
  sess.mic = "unavailable";
  refreshMicGrant();
  emitVoiceEvent(sess.id, "voice.mic.unavailable", { message: "Microphone unavailable." });
  return publicSession(sess);
}

export function beginUtterance(sessionId) {
  const sess = getSessionOrThrow(sessionId);
  // Barge-in: interrupting speech stops TTS deterministically first, then
  // moves SPEAKING → INTERRUPTED → LISTENING (no stuck SPEAKING state).
  if (sess.state === "SPEAKING" || sess.state === "INTERRUPTED") {
    void ttsEngine().stop().catch(() => {});
    if (sess.state === "SPEAKING") {
      if (!setSessionState(sess, "INTERRUPTED")) {
        throw new Error(`Cannot interrupt voice state ${sess.state}`);
      }
      emitVoiceEvent(sess.id, "voice.interrupted", { message: "Speech interrupted." });
    }
  }
  if (!setSessionState(sess, "LISTENING", undefined)) {
    throw new Error(`Cannot listen from voice state ${sess.state}`);
  }
  sess.utteranceId = `utt_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
  sess.audioParts = [];
  sess.audioBytes = 0;
  sess.transcript = null;
  emitVoiceEvent(sess.id, "voice.listening", { message: "Listening.", utteranceId: sess.utteranceId });
  return { ...publicSession(sess), utteranceId: sess.utteranceId };
}

export async function appendAudioChunk(app, { sessionId, utteranceId, base64, last = false }) {
  void app;
  const sess = getSessionOrThrow(sessionId);
  if (sess.state !== "LISTENING") throw new Error(`Voice session is not listening (state=${sess.state})`);
  if (utteranceId !== sess.utteranceId) throw new Error("Stale utterance");
  const { bytes, clean } = validateAudioChunk(base64, sess.audioBytes);
  sess.audioParts.push(Buffer.from(clean, "base64"));
  sess.audioBytes += bytes;
  sess.updatedAt = nowIso();
  const finished = last === true || sess.audioBytes >= VOICE_AUDIO.maxUtteranceBytes;
  if (!finished) return { ok: true, receivedBytes: sess.audioBytes, done: false };
  return finalizeUtterance(app, sess);
}

async function finalizeUtterance(app, sess) {
  if (!setSessionState(sess, "TRANSCRIBING")) throw new Error(`Cannot transcribe from ${sess.state}`);
  const pcmBytes = Buffer.concat(sess.audioParts);
  // Discard raw audio from the session record immediately after copy.
  sess.audioParts = [];
  const keepBytes = sess.audioBytes;
  sess.audioBytes = 0;
  emitVoiceEvent(sess.id, "voice.transcribing", { message: "Transcribing." });
  let raw;
  let transcript;
  try {
    // Last-chance load: mic-ready warming may have failed or been skipped.
    if (!sttEngine(app).pipeline) {
      await ensureSttLoaded(app, sess.id);
    }
    const pcmFloat = new Float32Array(pcmBytes.length / 2);
    for (let i = 0; i < pcmFloat.length; i++) {
      pcmFloat[i] = pcmBytes.readInt16LE(i * 2) / 32768;
    }
    raw = await sttEngine(app).transcribe(pcmFloat, VOICE_AUDIO.sampleRate);
    // STT output is untrusted input — validate exactly like typed text.
    // Validation errors land in the same fail-closed path as engine crashes.
    transcript = validateTranscript(typeof raw === "string" ? raw : String(raw?.text ?? raw ?? ""));
  } catch (err) {
    setSessionState(sess, "ERROR", err instanceof Error ? err.message : "transcription failed");
    emitVoiceEvent(sess.id, "voice.error", { message: "Speech recognition failed." });
    scheduleIdleUnload();
    throw new Error(err instanceof Error ? err.message.slice(0, 200) : "transcription failed");
  } finally {
    pcmBytes.fill(0);
  }
  sess.transcript = transcript;
  setSessionState(sess, "READY");
  emitVoiceEvent(sess.id, "voice.transcript", { transcript: transcript.slice(0, 4000), bytes: keepBytes });
  scheduleIdleUnload();
  return { ok: true, done: true, transcript };
}

export function cancelUtterance(sessionId) {
  const sess = getSessionOrThrow(sessionId);
  sess.audioParts = [];
  sess.audioBytes = 0;
  sess.transcript = null;
  if (["LISTENING", "TRANSCRIBING"].includes(sess.state)) {
    setSessionState(sess, "READY");
  }
  emitVoiceEvent(sess.id, "voice.cancelled", { message: "Voice input cancelled. Audio discarded." });
  return publicSession(sess);
}

export function noteThinking(sessionId) {
  const sess = getSessionOrThrow(sessionId);
  if (!setSessionState(sess, "THINKING")) throw new Error(`Cannot think from ${sess.state}`);
  return publicSession(sess);
}

/**
 * Speak event-derived text. Redacts secrets first; bounds length; never
 * speaks raw tool output verbatim (callers pass summarizeForSpeech output).
 */
export async function speakText(app, { sessionId, text }) {
  void app;
  const sess = getSessionOrThrow(sessionId);
  if (!["READY", "THINKING", "INTERRUPTED", "ERROR"].includes(sess.state)) {
    throw new Error(`Cannot speak from voice state ${sess.state}`);
  }
  const clean = validateSpeechText(redactSecretsFromText(text));
  setSessionState(sess, "SPEAKING");
  emitVoiceEvent(sess.id, "voice.speaking", { message: "Speaking." });
  try {
    await ttsEngine().speak(clean);
  } catch (err) {
    setSessionState(sess, "ERROR", err instanceof Error ? err.message : "speech failed");
    emitVoiceEvent(sess.id, "voice.error", { message: "Speech playback failed." });
    throw new Error(err instanceof Error ? err.message.slice(0, 200) : "speech failed");
  }
  if (sess.state === "SPEAKING") setSessionState(sess, "READY");
  emitVoiceEvent(sess.id, "voice.stopped", { message: "Speech finished." });
  return publicSession(sess);
}

export async function stopSpeaking(sessionId) {
  const sess = getSessionOrThrow(sessionId);
  await ttsEngine().stop().catch(() => {});
  if (sess.state === "SPEAKING") {
    setSessionState(sess, "INTERRUPTED");
    emitVoiceEvent(sess.id, "voice.interrupted", { message: "Speech interrupted." });
    setSessionState(sess, "READY");
  }
  return publicSession(sess);
}

export async function stopVoiceSession(sessionId) {
  const sess = getSessionOrThrow(sessionId);
  setSessionState(sess, "STOPPING");
  await ttsEngine().stop().catch(() => {});
  sess.audioParts = [];
  sess.audioBytes = 0;
  sess.transcript = null;
  sess.mic = "off";
  setSessionState(sess, "OFF");
  refreshMicGrant();
  emitVoiceEvent(sess.id, "voice.stopped", { message: "Voice session ended." });
  state.sessions.delete(sessionId);
  scheduleIdleUnload();
  return { ok: true, sessionId };
}

export function setVoiceMode({ sessionId, mode }) {
  const sess = getSessionOrThrow(sessionId);
  if (!["push-to-talk", "auto"].includes(mode)) throw new Error("Invalid voice mode");
  if (!["READY", "OFF", "REQUESTING_PERMISSION"].includes(sess.state)) {
    throw new Error(`Cannot change mode from ${sess.state}`);
  }
  sess.mode = mode;
  sess.updatedAt = nowIso();
  return publicSession(sess);
}

export function getVoiceStatus(sessionId) {
  if (sessionId !== undefined) return publicSession(getSessionOrThrow(sessionId));
  return {
    micGrant: state.micGrant,
    sessions: [...state.sessions.values()].map(publicSession),
  };
}

function publicSession(sess) {
  const { audioParts, ...rest } = sess;
  void audioParts;
  return { ...rest };
}

export function cleanupVoiceOnQuit() {
  try {
    for (const sess of state.sessions.values()) {
      sess.audioParts = [];
      sess.audioBytes = 0;
    }
    state.sessions.clear();
    state.micGrant = false;
    if (state.idleTimer) clearTimeout(state.idleTimer);
    state.idleTimer = null;
    const tts = state.engines.tts;
    if (tts && typeof tts.stop === "function") {
      void tts.stop().catch(() => {});
    }
    const stt = state.engines.stt;
    if (stt && typeof stt.unload === "function" && !(stt instanceof FakeSttEngine)) {
      void stt.unload().catch(() => {});
    }
  } catch { /* noop */ }
}

/* ---------------- IPC (voice:* multiplex, narrow + bounded) ---------------- */

function assertPayload(p, need = []) {
  if (!p || typeof p !== "object") throw new Error("Invalid payload");
  for (const k of need) {
    if (p[k] === undefined) throw new Error(`Missing ${k}`);
  }
  return p;
}

export function registerVoiceIpc(ipcMain, app) {
  ipcMain.handle("voice:startSession", async (_e, payload) => {
    const p = payload ?? {};
    if (p.mode !== undefined && !["push-to-talk", "auto"].includes(p.mode)) throw new Error("Invalid voice mode");
    return startVoiceSession(app, { mode: p.mode ?? "push-to-talk" });
  });
  ipcMain.handle("voice:micReady", async (_e, payload) => {
    const p = assertPayload(payload, ["sessionId"]);
    return noteMicReady(app, p.sessionId);
  });
  ipcMain.handle("voice:sttStatus", async () => ({ stt: sttStatus(), tts: ttsStatus() }));
  ipcMain.handle("voice:ensureStt", async (_e, payload) => {
    const p = payload ?? {};
    return ensureSttLoaded(app, typeof p.sessionId === "string" ? p.sessionId : undefined);
  });
  ipcMain.handle("voice:clearSttCache", async () => {
    await sttEngine(app).unload().catch(() => {});
    return clearSttCache(app);
  });
  ipcMain.handle("voice:micDenied", async (_e, payload) => {
    const p = assertPayload(payload, ["sessionId"]);
    if (p.reason !== undefined && (typeof p.reason !== "string" || p.reason.length > 300)) {
      throw new Error("Invalid reason");
    }
    return noteMicDenied(p.sessionId, p.reason);
  });
  ipcMain.handle("voice:beginUtterance", async (_e, payload) => {
    const p = assertPayload(payload, ["sessionId"]);
    return beginUtterance(p.sessionId);
  });
  ipcMain.handle("voice:audioChunk", async (_e, payload) => {
    const p = assertPayload(payload, ["sessionId", "utteranceId", "base64"]);
    if (typeof p.base64 !== "string" || p.base64.length > 400000) throw new Error("Audio chunk exceeds size limit");
    if (typeof p.utteranceId !== "string" || p.utteranceId.length > 64) throw new Error("Invalid utterance");
    return appendAudioChunk(app, {
      sessionId: p.sessionId,
      utteranceId: p.utteranceId,
      base64: p.base64,
      last: p.last === true,
    });
  });
  ipcMain.handle("voice:cancelUtterance", async (_e, payload) => {
    const p = assertPayload(payload, ["sessionId"]);
    return cancelUtterance(p.sessionId);
  });
  ipcMain.handle("voice:thinking", async (_e, payload) => {
    const p = assertPayload(payload, ["sessionId"]);
    return noteThinking(p.sessionId);
  });
  ipcMain.handle("voice:speak", async (_e, payload) => {
    const p = assertPayload(payload, ["sessionId", "text"]);
    if (typeof p.text !== "string" || p.text.length > 4000) throw new Error("Invalid speech text");
    return speakText(app, { sessionId: p.sessionId, text: p.text });
  });
  ipcMain.handle("voice:stopSpeaking", async (_e, payload) => {
    const p = assertPayload(payload, ["sessionId"]);
    return stopSpeaking(p.sessionId);
  });
  ipcMain.handle("voice:stopSession", async (_e, payload) => {
    const p = assertPayload(payload, ["sessionId"]);
    return stopVoiceSession(p.sessionId);
  });
  ipcMain.handle("voice:setMode", async (_e, payload) => {
    const p = assertPayload(payload, ["sessionId", "mode"]);
    return setVoiceMode({ sessionId: p.sessionId, mode: p.mode });
  });
  ipcMain.handle("voice:status", async (_e, payload) => getVoiceStatus(payload?.sessionId));
}

/* ---------------- test hooks ---------------- */

export const __voiceTestHooks = {
  reset() {
    try {
      for (const sess of state.sessions.values()) {
        sess.audioParts = [];
      }
    } catch { /* noop */ }
    state.sessions.clear();
    state.micGrant = false;
    state.engines.stt = null;
    state.engines.tts = null;
    if (state.idleTimer) clearTimeout(state.idleTimer);
    state.idleTimer = null;
  },
  getState() {
    return state;
  },
};
