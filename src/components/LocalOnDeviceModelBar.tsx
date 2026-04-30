import React, { useState } from "react";
import { useChat } from "@/context/ChatContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Cpu } from "lucide-react";
import { getLocalWeightsConsent, setLocalWeightsConsent } from "@/lib/gemmaWebGpu/localModelConsent";
import { ensureLocalGemmaLoaded } from "@/lib/gemmaWebGpu/localGemmaInference";
import { DEFAULT_LOCAL_GEMMA_MODEL_ID, LOCAL_MODEL_CATALOG, type LocalModelEntry } from "@/lib/gemmaWebGpu/models";
import { normalizeApiConfig, type LocalInferenceProfile } from "@/types/chat";
import { useToast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";

const LABEL_BY_PROFILE: Record<LocalInferenceProfile, string> = {
  eco: "Eco (low RAM, shorter replies)",
  balanced: "Balanced",
  performance: "Performance (uses GPU acceleration when available)",
};

/**
 * Renders a compact setup banner while consent is pending, plus a Dialog with the
 * full setup UI. Returns null once the user has given consent.
 */
const LocalOnDeviceModelBar: React.FC = () => {
  const { apiConfig, setApiConfig } = useChat();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(apiConfig.model || DEFAULT_LOCAL_GEMMA_MODEL_ID);
  const [ack, setAck] = useState(false);
  const [loading, setLoading] = useState(false);
  const [barPct, setBarPct] = useState<number | null>(null);

  if (apiConfig.aiProvider !== "webgpu_gemma" || getLocalWeightsConsent()) {
    return null;
  }

  const applyConsent = (storedId: string) => {
    setLocalWeightsConsent(true);
    setApiConfig(
      normalizeApiConfig({
        ...apiConfig,
        model: storedId,
        comparisonModelIds: [storedId],
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
    const m = (LOCAL_MODEL_CATALOG as readonly LocalModelEntry[]).find((e) => e.storedId === picked);
    if (!m) {
      toast({ title: "Pick a model", description: "Select a model from the list to continue.", variant: "destructive" });
      return;
    }
    applyConsent(m.storedId);
    toast({
      title: "On-device model enabled",
      description: "Weights download on your first message. Pre-cache now via 'Download to cache' in the ··· menu.",
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
    const m = (LOCAL_MODEL_CATALOG as readonly LocalModelEntry[]).find((e) => e.storedId === picked);
    if (!m) return;
    applyConsent(m.storedId);
    setLoading(true);
    setBarPct(0);
    const ac = new AbortController();
    try {
      await ensureLocalGemmaLoaded(
        m.storedId,
        (p) => setBarPct(p),
        ac.signal,
        { backendPreference: apiConfig.localInferenceProfile === "performance" ? "webgpu" : "auto" }
      );
      toast({ title: "Model ready", description: `${m.displayName} is cached on this device.` });
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
      {/* Compact inline prompt — much smaller than the old full-width band */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-teal-500/30 bg-teal-500/[0.06] px-3 py-2 text-sm">
        <div className="flex items-center gap-2 text-foreground/80">
          <Cpu size={14} className="shrink-0 text-teal-600 dark:text-teal-400" />
          <span className="text-xs">On-device model needs a one-time setup before your first chat.</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 shrink-0 border-teal-500/40 px-3 text-xs"
          onClick={() => setOpen(true)}
        >
          Set up
        </Button>
      </div>

      {/* Full setup Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Set up on-device model</DialogTitle>
            <DialogDescription>
              Choose a model to cache locally. Nothing is downloaded until you confirm. Weights are stored in your
              browser cache (~400 MB–1.5 GB depending on the model, one-time).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Model picker */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Model</Label>
              <Select value={picked} onValueChange={setPicked} disabled={loading}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {LOCAL_MODEL_CATALOG.map((e) => (
                    <SelectItem key={e.storedId} value={e.storedId}>
                      {e.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Smaller models use less RAM; larger ones give higher quality. You can change this in Settings later.
              </p>
            </div>

            {/* Resource profile — read-only hint */}
            <div className="rounded-lg border border-border/50 bg-muted/25 px-3 py-2.5 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Resource profile:</span>{" "}
              {LABEL_BY_PROFILE[apiConfig.localInferenceProfile]}. Change under{" "}
              <span className="font-medium text-foreground">Settings → AI & models</span>.
            </div>

            {/* Download progress */}
            {barPct != null && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>Downloading…</span>
                  <span>{barPct}%</span>
                </div>
                <Progress value={barPct} className="h-1.5" />
              </div>
            )}

            {/* Consent checkbox */}
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <Checkbox
                checked={ack}
                onCheckedChange={(v) => setAck(v === true)}
                className="mt-0.5"
                disabled={loading}
              />
              <span className="text-xs leading-relaxed text-muted-foreground">
                I allow downloading and caching the selected model in this browser (one-time, ~400 MB–1.5 GB).
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
