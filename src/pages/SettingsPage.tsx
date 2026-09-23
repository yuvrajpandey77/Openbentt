import React, { useState } from "react";
import { Bot, Cpu, Download, Loader2, RefreshCw, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { useAuth } from "@/context/AuthContext";
import { useLocalAI } from "@/context/LocalAIContext";
import { useChat } from "@/context/ChatContext";
import { normalizeApiConfig } from "@/types/chat";
import { defaultOllamaBaseUrl } from "@/lib/modelManager/ollamaProbe";
import { friendlyModelLabel } from "@/lib/ollama/selection";
import SettingsPanel from "@/components/SettingsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useOnboarding } from "@/context/OnboardingContext";
import { ExecutionSetupSection } from "@/components/conversation/ExecutionSetupSection";

/** Phase 9 — Settings: Account, Execution readiness, AI & Models, then full provider panels. */
const SettingsPage: React.FC = () => {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-6">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Account, execution, local AI, providers and privacy.</p>
      <div className="mt-5 flex flex-col gap-4 pb-10">
        <AccountCard />
        {isDesktopApp() && <ExecutionReadinessCard />}
        <LocalAICard />
        <AgentVoiceCard />
        <SettingsPanel />
      </div>
    </div>
  );
};

/** Canonical runtime readiness: authentication, execution, AI, workspace — one place. */
function ExecutionReadinessCard() {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot size={16} className="text-primary" /> Execution — OpenCode
        </CardTitle>
        <CardDescription>
          OpenCode is the default execution engine underneath every conversation. Status and workspace live here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!open ? (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Check execution status
          </Button>
        ) : (
          <ExecutionSetupSection onContinue={() => setOpen(false)} />
        )}
      </CardContent>
    </Card>
  );
}

function AccountCard() {
  const { status, user, signOut } = useAuth();
  const { reset } = useOnboarding();
  const [signingOut, setSigningOut] = useState(false);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Account</CardTitle>
        <CardDescription>
          {status === "signed-in"
            ? `Signed in as ${user?.email ?? user?.displayName}`
            : status === "loading"
              ? "Checking your session…"
              : "You are using Openbentt without an account (local only)."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {status === "signed-in" ? (
          <Button
            variant="outline"
            size="sm"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              try {
                await signOut();
              } finally {
                setSigningOut(false);
              }
            }}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Sign in from the welcome screen to attach an account. Restart onboarding to revisit it.
          </p>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          title="Show the first-run flow again (account, local AI setup)"
        >
          Replay onboarding
        </Button>
      </CardContent>
    </Card>
  );
}

/** Local agent + voice live in the desktop Agent workspace, not in Settings. */
function AgentVoiceCard() {
  const navigate = useNavigate();
  const desktop = isDesktopApp();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot size={16} className="text-primary" /> Agent &amp; voice — local
        </CardTitle>
        <CardDescription>
          Local task execution, on-device speech input/output, and the permission
          boundary that governs them. The microphone is off until you enable it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          size="sm"
          disabled={!desktop}
          onClick={() => navigate("/agent")}
          title={desktop ? "Open the Agent workspace" : "Available in the desktop app"}
        >
          {desktop ? "Open Agent workspace" : "Desktop app only"}
        </Button>
      </CardContent>
    </Card>
  );
}

