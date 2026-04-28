import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { getLocalGgufApi } from "@/lib/localGguf/desktopApi";
import { assertSafeGgufFileName, assertSafeRepoId } from "@/lib/localGguf/validate";
import { useChat } from "@/context/ChatContext";
import { GGUF_MODEL_NONE, buildGgufModelId } from "@/lib/localGguf/ids";
import { normalizeApiConfig } from "@/types/chat";
import { estimateMinVramGiBForWeights, guessQuantLabelFromGgufFileName } from "@/lib/localGguf/ggufHints";

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GiB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${(n / 1024).toFixed(0)} KiB`;
}

/** Desktop-only: discover, download, and remove GGUF weights; wire Settings model selection. */
const LocalGgufHub: React.FC = () => {
  const api = typeof window !== "undefined" ? getLocalGgufApi() : undefined;
  const { toast } = useToast();
  const { apiConfig, setApiConfig } = useChat();
  const qc = useQueryClient();

  const [searchQ, setSearchQ] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pickedRepoId, setPickedRepoId] = useState<string | null>(null);
  const [chosenFileName, setChosenFileName] = useState("");
  const [downloadPct, setDownloadPct] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQ.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQ]);

  const registryQuery = useQuery({
    queryKey: ["local-gguf-registry"],
    queryFn: async () => {
      const a = getLocalGgufApi();
      if (!a) return { entries: [] };
      return a.listRegistry();
    },
    enabled: Boolean(api),
  });

  const binaryQuery = useQuery({
    queryKey: ["local-gguf-binary", apiConfig.localGgufBinaryPath],
    queryFn: () => api!.resolveBinary(apiConfig.localGgufBinaryPath.trim() || undefined),
    enabled: Boolean(api),
  });

  const diskQuery = useQuery({
    queryKey: ["local-gguf-disk"],
    queryFn: () => api!.diskFree(),
    enabled: Boolean(api),
  });

  const searchQuery = useQuery({
    queryKey: ["hf-search", debouncedSearch],
    queryFn: () => api!.searchHf(debouncedSearch),
    enabled: Boolean(api && debouncedSearch.length >= 2),
  });

  const hfSecretQuery = useQuery({
    queryKey: ["hf-secret-status"],
    queryFn: () => getLocalGgufApi()!.hfSecretStatus(),
    enabled: Boolean(api?.hfSecretStatus),
  });

  useEffect(() => {
    const a = getLocalGgufApi();
    if (!a) return undefined;
    return a.onDownloadProgress((e) => {
      if ((e.total ?? 0) > 0 && e.received != null) {
        setDownloadPct(Math.min(99, Math.floor((100 * e.received) / e.total)));
      }
    });
  }, []);

  const filesQuery = useQuery({
    queryKey: ["hf-ggufs", pickedRepoId],
    queryFn: () => api!.listGgufFiles(pickedRepoId!),
    enabled: Boolean(api && pickedRepoId),
  });

  useEffect(() => {
    setChosenFileName("");
  }, [pickedRepoId]);

  useEffect(() => {
    const list = filesQuery.data?.gguf ?? [];
    if (list.length) {
      const preferred =
        [...list].sort((a, b) => {
          const sa = /\.(q8|q6|q5|q4|IQ)/i.exec(a)?.[1] ?? "z";
          const sb = /\.(q8|q6|q5|q4|IQ)/i.exec(b)?.[1] ?? "z";
          return sa.localeCompare(sb);
        })[0] ?? list[0]!;
      setChosenFileName(preferred);
    }
  }, [filesQuery.data?.gguf]);

  const gated =
    typeof (filesQuery.data as { gated?: boolean } | undefined)?.gated === "boolean"
      ? (filesQuery.data as { gated?: boolean }).gated
      : false;

  const fileHintBytes =
    chosenFileName && pickedRepoId ? filesQuery.data?.fileSizes?.[chosenFileName] : undefined;

  const quantVramHints = useMemo(() => {
    if (!chosenFileName) return { quant: null as string | null, vramGiB: null as number | null };
    const quant = guessQuantLabelFromGgufFileName(chosenFileName);
    const sz = typeof fileHintBytes === "number" && fileHintBytes > 0 ? fileHintBytes : null;
    const vramGiB = sz != null ? estimateMinVramGiBForWeights(sz) : null;
    return { quant, vramGiB };
  }, [chosenFileName, fileHintBytes]);

  const handleDownload = async () => {
    if (!api) return;
    const hasHfCred = Boolean(apiConfig.huggingFaceToken.trim() || hfSecretQuery.data?.stored);
    if (gated && !hasHfCred) {
      toast({
        title: "HF token likely required",
        description: "This repo may be gated — add and save a Hugging Face token in Settings.",
        variant: "destructive",
      });
      return;
    }
    try {
      assertSafeRepoId(pickedRepoId!);
      const fn = assertSafeGgufFileName(chosenFileName);
      setDownloadPct(0);
      await api.addFromHf({
        repoId: pickedRepoId!,
        fileName: fn,
        revision: "main",
      });
      setDownloadPct(100);
      await qc.invalidateQueries({ queryKey: ["local-gguf-registry"] });
      await qc.invalidateQueries({ queryKey: ["local-gguf-registry-models"] });
      toast({ title: "Download complete", description: `${pickedRepoId} · ${fn}` });

      /** Auto-select newest in Settings if provider is local GGUF. */
      const reg = await api.listRegistry();
      const newest = reg.entries[reg.entries.length - 1];
      if (
        newest &&
        apiConfig.aiProvider === "local_gguf"
      ) {
        setApiConfig(
          normalizeApiConfig({
            ...apiConfig,
            model: buildGgufModelId(newest.id),
            comparisonModelIds: [buildGgufModelId(newest.id)],
          })
        );
      }
    } catch (e) {
      toast({
        title: "Download failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setDownloadPct(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!api) return;
    try {
      await api.deleteEntry(id);
      await qc.invalidateQueries({ queryKey: ["local-gguf-registry"] });
      await qc.invalidateQueries({ queryKey: ["local-gguf-registry-models"] });
      if (apiConfig.model === buildGgufModelId(id)) {
        setApiConfig(
          normalizeApiConfig({
            ...apiConfig,
            model: GGUF_MODEL_NONE,
            comparisonModelIds: [GGUF_MODEL_NONE],
          })
        );
      }
      toast({ title: "Removed", description: "Model file deleted from disk." });
    } catch (e) {
      toast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleWhoami = async () => {
    if (!api) return;
    try {
      const plain = apiConfig.huggingFaceToken.trim();
      const r = await api.whoami(plain || "");
      toast({
        title: r.valid ? "Token OK" : "Token invalid",
        description: r.valid ? `Signed in as ${r.name ?? "?"}` : r.message ?? "Check Hugging Face",
        variant: r.valid ? "default" : "destructive",
      });
    } catch (e) {
      toast({ title: "whoami failed", description: String(e), variant: "destructive" });
    }
  };

  const entries = registryQuery.data?.entries ?? [];

  const searchRows = searchQuery.data ?? [];

  if (!api) {
    return (
      <Card className="border-dashed border-amber-500/40 p-6 text-sm text-muted-foreground">
        Local GGUF downloads and inference run inside the Openbentt <strong className="text-foreground">desktop</strong> app
        only. Build with Electron and launch <code className="rounded bg-muted px-1 py-0.5 text-[11px]">npm run electron:dev</code>.
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Inference binary (llama-server)</h2>
          <Badge variant="secondary">Beta</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Resolved path:{" "}
          <code className="break-all rounded bg-muted px-1 py-0.5 text-[11px]">
            {binaryQuery.data?.path ?? "not found — install llama.cpp or set OPENBENTT_LLAMA_SERVER_PATH"}
          </code>
          {binaryQuery.data?.source ? (
            <span className="ml-2 text-xs text-muted-foreground">({binaryQuery.data.source})</span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          Free disk (models volume):{" "}
          <strong>{diskQuery.data?.bytes != null ? formatBytes(diskQuery.data.bytes) : "unknown"}</strong>. Downloads
          abort early if HEAD size check fails quota.
        </p>
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Hugging Face hub</h2>
          <Badge variant="secondary">Beta</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search models (≥2 chars)…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="max-w-md font-mono text-sm"
          />
          <Button type="button" variant="outline" size="sm" onClick={() => searchQuery.refetch()}>
            Search
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleWhoami()}
            disabled={
              !(apiConfig.huggingFaceToken.trim() || hfSecretQuery.data?.stored)
            }
          >
            Validate HF token
          </Button>
        </div>

        <ScrollArea className="h-40 rounded-md border border-border/60">
          <ul className="p-2 text-xs">
            {searchRows.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className={`w-full rounded px-2 py-1.5 text-left hover:bg-muted/60 ${pickedRepoId === m.id ? "bg-muted" : ""}`}
                  onClick={() => {
                    try {
                      setPickedRepoId(assertSafeRepoId(m.id));
                      setChosenFileName("");
                      void qc.invalidateQueries({ queryKey: ["hf-ggufs", m.id] });
                    } catch (e) {
                      toast({
                        title: "Invalid repo",
                        description: String(e),
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <span className="font-medium">{m.id}</span>
                  <span className="ml-2 text-muted-foreground">{m.pipeline_tag ?? ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>

        {pickedRepoId ? (
          <div className="space-y-2">
            <Label>Pick a GGUF file in {pickedRepoId}</Label>
            {filesQuery.isFetching ? (
              <p className="text-xs text-muted-foreground">Listing files…</p>
            ) : (
              <select
                className="w-full rounded-md border border-border bg-background px-2 py-2 font-mono text-xs"
                value={chosenFileName}
                onChange={(e) => setChosenFileName(e.target.value)}
              >
                {(filesQuery.data?.gguf ?? []).map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            )}
            {quantVramHints.quant != null || quantVramHints.vramGiB != null ? (
              <p className="text-xs text-muted-foreground">
                {quantVramHints.quant ? (
                  <>
                    Quant (guess): <span className="font-medium text-foreground">{quantVramHints.quant}</span>
                  </>
                ) : null}
                {quantVramHints.quant && quantVramHints.vramGiB != null ? " · " : null}
                {quantVramHints.vramGiB != null ? (
                  <>
                    ~{quantVramHints.vramGiB} GiB weights (ballpark; KV cache adds more)
                  </>
                ) : null}
              </p>
            ) : null}

            {gated ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Gated repo: accept the license on huggingface.co and save an HF token in Settings (stored in OS
                encryption when available).
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={() => handleDownload()} disabled={!chosenFileName || downloadPct !== null}>
                Download to registry
              </Button>
              {downloadPct != null ? (
                <span className="text-xs tabular-nums text-muted-foreground">{downloadPct}%</span>
              ) : null}
            </div>
            {downloadPct != null ? <Progress value={downloadPct} className="h-2 max-w-xs" /> : null}
          </div>
        ) : null}
      </Card>

      <Card className="space-y-2 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Installed</h2>
          <Badge variant="secondary">Beta</Badge>
        </div>
        <ul className="space-y-2 text-sm">
          {entries.length === 0 ? (
            <li className="text-muted-foreground">No GGUF files yet.</li>
          ) : (
            entries.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 px-3 py-2"
              >
                <div>
                  <span className="font-medium">{e.displayName}</span>
                  <span className="ml-2 text-xs tabular-nums text-muted-foreground">{formatBytes(e.bytes)}</span>
                  <code className="mt-1 block break-all font-mono text-[10px] text-muted-foreground">{e.sha256 ?? "sha256 pending"}</code>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setApiConfig(
                        normalizeApiConfig({
                          ...apiConfig,
                          aiProvider: "local_gguf",
                          model: buildGgufModelId(e.id),
                          comparisonModelIds: [buildGgufModelId(e.id)],
                        })
                      )
                    }
                  >
                    Use in chat
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={() => void handleDelete(e.id)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))
          )}
        </ul>
      </Card>
    </div>
  );
};

export default LocalGgufHub;
