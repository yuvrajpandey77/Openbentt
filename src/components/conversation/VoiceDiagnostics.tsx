import React, { useCallback, useEffect, useRef, useState } from "react";
import { hasOpenCodeDesktopApi, openCodeAgentApi } from "@/lib/agent/openCodeAgentApi";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Phase I — voice diagnostics (observability, not styling).
 * Every pipeline boundary reports independently: mic permission, recorder,
 * STT model, TTS backend, last transcript. Failures are honest with reasons.
 */

interface EngineState {
  stt: { model: string; loaded: boolean; loading: boolean };
  tts: { backend: string; ok: boolean; error?: string };
}

export const VoiceDiagnostics: React.FC = () => {
  const available = hasOpenCodeDesktopApi();
  const [micPerm, setMicPerm] = useState<string>("unknown");
  const [recorder, setRecorder] = useState<{ ok: boolean; mime: string }>({ ok: false, mime: "—" });
  const [engines, setEngines] = useState<EngineState | null>(null);
  const [sttProgress, setSttProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    try {
      const MR = (window as unknown as { MediaRecorder?: { isTypeSupported?: (m: string) => boolean } }).MediaRecorder;
      const gum = Boolean(navigator?.mediaDevices?.getUserMedia);
      let mime = "—";
      if (MR && gum) {
        for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
          try {
            if (MR.isTypeSupported?.(m)) {
              mime = m;
              break;
            }
          } catch {
              /* next */
            }
        }
      }
      setRecorder({ ok: Boolean(MR && gum), mime });
    } catch {
      setRecorder({ ok: false, mime: "—" });
    }
    try {
      (navigator as Navigator & { permissions?: { query(o: { name: string }): Promise<{ state: string }> } }).permissions
        ?.query({ name: "microphone" as never })
        .then((r) => {
          if (mounted.current) setMicPerm(r.state);
        })
        .catch(() => setMicPerm("unknown"));
    } catch {
      setMicPerm("unknown");
    }
    return () => {
      mounted.current = false;
    };
  }, []);

  const refreshEngines = useCallback(async () => {
    if (!available) return;
    try {
      const s = await openCodeAgentApi.getVoiceEngineStatus();
      if (mounted.current) setEngines(s);
    } catch {
      /* degraded */
    }
  }, [available]);

  useEffect(() => {
    void refreshEngines();
    if (!available) return;
    try {
      return openCodeAgentApi.onVoiceEvent((evt) => {
        if (evt.type === "voice.stt.progress") {
          const msg = typeof evt.payload.message === "string" ? evt.payload.message : "Loading…";
          setSttProgress(msg);
          void refreshEngines();
        }
        if (evt.type === "voice.transcript") setNote("Transcript received — see conversation.");
        if (evt.type === "voice.error") setNote("Voice error — see conversation for details.");
      });
    } catch {
      return undefined;
    }
  }, [available, refreshEngines]);

  const ensureStt = async () => {
    setBusy(true);
    setNote(null);
    try {
      await openCodeAgentApi.ensureVoiceStt();
      setNote("Speech model ready.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "STT load failed.");
    } finally {
      await refreshEngines();
      setBusy(false);
    }
  };

  const clearCacheAndReload = async () => {
    setBusy(true);
    setNote(null);
    try {
      await openCodeAgentApi.clearVoiceSttCache();
      await openCodeAgentApi.ensureVoiceStt();
      setNote("Cache cleared and speech model reloaded.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Reload failed.");
    } finally {
      await refreshEngines();
      setBusy(false);
    }
  };

  if (!available) {
    return <p className="text-xs text-muted-foreground">Voice diagnostics need the desktop app.</p>;
  }

  const row = (label: string, value: React.ReactNode, tone?: "ok" | "bad" | "warn") => (
    <div className="flex items-center gap-2 py-1 text-xs">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-medium",
          tone === "ok" && "text-emerald-600 dark:text-emerald-400",
          tone === "bad" && "text-destructive",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          !tone && "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div className="rounded-lg border border-border/60 p-3" aria-label="Voice diagnostics">
      <p className="text-xs font-semibold text-foreground">Voice pipeline</p>
      <div className="mt-1 divide-y divide-border/40">
        {row("Microphone", micPerm === "granted" ? "READY (granted)" : micPerm === "denied" ? "BLOCKED (denied — allow in OS/browser settings)" : `state: ${micPerm}`, micPerm === "granted" ? "ok" : micPerm === "denied" ? "bad" : "warn")}
        {row("Recorder", recorder.ok ? `READY (${recorder.mime})` : "UNAVAILABLE (no MediaRecorder/getUserMedia)", recorder.ok ? "ok" : "bad")}
        {row(
          "STT model",
          engines
            ? engines.stt.loaded
              ? `READY (${engines.stt.model})`
              : engines.stt.loading
                ? `LOADING… ${sttProgress ?? ""}`
                : "NOT LOADED"
            : "checking…",
          engines ? (engines.stt.loaded ? "ok" : "warn") : undefined
        )}
        {row(
          "TTS",
          engines
            ? engines.tts.ok
              ? `READY (${engines.tts.backend})`
              : `UNAVAILABLE (${engines.tts.error ?? engines.tts.backend})`
            : "checking…",
          engines ? (engines.tts.ok ? "ok" : "bad") : undefined
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => void ensureStt()}>
          {busy ? "Loading…" : "Download / load speech model"}
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => void clearCacheAndReload()}>
          Clear cache & retry
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void refreshEngines()}>
          Refresh
        </Button>
      </div>
      {note && <p className="mt-1.5 text-[11px] text-muted-foreground">{note}</p>}
      <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
        Push-to-talk captures → 16kHz PCM → local Whisper → same conversation → OpenCode → OS speech.
        Voice can never approve permissions; approvals stay visual.
      </p>
    </div>
  );
};