function formatBytes(bytes: number | null): string {  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[u]}`;
}

function LocalAICard() {
  const {
    health, status, modelNames, runningModels, version, error,
    defaultModel, preferredModel, setPreferredModel,
    refresh, pullModel, activePulls, installInfo, recommendedModels,
    checking, desktopAvailable,
    effectiveModel,
  } = useLocalAI();
  const { apiConfig, setApiConfig } = useChat();
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);

  const selectModel = (name: string) => {
    setPreferredModel(name);
    setApiConfig(
      normalizeApiConfig({
        ...apiConfig,
        aiProvider: "openai_compatible",
        model: name,
        openAiCompatibleBaseUrl: apiConfig.openAiCompatibleBaseUrl?.trim() || defaultOllamaBaseUrl(),
      })
    );
  };

  const download = async (name: string) => {
    const target = name.trim();
    if (!target) return;
    setOpError(null);
    setBusy(target);
    try {
      await pullModel(target);
      setCustom("");
    } catch (e) {
      setOpError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const healthLabel =
    health === "ready" ? "Ready" : health === "checking" ? "Checking…" : health === "no-models" ? "No models" : health === "unsupported" ? "Desktop only" : "Unavailable";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">AI &amp; Models — local</CardTitle>
          <Badge variant={health === "ready" ? "default" : "secondary"}>{healthLabel}</Badge>
        </div>
        <CardDescription>
          {status?.reachable
            ? `Ollama ${version ?? ""} at ${status.origin} · ${modelNames.length} model${modelNames.length === 1 ? "" : "s"} installed`
            : (error ?? "Ollama is not reachable.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" disabled={checking} onClick={() => refresh()}>
            <RefreshCw size={13} className={checking ? "animate-spin" : ""} /> Check connection
          </Button>
          {installInfo && !status?.reachable && desktopAvailable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const w = window as unknown as { openbenttDesktop?: { openExternal: (u: string) => Promise<unknown> } };
                const url = installInfo.downloadUrl;
                if (w.openbenttDesktop) void w.openbenttDesktop.openExternal(url);
                else window.open(url, "_blank", "noopener,noreferrer");
              }}
            >
              Install Ollama
            </Button>
          )}
        </div>

        {modelNames.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {status?.models.map((m) => {
              const active = effectiveModel?.modelId === m.name;
              const running = runningModels.includes(m.name);
              const pull = activePulls[m.name];
              return (
                <div
                  key={m.name}
                  className="flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2"
                >
                  <Cpu size={15} className="shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {friendlyModelLabel(m.name)}
                      {running && <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-green-500 align-middle" aria-label="Loaded" />}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      Local · Ollama · {formatBytes(m.size)}
                      {m.details?.parameterSize ? ` · ${m.details.parameterSize}` : ""}
                      {m.details?.quantization ? ` · ${m.details.quantization}` : ""}
                    </p>
                    {pull && pull.state !== "ready" && (
                      <Progress value={pull.percent ?? undefined} className="mt-1.5 h-1" />
                    )}
                  </div>
                  {preferredModel === m.name && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">Preferred</Badge>
                  )}
                  {active ? (
                    <Badge variant="default" className="shrink-0 gap-1 text-[10px]">
                      <Check size={11} /> In use
                    </Badge>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-7 shrink-0 text-xs" onClick={() => selectModel(m.name)}>
                      Use
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {status?.reachable && modelNames.length === 0 && (
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            Ollama is running but no models are installed yet. Download a compact model below —
            recommended: {recommendedModels[0] ?? "qwen3:1.7b"}.
          </div>
        )}

        {desktopAvailable && status?.reachable && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium">Download a model</p>
            <div className="flex flex-wrap gap-1.5">
              {(recommendedModels.length > 0 ? recommendedModels : ["qwen3:1.7b"]).map((m) => (
                <Button
                  key={m}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  disabled={!!busy}
                  onClick={() => download(m)}
                >
                  {busy === m ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  {friendlyModelLabel(m)}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Or any Ollama model name, e.g. gemma3:4b"
                className="h-9 font-mono text-xs"
                aria-label="Custom Ollama model name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void download(custom);
                  }
                }}
              />
              <Button size="sm" className="h-9 shrink-0" disabled={!custom.trim() || !!busy} onClick={() => download(custom)}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : "Download"}
              </Button>
            </div>
            {opError && <p className="text-xs text-destructive">{opError}</p>}
            <p className="text-[11px] text-muted-foreground">
              Downloads run in the background with real progress. Default preference:{" "}
              {defaultModel ? friendlyModelLabel(defaultModel) : "none yet"}.
            </p>
          </div>
        )}

        <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
          Advanced local runtime (GGUF / llama-server files, Hugging Face hub) lives under Settings
          → AI &amp; models → provider “Local file model”. Cloud providers and keys are managed in
          the panels below.
        </p>
      </CardContent>
    </Card>
  );
}

export default SettingsPage;
