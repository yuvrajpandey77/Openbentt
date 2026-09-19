import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Cpu, Download, Loader2, RefreshCw } from "lucide-react";
import { useOnboarding } from "@/context/OnboardingContext";
import { useLocalAI } from "@/context/LocalAIContext";
import { useChat } from "@/context/ChatContext";
import { normalizeApiConfig } from "@/types/chat";
import { defaultOllamaBaseUrl } from "@/lib/modelManager/ollamaProbe";
import { friendlyModelLabel } from "@/lib/ollama/selection";
import { AuthPage } from "@/components/AuthPage";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

/**
 * Phase 9 — short first-run flow: account → local AI setup → first chat.
 * Every step reflects REAL state (auth session, Ollama API, pull progress).
 * Restarts resume mid-flow via persisted onboarding state.
 */
export const OnboardingFlow: React.FC = () => {
  const { state, send, complete } = useOnboarding();
  const navigate = useNavigate();

  const finish = () => {
    complete();
    navigate("/chat", { replace: true });
  };

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        {state === "FIRST_LAUNCH" && <WelcomeStep onContinue={() => send("START")} />}
        {(state === "AUTH_REQUIRED" || state === "AUTHENTICATING" || state === "AUTHENTICATED") && (
          <AuthStep onFinish={finish} />
        )}
        {state === "LOCAL_ONLY" && <LocalOnlyStep onFinish={finish} />}
        {state === "ENVIRONMENT_CHECK" && <EnvCheckStep />}
        {state === "OLLAMA_CHECK" && <OllamaStep onFinish={finish} />}
        {state === "MODEL_DISCOVERY" && <ModelDiscoveryStep onFinish={finish} />}
        {state === "MODEL_SETUP" && <ModelSetupStep onFinish={finish} />}
        {state === "READY" && <ReadyStep onFinish={finish} />}
        {state === "RESUME_EXISTING_USER" && <ResumeStep onFinish={finish} />}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">{children}</div>
  );
}

function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  return (
    <Card>
      <img src="/openbentt-logo.svg" alt="Openbentt" className="h-12 w-12 object-contain" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Welcome to Openbentt</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Your workspace for AI, research, knowledge and creation — running on your computer.
      </p>
      <Button className="mt-6 w-full gap-2" onClick={onContinue}>
        Continue <ArrowRight size={16} />
      </Button>
    </Card>
  );
}

function AuthStep({ onFinish }: { onFinish: () => void }) {
  const { state, send } = useOnboarding();
  // AUTHENTICATED arrives from AuthPage's sign-in effect; advance to env check.
  const advanced = useRef(false);
  useEffect(() => {
    if (state === "AUTHENTICATED" && !advanced.current) {
      advanced.current = true;
      send("ENV_DONE");
    }
  }, [state, send]);
  if (state === "AUTHENTICATED") {
    return (
      <Card>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> Account ready — checking your AI setup…
        </div>
      </Card>
    );
  }
  void onFinish;
  return <AuthPage />;
}

function LocalOnlyStep({ onFinish }: { onFinish: () => void }) {
  const { send } = useOnboarding();
  const fired = useRef(false);
  useEffect(() => {
    if (!fired.current) {
      fired.current = true;
      send("ENV_DONE");
    }
  }, [send]);
  void onFinish;
  return (
    <Card>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" /> Checking your AI setup…
      </div>
    </Card>
  );
}

function EnvCheckStep() {
  const { send } = useOnboarding();
  const { status, refresh, checking } = useLocalAI();
  const fired = useRef(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled || fired.current) return;
      fired.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);
  useEffect(() => {
    if (!checking && fired.current) {
      send(status?.reachable ? "OLLAMA_FOUND" : "OLLAMA_MISSING");
      fired.current = false;
    }
  }, [checking, status, send]);
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <Loader2 size={24} className="animate-spin text-primary" />
        <h2 className="text-lg font-semibold">Checking your AI setup…</h2>
        <p className="text-sm text-muted-foreground">Detecting Ollama and installed models.</p>
      </div>
    </Card>
  );
}

