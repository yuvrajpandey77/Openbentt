import { useCallback, useEffect, useRef, useState } from "react";
import { hasOpenCodeDesktopApi, openCodeAgentApi } from "@/lib/agent/openCodeAgentApi";

export type VoiceCaptureState =
  | "idle"
  | "loading-model"
  | "requesting-mic"
  | "listening"
  | "transcribing"
  | "error";

const MAX_RECORD_MS = 60_000;
const CHUNK_B64 = 300_000; // under the 400k main-process payload cap
const SILENCE_PEAK = 0.015; // below this the mic captured (near-)silence
const MIN_SPEECH_MS = 400;

function floatPeak(float32: Float32Array): number {
  let peak = 0;
  const step = Math.max(1, Math.floor(float32.length / 8000));
  for (let i = 0; i < float32.length; i += step) {
    const a = Math.abs(float32[i]);
    if (a > peak) peak = a;
  }
  return peak;
}

function floatTo16BitPCM(float32: Float32Array): Int16Array {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function int16ToB64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let bin = "";
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP) as unknown as number[]);
  }
  return btoa(bin);
}

/**
 * Desktop voice capture on the REAL local pipeline (Electron main):
 * ensure STT model → session → mic → 16kHz PCM chunks → transcript.
 * Nothing here uses the Web Speech API (absent in Electron).
 */
