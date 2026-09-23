import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChat } from "@/context/ChatContext";
import { defaultApiConfig, normalizeApiConfig, canSendChat, DEFAULT_MODEL_ID } from "@/types/chat";
import { ensureCloudInferenceForConfig } from "@/lib/privacy/privacyPreferences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/use-toast";
import { useForm } from "react-hook-form";
import { Cpu, Cloud, Server, ArrowRight, Check, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import { isWebClient } from "@/config/platformSurface";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { appHomePath } from "@/lib/appHomePath";
import { isLocalGgufDesktopAvailable } from "@/lib/localGguf/desktopApi";
import { ExecutionSetupSection } from "@/components/conversation/ExecutionSetupSection";

type Provider = "ondevice" | "openrouter" | "local" | "local_gguf";

interface FormValues {
  apiKey: string;
  localUrl: string;
}

const BASE_PROVIDERS: { id: Provider; icon: React.ReactNode; title: string; subtitle: string }[] = [
  {
    id: "ondevice",
    icon: <Cpu size={22} />,
    title: "Run on this device (browser GPU)",
    subtitle: "No API key. Downloads Qwen 2.5 0.5B (~400 MB) once via WebGPU/WASM in the browser.",
  },
  {
    id: "openrouter",
    icon: <Cloud size={22} />,
    title: "OpenRouter (cloud)",
    subtitle: "Access hundreds of cloud models. Bring your own key — stored on this device only.",
  },
  {
    id: "local",
    icon: <Server size={22} />,
    title: "Local server",
    subtitle: "Ollama, LM Studio, or any OpenAI-compatible endpoint on your machine.",
  },
];

const DESKTOP_GGUF_PROVIDER = {
  id: "local_gguf" as const,
  icon: <HardDrive size={22} />,
  title: "Local GGUF files",
  subtitle:
    "Download quantized models from Hugging Face and run with llama-server. Advanced / offline use.",
};

const OPENROUTER_PROVIDER = {
  id: "openrouter" as const,
  icon: <Cloud size={22} />,
  title: "OpenRouter (cloud) — recommended",
  subtitle: "Free models available. Paste your OpenRouter API key — stored on this device only.",
};

const SetupPage: React.FC = () => {
  const navigate = useNavigate();
  const { apiConfig, setApiConfig } = useChat();
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  /**
   * Desktop leads with OpenCode (no keys needed); the provider maze is an
   * opt-in advanced path. Web keeps the provider flow.
   */
  const [advancedProvider, setAdvancedProvider] = useState(false);
  const desktopFirst = isDesktopApp() && !advancedProvider;
  /** Desktop first-run continues to local-agent setup; web finishes at the model step. */
  const finishProviderSetup = () => {
    if (isDesktopApp()) setStep(3);
    else navigate(appHomePath(), { replace: true });
  };
  const finishSetup = () => {
    toast({ title: "Ready", description: "Your workspace is set up. Change models or keys any time in Settings." });
    navigate(appHomePath(), { replace: true });
  };
  const showGguf = isDesktopApp() && isLocalGgufDesktopAvailable();
  const providers = useMemo(() => {
    const cloudFirst = [
      OPENROUTER_PROVIDER,
      ...BASE_PROVIDERS.filter((p) => p.id !== "openrouter"),
    ];
    const base = isWebClient()
      ? cloudFirst.filter((p) => p.id === "openrouter" || p.id === "ondevice")
      : cloudFirst;
    return showGguf ? [...base, DESKTOP_GGUF_PROVIDER] : base;
  }, [showGguf]);
  const [provider, setProvider] = useState<Provider>("openrouter");

  const form = useForm<FormValues>({
    defaultValues: { apiKey: "", localUrl: "http://127.0.0.1:11434/v1" },
  });

  if (canSendChat(apiConfig)) {
    navigate(appHomePath(), { replace: true });
    return null;
  }

  const handleProviderContinue = () => {
    if (provider === "local_gguf") {
      setApiConfig(
        normalizeApiConfig({
          ...defaultApiConfig(),
          aiProvider: "local_gguf",
          model: GGUF_MODEL_NONE,
          apiKey: "",
        })
      );
      toast({
        title: "Local GGUF selected",
        description: "Download a model in Labs, then pick it in Settings → AI provider.",
      });
      navigate("/labs", { replace: true });
      return;
    }
    if (provider === "ondevice") {
      setApiConfig(
        normalizeApiConfig({
          ...defaultApiConfig(),
          aiProvider: "webgpu_gemma",
        })
      );
      toast({
        title: "On-device model selected",
        description: "Confirm the ~400 MB Qwen 0.5B download in chat, then send a message.",
      });
      finishProviderSetup();
      return;
    }
    setStep(2);
  };

  const handleOpenRouterSubmit = form.handleSubmit((data) => {
    if (!data.apiKey.trim()) {
      toast({ title: "API key required", description: "Paste your OpenRouter key to continue.", variant: "destructive" });
      return;
    }
    const next = normalizeApiConfig({
        ...apiConfig,
        aiProvider: "openrouter",
        apiKey: data.apiKey.trim(),
        model: DEFAULT_MODEL_ID,
      });
    ensureCloudInferenceForConfig(next);
    setApiConfig(next);
    toast({ title: "Model connected", description: "Now let's get your local agent ready." });
    finishProviderSetup();
  });

  const handleLocalSubmit = form.handleSubmit((data) => {
    const url = data.localUrl.trim() || "http://127.0.0.1:11434/v1";
    setApiConfig(
      normalizeApiConfig({
        ...defaultApiConfig(),
        aiProvider: "openai_compatible",
        apiKey: "",
        openAiCompatibleBaseUrl: url,
        model: "llama3.2",
      })
    );
    toast({ title: "Local server connected", description: `Using ${url}. Make sure your server is running.` });
    finishProviderSetup();
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <Avatar className="h-12 w-12">
            <AvatarImage src="/openbentt-logo.svg" alt="" />
            <AvatarFallback className="font-display text-sm">OB</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              Welcome to Openbentt
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {desktopFirst
                ? "Openbentt runs on OpenCode — no keys needed"
                : step === 1
                  ? "How do you want to run AI models?"
                  : step === 2
                    ? "Configure your connection"
                    : "Set up your local agent"}
            </p>
          </div>

          {/* Step indicator (provider flow only; desktop-first is one screen) */}
          {!desktopFirst && (
            <div className="flex items-center gap-2">
              <div className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold", step >= 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                {step > 1 ? <Check size={10} /> : "1"}
              </div>
              <div className="h-px w-8 bg-border" />
              <div className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold", step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                {step > 2 ? <Check size={10} /> : "2"}
              </div>
              {isDesktopApp() && (
                <>
                  <div className="h-px w-8 bg-border" />
                  <div className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold", step >= 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                    3
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Desktop-first: OpenCode setup up front, provider maze opt-in */}
        {desktopFirst && (
          <div className="space-y-3">
            <ExecutionSetupSection onContinue={finishSetup} />
            <Button
              type="button"
              variant="ghost"
              className="w-full text-xs text-muted-foreground"
              onClick={() => setAdvancedProvider(true)}
            >
              Advanced: use your own model provider instead
            </Button>
          </div>
        )}

        {/* Step 1: Choose provider */}
        {!desktopFirst && step === 1 && (
          <div className="space-y-3">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProvider(p.id)}
                className={cn(
                  "w-full rounded-xl border p-4 text-left transition-colors",
                  provider === p.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-card hover:border-border/80 hover:bg-muted/30"
                )}
              >
                <div className="flex items-start gap-3">
                  <span className={cn("mt-0.5 shrink-0", provider === p.id ? "text-primary" : "text-muted-foreground")}>
                    {p.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{p.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{p.subtitle}</p>
                  </div>
                  {provider === p.id && (
                    <Check size={16} className="ml-auto mt-0.5 shrink-0 text-primary" />
                  )}
                </div>
              </button>
            ))}

            <Button className="w-full gap-2" onClick={handleProviderContinue}>
              Continue <ArrowRight size={16} />
            </Button>

            <p className="text-center text-[11px] text-muted-foreground">
              All keys and settings are stored in this browser only — never sent to our servers.
            </p>
          </div>
        )}

        {/* Step 2: Configure selected provider */}
        {!desktopFirst && step === 2 && provider === "openrouter" && (
          <form onSubmit={handleOpenRouterSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey" className="text-sm font-medium">
                OpenRouter API key
              </Label>
              <Input
                id="apiKey"
                placeholder="sk-or-..."
                type="password"
                autoFocus
                {...form.register("apiKey")}
              />
              <p className="text-[11px] text-muted-foreground">
                Get a key at{" "}
                <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  openrouter.ai/keys
                </a>{" "}
                — many models have a free tier.
              </p>
            </div>
            <Button type="submit" className="w-full">
              Connect to OpenRouter
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setStep(1)}>
              Back
            </Button>
          </form>
        )}

        {/* Step 3: local agent (desktop first-run; deterministic UI, never chat) */}
        {!desktopFirst && step === 3 && (
          <ExecutionSetupSection onContinue={finishSetup} />
        )}

        {!desktopFirst && step === 2 && provider === "local" && (
          <form onSubmit={handleLocalSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="localUrl" className="text-sm font-medium">
                Local server base URL
              </Label>
              <Input
                id="localUrl"
                placeholder="http://127.0.0.1:11434/v1"
                autoFocus
                {...form.register("localUrl")}
              />
              <p className="text-[11px] text-muted-foreground">
                Works with Ollama, LM Studio, Jan, or any OpenAI-compatible server. Default model is set to{" "}
                <code className="bg-muted px-1 rounded text-[10px]">llama3.2</code> — change in Settings after connecting.
              </p>
            </div>
            <Button type="submit" className="w-full">
              Connect to local server
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setStep(1)}>
              Back
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default SetupPage;
