import React from "react";
import { Link } from "react-router-dom";
import { useChat } from "@/context/ChatContext";
import { Badge } from "@/components/ui/badge";
import { shortModelLabel } from "@/lib/openrouter";
import { cn } from "@/lib/utils";

const PROVIDER_LABEL: Record<string, string> = {
  openrouter: "OpenRouter",
  openai_direct: "OpenAI",
  openai_compatible: "OpenAI-compatible",
  anthropic: "Anthropic",
  google: "Gemini",
};

interface PlaygroundShellProps {
  tag: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}

/** Shared chrome for Notebook / Labs / LaTeX / Benchmark / WebGPU — shows the same AI pipeline as Home. */
export const PlaygroundShell: React.FC<PlaygroundShellProps> = ({ tag, title, subtitle, children, className }) => {
  const { apiConfig } = useChat();
  const provider = PROVIDER_LABEL[apiConfig.aiProvider] ?? apiConfig.aiProvider;
  const model = shortModelLabel(apiConfig.model);
  const research = apiConfig.researchEnabled
    ? `Research ${apiConfig.researchDepth}`
    : "Research off";
  const reasoning = apiConfig.reasoningPreference === "more" ? "Reasoning +" : "Reasoning default";

  return (
    <div className={cn("min-h-screen bg-background", className)}>
      <div className="border-b border-border/70 bg-muted/15">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Link to="/chat" className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              ← Home chat
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-display text-[10px] uppercase tracking-wide">
                {tag}
              </Badge>
              <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex flex-col gap-1 rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-[11px] text-muted-foreground shadow-sm">
            <span className="font-medium text-foreground">Main chat pipeline</span>
            <span>
              {provider} · <span className="font-mono text-[10px] text-foreground">{model}</span>
            </span>
            <span>
              {research} · {reasoning}
            </span>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8 md:py-8">{children}</div>
    </div>
  );
};
