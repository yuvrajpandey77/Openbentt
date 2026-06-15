import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Info, ExternalLink } from "lucide-react";
import type { OpenRouterModel } from "@/lib/openrouter";
import { shortModelLabel, isLikelyFreeModel } from "@/lib/openrouter";

function fmtPrice(v: string | number | undefined): string {
  if (v === undefined) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  if (n === 0) return "$0";
  return `$${n}/M tok`;
}

interface ModelSpecDialogProps {
  modelId: string;
  models: OpenRouterModel[] | undefined;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}

export const ModelSpecDialog: React.FC<ModelSpecDialogProps> = ({
  modelId,
  models,
  open,
  onOpenChange,
  showTrigger = true,
}) => {
  const m = models?.find((x) => x.id === modelId);
  const href = `https://openrouter.ai/${modelId}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 border-primary/40 text-primary font-medium">
            <Info className="h-4 w-4" />
            Specs
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-left leading-tight pr-8">
            {m?.name || shortModelLabel(modelId)}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 max-h-[60vh] pr-3">
          <div className="space-y-4 text-sm">
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Model id</span>
              <p className="font-mono text-xs break-all mt-1">{modelId}</p>
            </div>
            {m && (
              <>
                <div className="flex flex-wrap gap-2">
                  {isLikelyFreeModel(m) ? (
                    <Badge variant="secondary">Likely free tier</Badge>
                  ) : (
                    <Badge variant="outline">Paid / usage-based</Badge>
                  )}
                  {m.context_length != null && (
                    <Badge variant="outline">{m.context_length.toLocaleString()} ctx</Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/80 p-3 bg-muted/30">
                  <div>
                    <div className="text-xs text-muted-foreground">Prompt</div>
                    <div className="font-mono text-sm">{fmtPrice(m.pricing?.prompt)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Completion</div>
                    <div className="font-mono text-sm">{fmtPrice(m.pricing?.completion)}</div>
                  </div>
                  {m.pricing?.request != null && Number(m.pricing.request) > 0 && (
                    <div className="col-span-2">
                      <div className="text-xs text-muted-foreground">Request fee</div>
                      <div className="font-mono text-sm">{fmtPrice(m.pricing.request)}</div>
                    </div>
                  )}
                  {m.pricing?.image != null && Number(m.pricing.image) > 0 && (
                    <div className="col-span-2">
                      <div className="text-xs text-muted-foreground">Image</div>
                      <div className="font-mono text-sm">{fmtPrice(m.pricing.image)}</div>
                    </div>
                  )}
                </div>
                {m.architecture?.input_modalities && m.architecture.input_modalities.length > 0 && (
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-wide">Input</span>
                    <p className="mt-1">{m.architecture.input_modalities.join(", ")}</p>
                  </div>
                )}
                {m.description && (
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-wide">Description</span>
                    <p className="mt-1 text-muted-foreground leading-relaxed">{m.description.slice(0, 800)}</p>
                  </div>
                )}
              </>
            )}
            {!m && (
              <p className="text-muted-foreground">
                Full pricing and metadata load when the model directory syncs (valid API key). You can still open the
                OpenRouter page for this id.
              </p>
            )}
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-primary hover:underline text-sm font-medium"
            >
              Open on OpenRouter
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
