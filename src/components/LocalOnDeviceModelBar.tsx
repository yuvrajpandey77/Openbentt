import React, { useState } from "react";
import { useChat } from "@/context/ChatContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Cpu } from "lucide-react";
import { getLocalWeightsConsent, setLocalWeightsConsent } from "@/lib/gemmaWebGpu/localModelConsent";
import { ensureLocalGemmaLoaded } from "@/lib/gemmaWebGpu/localGemmaInference";
import { LOCAL_TINY_MODEL_ID, getLocalModelEntry } from "@/lib/gemmaWebGpu/models";
import { normalizeApiConfig } from "@/types/chat";
import { useToast } from "@/components/ui/use-toast";
import { ModelDownloadProgressBar } from "@/components/ModelDownloadProgressBar";

const TINY = getLocalModelEntry(LOCAL_TINY_MODEL_ID);

/**
 * Renders a compact setup banner while consent is pending, plus a Dialog with the
 * full setup UI. Returns null once the user has given consent.
 */
type LocalOnDeviceModelBarProps = {
  /** Hide inline banner; dialog can still open via `open` / `onOpenChange`. */
  dialogOnly?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const LocalOnDeviceModelBar: React.FC<LocalOnDeviceModelBarProps> = ({
  dialogOnly = false,
  open: controlledOpen,
  onOpenChange,
}) => {
  const { apiConfig, setApiConfig } = useChat();
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [ack, setAck] = useState(false);
  const [loading, setLoading] = useState(false);
  const [barPct, setBarPct] = useState<number | null>(null);

  if (apiConfig.aiProvider !== "webgpu_gemma" || getLocalWeightsConsent()) {
    return null;
  }

  const applyConsent = () => {
    setLocalWeightsConsent(true);
    setApiConfig(
      normalizeApiConfig({
        ...apiConfig,
        aiProvider: "webgpu_gemma",
        model: LOCAL_TINY_MODEL_ID,
        comparisonModelIds: [LOCAL_TINY_MODEL_ID],
      })
    );
  };

  const onConfirm = () => {
    if (!ack) {
      toast({
        title: "One more step",
        description: "Check the box to allow caching model files before continuing.",
        variant: "destructive",
      });
      return;
    }
    applyConsent();
    toast({
      title: "On-device model enabled",
      description: "Qwen 0.5B downloads on your first message, or use Download & cache now.",
    });
    setOpen(false);
  };

  const onPrewarm = async () => {
    if (!ack) {
      toast({
        title: "One more step",
        description: "Check the consent box first.",
        variant: "destructive",
      });
      return;
    }
    applyConsent();
    setLoading(true);
    setBarPct(0);
    const ac = new AbortController();
    try {
      await ensureLocalGemmaLoaded(
        LOCAL_TINY_MODEL_ID,
        (p) => setBarPct(p),
        ac.signal,
        {
          // Browser: WASM first avoids ORT "Can't create session" on flaky WebGPU.
          backendPreference: apiConfig.localInferenceProfile === "performance" ? "auto" : "wasm",
        }
      );
      toast({ title: "Model ready", description: `${TINY.displayName} is cached on this device.` });
      setOpen(false);
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      toast({
        title: "Download failed",
        description: e instanceof Error ? e.message : "Could not load the model",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setBarPct(null);
    }
  };

  return (
    <>
      {!dialogOnly && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/[0.06] px-3 py-2 text-sm">
          <div className="flex min-w-0 items-center gap-2 text-foreground/80">
            <Cpu size={14} className="shrink-0 text-primary" />
            <span className="text-xs">
              On-device chat uses Qwen 2.5 0.5B (~400 MB, one-time download). Set up before your first message.
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 border-primary/40 px-3 text-xs"
            onClick={() => setOpen(true)}
          >
            Set up
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Set up on-device model</DialogTitle>
            <DialogDescription>
              Runs entirely in this browser (WebGPU when available, otherwise CPU). No cloud API key required.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
              <p className="text-sm font-medium text-foreground">{TINY.displayName}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{TINY.subtitle}</p>
            </div>

            {barPct != null && (
              <ModelDownloadProgressBar
                title="Downloading model to cache…"
                percentOnly
                className="border-0 bg-transparent p-0"
                progress={{
                  percent: barPct,
                  received: null,
                  total: null,
                  speedBps: null,
                  etaSeconds: null,
                }}
              />
            )}

            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <Checkbox
                checked={ack}
                onCheckedChange={(v) => setAck(v === true)}
                className="mt-0.5"
                disabled={loading}
              />
              <span className="text-xs leading-relaxed text-muted-foreground">
                I allow downloading and caching Qwen 2.5 0.5B (q8) in this browser (~200–400 MB, one-time).
              </span>
            </label>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="button" variant="outline" onClick={() => void onPrewarm()} disabled={loading || !ack}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Downloading…
                </>
              ) : (
                "Download & cache now"
              )}
            </Button>
            <Button type="button" onClick={onConfirm} disabled={loading || !ack}>
              Enable & chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default LocalOnDeviceModelBar;