function OllamaStep({ onFinish }: { onFinish: () => void }) {
  const { send } = useOnboarding();
  const { status, refresh, checking, installInfo, desktopAvailable } = useLocalAI();
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (status?.reachable) send("OLLAMA_FOUND");
  }, [status, send]);

  const openInstaller = async () => {
    const url = installInfo?.downloadUrl ?? "https://ollama.com/download";
    try {
      const w = window as unknown as {
        openbenttDesktop?: { openExternal: (u: string) => Promise<unknown> };
      };
      if (w.openbenttDesktop) await w.openbenttDesktop.openExternal(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const recheck = async () => {
    setVerifying(true);
    try {
      await refresh();
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Card>
      <Cpu size={28} className="text-primary" />
      <h2 className="mt-3 text-xl font-semibold">Run AI locally</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        Openbentt uses Ollama to run models on your computer — private, offline-capable, no API
        key needed. We couldn&apos;t find Ollama running.
      </p>
      {installInfo && (
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          {installInfo.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
      {!desktopAvailable && (
        <p className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          You&apos;re in a browser preview — install Ollama in the desktop app to continue local
          setup.
        </p>
      )}
      <div className="mt-5 flex flex-col gap-2">
        <Button className="w-full gap-2" onClick={openInstaller}>
          <Download size={16} /> Install Ollama
        </Button>
        <Button variant="outline" className="w-full gap-2" disabled={checking || verifying} onClick={recheck}>
          {(checking || verifying) && <Loader2 size={14} className="animate-spin" />}
          I&apos;ve installed it — check again
        </Button>
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={onFinish}>
          Skip for now
        </Button>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <RefreshCw size={11} /> Only the official Ollama distribution is used. Nothing is installed
        without your action.
      </p>
    </Card>
  );
}

function ModelDiscoveryStep({ onFinish }: { onFinish: () => void }) {
  const { send } = useOnboarding();
  const { defaultModel, checking } = useLocalAI();
  const { apiConfig, setApiConfig } = useChat();
  const fired = useRef(false);

  useEffect(() => {
    if (checking || fired.current) return;
    fired.current = true;
    send(defaultModel ? "MODEL_FOUND" : "MODEL_NEEDED");
  }, [checking, defaultModel, send]);

  const useModel = () => {
    if (!defaultModel) return;
    setApiConfig(
      normalizeApiConfig({
        ...apiConfig,
        aiProvider: "openai_compatible",
        model: defaultModel,
        openAiCompatibleBaseUrl: apiConfig.openAiCompatibleBaseUrl?.trim() || defaultOllamaBaseUrl(),
      })
    );
    onFinish();
  };

  if (checking || !defaultModel) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> Looking for installed models…
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/15">
        <Check size={20} className="text-green-500" />
      </div>
      <h2 className="mt-3 text-xl font-semibold">Your local AI is ready</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Found <span className="font-medium text-foreground">{friendlyModelLabel(defaultModel)}</span>{" "}
        already installed — no download needed.
      </p>
      <Button className="mt-5 w-full gap-2" onClick={useModel}>
        Use {friendlyModelLabel(defaultModel)} <ArrowRight size={16} />
      </Button>
    </Card>
  );
}

function ModelSetupStep({ onFinish }: { onFinish: () => void }) {
  const { send } = useOnboarding();
  const { recommendedModels, pullModel, activePulls, desktopAvailable, defaultModel } = useLocalAI();
  const { apiConfig, setApiConfig } = useChat();
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const options = useMemo(
    () => (recommendedModels.length > 0 ? recommendedModels : ["qwen3:1.7b", "smollm2:1.7b"]),
    [recommendedModels]
  );
  const target = chosen ?? options[0];
  const progress = target ? activePulls[target] : undefined;

  // A model appeared mid-setup (e.g. pulled externally) — finish discovery.
  useEffect(() => {
    if (defaultModel) send("MODEL_FOUND");
  }, [defaultModel, send]);

  const startDownload = async () => {
    setError(null);
    setChosen(target);
    try {
      await pullModel(target);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const useDownloaded = () => {
    setApiConfig(
      normalizeApiConfig({
        ...apiConfig,
        aiProvider: "openai_compatible",
        model: target,
        openAiCompatibleBaseUrl: apiConfig.openAiCompatibleBaseUrl?.trim() || defaultOllamaBaseUrl(),
      })
    );
    send("MODEL_READY");
  };

  const done = progress?.state === "ready";

  return (
    <Card>
      <Download size={28} className="text-primary" />
      <h2 className="mt-3 text-xl font-semibold">Choose your first local model</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        A compact instruction model runs well on most computers and stays entirely on-device. The
        download happens in the background — you can keep using the app.
      </p>
      <div className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label="Recommended models">
        {options.map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={target === m}
            onClick={() => setChosen(m)}
            className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors ${
              target === m ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
            }`}
          >
            <Cpu size={16} className="shrink-0 text-primary" />
            <span className="flex-1 font-medium">{friendlyModelLabel(m)}</span>
            <span className="text-[11px] text-muted-foreground">Local · Ollama</span>
          </button>
        ))}
      </div>
      {progress && progress.state !== "ready" && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{progress.detail || "Downloading…"}</span>
            {progress.percent != null && <span className="tabular-nums">{progress.percent}%</span>}
          </div>
          <Progress value={progress.percent ?? undefined} className="mt-1.5" />
        </div>
      )}
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
      {!desktopAvailable && (
        <p className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          Downloads need the desktop app. You can skip and use a cloud provider instead.
        </p>
      )}
      <div className="mt-5 flex flex-col gap-2">
        {done ? (
          <Button className="w-full gap-2" onClick={useDownloaded}>
            Start chatting <ArrowRight size={16} />
          </Button>
        ) : (
          <Button className="w-full gap-2" disabled={!desktopAvailable || !!progress} onClick={startDownload}>
            {(progress ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />)}
            {progress ? "Downloading…" : `Download ${friendlyModelLabel(target)}`}
          </Button>
        )}
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={onFinish}>
          Skip for now
        </Button>
      </div>
    </Card>
  );
}

function ReadyStep({ onFinish }: { onFinish: () => void }) {
  return (
    <Card>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/15">
        <Check size={20} className="text-green-500" />
      </div>
      <h2 className="mt-3 text-xl font-semibold">Your workspace is ready</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Ask anything, start a project, or connect your knowledge.
      </p>
      <Button className="mt-5 w-full gap-2" onClick={onFinish}>
        Start chatting <ArrowRight size={16} />
      </Button>
    </Card>
  );
}

function ResumeStep({ onFinish }: { onFinish: () => void }) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <img src="/openbentt-logo.svg" alt="Openbentt" className="h-10 w-10 object-contain" />
        <h2 className="text-lg font-semibold">Welcome back</h2>
        <p className="text-sm text-muted-foreground">Picking up where you left off.</p>
        <Button className="mt-2 w-full gap-2" onClick={onFinish}>
          Continue <ArrowRight size={16} />
        </Button>
      </div>
    </Card>
  );
}