export function useVoiceCapture() {
  const [state, setState] = useState<VoiceCaptureState>("idle");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Live mic level 0..1 while listening (proves the mic hears you). */
  const [level, setLevel] = useState(0);
  /** ms since recording started (while listening). */
  const [elapsedMs, setElapsedMs] = useState(0);
  const sessionRef = useRef<string | null>(null);
  const utteranceRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const meterCtxRef = useRef<AudioContext | null>(null);
  const listenStartRef = useRef(0);
  const progressUnsubRef = useRef<(() => void) | null>(null);

  const stopMeter = useCallback(() => {
    if (meterRafRef.current) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    try {
      void meterCtxRef.current?.close().catch(() => {});
    } catch {
      /* noop */
    }
    meterCtxRef.current = null;
    setLevel(0);
  }, []);

  const cleanup = useCallback((closeSession: string | null) => {
    stopMeter();
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    try {
      progressUnsubRef.current?.();
    } catch {
      /* noop */
    }
    progressUnsubRef.current = null;
    try {
      recorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* noop */
    }
    recorderRef.current = null;
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* noop */
    }
    streamRef.current = null;
    chunksRef.current = [];
    if (closeSession) {
      const id = closeSession;
      sessionRef.current = null;
      utteranceRef.current = null;
      void openCodeAgentApi.stopVoiceSession(id).catch(() => {});
    }
  }, [stopMeter]);

  useEffect(() => () => cleanup(sessionRef.current), [cleanup]);

  /** Live level meter on the mic stream (analyser, ~10fps state updates). */
  const startMeter = useCallback(
    (stream: MediaStream) => {
      try {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        meterCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        listenStartRef.current = Date.now();
        let lastTick = 0;
        const loop = () => {
          if (!meterCtxRef.current) return;
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (let i = 0; i < data.length; i += 2) {
            const v = Math.abs(data[i] - 128) / 128;
            if (v > peak) peak = v;
          }
          const now = Date.now();
          if (now - lastTick > 100) {
            lastTick = now;
            setLevel(Math.min(1, peak));
            setElapsedMs(now - listenStartRef.current);
          }
          meterRafRef.current = requestAnimationFrame(loop);
        };
        meterRafRef.current = requestAnimationFrame(loop);
      } catch {
        /* meter is best-effort; recording continues without it */
      }
    },
    []
  );

  const start = useCallback(async (): Promise<void> => {
    if (!hasOpenCodeDesktopApi()) throw new Error("Voice capture needs the desktop app.");
    setError(null);
    setProgress(null);
    // Model first: fail fast with a useful message instead of mid-utterance.
    setState("loading-model");
    try {
      progressUnsubRef.current = openCodeAgentApi.onVoiceEvent((evt) => {
        if (evt.type === "voice.stt.progress" && typeof evt.payload?.message === "string") {
          setProgress(evt.payload.message);
        }
      });
    } catch {
      /* events optional */
    }
    try {
      await openCodeAgentApi.ensureVoiceStt();
    } catch (e) {
      try {
        progressUnsubRef.current?.();
      } catch {
        /* noop */
      }
      progressUnsubRef.current = null;
      setState("error");
      setError(
        e instanceof Error
          ? e.message
          : "Speech model unavailable. Open Diagnostics to download it."
      );
      return;
    }
    setState("requesting-mic");
    let sessionId: string;
    try {
      const sess = await openCodeAgentApi.startVoiceSession("push-to-talk");
      sessionId = (sess as { id: string }).id;
      sessionRef.current = sessionId;
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Could not start a voice session.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      try {
        await openCodeAgentApi.voiceMicDenied(sessionId, "permission denied");
      } catch {
        /* noop */
      }
      cleanup(sessionId);
      setState("error");
      setError("Microphone blocked — allow it in the OS/browser settings, then try again.");
      return;
    }
    streamRef.current = stream;
    try {
      await openCodeAgentApi.voiceMicReady(sessionId);
      const begun = (await openCodeAgentApi.beginVoiceUtterance(sessionId)) as { utteranceId?: string };
      if (!begun?.utteranceId) throw new Error("Voice session failed to start listening.");
      utteranceRef.current = begun.utteranceId;
    } catch (e) {
      cleanup(sessionId);
      setState("error");
      setError(e instanceof Error ? e.message : "Voice session failed to start listening.");
      return;
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => {
      try {
        return window.MediaRecorder?.isTypeSupported?.(m);
      } catch {
        return false;
      }
    });
    let recorder: MediaRecorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (e) {
      cleanup(sessionId);
      setState("error");
      setError(e instanceof Error ? e.message : "Recorder unavailable on this device.");
      return;
    }
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderRef.current = recorder;
    setState("listening");
    setProgress(null);
    recorder.start(250);
    setElapsedMs(0);
    setLevel(0);
    startMeter(stream);
    timerRef.current = window.setTimeout(() => {
      void stopRef.current();
    }, MAX_RECORD_MS);
  }, [cleanup, startMeter]);

  /** Stop recording, transcribe, return the transcript (or null when empty). */
  const stop = useCallback(async (): Promise<string | null> => {
    const recorder = recorderRef.current;
    const sessionId = sessionRef.current;
    if (!recorder || !sessionId) {
      cleanup(sessionId);
      setState("idle");
      return null;
    }
    setState("transcribing");
    stopMeter();
    const blob: Blob = await new Promise((resolve) => {
      // Snapshot first: the wrapper below must not re-collect chunks that
      // are already in chunksRef (previously this duplicated the tail).
      const prior = chunksRef.current.slice();
      const parts: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) parts.push(e.data);
      };
      recorder.onstop = () => resolve(new Blob([...prior, ...parts], { type: recorder.mimeType }));
      try {
        recorder.stop();
      } catch {
        resolve(new Blob(prior, { type: "audio/webm" }));
      }
    });
    recorderRef.current = null;
    try {
      const buf = await blob.arrayBuffer();
      if (buf.byteLength < 8000) {
        // Under ~0.25s of audio — treat as accidental tap, not speech.
        cleanup(sessionId);
        setState("idle");
        return null;
      }
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const actx = new AC();
      try {
        const decoded = await actx.decodeAudioData(buf.slice(0));
        const seconds = Math.min(decoded.duration, 60);
        const offline = new OfflineAudioContext(1, Math.ceil(16000 * seconds), 16000);
        const src = offline.createBufferSource();
        src.buffer = decoded;
        src.connect(offline.destination);
        src.start(0);
        const rendered = await offline.startRendering();
        const channel = rendered.getChannelData(0);
        const peak = floatPeak(channel);
        const speechMs = (channel.length / 16000) * 1000;
        if (speechMs < MIN_SPEECH_MS || peak < SILENCE_PEAK) {
          // Don't burn an STT run on silence: say exactly what happened.
          cleanup(sessionId);
          setState("error");
          setError(
            speechMs < MIN_SPEECH_MS
              ? "That was too short — hold the mic and speak a full sentence."
              : "No speech detected — the mic captured silence. Check the input device/volume in OS settings, watch the level bar move while you talk, then try again."
          );
          return null;
        }
        const pcm = floatTo16BitPCM(channel);
        const b64 = int16ToB64(pcm);
        let transcript: string | undefined;
        const utt = utteranceRef.current;
        if (!utt) throw new Error("Voice session lost its utterance.");
        for (let i = 0; i < b64.length; i += CHUNK_B64) {
          const piece = b64.slice(i, i + CHUNK_B64);
          const last = i + CHUNK_B64 >= b64.length;
          const res = await openCodeAgentApi.sendVoiceAudio({
            sessionId,
            utteranceId: utt,
            base64: piece,
            last,
          });
          if (last && res.done) transcript = res.transcript;
        }
        cleanup(sessionId);
        setState("idle");
        const clean = (transcript ?? "").trim();
        return clean || null;
      } finally {
        try {
          await actx.close();
        } catch {
          /* noop */
        }
      }
    } catch (e) {
      cleanup(sessionId);
      setState("error");
      const raw = e instanceof Error ? e.message : "Transcription failed.";
      // "Empty transcript" means Whisper heard nothing intelligible — say so.
      setError(
        /empty transcript/i.test(raw)
          ? "Couldn't hear any speech in that recording — speak louder/closer to the mic and try again."
          : raw.slice(0, 220)
      );
      return null;
    }
  }, [cleanup]);

  const stopRef = useRef(stop);
  stopRef.current = stop;

  const cancel = useCallback(() => {
    const id = sessionRef.current;
    if (id) {
      void openCodeAgentApi.cancelVoiceUtterance(id).catch(() => {});
    }
    cleanup(id);
    setState("idle");
    setError(null);
  }, [cleanup]);

  return { state, progress, error, start, stop, cancel, clearError: () => setError(null) };
}
