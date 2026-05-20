import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getLocalGgufApi } from "@/lib/localGguf/desktopApi";
import { assertSafeGgufFileName, assertSafeRepoId } from "@/lib/localGguf/validate";
import { useChat } from "@/context/ChatContext";
import { GGUF_MODEL_NONE, buildGgufModelId } from "@/lib/localGguf/ids";
import { normalizeApiConfig } from "@/types/chat";
import { estimateMinVramGiBForWeights, guessQuantLabelFromGgufFileName } from "@/lib/localGguf/ggufHints";
import {
  evaluateGgufDownload,
  filterGgufFileNames,
  parseParamBillions,
  scoreGgufFileForDefault,
} from "@/lib/localGguf/guardrails";
import { curatedModelsForPolicy, type CuratedGgufModel } from "@/config/curatedGgufModels";
import { CheckCircle2, AlertTriangle, Shield, ExternalLink } from "lucide-react";
import { formatBytes } from "@/lib/downloadProgress";
import { useGgufDownloadProgress } from "@/hooks/useByteDownloadProgress";
import { ModelDownloadProgressBar } from "@/components/ModelDownloadProgressBar";
import { isDesktopApp } from "@/lib/isDesktopApp";

/** Desktop-only: discover, download, and remove GGUF weights with safety guardrails. */
const LocalGgufHub: React.FC = () => {
  const api = typeof window !== "undefined" ? getLocalGgufApi() : undefined;
  const { toast } = useToast();
  const { apiConfig, setApiConfig } = useChat();
  const qc = useQueryClient();

  const policy = useMemo(
    () => ({ maxParamB: apiConfig.localGgufMaxParamB }),
    [apiConfig.localGgufMaxParamB]
  );

  const [hubTab, setHubTab] = useState<"recommended" | "search">("recommended");
  const [searchQ, setSearchQ] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pickedRepoId, setPickedRepoId] = useState<string | null>(null);
  const [chosenFileName, setChosenFileName] = useState("");
  const [downloading, setDownloading] = useState(false);
  const ggufProgress = useGgufDownloadProgress();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDownload, setPendingDownload] = useState<{
    repoId: string;
    fileName: string;
    fileSizeBytes?: number;
  } | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

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

  const filesQuery = useQuery({
    queryKey: ["hf-ggufs", pickedRepoId],
    queryFn: () => api!.listGgufFiles(pickedRepoId!),
    enabled: Boolean(api && pickedRepoId),
  });

  useEffect(() => {
    setChosenFileName("");
  }, [pickedRepoId]);

  const gated =
    typeof (filesQuery.data as { gated?: boolean } | undefined)?.gated === "boolean"
      ? (filesQuery.data as { gated?: boolean }).gated
      : false;

  const fileSizes = filesQuery.data?.fileSizes ?? {};

  const filteredFiles = useMemo(() => {
    const all = filesQuery.data?.gguf ?? [];
    if (!pickedRepoId || !all.length) return { allowed: [] as string[], blocked: [] as { fileName: string; reason: string }[] };
    return filterGgufFileNames(all, pickedRepoId, policy, fileSizes);
  }, [filesQuery.data?.gguf, pickedRepoId, policy, fileSizes]);

  useEffect(() => {
    const { allowed } = filteredFiles;
    if (allowed.length) {
      const pick = scoreGgufFileForDefault(allowed, pickedRepoId!) ?? allowed[0]!;
      setChosenFileName(pick);
    }
  }, [filteredFiles, pickedRepoId]);

  const fileHintBytes = chosenFileName && pickedRepoId ? fileSizes[chosenFileName] : undefined;

  const downloadVerdict = useMemo(() => {
    if (!pickedRepoId || !chosenFileName) return null;
    return evaluateGgufDownload({
      repoId: pickedRepoId,
      fileName: chosenFileName,
      fileSizeBytes: fileHintBytes,
      policy,
    });
  }, [pickedRepoId, chosenFileName, fileHintBytes, policy]);

  const recommended = useMemo(
    () => curatedModelsForPolicy(apiConfig.localGgufMaxParamB),
    [apiConfig.localGgufMaxParamB]
  );

  const runDownload = async (repoId: string, fileName: string) => {
    if (!api) return;
    const hasHfCred = Boolean(apiConfig.huggingFaceToken.trim() || hfSecretQuery.data?.stored);
    if (gated && !hasHfCred && pickedRepoId === repoId) {
      toast({
        title: "HF token likely required",
        description: "Add a Hugging Face token in Settings for gated repos.",
        variant: "destructive",
      });
      return;
    }
    try {
      assertSafeRepoId(repoId);
      const fn = assertSafeGgufFileName(fileName);
      const pre = evaluateGgufDownload({
        repoId,
        fileName: fn,
        fileSizeBytes: fileSizes[fn],
        policy,
      });
      if (!pre.ok) {
        toast({ title: "Blocked by safety policy", description: pre.reason, variant: "destructive" });
        return;
      }
      setDownloading(true);
      await api.addFromHf({
        repoId,
        fileName: fn,
        revision: "main",
        maxParamB: apiConfig.localGgufMaxParamB,
      });
      if (!apiConfig.localGgufDownloadConsent) {
        setApiConfig(
          normalizeApiConfig({ ...apiConfig, localGgufDownloadConsent: true })
        );
      }
      await qc.invalidateQueries({ queryKey: ["local-gguf-registry"] });
      await qc.invalidateQueries({ queryKey: ["local-gguf-registry-models"] });
      toast({ title: "Download complete", description: `${repoId} · ${fn}` });

      const reg = await api.listRegistry();
      const newest = reg.entries[reg.entries.length - 1];
      if (newest) {
        setApiConfig(
          normalizeApiConfig({
            ...apiConfig,
            aiProvider: "local_gguf",
            model: buildGgufModelId(newest.id),
            comparisonModelIds: [buildGgufModelId(newest.id)],
            localGgufDownloadConsent: true,
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
      setDownloading(false);
      setConfirmOpen(false);
      setPendingDownload(null);
    }
  };

  const requestDownload = (repoId: string, fileName: string, fileSizeBytes?: number) => {
    const v = evaluateGgufDownload({ repoId, fileName, fileSizeBytes, policy });
    if (!v.ok) {
      toast({ title: "Not allowed", description: v.reason, variant: "destructive" });
      return;
    }
    if (!apiConfig.localGgufDownloadConsent) {
      setPendingDownload({ repoId, fileName, fileSizeBytes });
      setConsentChecked(false);
      setConfirmOpen(true);
      return;
    }
    void runDownload(repoId, fileName);
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
  const llamaOk = Boolean(binaryQuery.data?.path);

  if (!api) {
    return (
      <Card className="border-dashed border-amber-500/40 p-6 text-sm text-muted-foreground">
        Local GGUF runs in the <strong className="text-foreground">Openbentt desktop</strong> app only. Launch via{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[11px]">npm run electron:dev:safe</code> or the installed app.
      </Card>
    );
  }

  const downloadActive = downloading || ggufProgress.active;
  const desktopPlatform =
    typeof window !== "undefined" ? window.openbenttDesktop?.platform : undefined;

  return (
    <div className="space-y-6">
      {downloadActive && ggufProgress.percent != null ? (
        <ModelDownloadProgressBar
          title="Downloading model weights…"
          progress={ggufProgress}
          hint="Large files may take several minutes. Keep the app open until the download completes."
        />
      ) : null}

      <Card className="border-primary/20 bg-primary/[0.03] p-5">
        <div className="flex flex-wrap items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="font-semibold">Local models — safety & setup</h2>
            <p className="text-sm text-muted-foreground">
              Downloads are limited to <strong className="text-foreground">≤{apiConfig.localGgufMaxParamB}B</strong>{" "}
              models and size caps to protect disk and RAM. Change the limit in Settings → AI provider → Local file
              model.
            </p>
            <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
              <li className="flex items-center gap-2">
                {llamaOk ? (
                  <CheckCircle2 className="h-4 w-4 text-teal-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                )}
                <span>
                  llama-server
                  {binaryQuery.data?.source === "bundled" ? (
                    <Badge variant="secondary" className="ml-1.5 text-[10px]">
                      bundled
                    </Badge>
                  ) : null}
                  : <code className="text-[11px]">{binaryQuery.data?.path ?? "not found"}</code>
                </span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-teal-600" />
                <span>Policy: max {apiConfig.localGgufMaxParamB}B parameters</span>
              </li>
              <li className="flex items-center gap-2">
                {diskQuery.data?.bytes != null ? (
                  <CheckCircle2 className="h-4 w-4 text-teal-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                )}
                <span>Free disk: {diskQuery.data?.bytes != null ? formatBytes(diskQuery.data.bytes) : "unknown"}</span>
              </li>
              <li className="flex items-center gap-2">
                {entries.length > 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-teal-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                )}
                <span>{entries.length} model(s) installed</span>
              </li>
            </ul>
            {!llamaOk ? (
              <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs text-amber-900 dark:text-amber-200">
                <p className="font-medium text-foreground">llama-server not found</p>
                <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
                  <li>
                    Build or install{" "}
                    <a
                      href="https://github.com/ggerganov/llama.cpp"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-primary hover:underline"
                    >
                      llama.cpp <ExternalLink className="h-3 w-3" />
                    </a>{" "}
                    and ensure <code className="rounded bg-muted px-1">llama-server</code> is on your PATH.
                  </li>
                  <li>Or set a custom binary path in Settings → AI provider → Local file model.</li>
                  {isDesktopApp() && desktopPlatform === "linux" ? (
                    <li>
                      On Linux, if GPU inference fails, try{" "}
                      <code className="rounded bg-muted px-1">npm run electron:dev:safe</code> (software rendering).
                    </li>
                  ) : null}
                </ol>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <Tabs value={hubTab} onValueChange={(v) => setHubTab(v as "recommended" | "search")}>
        <TabsList>
          <TabsTrigger value="recommended">Recommended</TabsTrigger>
          <TabsTrigger value="search">Search Hugging Face</TabsTrigger>
        </TabsList>

        <TabsContent value="recommended" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Curated Q4 models within your {apiConfig.localGgufMaxParamB}B limit. One-click download, then chat in Settings
            → Local file model (GGUF).
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {recommended.map((m: CuratedGgufModel) => (
              <Card key={m.id} className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.paramB}B</span>
                  <Badge variant={m.tier === "starter" ? "secondary" : "outline"}>{m.tier}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{m.blurb}</p>
                <code className="break-all font-mono text-[10px] text-muted-foreground">{m.repoId}</code>
                <Button
                  type="button"
                  size="sm"
                  disabled={downloadActive || !llamaOk}
                  onClick={() => requestDownload(m.repoId, m.fileName)}
                >
                  Download
                </Button>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="search" className="mt-4 space-y-4">
          <Card className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">Hugging Face search</h3>
              <Badge variant="secondary">Filtered</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Only GGUF files passing the {apiConfig.localGgufMaxParamB}B policy are selectable. Oversized files are hidden
              or blocked.
            </p>
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
                disabled={!(apiConfig.huggingFaceToken.trim() || hfSecretQuery.data?.stored)}
              >
                Validate HF token
              </Button>
            </div>

            <ScrollArea className="h-36 rounded-md border border-border/60">
              <ul className="p-2 text-xs">
                {searchRows.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className={`w-full rounded px-2 py-1.5 text-left hover:bg-muted/60 ${pickedRepoId === m.id ? "bg-muted" : ""}`}
                      onClick={() => {
                        try {
                          setPickedRepoId(assertSafeRepoId(m.id));
                          void qc.invalidateQueries({ queryKey: ["hf-ggufs", m.id] });
                        } catch (e) {
                          toast({ title: "Invalid repo", description: String(e), variant: "destructive" });
                        }
                      }}
                    >
                      <span className="font-medium">{m.id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>

            {pickedRepoId ? (
              <div className="space-y-2">
                <Label>GGUF file — {pickedRepoId}</Label>
                {filesQuery.isFetching ? (
                  <p className="text-xs text-muted-foreground">Listing files…</p>
                ) : filteredFiles.allowed.length === 0 ? (
                  <p className="text-xs text-amber-600">
                    No files pass the safety filter for this repo. Try another model or raise the limit in Settings (max
                    16B).
                  </p>
                ) : (
                  <select
                    className="w-full rounded-md border border-border bg-background px-2 py-2 font-mono text-xs"
                    value={chosenFileName}
                    onChange={(e) => setChosenFileName(e.target.value)}
                  >
                    {filteredFiles.allowed.map((f) => (
                      <option key={f} value={f}>
                        {f}
                        {fileSizes[f] ? ` · ${formatBytes(fileSizes[f])}` : ""}
                      </option>
                    ))}
                  </select>
                )}
                {filteredFiles.blocked.length > 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    {filteredFiles.blocked.length} file(s) hidden (over limit).
                  </p>
                ) : null}
                {downloadVerdict?.ok && chosenFileName ? (
                  <p className="text-xs text-muted-foreground">
                    {guessQuantLabelFromGgufFileName(chosenFileName) ?? "quant unknown"} · ~
                    {parseParamBillions(pickedRepoId, chosenFileName) ?? "?"}B · est. VRAM{" "}
                    {fileHintBytes ? `~${estimateMinVramGiBForWeights(fileHintBytes)} GiB` : "—"}
                  </p>
                ) : downloadVerdict && !downloadVerdict.ok ? (
                  <p className="text-xs text-destructive">{downloadVerdict.reason}</p>
                ) : null}
                {gated ? (
                  <p className="text-xs text-amber-600">Gated repo — HF token required in Settings.</p>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    !chosenFileName || downloadActive || !llamaOk || (downloadVerdict != null && !downloadVerdict.ok)
                  }
                  onClick={() => requestDownload(pickedRepoId, chosenFileName, fileHintBytes)}
                >
                  Download to registry
                </Button>
              </div>
            ) : null}
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="space-y-2 p-5">
        <h2 className="font-semibold">Installed models</h2>
        <ul className="space-y-2 text-sm">
          {registryQuery.isLoading ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : entries.length === 0 ? (
            <li className="text-muted-foreground">No models yet — pick one from Recommended.</li>
          ) : (
            entries.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 px-3 py-2"
              >
                <div>
                  <span className="font-medium">{e.displayName}</span>
                  <span className="ml-2 text-xs tabular-nums text-muted-foreground">{formatBytes(e.bytes)}</span>
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

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Download local model weights?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              {pendingDownload ? (
                <>
                  <p>
                    <strong>{pendingDownload.repoId}</strong>
                    <br />
                    <code className="text-xs">{pendingDownload.fileName}</code>
                  </p>
                  <p>
                    Large downloads use disk space and can stress CPU/GPU during inference. You are responsible for
                    third-party licenses.
                  </p>
                </>
              ) : null}
              <label className="flex cursor-pointer items-start gap-2 pt-2">
                <Checkbox checked={consentChecked} onCheckedChange={(c) => setConsentChecked(c === true)} />
                <span className="text-sm">I understand and want to download multi-GB model files on this device.</span>
              </label>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!consentChecked || !pendingDownload}
              onClick={() => pendingDownload && void runDownload(pendingDownload.repoId, pendingDownload.fileName)}
            >
              Download
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LocalGgufHub;
