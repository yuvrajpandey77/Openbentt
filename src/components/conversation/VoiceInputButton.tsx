import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Loader2, Mic, Square } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { hasOpenCodeDesktopApi } from "@/lib/agent/openCodeAgentApi";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";
import { cn } from "@/lib/utils";

/**
 * Voice entry for the composer — mic button stays in the toolbar;
 * listening / error / preview float above the composer so layout stays clean.
 */
interface VoiceInputButtonProps {
  setComposerMessage?: (t: string) => void;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({ setComposerMessage }) => {
  const { submitVoiceTranscript, isLoading } = useChat();
  const [preview, setPreview] = useState<string | null>(null);

  if (hasOpenCodeDesktopApi()) {
    return (
      <DesktopVoiceButton
        preview={preview}
        setPreview={setPreview}
        isLoading={isLoading}
        submit={submitVoiceTranscript}
        setComposerMessage={setComposerMessage}
      />
    );
  }
  return (
    <WebSpeechButton
      preview={preview}
      setPreview={setPreview}
      isLoading={isLoading}
      submit={submitVoiceTranscript}
      setComposerMessage={setComposerMessage}
    />
  );
};

interface ButtonParts {
  preview: string | null;
  setPreview: (t: string | null) => void;
  isLoading: boolean;
  submit: (t: string) => Promise<void>;
  setComposerMessage?: (t: string) => void;
}

function VoiceStatusCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={cn(
        "pointer-events-auto fixed bottom-[5.5rem] left-1/2 z-[90] w-[min(92vw,24rem)] -translate-x-1/2",
        "rounded-2xl border border-border bg-card p-3 shadow-xl ring-1 ring-border/70",
        className
      )}
      role="status"
    >
      {children}
    </div>,
    document.body
  );
}

const DesktopVoiceButton: React.FC<ButtonParts> = ({
  preview,
  setPreview,
  isLoading,
  submit,
  setComposerMessage,
}) => {
  const { state, progress, error, level, elapsedMs, start, stop, cancel, clearError } = useVoiceCapture();
  const busy = state === "loading-model" || state === "requesting-mic" || state === "transcribing";
  const listening = state === "listening";

  const toggle = useCallback(() => {
    if (listening) {
      void stop().then((t) => {
        if (t?.trim()) {
          setComposerMessage?.(t.trim());
          setPreview(t.trim());
        }
      });
    } else if (state === "idle" || state === "error") {
      clearError();
      setPreview(null);
      void start().catch(() => {});
    }
  }, [listening, state, stop, start, setPreview, setComposerMessage, clearError]);

  const statusText =
    state === "loading-model"
      ? progress ?? "Loading speech model…"
      : state === "requesting-mic"
        ? "Allow microphone access…"
        : state === "transcribing"
          ? "Turning speech into text…"
          : listening
            ? `Listening… click Stop when done (${Math.floor(elapsedMs / 1000)}s)`
            : "Click to speak into chat";

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-border/70 bg-muted/40 p-0",
                listening && "border-primary/50 bg-primary/10 text-primary"
              )}
              type="button"
              onClick={toggle}
              disabled={(isLoading && !listening) || busy}
              aria-label={listening ? "Stop listening" : "Speak into chat"}
              aria-pressed={listening}
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : listening ? (
                <Square size={12} className="fill-current" />
              ) : (
                <Mic size={14} />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{statusText}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {listening && (
        <VoiceStatusCard>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-foreground">Listening</p>
              <p className="text-[11px] text-muted-foreground">Speak clearly — watch the level bar move</p>
            </div>
            <Button type="button" size="sm" className="h-8 cursor-pointer gap-1.5" onClick={toggle}>
              <Square size={12} className="fill-current" /> Stop
            </Button>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-100"
              style={{ width: `${Math.max(4, Math.round(level * 100))}%` }}
            />
          </div>
        </VoiceStatusCard>
      )}

      {busy && !listening && (
        <VoiceStatusCard>
          <p className="text-sm font-medium">{statusText}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">First use may download a small speech model.</p>
        </VoiceStatusCard>
      )}

      {(preview || error) && !listening && !busy && (
        <VoiceStatusCard>
          {error ? (
            <>
              <p className="text-sm font-medium text-destructive">Couldn’t capture speech</p>
              <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              <div className="mt-2 flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 cursor-pointer"
                  onClick={() => {
                    clearError();
                    void start().catch(() => {});
                  }}
                >
                  Try again
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 cursor-pointer"
                  onClick={() => void cancel()}
                >
                  Dismiss
                </Button>
              </div>
            </>
          ) : (
            preview && (
              <>
                <p className="text-sm font-medium">Heard:</p>
                <p className="mt-1 break-words text-xs text-muted-foreground">“{preview}”</p>
                <div className="mt-2 flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 cursor-pointer"
                    disabled={isLoading}
                    onClick={() => {
                      const t = preview;
                      setPreview(null);
                      void submit(t);
                    }}
                  >
                    Send
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 cursor-pointer"
                    onClick={() => setPreview(null)}
                  >
                    Keep in box
                  </Button>
                </div>
              </>
            )
          )}
        </VoiceStatusCard>
      )}
    </>
  );
};

const WebSpeechButton: React.FC<ButtonParts> = ({
  preview,
  setPreview,
  isLoading,
  submit,
  setComposerMessage,
}) => {
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
        if (text) {
          setComposerMessage?.(text);
          setPreview(text);
        }
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
  }, [setPreview, setComposerMessage]);

  useEffect(() => () => stop(), [stop]);

  if (!supported) return null;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-border/70 bg-muted/40 p-0"
              type="button"
              onClick={() => (listening ? stop() : start())}
              disabled={isLoading && !listening}
              aria-label={listening ? "Stop listening" : "Speak into chat"}
              aria-pressed={listening}
            >
              {listening ? <Square size={12} className="fill-current" /> : <Mic size={14} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{listening ? "Stop listening" : "Speak into chat"}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {preview && (
        <VoiceStatusCard>
          <p className="text-sm font-medium">Heard:</p>
          <p className="mt-1 break-words text-xs text-muted-foreground">“{preview}”</p>
          <div className="mt-2 flex gap-1.5">
            <Button
              type="button"
              size="sm"
              className="h-8 cursor-pointer"
              disabled={isLoading}
              onClick={() => {
                const t = preview;
                setPreview(null);
                void submit(t);
              }}
            >
              Send
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8 cursor-pointer" onClick={() => setPreview(null)}>
              Keep in box
            </Button>
          </div>
        </VoiceStatusCard>
      )}
    </>
  );
};
