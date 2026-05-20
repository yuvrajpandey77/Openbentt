import React, { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@/context/ChatContext";
import { useTheme } from "../context/ThemeContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Moon, Sun, Plus, Trash2, Sparkles, Cpu, Search, FlaskConical } from "lucide-react";
import { useOpenRouterModels, buildSelectableModels } from "@/hooks/useOpenRouterModels";
import { useLocalGgufRegistryModels } from "@/hooks/useLocalGgufRegistryModels";
import { shortModelLabel } from "@/lib/openrouter";
import {
  dedupeModels,
  normalizeApiConfig,
  DEFAULT_MODEL_ID,
  type AiProvider,
  type ResearchDepth,
  type ReasoningPreference,
  type LocalInferenceProfile,
} from "@/types/chat";
import {
  DEFAULT_LOCAL_GEMMA_MODEL_ID,
  isLocalGemmaModelId,
  LOCAL_GEMMA_SELECTABLE_MODELS,
} from "@/lib/gemmaWebGpu/models";
import { GGUF_MODEL_NONE } from "@/lib/localGguf/ids";
import { ModelCapabilityBadges } from "@/components/ModelCapabilityBadges";
import {
  listExperimentPresets,
  saveExperimentPreset,
  deleteExperimentPreset,
  type ExperimentPreset,
} from "@/lib/experimentPresets";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { getLocalGgufApi } from "@/lib/localGguf/desktopApi";
import DesktopUpdateCard from "@/components/DesktopUpdateCard";
import { isWebClient } from "@/config/platformSurface";

const MAX_COMPARE = 4;

const SettingsPanel: React.FC = () => {
  const webClient = isWebClient();
  const { apiConfig, setApiConfig } = useChat();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const [localAiProvider, setLocalAiProvider] = useState<AiProvider>(apiConfig.aiProvider);
  const [localApiKey, setLocalApiKey] = useState(apiConfig.apiKey);
  const [localModel, setLocalModel] = useState(apiConfig.model);
  const [customInput, setCustomInput] = useState("");
  const [localCustomIds, setLocalCustomIds] = useState<string[]>(apiConfig.customModelIds);
  const [localComparisonEnabled, setLocalComparisonEnabled] = useState(apiConfig.comparisonEnabled);
  const [localComparisonIds, setLocalComparisonIds] = useState<string[]>(apiConfig.comparisonModelIds);
  const [localResearchEnabled, setLocalResearchEnabled] = useState(apiConfig.researchEnabled);
  const [localBraveKey, setLocalBraveKey] = useState(apiConfig.braveSearchApiKey);
  const [localProxyUrl, setLocalProxyUrl] = useState(apiConfig.researchProxyUrl);
  const [localResearchApprovedDomains, setLocalResearchApprovedDomains] = useState(
    apiConfig.researchApprovedDomains
  );
  const [localMathMode, setLocalMathMode] = useState(apiConfig.mathModeEnabled);
  const [localDebugMode, setLocalDebugMode] = useState(apiConfig.debugModeEnabled);
  const [localCompatBase, setLocalCompatBase] = useState(apiConfig.openAiCompatibleBaseUrl);
  const [localRedTeam, setLocalRedTeam] = useState(apiConfig.redTeamModeEnabled);
  const [localShowTrace, setLocalShowTrace] = useState(apiConfig.showAgentTraces);
  const [localResearchDepth, setLocalResearchDepth] = useState<ResearchDepth>(apiConfig.researchDepth);
  const [localReasoningPreference, setLocalReasoningPreference] = useState<ReasoningPreference>(
    apiConfig.reasoningPreference
  );
  const [localInferenceProfile, setLocalInferenceProfile] = useState<LocalInferenceProfile>(apiConfig.localInferenceProfile);
  const [localResearchWithLocal, setLocalResearchWithLocal] = useState(apiConfig.researchWithLocalModel);
  const [localGgufBinaryPath, setLocalGgufBinaryPath] = useState(apiConfig.localGgufBinaryPath);
  const [localGgufMaxParamB, setLocalGgufMaxParamB] = useState<8 | 16>(apiConfig.localGgufMaxParamB);
  const [localHuggingFaceToken, setLocalHuggingFaceToken] = useState(apiConfig.huggingFaceToken);
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<ExperimentPreset[]>(() => listExperimentPresets());

  const { data: models, isLoading: modelsLoading } = useOpenRouterModels(
    localApiKey,
    localCompatBase,
    localAiProvider
  );
  const { data: ggufModels, isLoading: ggufModelsLoading } = useLocalGgufRegistryModels(localAiProvider === "local_gguf");

  const { data: hfSecretStatus } = useQuery({
    queryKey: ["hf-secret-status"],
    queryFn: async () => {
      const a = getLocalGgufApi();
      if (!a?.hfSecretStatus) return { stored: false, encryptionAvailable: false };
      return a.hfSecretStatus();
    },
    enabled: localAiProvider === "local_gguf" && Boolean(getLocalGgufApi()),
    staleTime: 15_000,
  });

  useEffect(() => {
    setLocalAiProvider(apiConfig.aiProvider);
    setLocalApiKey(apiConfig.apiKey);
    setLocalModel(apiConfig.model || DEFAULT_MODEL_ID);
    setLocalCustomIds(apiConfig.customModelIds);
    setLocalComparisonEnabled(apiConfig.comparisonEnabled);
    setLocalComparisonIds(apiConfig.comparisonModelIds);
    setLocalResearchEnabled(apiConfig.researchEnabled);
    setLocalBraveKey(apiConfig.braveSearchApiKey);
    setLocalProxyUrl(apiConfig.researchProxyUrl);
    setLocalResearchApprovedDomains(apiConfig.researchApprovedDomains);
    setLocalMathMode(apiConfig.mathModeEnabled);
    setLocalDebugMode(apiConfig.debugModeEnabled);
    setLocalCompatBase(apiConfig.openAiCompatibleBaseUrl);
    setLocalRedTeam(apiConfig.redTeamModeEnabled);
    setLocalShowTrace(apiConfig.showAgentTraces);
    setLocalResearchDepth(apiConfig.researchDepth);
    setLocalReasoningPreference(apiConfig.reasoningPreference);
    setLocalInferenceProfile(apiConfig.localInferenceProfile);
    setLocalResearchWithLocal(apiConfig.researchWithLocalModel);
    setLocalGgufBinaryPath(apiConfig.localGgufBinaryPath);
    setLocalGgufMaxParamB(apiConfig.localGgufMaxParamB);
    setLocalHuggingFaceToken(apiConfig.huggingFaceToken);
  }, [apiConfig]);

  useEffect(() => {
    if (localAiProvider === "webgpu_gemma" && !isLocalGemmaModelId(localModel)) {
      setLocalModel(DEFAULT_LOCAL_GEMMA_MODEL_ID);
    }
  }, [localAiProvider, localModel]);

  const selectable = useMemo(
    () =>
      localAiProvider === "webgpu_gemma"
        ? buildSelectableModels(LOCAL_GEMMA_SELECTABLE_MODELS, localCustomIds, [localModel, ...localComparisonIds], {
            includeAllFromApi: true,
          })
        : localAiProvider === "local_gguf"
          ? buildSelectableModels(ggufModels, localCustomIds, [localModel, ...localComparisonIds], {
              includeAllFromApi: true,
            })
          : buildSelectableModels(models, localCustomIds, [localModel, ...localComparisonIds], {
              includeAllFromApi: localAiProvider !== "openrouter",
            }),
    [models, ggufModels, localCustomIds, localModel, localComparisonIds, localAiProvider]
  );

  const primaryModelMeta = useMemo(
    () => selectable.find((m) => m.id === localModel),
    [selectable, localModel]
  );

  const persistHfTokenToDesktopSecret = async (): Promise<void> => {
    const api = getLocalGgufApi();
    const plain = localHuggingFaceToken.trim();
    if (
      !plain ||
      typeof window.openbenttDesktop?.isElectron !== "boolean" ||
      !window.openbenttDesktop.isElectron ||
      !api?.hfSecretSet
    ) {
      return;
    }
    await api.hfSecretSet(plain);
    setLocalHuggingFaceToken("");
    void qc.invalidateQueries({ queryKey: ["hf-secret-status"] });
    toast({
      title: "Hugging Face token",
      description: "Saved with OS-backed encryption where available.",
    });
  };

  const handleSave = async () => {
    const primaryModel =
      localModel.trim() ||
      (localAiProvider === "local_gguf"
        ? GGUF_MODEL_NONE
        : localAiProvider === "webgpu_gemma"
          ? DEFAULT_LOCAL_GEMMA_MODEL_ID
          : DEFAULT_MODEL_ID);
    try {
      await persistHfTokenToDesktopSecret();
    } catch (e) {
      toast({
        title: "Could not save HF token",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
      return;
    }
    const electron = typeof window.openbenttDesktop?.isElectron === "boolean" && window.openbenttDesktop.isElectron;
    setApiConfig(
      normalizeApiConfig({
        aiProvider: localAiProvider,
        apiKey: localApiKey,
        model: primaryModel,
        customModelIds: dedupeModels(localCustomIds),
        comparisonEnabled: localComparisonEnabled,
        comparisonModelIds: dedupeModels(localComparisonIds).slice(0, MAX_COMPARE),
        researchEnabled: localResearchEnabled,
        researchDepth: localResearchDepth,
        reasoningPreference: localReasoningPreference,
        braveSearchApiKey: localBraveKey,
        researchProxyUrl: localProxyUrl,
        researchApprovedDomains: localResearchApprovedDomains,
        mathModeEnabled: localMathMode,
        debugModeEnabled: localDebugMode,
        openAiCompatibleBaseUrl: localCompatBase,
        redTeamModeEnabled: localRedTeam,
        showAgentTraces: localShowTrace,
        localInferenceProfile: localInferenceProfile,
        researchWithLocalModel: localResearchWithLocal,
        localGgufBinaryPath: localGgufBinaryPath,
        localGgufMaxParamB,
        huggingFaceToken: electron ? "" : localHuggingFaceToken.trim(),
      })
    );
  };

  const refreshPresets = () => setPresets(listExperimentPresets());

  const handleSavePreset = async () => {
    try {
      await persistHfTokenToDesktopSecret();
    } catch {
      /* ignore preset if secret save fails */
    }
    const electron = typeof window.openbenttDesktop?.isElectron === "boolean" && window.openbenttDesktop.isElectron;
    const primaryModel =
      localModel.trim() ||
      (localAiProvider === "local_gguf"
        ? GGUF_MODEL_NONE
        : localAiProvider === "webgpu_gemma"
          ? DEFAULT_LOCAL_GEMMA_MODEL_ID
          : DEFAULT_MODEL_ID);
    saveExperimentPreset(
      presetName,
      normalizeApiConfig({
        aiProvider: localAiProvider,
        apiKey: localApiKey,
        model: primaryModel,
        customModelIds: dedupeModels(localCustomIds),
        comparisonEnabled: localComparisonEnabled,
        comparisonModelIds: dedupeModels(localComparisonIds).slice(0, MAX_COMPARE),
        researchEnabled: localResearchEnabled,
        researchDepth: localResearchDepth,
        reasoningPreference: localReasoningPreference,
        braveSearchApiKey: localBraveKey,
        researchProxyUrl: localProxyUrl,
        researchApprovedDomains: localResearchApprovedDomains,
        mathModeEnabled: localMathMode,
        debugModeEnabled: localDebugMode,
        openAiCompatibleBaseUrl: localCompatBase,
        redTeamModeEnabled: localRedTeam,
        showAgentTraces: localShowTrace,
        localInferenceProfile: localInferenceProfile,
        researchWithLocalModel: localResearchWithLocal,
        localGgufBinaryPath,
        localGgufMaxParamB,
        huggingFaceToken: electron ? "" : localHuggingFaceToken.trim(),
      })
    );
    setPresetName("");
    refreshPresets();
  };

  const loadPreset = (p: ExperimentPreset) => {
    const c = p.config;
    setLocalAiProvider(c.aiProvider ?? "openrouter");
    setLocalApiKey(c.apiKey);
    setLocalModel(c.model);
    setLocalCustomIds(c.customModelIds);
    setLocalComparisonEnabled(c.comparisonEnabled);
    setLocalComparisonIds(c.comparisonModelIds);
    setLocalResearchEnabled(c.researchEnabled);
    setLocalBraveKey(c.braveSearchApiKey);
    setLocalProxyUrl(c.researchProxyUrl);
    setLocalResearchApprovedDomains(c.researchApprovedDomains ?? "");
    setLocalMathMode(c.mathModeEnabled);
    setLocalDebugMode(c.debugModeEnabled);
    setLocalCompatBase(c.openAiCompatibleBaseUrl);
    setLocalRedTeam(c.redTeamModeEnabled);
    setLocalShowTrace(c.showAgentTraces);
    setLocalResearchDepth(c.researchDepth ?? "standard");
    setLocalReasoningPreference(c.reasoningPreference ?? "default");
    setLocalInferenceProfile(c.localInferenceProfile ?? "balanced");
    setLocalResearchWithLocal(c.researchWithLocalModel ?? true);
    setLocalGgufBinaryPath(c.localGgufBinaryPath ?? "");
    setLocalGgufMaxParamB(c.localGgufMaxParamB === 16 ? 16 : 8);
    setLocalHuggingFaceToken(c.huggingFaceToken ?? "");
  };

  const addCustomModel = () => {
    const id = customInput.trim();
    if (!id) return;
    setLocalCustomIds(dedupeModels([...localCustomIds, id]));
    setCustomInput("");
  };

  const removeCustom = (id: string) => {
    setLocalCustomIds(localCustomIds.filter((x) => x !== id));
  };

  const toggleCompareId = (id: string, checked: boolean) => {
    let next = dedupeModels(localComparisonIds);
    if (checked) {
      if (next.includes(id)) return;
      if (next.length >= MAX_COMPARE) return;
      next.push(id);
    } else {
      next = next.filter((x) => x !== id);
    }
    if (next.length === 0) next = [localModel || DEFAULT_MODEL_ID];
    setLocalComparisonIds(next);
  };

  return (
    <Tabs defaultValue="ai" className="w-full">
      <TabsList
        className={`grid h-auto w-full gap-1 rounded-xl bg-muted/50 p-1 ${
          webClient ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"
        }`}
      >
        <TabsTrigger value="general" className="gap-1.5 rounded-lg py-2.5 text-xs font-medium sm:text-sm">
          <Sparkles className="h-3.5 w-3.5 opacity-80" aria-hidden />
          General
        </TabsTrigger>
        <TabsTrigger value="ai" className="gap-1.5 rounded-lg py-2.5 text-xs font-medium sm:text-sm">
          <Cpu className="h-3.5 w-3.5 opacity-80" aria-hidden />
          AI & models
        </TabsTrigger>
        <TabsTrigger value="research" className="gap-1.5 rounded-lg py-2.5 text-xs font-medium sm:text-sm">
          <Search className="h-3.5 w-3.5 opacity-80" aria-hidden />
          Research
        </TabsTrigger>
        {!webClient && (
          <TabsTrigger value="experiments" className="gap-1.5 rounded-lg py-2.5 text-xs font-medium sm:text-sm">
            <FlaskConical className="h-3.5 w-3.5 opacity-80" aria-hidden />
            Experiments
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="general" className="mt-4 space-y-4 outline-none">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-lg">Appearance</CardTitle>
            <CardDescription>How the app looks on this device.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2">
                <Sun size={18} className={theme === "light" ? "text-amber-500" : "text-muted-foreground"} />
                <Label htmlFor="theme-toggle" className="text-sm font-medium">
                  Dark mode
                </Label>
                <Moon size={18} className={theme === "dark" ? "text-sky-400" : "text-muted-foreground"} />
              </div>
              <Switch id="theme-toggle" checked={theme === "dark"} onCheckedChange={toggleTheme} />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Typography uses Plus Jakarta Sans for UI and JetBrains Mono for code fields — Openbentt uses a
              research-lab aesthetic.
            </p>
          </CardContent>
        </Card>
        <DesktopUpdateCard />
      </TabsContent>

      <TabsContent value="ai" className="mt-4 space-y-4 outline-none">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-lg">Provider & credentials</CardTitle>
            <CardDescription>Choose how the main chat reaches models. Keys stay in this browser.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>AI provider</Label>
              <Select value={localAiProvider} onValueChange={(v) => setLocalAiProvider(v as AiProvider)}>
                <SelectTrigger className="openbentt-input h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openrouter">OpenRouter (many models, one key)</SelectItem>
                  <SelectItem value="openai_compatible">OpenAI-compatible URL (Ollama, LM Studio, …)</SelectItem>
                  <SelectItem value="webgpu_gemma">On-device model (WebGPU / WASM)</SelectItem>
                  {!webClient && (
                    <>
                      <SelectItem value="local_gguf">Local file model — desktop app (GGUF)</SelectItem>
                      <SelectItem value="openai_direct">OpenAI (api.openai.com)</SelectItem>
                      <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                      <SelectItem value="google">Google Gemini (AI Studio key)</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              {!webClient && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  <strong>Grok (xAI):</strong> OpenAI-compatible base{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">https://api.x.ai/v1</code>.{" "}
                  <strong>Kimi:</strong>{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">https://api.moonshot.cn/v1</code>.
                </p>
              )}
            </div>

            {localAiProvider !== "webgpu_gemma" && localAiProvider !== "local_gguf" && <Separator />}

            {localAiProvider !== "webgpu_gemma" && localAiProvider !== "local_gguf" && (
              <div className="space-y-2">
                <Label htmlFor="api-key">
                  {localAiProvider === "google"
                    ? "Google AI Studio API key"
                    : localAiProvider === "anthropic"
                      ? "Anthropic API key"
                      : localAiProvider === "openai_direct"
                        ? "OpenAI API key"
                        : localAiProvider === "openrouter"
                          ? "OpenRouter API key"
                          : "API key (if required by server)"}
                </Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder={
                    localAiProvider === "google"
                      ? "AIza…"
                      : localAiProvider === "anthropic"
                        ? "sk-ant-…"
                        : "sk-…"
                  }
                  value={localApiKey}
                  onChange={(e) => setLocalApiKey(e.target.value)}
                  className="openbentt-input h-11 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">Stored only in localStorage on this device.</p>
              </div>
            )}

            {localAiProvider === "local_gguf" && (
              <>
                <Alert className="border-amber-500/30 bg-amber-500/[0.06]">
                  <AlertTitle className="flex flex-wrap items-center gap-2 text-sm">
                    Local file model (desktop){" "}
                    <Badge variant="secondary" className="font-normal">
                      Beta
                    </Badge>
                  </AlertTitle>
                  <AlertDescription className="text-[11px] leading-relaxed text-muted-foreground">
                    Requires the <strong>Openbentt desktop</strong> app, a{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[10px]">llama-server</code> binary, and at least
                    one model file downloaded from <strong>Labs → Local model hub</strong>. Runs locally on{" "}
                    <code className="font-mono text-[10px]">127.0.0.1</code> only. You are responsible for model licenses.
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <Label>Local model safety limit</Label>
                  <Select
                    value={String(localGgufMaxParamB)}
                    onValueChange={(v) => setLocalGgufMaxParamB(v === "16" ? 16 : 8)}
                  >
                    <SelectTrigger className="openbentt-input h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="8">Up to 8B parameters (recommended)</SelectItem>
                      <SelectItem value="16">Up to 16B parameters (advanced)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Blocks oversized GGUF downloads and very large files. Absolute maximum is 16B.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="llama-bin">Optional: path to llama-server</Label>
                  <Input
                    id="llama-bin"
                    placeholder="Leave blank to auto-detect (PATH / env / bundled)"
                    value={localGgufBinaryPath}
                    onChange={(e) => setLocalGgufBinaryPath(e.target.value)}
                    className="openbentt-input font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hf-token">Hugging Face token (optional)</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Required for gated models and helpful for rate limits. On the <strong>desktop app</strong>, saving
                    stores the token with <strong>OS encryption</strong> (Electron{" "}
                    <code className="text-[10px]">safeStorage</code>) instead of plaintext in localStorage. Validate via{" "}
                    <code className="text-[10px]">whoami</code> in Labs.
                  </p>
                  {hfSecretStatus?.stored ? (
                    <p className="text-[11px] text-teal-600 dark:text-teal-400">
                      A token is already stored securely
                      {!hfSecretStatus.encryptionAvailable ? " (encryption unavailable — restricted file fallback)." : "."}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Input
                      id="hf-token"
                      type="password"
                      placeholder={
                        hfSecretStatus?.stored && !localHuggingFaceToken.trim()
                          ? "Paste a new hf_… token to replace"
                          : "hf_…"
                      }
                      value={localHuggingFaceToken}
                      onChange={(e) => setLocalHuggingFaceToken(e.target.value)}
                      className="openbentt-input min-w-[200px] flex-1 font-mono text-sm"
                    />
                    {getLocalGgufApi()?.hfSecretClear ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await getLocalGgufApi()?.hfSecretClear();
                          void qc.invalidateQueries({ queryKey: ["hf-secret-status"] });
                          toast({ title: "Stored Hugging Face token cleared" });
                        }}
                      >
                        Clear stored
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/15 px-4 py-3">
                  <div>
                  <Label className="text-sm">Research with local model</Label>
                  <p className="text-[11px] text-muted-foreground">
                      Allows Wikipedia/URLs/Brave when Research is enabled (network in background).
                  </p>
                  </div>
                  <Switch checked={localResearchWithLocal} onCheckedChange={setLocalResearchWithLocal} />
                </div>
              </>
            )}

            {localAiProvider === "webgpu_gemma" && (
              <>
                <Alert className="border-teal-500/30 bg-teal-500/[0.06]">
                  <AlertTitle className="text-sm">On-device model</AlertTitle>
                  <AlertDescription className="text-[11px] leading-relaxed text-muted-foreground">
                    Nothing is downloaded until you run the first-time setup (a prompt appears in the composer when this
                    provider is active). Catalog includes Qwen 0.5B, Qwen 1.5B, Gemma E2B, and Gemma E4B — the app
                    auto-downgrades if the GPU buffer is too small. <strong>Research</strong> can run in the background
                    when enabled (Research tab) with <strong>Research with on-device</strong> turned on below.
                  </AlertDescription>
                </Alert>
                <div className="space-y-2 rounded-xl border border-border/60 bg-muted/15 p-4">
                  <Label className="text-sm">On-device resource profile</Label>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Eco uses less RAM and smaller effective context. Performance requests WebGPU more aggressively
                    (longer output, more GPU work when the device supports it).
                  </p>
                  <Select
                    value={localInferenceProfile}
                    onValueChange={(v) => setLocalInferenceProfile(v as LocalInferenceProfile)}
                  >
                    <SelectTrigger className="openbentt-input h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eco">Eco (lowest RAM, shorter context & replies)</SelectItem>
                      <SelectItem value="balanced">Balanced (default for mixed use)</SelectItem>
                      <SelectItem value="performance">Performance (heavier GPU, longer outputs)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/15 px-4 py-3">
                  <div>
                    <Label className="text-sm">Research with on-device</Label>
                    <p className="text-[11px] text-muted-foreground">Fetch Wikipedia/URLs/Brave and inject when Research is on.</p>
                  </div>
                  <Switch checked={localResearchWithLocal} onCheckedChange={setLocalResearchWithLocal} />
                </div>
              </>
            )}

            {localAiProvider === "openai_compatible" && (
              <>
                <Separator />
                <div className="space-y-2 rounded-xl border border-border/60 bg-muted/15 p-4">
                  <Label htmlFor="compat-base">OpenAI-compatible API base</Label>
                  <p className="text-xs text-muted-foreground">
                    <strong>Ollama</strong> / <strong>LM Studio</strong> / <strong>vLLM</strong> / <strong>Grok</strong> /{" "}
                    <strong>Kimi</strong> — must expose{" "}
                    <code className="font-mono text-[11px]">/v1/chat/completions</code>.
                  </p>
                  <Input
                    id="compat-base"
                    placeholder="https://api.x.ai/v1 or http://127.0.0.1:11434/v1"
                    value={localCompatBase}
                    onChange={(e) => setLocalCompatBase(e.target.value)}
                    className="openbentt-input font-mono text-sm"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-lg">Reasoning</CardTitle>
            <CardDescription>
              Extra system-instruction emphasis for structured thinking. This is not a separate “thinking model” endpoint —
              use a reasoning-capable model for best results.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label className="sr-only">Reasoning emphasis</Label>
            <Select
              value={localReasoningPreference}
              onValueChange={(v) => setLocalReasoningPreference(v as ReasoningPreference)}
            >
              <SelectTrigger className="openbentt-input h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="more">More explicit reasoning (steps, alternatives, confidence)</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-lg">Models</CardTitle>
            <CardDescription>Primary model and custom IDs for providers that support them.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="model">Primary model</Label>
              <Select value={localModel} onValueChange={setLocalModel}>
                <SelectTrigger id="model" className="openbentt-input h-11">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {selectable.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name || shortModelLabel(m.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-muted/15 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs font-medium text-muted-foreground">Modality hints (heuristic, from model id)</span>
                <ModelCapabilityBadges modelId={localModel} meta={primaryModelMeta} />
              </div>
              <p className="text-xs text-muted-foreground">
                {(modelsLoading || (localAiProvider === "local_gguf" && ggufModelsLoading)) &&
                localAiProvider !== "webgpu_gemma"
                  ? "Loading models…"
                  : localAiProvider === "webgpu_gemma"
                    ? "Default is the smallest (Qwen 0.5B) in new installs. Pick Gemma E2B/E4B or Qwen 1.5B for better quality when you have RAM. Openbentt auto-downgrades when needed."
                  : localAiProvider === "local_gguf"
                    ? "Download GGUF weights in Labs, then choose the registry entry here. Pick “GGUF (pick a model)” until you add one."
                    : localAiProvider === "openrouter"
                      ? "Free-tier OpenRouter IDs plus custom entries."
                      : localAiProvider === "openai_compatible"
                        ? "Models from your server plus custom IDs."
                        : "Directory or curated list — add custom IDs below if needed."}
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Custom model IDs</Label>
              <p className="text-xs text-muted-foreground">
                Paste any model id your provider accepts. Example:{" "}
                <code className="rounded bg-muted px-1 font-mono text-[11px]">openai/gpt-4o</code>
              </p>
              <div className="flex gap-2">
                <Input
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="org/model-name"
                  className="openbentt-input font-mono text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomModel();
                    }
                  }}
                />
                <Button type="button" variant="secondary" className="shrink-0" onClick={addCustomModel}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {localCustomIds.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {localCustomIds.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-xs"
                    >
                      <span className="max-w-[220px] truncate font-mono">{id}</span>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => removeCustom(id)}
                        aria-label={`Remove ${id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {webClient && (
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-lg">Tiled comparison</CardTitle>
              <CardDescription>Send the same prompt to 2–4 cloud models side by side.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/15 px-4 py-3">
                <Label className="text-sm font-medium">Enable tiled comparison</Label>
                <Switch
                  checked={localComparisonEnabled}
                  onCheckedChange={setLocalComparisonEnabled}
                  disabled={localAiProvider === "webgpu_gemma"}
                />
              </div>
              {localAiProvider === "webgpu_gemma" && (
                <p className="text-[11px] text-muted-foreground">
                  Switch to OpenRouter or a local OpenAI-compatible server to compare multiple models.
                </p>
              )}
              <ScrollArea className="h-44 rounded-xl border border-border/60">
                <div className="space-y-1 p-3">
                  {selectable.map((m) => {
                    const checked = dedupeModels(localComparisonIds).includes(m.id);
                    return (
                      <label
                        key={`web-cmp-${m.id}`}
                        className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 hover:bg-muted/40"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggleCompareId(m.id, v === true)}
                          className="mt-0.5"
                        />
                        <span className="text-xs leading-snug">
                          <span className="block font-medium">{m.name || shortModelLabel(m.id)}</span>
                          <span className="break-all font-mono text-[10px] text-muted-foreground">{m.id}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="research" className="mt-4 space-y-4 outline-none">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-lg">Research & tools</CardTitle>
            <CardDescription>
              {webClient
                ? "Wikipedia and public URLs in the browser. Proxy and Brave search need a self-hosted setup."
                : "Defaults for Wikipedia, URLs, optional Brave via proxy, and assistant modes."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!webClient && (
            <Alert className="border-amber-500/35 bg-amber-500/[0.06]">
              <AlertTitle className="text-sm">Security</AlertTitle>
              <AlertDescription className="text-[11px] leading-relaxed text-muted-foreground">
                Brave Search keys and proxy URLs in Settings are stored in localStorage. Prefer an HTTPS research proxy
                (see README) so secrets are not exposed to every page script.
              </AlertDescription>
            </Alert>
            )}

            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/15 px-4 py-3">
              <Label className="text-sm font-medium">Research (Wikipedia + URLs + optional Brave)</Label>
              <Switch checked={localResearchEnabled} onCheckedChange={setLocalResearchEnabled} />
            </div>

            <div className="space-y-2">
              <Label>Research depth</Label>
              <Select
                value={localResearchDepth}
                onValueChange={(v) => setLocalResearchDepth(v as ResearchDepth)}
                disabled={!localResearchEnabled}
              >
                <SelectTrigger className="openbentt-input h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quick">Quick — minimal context, faster</SelectItem>
                  <SelectItem value="standard">Standard — balanced (default)</SelectItem>
                  <SelectItem value="deep">Deep — more papers, URLs, and excerpts (still not “Deep Research” agents)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Scales client-side fetching only. For ChatGPT-style multi-step web agents, you would need a server-side
                research service (proxy) or a dedicated API product.
              </p>
            </div>

            {!webClient && (
              <>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Brave Search API key (optional)</Label>
              <p className="text-[11px] leading-snug text-muted-foreground">
                The Brave API cannot be called from the browser (CORS). Put the key on a HTTPS research proxy (see{" "}
                <code className="font-mono text-[10px]">server/research-proxy.mjs</code>) or skip Brave.
              </p>
              <Input
                type="password"
                placeholder="BSA... (for proxy / future use)"
                value={localBraveKey}
                onChange={(e) => setLocalBraveKey(e.target.value)}
                className="openbentt-input font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Research proxy base URL (optional, HTTPS)</Label>
              <Input
                placeholder="https://… or http://127.0.0.1:8787 (npm run research-proxy)"
                value={localProxyUrl}
                onChange={(e) => setLocalProxyUrl(e.target.value)}
                className="openbentt-input text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Deep research — approved domains (proxy only)</Label>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Comma-separated hostnames (e.g. <code className="font-mono text-[10px]">arxiv.org,wikipedia.org</code>).
                When research depth is <strong>deep</strong> and the proxy has Brave, it may fetch full pages only for these
                hosts.
              </p>
              <Input
                placeholder="arxiv.org, wikipedia.org, semanticscholar.org"
                value={localResearchApprovedDomains}
                onChange={(e) => setLocalResearchApprovedDomains(e.target.value)}
                className="openbentt-input font-mono text-sm"
              />
            </div>

            <Separator />
              </>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2.5">
                <Label className="text-sm">Math mode</Label>
                <Switch checked={localMathMode} onCheckedChange={setLocalMathMode} />
              </div>
              {!webClient && (
                <>
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2.5">
                    <Label className="text-sm">Debug / code mode</Label>
                    <Switch checked={localDebugMode} onCheckedChange={setLocalDebugMode} />
                  </div>
                  <div className="flex flex-col gap-1 rounded-xl border border-border/60 px-3 py-2.5 sm:col-span-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-sm">Red-team / safety eval</Label>
                      <Switch checked={localRedTeam} onCheckedChange={setLocalRedTeam} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Authorized jailbreak and policy-testing preset.</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2.5 sm:col-span-2">
                    <Label className="text-sm">Show agent / research trace</Label>
                    <Switch checked={localShowTrace} onCheckedChange={setLocalShowTrace} />
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {!webClient && (
      <TabsContent value="experiments" className="mt-4 space-y-4 outline-none">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-lg">Experiment presets</CardTitle>
            <CardDescription>Save and reload full API and mode configuration for benchmarks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Preset name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                className="openbentt-input sm:flex-1"
              />
              <Button type="button" variant="secondary" className="sm:w-auto" onClick={handleSavePreset}>
                Save preset
              </Button>
            </div>
            {presets.length > 0 && (
              <ul className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-border/60 bg-muted/10 p-2 text-xs">
                {presets.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-md px-1 py-1.5 hover:bg-muted/50"
                  >
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => loadPreset(p)}
                      >
                        Load
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => {
                          deleteExperimentPreset(p.id);
                          refreshPresets();
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-lg">Tiled comparison</CardTitle>
            <CardDescription>Send the same prompt to 2–4 models side by side.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/15 px-4 py-3">
              <Label className="text-sm font-medium">Enable tiled comparison</Label>
              <Switch
                checked={localComparisonEnabled}
                onCheckedChange={setLocalComparisonEnabled}
                disabled={localAiProvider === "webgpu_gemma" || localAiProvider === "local_gguf"}
              />
            </div>
            {(localAiProvider === "webgpu_gemma" || localAiProvider === "local_gguf") && (
              <p className="text-[11px] text-muted-foreground">
                Tiled comparison is not available with{" "}
                {localAiProvider === "local_gguf" ? "local GGUF inference." : "on-device Gemma."}
              </p>
            )}
            <ScrollArea className="h-44 rounded-xl border border-border/60">
              <div className="space-y-1 p-3">
                {selectable.map((m) => {
                  const checked = dedupeModels(localComparisonIds).includes(m.id);
                  return (
                    <label
                      key={`set-cmp-${m.id}`}
                      className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggleCompareId(m.id, v === true)}
                        className="mt-0.5"
                      />
                      <span className="text-xs leading-snug">
                        <span className="block font-medium">{m.name || shortModelLabel(m.id)}</span>
                        <span className="break-all font-mono text-[10px] text-muted-foreground">{m.id}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </TabsContent>
      )}

      <div className="sticky bottom-0 mt-6 border-t border-border/60 bg-background/95 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button className="openbentt-button h-11 w-full text-base font-semibold shadow-sm" onClick={handleSave}>
          Save settings
        </Button>
      </div>
    </Tabs>
  );
};

export default SettingsPanel;
