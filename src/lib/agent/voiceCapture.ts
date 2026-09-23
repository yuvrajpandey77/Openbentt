/**
 * Phase 3 — Renderer microphone capture helper (no Node APIs).
 *
 * Push-to-talk primary: hold → MediaRecorder → release → decode to 16 kHz
 * mono PCM16 → chunked upload over narrow `voice:*` IPC.
 * Auto mode adds renderer-side silence detection (AnalyserNode energy) with
 * a bounded max utterance; the main process independently enforces all
 * bounds and discards raw audio after transcription.
 *
 * Requires the main-side mic grant (voice session) or getUserMedia throws.
 */
import { openCodeAgentApi } from "./openCodeAgentApi";

const TARGET_RATE = 16000;
const TIMESLICE_MS = 250;
const MAX_RECORD_MS = 60000;
const CHUNK_BYTES = 200 * 1024; // under the 256 KiB IPC chunk bound

export interface CapturedUtterance {
  pcm16: Int16Array;
  durationMs: number;
}

async function decodeToPcm16(blob: Blob): Promise<CapturedUtterance> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("Web Audio is unavailable in this environment.");
  const ctx = new Ctx();
  try {
    const buf = await blob.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf);
    const length = Math.min(
      Math.floor((audio.duration * TARGET_RATE)),
      TARGET_RATE * 60,
    );
    const offline = new OfflineAudioContext(1, Math.max(1, length), TARGET_RATE);
    const src = offline.createBufferSource();
    src.buffer = audio;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    const data = rendered.getChannelData(0);
    const pcm = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const s = Math.max(-1, Math.min(1, data[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return { pcm16: pcm, durationMs: Math.round((data.length / TARGET_RATE) * 1000) };
  } finally {
    void ctx.close().catch(() => {});
  }
}

function toBase64Chunks(pcm: Int16Array): string[] {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_BYTES) {
    const slice = bytes.subarray(i, i + CHUNK_BYTES);
    let bin = "";
    for (let j = 0; j < slice.length; j += 8192) {
      bin += String.fromCharCode(...slice.subarray(j, j + 8192));
    }
    out.push(btoa(bin));
  }
  return out;
}

export interface VoiceRecorder {
  stopAndUpload: (opts?: { cancel?: boolean }) => Promise<{ transcript?: string; cancelled: boolean }>;
  cancel: () => Promise<void>;
}

function hasCaptureSupport(): boolean {
  try {
    return Boolean(navigator?.mediaDevices?.getUserMedia) && typeof window.MediaRecorder !== "undefined";
  } catch {
    return false;
  }
}

/**
 * Record one utterance and stream it to main for local STT.
 * Push-to-talk: call `stopAndUpload()` on release.
 * Auto: silence detection stops automatically (see startAutoUtterance).
 */
export async function recordUtterance(
  sessionId: string,
  utteranceId: string,
  opts: { silenceTimeoutMs?: number } = {},
): Promise<VoiceRecorder> {
  if (!hasCaptureSupport()) {
    await openCodeAgentApi.voiceMicDenied(sessionId, "Capture is not supported in this browser context.");
    throw new Error("Microphone capture is not supported here.");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    await openCodeAgentApi.voiceMicDenied(sessionId, "Microphone permission was denied.");
    throw new Error("Microphone permission was denied.");
  }
  await openCodeAgentApi.voiceMicReady(sessionId);

  const rec = new MediaRecorder(stream);
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) parts.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
  });
  rec.start(TIMESLICE_MS);

  // Renderer-side silence detection (VAD-lite) for auto mode.
  let analyser: AnalyserNode | null = null;
  let audioCtx: AudioContext | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    try { rec.stop(); } catch { /* noop */ }
  };
  const hardStop = setTimeout(finish, MAX_RECORD_MS);
  if (opts.silenceTimeoutMs && opts.silenceTimeoutMs > 0) {
    try {
      const Ctx = window.AudioContext;
      audioCtx = new Ctx();
      const src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const check = () => {
        if (done || !analyser) return;
        analyser.getByteTimeDomainData(data);
        let energy = 0;
        for (let i = 0; i < data.length; i += 4) {
          const v = (data[i] - 128) / 128;
          energy += v * v;
        }
        energy /= data.length / 4;
        if (energy < 0.0004) {
          if (!silenceTimer) {
            silenceTimer = setTimeout(finish, Math.min(opts.silenceTimeoutMs ?? 8000, 30000));
          }
        } else if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
        setTimeout(check, 250);
      };
      setTimeout(check, 1000);
    } catch { /* record without VAD */ }
  }

  const teardown = () => {
    clearTimeout(hardStop);
    if (silenceTimer) clearTimeout(silenceTimer);
    try { audioCtx?.close().catch(() => {}); } catch { /* noop */ }
    for (const t of stream.getTracks()) {
      try { t.stop(); } catch { /* noop */ }
    }
  };

  return {
    async stopAndUpload({ cancel = false } = {}) {
      finish();
      await stopped;
      teardown();
      if (cancel) {
        await openCodeAgentApi.cancelVoiceUtterance(sessionId);
        return { cancelled: true };
      }
      const blob = new Blob(parts, { type: rec.mimeType || "audio/webm" });
      if (!blob.size) {
        await openCodeAgentApi.cancelVoiceUtterance(sessionId);
        return { cancelled: true };
      }
      const { pcm16 } = await decodeToPcm16(blob);
      const chunks = toBase64Chunks(pcm16);
      let result: { ok: boolean; done: boolean; transcript?: string } = { ok: true, done: false };
      for (let i = 0; i < chunks.length; i++) {
        result = await openCodeAgentApi.sendVoiceAudio({
          sessionId,
          utteranceId,
          base64: chunks[i],
          last: i === chunks.length - 1,
        });
      }
      return { transcript: result.transcript, cancelled: false };
    },
    async cancel() {
      finish();
      await stopped;
      teardown();
      await openCodeAgentApi.cancelVoiceUtterance(sessionId);
    },
  };
}
