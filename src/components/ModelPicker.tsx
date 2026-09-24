import React, { useState } from "react";
import { Check, ChevronDown, Cpu, Cloud, Loader2 } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { useLocalAI } from "@/context/LocalAIContext";
import { normalizeApiConfig } from "@/types/chat";
import { defaultOllamaBaseUrl } from "@/lib/modelManager/ollamaProbe";
import { friendlyModelLabel } from "@/lib/ollama/selection";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

/**
 * Phase 9 — one reusable model picker (global default scope, honestly labeled).
 * Lists REAL discovered Ollama models + current cloud selection; switching to
 * a local model configures the existing OpenAI-compatible path (no new
 * inference backend, no policy bypass).
 */
export const ModelPicker: React.FC<{ align?: "start" | "end" | "center" }> = ({ align = "start" }) => {
  const { apiConfig, setApiConfig } = useChat();
  const { health, modelNames, defaultModel, setPreferredModel, preferredModel, runningModels } = useLocalAI();
  const [open, setOpen] = useState(false);

  const isLocalActive = apiConfig.aiProvider === "openai_compatible";
  const currentLabel = isLocalActive
    ? `${friendlyModelLabel(apiConfig.model || defaultModel || "local model")}`
    : apiConfig.model || "Select model";

  const selectLocalModel = (name: string) => {
    setPreferredModel(name);
    setApiConfig(
      normalizeApiConfig({
        ...apiConfig,
        aiProvider: "openai_compatible",
        model: name,
        openAiCompatibleBaseUrl: apiConfig.openAiCompatibleBaseUrl?.trim() || defaultOllamaBaseUrl(),
      })
    );
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 max-w-[16rem] gap-1.5 px-2 text-xs font-medium"
          aria-label={`Model: ${currentLabel}. Change model`}
        >
          {isLocalActive ? <Cpu size={14} className="shrink-0 text-primary" /> : <Cloud size={14} className="shrink-0 text-muted-foreground" />}
          <span className="truncate">{currentLabel}</span>
          <Badge variant="secondary" className="hidden shrink-0 px-1 py-0 text-[10px] font-normal sm:inline">
            {isLocalActive ? "Local" : "Cloud"}
          </Badge>
          <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[min(92vw,20rem)] p-1.5">
        <p className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Global default
        </p>
        {health === "checking" && (
          <p className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Checking local AI…
          </p>
        )}
        {health !== "checking" && modelNames.length > 0 && (
          <>
            <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Local · Ollama
            </p>
            {modelNames.map((name) => {
              const active = isLocalActive && apiConfig.model === name;
              const running = runningModels.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => selectLocalModel(name)}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs",
                    "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
                    active && "bg-accent text-accent-foreground"
                  )}
                >
                  <Cpu size={14} className="shrink-0 text-primary group-hover:text-accent-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">{friendlyModelLabel(name)}</span>
                  {running && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" aria-label="Loaded" />
                  )}
                  {preferredModel === name && (
                    <Badge variant="outline" className="shrink-0 px-1 py-0 text-[10px] group-hover:border-accent-foreground/40">
                      Preferred
                    </Badge>
                  )}
                  {active && <Check size={14} className="shrink-0 text-primary group-hover:text-accent-foreground" />}
                </button>
              );
            })}
          </>
        )}
        {health !== "checking" && modelNames.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            {health === "unsupported"
              ? "Local models need the desktop app."
              : "No local models found — set up Ollama to run AI on this computer."}
          </p>
        )}
        <div className="mt-1 border-t border-border pt-1">
          <p className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Current cloud model
          </p>
          <div className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground">
            <Cloud size={14} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {isLocalActive ? "— (using local model)" : apiConfig.model || "—"}
            </span>
          </div>
          <p className="px-2 py-1 text-[11px] text-muted-foreground/80">
            Cloud and advanced provider settings live in Settings → Providers.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
};
