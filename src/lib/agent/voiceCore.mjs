/**
 * Phase 3 (Voice) — Shared voice core (single source of truth).
 * Plain JS so the renderer (via TS facades) and Electron (voiceService.mjs)
 * share the voice session state machine, audio bounds, transcript validation,
 * spoken-summary policy, and mic-permission semantics with zero divergence.
 *
 * Deterministic only. No mic access, no audio processing, no secrets here.
 */

export const VOICE_STATES = [
  "OFF",
  "REQUESTING_PERMISSION",
  "READY",
  "LISTENING",
  "TRANSCRIBING",
  "THINKING",
  "SPEAKING",
  "INTERRUPTED",
  "ERROR",
  "STOPPING",
];

const VOICE_TRANSITIONS = {
  OFF: ["REQUESTING_PERMISSION", "OFF"],
  REQUESTING_PERMISSION: ["READY", "ERROR", "OFF", "STOPPING"],
  READY: ["LISTENING", "THINKING", "SPEAKING", "STOPPING", "OFF", "ERROR"],
  LISTENING: ["TRANSCRIBING", "READY", "STOPPING", "ERROR", "OFF"],
  TRANSCRIBING: ["THINKING", "READY", "ERROR", "STOPPING", "OFF"],
  THINKING: ["SPEAKING", "READY", "ERROR", "STOPPING", "OFF"],
  SPEAKING: ["READY", "INTERRUPTED", "STOPPING", "ERROR", "OFF"],
  INTERRUPTED: ["READY", "LISTENING", "STOPPING", "OFF"],
  ERROR: ["READY", "OFF", "STOPPING"],
  STOPPING: ["OFF", "READY"],
};

export function isValidVoiceTransition(from, to) {
  if (!VOICE_STATES.includes(from) || !VOICE_STATES.includes(to)) return false;
  return (VOICE_TRANSITIONS[from] ?? []).includes(to);
}

export const INPUT_SOURCES = ["text", "voice"];

export function isValidInputSource(s) {
  return INPUT_SOURCES.includes(s);
}

/* ---------------- audio bounds ---------------- */

export const VOICE_AUDIO = {
  sampleRate: 16000,
  channels: 1,
  bytesPerSample: 2, // 16-bit PCM mono
  maxUtteranceSeconds: 60,
  silenceTimeoutMs: 8000,
  maxChunkBytes: 256 * 1024,
  maxUtteranceBytes: 16000 * 1 * 2 * 60, // 1_920_000
  maxSessions: 4,
};

export function maxAudioBytesForSeconds(seconds) {
  const s = Math.min(Math.max(Number(seconds) || 0, 1), VOICE_AUDIO.maxUtteranceSeconds);
  return Math.floor(VOICE_AUDIO.sampleRate * VOICE_AUDIO.channels * VOICE_AUDIO.bytesPerSample * s);
}

/**
 * Validate one base64 PCM16 audio chunk. Fail-closed bounds.
 * Returns { bytes } or throws.
 */
export function validateAudioChunk(base64, accumulatedBytes = 0) {
  if (typeof base64 !== "string" || !base64) throw new Error("Invalid audio chunk");
  if (base64.length > Math.ceil((VOICE_AUDIO.maxChunkBytes * 4) / 3) + 16) {
    throw new Error("Audio chunk exceeds size limit");
  }
  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64.slice(0, 4096))) throw new Error("Invalid audio encoding");
  const clean = base64.replace(/\s/g, "");
  const approxBytes = Math.floor((clean.length * 3) / 4);
  if (approxBytes > VOICE_AUDIO.maxChunkBytes) throw new Error("Audio chunk exceeds size limit");
  if (accumulatedBytes + approxBytes > VOICE_AUDIO.maxUtteranceBytes) {
    throw new Error("Utterance exceeds maximum duration");
  }
  return { bytes: approxBytes, clean };
}

/* ---------------- transcript validation ---------------- */

export const TRANSCRIPT_LIMITS = {
  maxChars: 4000,
  minChars: 1,
};

/**
 * Validate STT output exactly like typed input (untrusted until classified).
 * Returns trimmed transcript or throws.
 */
export function validateTranscript(text) {
  if (typeof text !== "string") throw new Error("Invalid transcript");
  const t = text.replace(/[\0\x01-\x08\x0b\x0c\x0e-\x1f]/g, "").trim().slice(0, TRANSCRIPT_LIMITS.maxChars);
  if (t.length < TRANSCRIPT_LIMITS.minChars) throw new Error("Empty transcript");
  return t;
}

/* ---------------- spoken summaries ---------------- */

export const SPEECH_LIMITS = {
  maxChars: 500,
  eventSummaryChars: 2000,
};

/**
 * Build a concise spoken summary from agent events + task state.
 * Source of truth is existing events; never invents results. Redaction is
 * applied by the caller (redactSecretsFromText) before TTS.
 */
export function summarizeForSpeech({ events = [], taskStatus, permissionPending = false }) {
  const lines = [];
  if (permissionPending) {
    lines.push("Openbentt needs your permission to continue. Please review the request on screen.");
    return lines.join(" ").slice(0, SPEECH_LIMITS.maxChars);
  }
  const types = new Set(events.map((e) => e?.type));
  if (taskStatus === "COMPLETED" || types.has("agent.completed")) {
    const last = [...events].reverse().find((e) => typeof e?.payload?.message === "string");
    const detail = last ? String(last.payload.message).slice(0, 160) : "";
    lines.push(`The task is complete. ${detail}`.trim());
    return lines.join(" ").slice(0, SPEECH_LIMITS.maxChars);
  }
  if (taskStatus === "FAILED" || types.has("agent.failed")) {
    lines.push("The task could not be completed. Details are on screen.");
    return lines.join(" ").slice(0, SPEECH_LIMITS.maxChars);
  }
  if (types.has("agent.command.output") || types.has("agent.command.requested")) {
    lines.push("The tests are running.");
  } else if (types.has("agent.file.changed")) {
    lines.push("I found the relevant files and I am working on the changes.");
  } else if (types.has("agent.tool.output") || types.has("agent.thinking")) {
    lines.push("Inspecting the project.");
  } else if (types.has("agent.started")) {
    lines.push("Starting the task.");
  } else {
    lines.push("Working on your request.");
  }
  return lines.join(" ").slice(0, SPEECH_LIMITS.maxChars);
}

/**
 * Validate TTS input text: bounded, non-empty after redaction placeholder.
 */
export function validateSpeechText(text) {
  if (typeof text !== "string") throw new Error("Invalid speech text");
  const t = text.trim().slice(0, SPEECH_LIMITS.maxChars);
  if (!t) throw new Error("Empty speech text");
  return t;
}

/* ---------------- mic permission labels ---------------- */

export const MIC_STATES = [
  "off",
  "requesting",
  "active",
  "muted",
  "unavailable",
];

export function micLabel(state) {
  switch (state) {
    case "off": return "Microphone off";
    case "requesting": return "Microphone requesting permission";
    case "active": return "Microphone active";
    case "muted": return "Microphone muted";
    case "unavailable": return "Microphone unavailable";
    default: return "Microphone off";
  }
}
