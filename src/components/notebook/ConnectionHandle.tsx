import { useEffect, useRef } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ConnectionHandleKind = "chat-tex" | "chat-pdf" | "tex-tab" | "pdf-preview";

type ConnectionHandleProps = {
  id: string;
  kind: ConnectionHandleKind;
  active?: boolean;
  connected?: boolean;
  highlight?: boolean;
  snapHighlight?: boolean;
  label?: string;
  tooltip?: string;
  onPointerDown?: (e: React.PointerEvent) => void;
  onClick?: () => void;
  registerAnchor: (id: string, el: HTMLElement | null) => void;
  className?: string;
};

const KIND_COLORS: Record<ConnectionHandleKind, string> = {
  "chat-tex": "bg-primary border-primary/60 shadow-primary/40",
  "chat-pdf": "bg-primary border-primary/60 shadow-primary/40",
  "tex-tab": "bg-primary border-primary/60 shadow-primary/40",
  "pdf-preview": "bg-primary border-primary/60 shadow-primary/40",
};

const DEFAULT_TOOLTIPS: Record<ConnectionHandleKind, string> = {
  "chat-tex": "Drag to a LaTeX tab dot, or click then click a tab",
  "chat-pdf": "Drag to the PDF preview dot, or click then click preview",
  "tex-tab": "Drop chat wire here, or click to connect",
  "pdf-preview": "Drop chat wire here, or click to connect",
};

/** Connection dot — registers center for cable overlay; supports click or drag-to-connect. */
export function ConnectionHandle({
  id,
  kind,
  active,
  connected,
  highlight,
  snapHighlight,
  label,
  tooltip,
  onPointerDown,
  onClick,
  registerAnchor,
  className,
}: ConnectionHandleProps) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    registerAnchor(id, ref.current);
    return () => registerAnchor(id, null);
  }, [id, registerAnchor]);

  const tip = tooltip ?? label ?? DEFAULT_TOOLTIPS[kind];

  const dot = (
    <button
      ref={ref}
      type="button"
      data-connection-handle={id}
      data-connection-kind={kind}
      aria-label={label ?? `Connection ${kind}`}
      className={cn(
        "relative z-10 h-3.5 w-3.5 shrink-0 rounded-full border-2 shadow-md transition-transform hover:scale-110",
        KIND_COLORS[kind],
        connected && "ring-2 ring-primary/70 ring-offset-2 ring-offset-background",
        (active || highlight) && "scale-110 ring-2 ring-white/70 animate-pulse",
        snapHighlight && "scale-125 ring-2 ring-primary/90 shadow-lg shadow-primary/50",
        className
      )}
      onPointerDown={onPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    />
  );

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{dot}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[220px] text-xs">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}
