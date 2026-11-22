import { useEffect, useRef, useState } from "react";
import { Minimize2, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useNarration } from "@/context/NarrationContext";
import { cn } from "@/lib/utils";

function Bars({ active }: { active: boolean }) {
  return (
    <span className="flex h-4 items-end gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn("voice-bar w-0.5 rounded-full bg-emerald-400", active && "voice-bar-on")}
          style={{ animationDelay: `${i * 0.15}s`, height: active ? undefined : 6 }}
        />
      ))}
    </span>
  );
}

function LinePreview({ line, wordIndex }: { line: string; wordIndex: number }) {
  const words = line.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return (
    <p className="max-w-[28rem] text-left text-sm leading-relaxed">
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className={i < wordIndex ? "text-foreground" : "text-muted-foreground/45"}>
          {word}{" "}
        </span>
      ))}
    </p>
  );
}

/** Floating speak-along control: drag it, shrink it to an icon, pause, and replay. */
export function VoiceDock() {
  const narration = useNarration();
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const dismissedFor = useRef<string | null>(null);
  const [openedForSpeech, setOpenedForSpeech] = useState(false);
  const status = narration?.status ?? "idle";
  const liveMessage = narration?.messageId ?? null;
  useEffect(() => {
    if (status === "idle") {
      setOpenedForSpeech(false);
      return;
    }
    if (liveMessage === dismissedFor.current) return;
    setOpenedForSpeech(true);
  }, [status, liveMessage]);
  if (!narration) return null;
  const {
    mode,
    auto,
    pos,
    note,
    voiceLabel,
    wordIndex,
    currentLine,
    pause,
    resume,
    replay,
    setAuto,
    setMode,
    setPos,
    messageId,
  } = narration;
  const showPill = mode === "pill" || openedForSpeech;
  const label = status === "paused" ? "Paused" : status === "preparing" ? "Preparing" : status === "speaking" ? "Speaking" : "Voice";

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) < 4) return;
    start.moved = true;
    const width = event.currentTarget.offsetWidth;
    const height = event.currentTarget.offsetHeight;
    setPos({
      x: Math.min(window.innerWidth - width - 8, Math.max(8, start.left + dx)),
      y: Math.min(window.innerHeight - height - 8, Math.max(8, start.top + dy)),
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div
      className="fixed z-[80] touch-none"
      style={pos ? { left: pos.x, top: pos.y } : { left: "50%", bottom: 92, transform: "translateX(-50%)" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {showPill ? (
        <div className="flex flex-col items-center gap-2">
          {liveMessage && currentLine ? (
            <div className="max-w-md rounded-2xl border border-border/70 bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
              <LinePreview line={currentLine} wordIndex={status === "paused" ? wordIndex : wordIndex} />
            </div>
          ) : null}
          <div className="flex items-center gap-2 rounded-full border border-border/80 bg-background/95 py-1.5 pl-3 pr-1.5 shadow-lg backdrop-blur">
            <Bars active={status === "speaking"} />
            <div className="min-w-0 pr-1">
              <p className="text-sm font-medium leading-none text-foreground">{label}</p>
              <p className="mt-0.5 max-w-[12rem] truncate text-[10px] text-muted-foreground">
                {note || `${voiceLabel} · free`}
              </p>
            </div>
            {status === "speaking" || status === "preparing" ? (
              <button type="button" className="rounded-full px-3 py-1 text-sm text-foreground hover:bg-muted" onClick={pause}>
                Pause
              </button>
            ) : (
              <button
                type="button"
                className="rounded-full px-3 py-1 text-sm text-foreground hover:bg-muted"
                onClick={() => (status === "paused" ? resume() : replay())}
                disabled={!messageId && status !== "paused"}
              >
                {status === "paused" ? "Resume" : "Speak"}
              </button>
            )}
            <button type="button" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Say it again" onClick={replay} disabled={!messageId}>
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title={auto ? "Stop reading new replies" : "Read each reply aloud"}
              onClick={() => setAuto(!auto)}
            >
              {auto ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Shrink to an icon"
              onClick={() => {
                dismissedFor.current = messageId;
                setOpenedForSpeech(false);
                setMode("icon");
              }}
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-border/80 bg-background/95 shadow-lg backdrop-blur"
          title="Open voice"
          onClick={() => setMode("pill")}
        >
          <Bars active={status === "speaking"} />
        </button>
      )}
    </div>
  );
}
