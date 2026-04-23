import React, { useState } from "react";
import { useChat } from "@/context/ChatContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { getLocalWeightsConsent, setLocalWeightsConsent } from "@/lib/gemmaWebGpu/localModelConsent";
import { ensureLocalGemmaLoaded } from "@/lib/gemmaWebGpu/localGemmaInference";
import { DEFAULT_LOCAL_GEMMA_MODEL_ID, LOCAL_MODEL_CATALOG, type LocalModelEntry } from "@/lib/gemmaWebGpu/models";
import { normalizeApiConfig, type LocalInferenceProfile } from "@/types/chat";
import { useToast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";

const LABEL_BY_PROFILE: Record<LocalInferenceProfile, string> = {
  eco: "Eco (low RAM, shorter replies)",
  balanced: "Balanced",
  performance: "Performance (uses WebGPU when available)",
};

/**
 * Shown for on-device WebGPU until the user has chosen a model and consented to a one-time Hugging Face cache.
 */
const LocalOnDeviceModelBar: React.FC = () => {
  const { apiConfig, setApiConfig, webgpuModelDownloadProgress } = useChat();
  const { toast } = useToast();
  const [picked, setPicked] = useState(apiConfig.model || DEFAULT_LOCAL_GEMMA_MODEL_ID);
  const [ack, setAck] = useState(false);
  const [loading, setLoading] = useState(false);
  const [barPct, setBarPct] = useState<number | null>(null);

  if (apiConfig.aiProvider !== "webgpu_gemma" || getLocalWeightsConsent()) {
    return null;
  }

  const onConfirm = () => {
    if (!ack) {
      toast({ title: "Confirm download", description: "Check the box to allow caching model files.", variant: "destructive" });
      return;
    }
    const m = (LOCAL_MODEL_CATALOG as readonly LocalModelEntry[]).find((e) => e.storedId === picked);
    if (!m) {
      toast({ title: "Invalid model", description: "Pick a model from the list.", variant: "destructive" });
      return;
    }
    setLocalWeightsConsent(true);
    setApiConfig(
      normalizeApiConfig({
        ...apiConfig,
        model: m.storedId,
        comparisonModelIds: [m.storedId],
      })
    );
    toast({
      title: "On-device model enabled",
      description: "Weights load on first send, or use Download in the composer to pre-cache now.",
    });
  };

  const onPrewarm = async () => {
    if (!ack) {
      toast({ title: "Confirm first", description: "Allow caching (checkbox) before downloading.", variant: "destructive" });
      return;
    }
    const m = (LOCAL_MODEL_CATALOG as readonly LocalModelEntry[]).find((e) => e.storedId === picked);
    if (!m) return;
    setLocalWeightsConsent(true);
    setApiConfig(
      normalizeApiConfig({
        ...apiConfig,
        model: m.storedId,
        comparisonModelIds: [m.storedId],
      })
    );
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
    <div className="shrink-0 border-b border-teal-500/25 bg-teal-500/[0.07] px-3 py-3">
      <Alert className="border-teal-500/40 bg-card/80">
        <AlertTitle className="text-sm">Set up on-device model</AlertTitle>
        <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
          Nothing is downloaded until you confirm. For Notebook / LaTeX papers, prefer a larger model and{" "}
          <strong>Balanced</strong> or <strong>Performance</strong> (Settings) so replies include full <code>latex</code>{" "}
          blocks. Eco mode saves memory with shorter context and output.
        </AlertDescription>
      </Alert>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label className="text-xs">Model to cache (Hugging Face ONNX)</Label>
          <Select value={picked} onValueChange={setPicked}>
            <SelectTrigger className="openbentt-input h-10 text-left">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {LOCAL_MODEL_CATALOG.map((e) => (
                <SelectItem key={e.storedId} value={e.storedId}>
                  {e.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-md">
          <Label className="text-xs">Resource profile</Label>
          <div className="rounded-md border border-border/60 bg-muted/30 px-2 py-2 text-[11px] text-muted-foreground">
            {LABEL_BY_PROFILE[apiConfig.localInferenceProfile]}. Change under{" "}
            <span className="font-medium text-foreground">Settings → AI &amp; models</span>.
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-2 text-xs sm:max-w-md">
          <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
          <span>
            I allow downloading and caching the selected model in this browser (roughly 400MB–1.5GB one-time, depending
            on the model).
          </span>
        </label>
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          <Button type="button" size="sm" onClick={onConfirm} disabled={loading}>
            Allow and continue
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => void onPrewarm()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Download / pre-cache now"}
          </Button>
        </div>
      </div>
      {barPct != null && (
        <div className="mt-2 space-y-1">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Download progress</span>
            <span>{barPct}%</span>
          </div>
          <Progress value={barPct} className="h-1.5" />
        </div>
      )}
      {webgpuModelDownloadProgress != null && !loading && (
        <p className="mt-1 text-[11px] text-muted-foreground">Another download may be in progress from chat ({webgpuModelDownloadProgress}%).</p>
      )}
    </div>
  );
};

export default LocalOnDeviceModelBar;
