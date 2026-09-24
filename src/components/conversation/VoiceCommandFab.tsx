import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GripVertical, Loader2, Mic, MicOff, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChat } from "@/context/ChatContext";
import { useToast } from "@/components/ui/use-toast";
import { hasOpenCodeDesktopApi } from "@/lib/agent/openCodeAgentApi";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";
import { parseVoiceCommand, voiceTabLabel } from "@/lib/voiceCommands";
import { cn } from "@/lib/utils";

const POS_KEY = "openbentt-voice-fab-pos";

/**
 * Central floating voice commander: draggable mic, hoverable, opens app
 * tabs ("open projects", "go to tasks") or sends anything else to chat as
 * a voice task (OpenCode executes with approvals). Mounted once in AppLayout.
 */
export const VoiceCommandFab: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { submitVoiceTranscript, isLoading } = useChat();
  const { state, progress, error, start, stop, cancel, clearError } = useVoiceCapture();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.x === "number" && typeof p.y === "number") return p;
      }
    } catch {
      /* default */
    }
    return null;
  });
  const dragRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (pos) {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(pos));
      } catch {
        /* ignore */
      }
    }
  }, [pos]);

  if (!hasOpenCodeDesktopApi()) return null;

  const listening = state === "listening";
  const busy = state === "loading-model" || state === "requesting-mic" || state === "transcribing";

  const onPointerDown = (e: React.PointerEvent) => {
    const el = fabRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const x = e.clientX - d.dx;
    const y = e.clientY - d.dy;
    if (Math.abs(x - (pos?.x ?? window.innerWidth - 76)) + Math.abs(y - (pos?.y ?? window.innerHeight - 170)) > 6) {
      d.moved = true;
    }
    if (d.moved) {
      setPos({
        x: Math.min(Math.max(8, x), window.innerWidth - 60),
        y: Math.min(Math.max(8, y), window.innerHeight - 60),
      });
    }
  };
  const onPointerUp = () => {
    const moved = dragRef.current?.moved;
    dragRef.current = null;
    if (!moved) {
      setOpen((v) => !v);
      setPreview(null);
      clearError();
    }
  };

  const toggleRecord = () => {
    if (listening) {
      void stop().then((t) => {
        if (t) setPreview(t);
      });
    } else if (state === "idle" || state === "error") {
      clearError();
      setPreview(null);
      void start().catch(() => {});
    }
  };

  const send = () => {
    const t = (preview ?? "").trim();
    if (!t) return;
    const route = parseVoiceCommand(t);
    setPreview(null);
    setOpen(false);
    if (route) {
      navigate(route);
      toast({ title: `Opened ${voiceTabLabel(route)}`, description: `“${t.slice(0, 80)}”` });
    } else {
      void submitVoiceTranscript(t);
      toast({ title: "Sent to chat", description: `“${t.slice(0, 80)}” — running as a voice task.` });
    }
  };

  const status =
    state === "loading-model"
      ? (progress ?? "Loading speech model…")
      : state === "requesting-mic"
        ? "Requesting microphone…"
        : state === "transcribing"
          ? "Transcribing…"
          : error ?? (listening ? "Listening — tap stop when done" : "Tap the mic and speak a command");

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label="Voice commander — drag to move, click to open"
        title="Voice commander — drag to move, click for commands"
        className={cn(
          "fixed z-50 flex h-12 w-12 touch-none items-center justify-center rounded-full border shadow-lg transition-colors",
          "border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90",
          listening && "animate-pulse border-destructive bg-destructive"
        )}
        style={
          pos
            ? { left: pos.x, top: pos.y }
            : { right: 16, bottom: 150 }
        }
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
      </button>
      {open && (
        <div
          className="fixed z-50 w-72 rounded-xl border border-border/70 bg-card p-3 shadow-xl"
          role="dialog"
          aria-label="Voice commander"
          style={
            pos
              ? {
                  left: Math.min(pos.x, window.innerWidth - 300),
                  top: Math.max(8, pos.y - 320),
                }
              : { right: 16, bottom: 210 }
          }
        >
          <div className="flex items-center gap-1.5">
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold">Voice commander</p>
            <Button type="button" size="sm" variant="ghost" className="ml-auto h-6 w-6 p-0" onClick={() => { setOpen(false); cancel(); }} aria-label="Close">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{status}</p>
          <div className="mt-2 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 flex-1 gap-1.5 text-xs"
              disabled={busy || (isLoading && !listening)}
              onClick={toggleRecord}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              {listening ? "Stop" : "Speak"}
            </Button>
            {preview && (
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setPreview(null); cancel(); }}>
                Discard
              </Button>
            )}
          </div>
          {error && <p className="mt-1.5 text-[11px] text-destructive">{error}</p>}
          {preview && (
            <div className="mt-2 rounded-md border border-border/60 bg-muted/20 p-2">
              <p className="break-words text-xs">“{preview}”</p>
              <Button type="button" size="sm" className="mt-1.5 h-7 w-full gap-1.5 text-xs" disabled={isLoading} onClick={send}>
                <Send className="h-3.5 w-3.5" />
                {parseVoiceCommand(preview) ? "Open it" : "Do it"}
              </Button>
            </div>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            Try “open projects”, “go to tasks”, “show diagnostics” — anything else runs as a chat task
            (compile, edit, research) with approvals.
          </p>
        </div>
      )}
    </>
  );
};

export default VoiceCommandFab;
