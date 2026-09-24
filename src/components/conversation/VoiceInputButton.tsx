import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Mic, MicOff } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { hasOpenCodeDesktopApi } from "@/lib/agent/openCodeAgentApi";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";

/**
 * Voice entry for the ONE canonical composer.
 *
 * Desktop (Electron): uses the local voice pipeline — STT model → mic →
 * 16kHz PCM → local Whisper → transcript preview → SAME conversation
 * pipeline as typed text (inputSource: "voice"). The old Web Speech API
 * path does not exist in Electron, which is why the button never worked.
 *
 * Browser fallback: Web Speech API when available.
 * Voice is metadata — it can never approve permissions.
 */
export const VoiceInputButton: React.FC = () => {
  const { submitVoiceTranscript, isLoading } = useChat();
  const [preview, setPreview] = useState<string | null>(null);

  if (hasOpenCodeDesktopApi()) {
    return <DesktopVoiceButton preview={preview} setPreview={setPreview} isLoading={isLoading} submit={submitVoiceTranscript} />;
  }
  return <WebSpeechButton preview={preview} setPreview={setPreview} isLoading={isLoading} submit={submitVoiceTranscript} />;
};

interface ButtonParts {
  preview: string | null;
  setPreview: (t: string | null) => void;
  isLoading: boolean;
  submit: (t: string) => Promise<void>;
}

const DesktopVoiceButton: React.FC<ButtonParts> = ({ preview, setPreview, isLoading, submit }) => {
  const { state, progress, error, start, stop, cancel, clearError } = useVoiceCapture();
  const busy = state === "loading-model" || state === "requesting-mic" || state === "transcribing";
  const listening = state === "listening";

  const toggle = useCallback(() => {
    if (listening) {
      void stop().then((t) => {
        if (t) setPreview(t);
      });
    } else if (state === "idle" || state === "error") {
      clearError();
      setPreview(null);
      void start().catch(() => {});
    }
  }, [listening, state, stop, start, setPreview, clearError]);

  const statusText =
    state === "loading-model"
      ? progress ?? "Loading speech model…"
      : state === "requesting-mic"
        ? "Requesting microphone…"
        : state === "transcribing"
          ? "Transcribing…"
          : error ?? (listening ? "Listening — click again to finish" : "Speak — enters the same conversation");

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={listening ? "secondary" : "ghost"}
              size="sm"
              className="h-8 w-8 shrink-0 border border-border/60 bg-background/80 p-0 md:h-9 md:w-9"
              type="button"
              onClick={toggle}
              disabled={(isLoading && !listening) || busy}
              aria-label={listening ? "Stop listening" : "Voice input"}
              aria-pressed={listening}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : listening ? <MicOff size={14} /> : <Mic size={14} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{statusText}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {(preview || error) && (
        <div className="w-full rounded-md border border-border/60 bg-muted/20 p-2 text-xs" role="status">
          {error ? (
            <>
              <p className="font-medium text-destructive">Voice failed</p>
              <p className="mt-0.5 break-words text-muted-foreground">{error}</p>
              <div className="mt-1.5 flex gap-1.5">
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void cancel()}>
                  Dismiss
                </Button>
              </div>
            </>
          ) : (
            preview && (
              <>
                <p className="font-medium">You said:</p>
                <p className="mt-0.5 break-words">“{preview}”</p>
                <div className="mt-1.5 flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={isLoading}
                    onClick={() => {
                      const t = preview;
                      setPreview(null);
                      void submit(t);
                    }}
                  >
                    Send as voice
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setPreview(null)}
                  >
                    Discard
                  </Button>
                </div>
              </>
            )
          )}
        </div>
      )}
    </>
  );
};

const WebSpeechButton: React.FC<ButtonParts> = ({ preview, setPreview, isLoading, submit }) => {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recogRef = useRef<{ stop: () => void; abort: () => void } | null>(null);

  useEffect(() => {
    const SR =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    setSupported(Boolean(SR));
  }, []);

  const stop = useCallback(() => {
    try {
      recogRef.current?.stop();
    } catch {
      /* noop */
    }
    recogRef.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
        abort: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
        abort: () => void;
      };
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    try {
      const recog = new Ctor();
      recog.lang = navigator.language || "en-US";
      recog.interimResults = false;
      recog.onresult = (e) => {
        const last = e.results[e.results.length - 1];
        const text = last?.[0]?.transcript?.trim();
        if (text) setPreview(text);
      };
      recog.onerror = () => {
        setListening(false);
        recogRef.current = null;
      };
      recog.onend = () => {
        setListening(false);
        recogRef.current = null;
      };
      recogRef.current = recog;
      setPreview(null);
      setListening(true);
      recog.start();
    } catch {
      setListening(false);
    }
  }, [setPreview]);

  useEffect(() => () => stop(), [stop]);

  if (!supported) return null;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={listening ? "secondary" : "ghost"}
              size="sm"
              className="h-8 w-8 shrink-0 border border-border/60 bg-background/80 p-0 md:h-9 md:w-9"
              type="button"
              onClick={() => (listening ? stop() : start())}
              disabled={isLoading && !listening}
              aria-label={listening ? "Stop listening" : "Voice input"}
              aria-pressed={listening}
            >
              {listening ? <MicOff size={14} /> : <Mic size={14} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{listening ? "Stop listening" : "Speak — enters the same conversation"}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {preview && (
        <div className="w-full rounded-md border border-border/60 bg-muted/20 p-2 text-xs" role="status">
          <p className="font-medium">You said:</p>
          <p className="mt-0.5 break-words">“{preview}”</p>
          <div className="mt-1.5 flex gap-1.5">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              disabled={isLoading}
              onClick={() => {
                const t = preview;
                setPreview(null);
                void submit(t);
              }}
            >
              Send as voice
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setPreview(null)}
            >
              Discard
            </Button>
          </div>
        </div>
      )}
    </>
  );
};
