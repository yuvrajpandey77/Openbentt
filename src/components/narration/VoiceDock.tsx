import { useEffect, useRef, useState } from "react";
import { Minimize2, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useNarration } from "@/context/NarrationContext";
import { cn } from "@/lib/utils";

function Bars({ active }: { active: boolean }) {
  return (
    <span className="flex h-4 items-end gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn("voice-bar w-0.5 rounded-full bg-primary", active && "voice-bar-on")}
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

function DockBtn({
  label,
  title,
  onClick,
  disabled,
  children,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="flex min-w-[3.25rem] cursor-pointer flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
      <span className="text-[9px] font-medium leading-none">{label}</span>
    </button>
  );
}

/** Read-aloud dock — sits above the composer, labeled controls, shrinkable. */
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
  const label =
    status === "paused"
      ? "Paused"
      : status === "preparing"
        ? "Preparing"
        : status === "speaking"
          ? "Speaking"
          : "Read aloud";

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
      style={
        pos
          ? { left: pos.x, top: pos.y }
          : { right: "1.25rem", bottom: "6.5rem" }
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {showPill ? (
        <div className="flex flex-col items-end gap-2">
          {status !== "idle" && currentLine ? (
            <div className="max-w-md rounded-2xl border border-border bg-card px-4 py-3 shadow-lg ring-1 ring-border/60">
              <LinePreview line={currentLine} wordIndex={wordIndex} />
            </div>
          ) : null}
          <div className="flex items-center gap-1 rounded-2xl border border-border bg-card py-1.5 pl-3 pr-1.5 shadow-lg ring-1 ring-border/60">
            <Bars active={status === "speaking"} />
            <div className="min-w-0 px-2">
              <p className="text-sm font-medium leading-none text-foreground">{label}</p>
              <p className="mt-0.5 max-w-[10rem] truncate text-[10px] text-muted-foreground">
                {note || `${voiceLabel} · free`}
              </p>
            </div>
            {status === "speaking" || status === "preparing" ? (
              <DockBtn label="Pause" title="Pause reading" onClick={pause}>
                <Pause className="h-3.5 w-3.5" />
              </DockBtn>
            ) : (
              <DockBtn
                label={status === "paused" ? "Resume" : "Speak"}
                title={status === "paused" ? "Resume reading" : "Read the last reply aloud"}
                onClick={() => (status === "paused" ? resume() : replay())}
                disabled={!messageId && status !== "paused"}
              >
                <Play className="h-3.5 w-3.5" />
              </DockBtn>
            )}
            <DockBtn label="Again" title="Say it again" onClick={replay} disabled={!messageId}>
              <RotateCcw className="h-3.5 w-3.5" />
            </DockBtn>
            <DockBtn
              label={auto ? "Auto on" : "Auto off"}
              title={auto ? "Stop reading new replies automatically" : "Read each new reply aloud"}
              onClick={() => setAuto(!auto)}
            >
              {auto ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </DockBtn>
            <DockBtn
              label="Hide"
              title="Shrink voice controls"
              onClick={() => {
                dismissedFor.current = messageId;
                setOpenedForSpeech(false);
                setMode("icon");
              }}
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </DockBtn>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="flex h-12 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3 shadow-lg ring-1 ring-border/60"
          title="Show read-aloud controls"
          aria-label="Show read-aloud controls"
          onClick={() => setMode("pill")}
        >
          <Bars active={status === "speaking"} />
          <span className="text-xs font-medium text-foreground">Voice</span>
        </button>
      )}
    </div>
  );
}
