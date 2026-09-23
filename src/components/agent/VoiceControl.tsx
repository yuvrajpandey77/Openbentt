import { useCallback, useEffect, useRef, useState } from "react";
import { openCodeAgentApi } from "@/lib/agent/openCodeAgentApi";
import { recordUtterance } from "@/lib/agent/voiceCapture";
import { submitVoiceTask } from "@/lib/agent/openCodeHarness";
import { summarizeForSpeech } from "@/lib/agent/voiceCore.mjs";
import type { VoiceEvent, VoiceSessionPublic } from "@/lib/agent/openCodeTypes";

/**
 * Phase 3 — Voice control: push-to-talk microphone button + session states.
 *
 * Flow: enable mic (explicit) → hold to record → release → local STT →
 * transcript preview → [Run] routes through the EXISTING harness
 * (decideRoute → createTask → approvals) → completion summary spoken
 * via local TTS. Voice can never approve permissions; the visual
 * permission dialog remains the sole authority.
 */
export function VoiceControl({
  workspaceRoot,
  onTaskCreated,
}: {
  workspaceRoot: string;
  onTaskCreated?: (taskId: string) => void;
}) {
  const [session, setSession] = useState<VoiceSessionPublic | null>(null);
  const [micState, setMicState] = useState("off");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const recorderRef = useRef<{ stopAndUpload: (o?: { cancel?: boolean }) => Promise<{ transcript?: string; cancelled: boolean }>; cancel: () => Promise<void> } | null>(null);
  const utteranceRef = useRef<string | null>(null);
  const voiceTaskRef = useRef<string | null>(null);
  const sessionRef = useRef<VoiceSessionPublic | null>(null);
  sessionRef.current = session;

  useEffect(() => {
    return openCodeAgentApi.onEvent((evt) => {
      const watched = voiceTaskRef.current;
      const sess = sessionRef.current;
      if (!watched || !sess || evt.taskId !== watched) return;
      if (evt.type === "agent.completed" || evt.type === "agent.failed") {
        const summary = summarizeForSpeech({
          events: [evt],
          taskStatus: evt.type === "agent.completed" ? "COMPLETED" : "FAILED",
        });
        voiceTaskRef.current = null;
        openCodeAgentApi.speakVoiceText(sess.id, summary).catch(() => {});
      }
      if (evt.type === "agent.permission.requested") {
        const notice = summarizeForSpeech({ events: [], permissionPending: true });
        openCodeAgentApi.speakVoiceText(sess.id, notice).catch(() => {});
      }
    });
  }, []);
  useEffect(() => {
    return openCodeAgentApi.onVoiceEvent((evt: VoiceEvent) => {
      if (evt.type === "voice.transcript" && typeof evt.payload.transcript === "string") {
        setTranscript(String(evt.payload.transcript));
      }
      if (evt.type === "voice.speaking") setSpeaking(true);
      if (evt.type === "voice.stopped" || evt.type === "voice.interrupted") setSpeaking(false);
      if (evt.type === "voice.error") {
        setError("Voice error — see details. Microphone is off until you retry.");
      }
    });
  }, []);

  const enableMic = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const s = await openCodeAgentApi.startVoiceSession("push-to-talk");
      setSession(s);
      setMicState("requesting");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start voice.");
    } finally {
      setBusy(false);
    }
  }, []);

  const disableMic = useCallback(async () => {
    if (!session) return;
    try {
      await openCodeAgentApi.stopVoiceSession(session.id);
    } catch { /* best effort */ }
    setSession(null);
    setMicState("off");
    setTranscript(null);
    setRecording(false);
    setSpeaking(false);
  }, [session]);

  const holdToTalk = useCallback(async () => {
    if (!session || recording) return;
    setError(null);
    setTranscript(null);
    try {
      // Interrupt any speech first (barge-in).
      if (speaking) {
        await openCodeAgentApi.stopVoiceSpeaking(session.id);
        setSpeaking(false);
      }
      const started = await openCodeAgentApi.beginVoiceUtterance(session.id);
      utteranceRef.current = started.utteranceId;
      setMicState("active");
      const recorder = await recordUtterance(session.id, started.utteranceId);
      recorderRef.current = recorder;
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recording failed.");
      setMicState(session ? "muted" : "off");
    }
  }, [session, recording, speaking]);

  const releaseToTranscribe = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorderRef.current = null;
    setRecording(false);
    setMicState("muted");
    try {
      const res = await recorder.stopAndUpload();
      if (!res.cancelled && res.transcript) setTranscript(res.transcript);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed.");
    }
  }, []);

  const cancelRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);
    try {
      if (recorder) await recorder.cancel();
      else if (session) await openCodeAgentApi.cancelVoiceUtterance(session.id);
    } catch { /* noop */ }
    setTranscript(null);
  }, [session]);

  const runTranscript = useCallback(async () => {
    if (!transcript || !workspaceRoot.trim()) return;
    setError(null);
    setBusy(true);
    try {
      if (session) await openCodeAgentApi.voiceThinking(session.id);
      const task = await submitVoiceTask(transcript, { workspaceRoot: workspaceRoot.trim() });
      voiceTaskRef.current = task.id;
      onTaskCreated?.(task.id);
      setTranscript(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not run voice task.");
    } finally {
      setBusy(false);
    }
  }, [transcript, workspaceRoot, session, onTaskCreated]);

  const stopSpeech = useCallback(async () => {
    if (!session) return;
    try {
      await openCodeAgentApi.stopVoiceSpeaking(session.id);
    } catch { /* noop */ }
    setSpeaking(false);
  }, [session]);

  const stateLabel = recording ? "Voice: Listening" : speaking ? "Voice: Speaking" : session ? "Voice: Ready" : "Voice: Off";

  return (
    <section aria-label="Voice control" className="rounded border p-2">
      <div className="flex items-center gap-2">
        {!session ? (
          <button type="button" disabled={busy} onClick={() => enableMic()} className="rounded border px-2 py-1 text-xs disabled:opacity-50" aria-label="Enable microphone">
            🎙 Enable mic
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onPointerDown={() => holdToTalk()}
              onPointerUp={() => releaseToTranscribe()}
              onPointerLeave={() => { if (recording) void releaseToTranscribe(); }}
              className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
              aria-label="Hold to talk"
            >
              🎙 {recording ? "Release" : "Hold to talk"}
            </button>
            {recording && (
              <button type="button" onClick={() => cancelRecording()} className="rounded border px-2 py-1 text-xs">
                Cancel
              </button>
            )}
            {speaking && (
              <button type="button" onClick={() => stopSpeech()} className="rounded border px-2 py-1 text-xs">
                Stop
              </button>
            )}
            <button type="button" onClick={() => disableMic()} className="rounded border px-2 py-1 text-xs">
              Mic off
            </button>
          </>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">{stateLabel} · {micState === "off" ? "Microphone off" : micState === "requesting" ? "Microphone requesting permission" : micState === "active" ? "Microphone active" : "Microphone muted"}</span>
      </div>
      {transcript && (
        <div className="mt-2 rounded bg-muted p-2 text-xs">
          <p className="font-medium">You said:</p>
          <p className="mt-1">“{transcript}”</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy || !workspaceRoot.trim()} onClick={() => runTranscript()} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50">
              Run
            </button>
            <button type="button" onClick={() => setTranscript(null)} className="rounded border px-2 py-1 text-xs">
              Edit (discard)
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Preview only — execution still needs your explicit permission for every sensitive step.</p>
        </div>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
    </section>
  );
}
