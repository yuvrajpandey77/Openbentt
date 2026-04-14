import React from "react";
import { Image, Mic, AudioLines, Brain, Type } from "lucide-react";
import type { OpenRouterModel } from "@/lib/openrouter";
import { inferModelCapabilities, type ModelCapabilities } from "@/lib/modelCapabilities";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ModelCapabilityBadgesProps {
  modelId: string;
  /** When set (same id as modelId), prefer OpenRouter `/models` architecture metadata. */
  meta?: OpenRouterModel | null;
  className?: string;
  /** Smaller icons for dense lists */
  compact?: boolean;
}

function Badge({
  icon: Icon,
  label,
  active,
  compact,
}: {
  icon: React.ElementType;
  label: string;
  active: boolean;
  compact?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-md border transition-colors",
            compact ? "h-6 w-6" : "h-7 w-7",
            active
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/50 bg-muted/30 text-muted-foreground/45"
          )}
          aria-label={label}
        >
          <Icon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function describeCapabilities(c: ModelCapabilities): string {
  const parts: string[] = [];
  if (c.text) parts.push("Text chat");
  if (c.vision) parts.push("Vision / images (heuristic: id matches vision-capable families)");
  if (c.audioIn) parts.push("Audio in / ASR-style ids (heuristic)");
  if (c.audioOut) parts.push("Audio / TTS-style ids (heuristic)");
  if (c.reasoningHeavy) parts.push("Reasoning-heavy id (o-series, R1-like, …)");
  return parts.join(". ") + ".";
}

export const ModelCapabilityBadges: React.FC<ModelCapabilityBadgesProps> = ({ modelId, meta, className, compact }) => {
  const c = inferModelCapabilities(modelId, meta ?? undefined);
  const src = c.source === "openrouter" ? "OpenRouter API" : "id heuristic";
  return (
    <div className={cn("inline-flex items-center gap-0.5", className)} onClick={(e) => e.stopPropagation()}>
      <Badge icon={Type} label="Text chat" active={c.text} compact={compact} />
      <Badge
        icon={Image}
        label={
          c.vision
            ? `Images / vision (${src})`
            : `No image input indicated (${src})`
        }
        active={c.vision}
        compact={compact}
      />
      <Badge
        icon={Mic}
        label={c.audioIn ? `Audio in (${src})` : `No audio-in in metadata (${src})`}
        active={c.audioIn}
        compact={compact}
      />
      <Badge
        icon={AudioLines}
        label={c.audioOut ? `Audio out (${src})` : `No audio-out in metadata (${src})`}
        active={c.audioOut}
        compact={compact}
      />
      <Badge
        icon={Brain}
        label={c.reasoningHeavy ? "Reasoning-tuned id (heuristic)" : "General instruction id (heuristic)"}
        active={c.reasoningHeavy}
        compact={compact}
      />
    </div>
  );
};
