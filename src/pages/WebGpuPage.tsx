import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface GpuInfo {
  vendor?: string;
  architecture?: string;
  limits?: Record<string, number>;
}

const SLM_HEURISTICS = [
  { name: "~0.5B Q4", params: "500M", vramGb: "~0.5", note: "Tiny chat / classification" },
  { name: "~1.5B Q4", params: "1.5B", vramGb: "~1", note: "Light SLM" },
  { name: "~3B Q4", params: "3B", vramGb: "~2", note: "Small instruct" },
  { name: "~7B Q4", params: "7B", vramGb: "~4–5", note: "Common local LLM" },
  { name: "~13B Q4", params: "13B", vramGb: "~8", note: "Heavier; often desktop GPU" },
];

const HF_LINKS = [
  { label: "Xenova (ONNX) tiny models", url: "https://huggingface.co/models?library=transformers.js&sort=trending" },
  { label: "Transformers.js docs", url: "https://huggingface.co/docs/transformers.js" },
];

const WebGpuPage: React.FC = () => {
  const { toast } = useToast();
  const [gpu, setGpu] = useState<GpuInfo | null>(null);
  const [noWebGpu, setNoWebGpu] = useState<string | null>(null);
  const [probeBusy, setProbeBusy] = useState(false);
  const [probeResult, setProbeResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.gpu) {
        setNoWebGpu("WebGPU is not exposed in this browser (try Chrome/Edge, secure context, and flags if needed).");
        return;
      }
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter || cancelled) {
          setNoWebGpu("No WebGPU adapter (blocked GPU, unsupported OS, or no permission).");
          return;
        }
        const info = (adapter as unknown as { info?: { vendor?: string; architecture?: string } }).info;
        const lim = adapter.limits;
        const L: Record<string, number> = {
          maxStorageBufferBindingSize: lim.maxStorageBufferBindingSize,
          maxBufferSize: lim.maxBufferSize,
          maxComputeWorkgroupStorageSize: lim.maxComputeWorkgroupStorageSize,
          maxComputeInvocationsPerWorkgroup: lim.maxComputeInvocationsPerWorkgroup,
        };
        setGpu({
          vendor: info?.vendor,
          architecture: info?.architecture,
          limits: L,
        });
      } catch (e) {
        setNoWebGpu(e instanceof Error ? e.message : "WebGPU probe failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runTransformersProbe = async () => {
    setProbeBusy(true);
    setProbeResult(null);
    try {
      const { pipeline, env } = await import("@xenova/transformers");
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      const t0 = performance.now();
      const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
        dtype: "q8",
      });
      const out = await extractor("WebGPU / WASM probe text.", { pooling: "mean", normalize: true });
      const ms = Math.round(performance.now() - t0);
      const data = out as { data?: { length?: number } };
      const n = data.data?.length ?? "?";
      setProbeResult(
        `OK in ${ms} ms. Embedding size: ${n}. Uses ONNX Runtime in-browser (WASM by default). WebGPU acceleration depends on browser and build.`
      );
      toast({ title: "Probe finished", description: "MiniLM embedding ran in-browser." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setProbeResult(`Failed: ${msg}`);
      toast({ title: "Probe failed", description: msg, variant: "destructive" });
    } finally {
      setProbeBusy(false);
    }
  };

  const maxBuf = gpu?.limits?.maxStorageBufferBindingSize;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Browser GPU limits and Transformers.js probe — full LLM chat uses the main composer (WebGPU workspace context on this
          route).
        </p>

        <Card className="p-4 space-y-2">
          <h2 className="font-semibold">Adapter</h2>
          {noWebGpu && <p className="text-sm text-amber-600">{noWebGpu}</p>}
          {gpu && (
            <div className="text-sm space-y-1 font-mono">
              <div>Vendor: {gpu.vendor ?? "—"}</div>
              <div>Architecture: {gpu.architecture ?? "—"}</div>
              {gpu.limits &&
                Object.entries(gpu.limits).map(([k, v]) => (
                  <div key={k}>
                    {k}: {v.toLocaleString()}
                  </div>
                ))}
              {maxBuf != null && (
                <p className="text-xs text-muted-foreground pt-2">
                  maxStorageBufferBindingSize limits single-buffer uploads; large models are usually sharded — expect
                  practical browser SLMs to stay in the low‑billions of parameters unless using specialized runtimes.
                </p>
              )}
            </div>
          )}
        </Card>

        <Card className="p-4 space-y-2">
          <h2 className="font-semibold">Heuristic SLM size vs VRAM (quantized)</h2>
          <p className="text-xs text-muted-foreground">Rough guide only — depends on framework, context length, and KV cache.</p>
          <table className="w-full text-xs border border-border/60">
            <thead className="bg-muted/40">
              <tr>
                <th className="p-2 text-left">Class</th>
                <th className="p-2 text-left">Params</th>
                <th className="p-2 text-left">VRAM (typ. Q4)</th>
                <th className="p-2 text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {SLM_HEURISTICS.map((r) => (
                <tr key={r.name} className="border-t border-border/40">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2">{r.params}</td>
                  <td className="p-2">{r.vramGb}</td>
                  <td className="p-2 text-muted-foreground">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">Transformers.js probe (download + run)</h2>
          <p className="text-xs text-muted-foreground">
            Downloads ONNX weights on first run (cached by the browser). Uses quantized MiniLM — not a full LLM, but
            validates your pipeline.
          </p>
          <Button type="button" size="sm" onClick={() => void runTransformersProbe()} disabled={probeBusy}>
            {probeBusy && <Loader2 className="h-4 w-4 mr-2 animate-spin inline" />}
            Run embedding probe
          </Button>
          {probeResult && <pre className="text-xs whitespace-pre-wrap bg-muted/30 p-3 rounded-md">{probeResult}</pre>}
        </Card>

        <Card className="p-4 space-y-2">
          <h2 className="font-semibold">Downloads & docs</h2>
          <ul className="text-sm space-y-1">
            {HF_LINKS.map((l) => (
              <li key={l.url}>
                <a href={l.url} className="text-primary hover:underline" target="_blank" rel="noreferrer">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
};

export default WebGpuPage;
