import React, { useMemo, useState } from "react";
import {
  Bot,
  Cpu,
  Download,
  Loader2,
  RefreshCw,
  Check,
  Settings as SettingsIcon,
  Monitor,
  Shield,
  KeyRound,
  BarChart3,
  FlaskConical,
  Wrench,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { useAuth } from "@/context/AuthContext";
import { useLocalAI } from "@/context/LocalAIContext";
import { useChat } from "@/context/ChatContext";
import { normalizeApiConfig } from "@/types/chat";
import { defaultOllamaBaseUrl } from "@/lib/modelManager/ollamaProbe";
import { friendlyModelLabel } from "@/lib/ollama/selection";
import SettingsPanel, { type SettingsSectionId } from "@/components/SettingsPanel";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ExecutionSetupSection } from "@/components/conversation/ExecutionSetupSection";
import DesktopUpdateCard from "@/components/DesktopUpdateCard";
import { cn } from "@/lib/utils";

type RailId =
  | "general"
  | "computer"
  | "models"
  | "permissions"
  | "vault"
  | "usage"
  | "updates"
  | "more";

const RAIL: Array<{ id: RailId; label: string; icon: React.ElementType; desktopOnly?: boolean }> = [
  { id: "general", label: "General", icon: SettingsIcon },
  { id: "computer", label: "Computer", icon: Monitor, desktopOnly: true },
  { id: "models", label: "Models", icon: Cpu },
  { id: "permissions", label: "Permissions", icon: Shield },
  { id: "vault", label: "Vault", icon: KeyRound, desktopOnly: true },
  { id: "usage", label: "Usage", icon: BarChart3 },
  { id: "updates", label: "Updates", icon: Download, desktopOnly: true },
  { id: "more", label: "More", icon: FlaskConical },
];

function railToPanelSection(rail: RailId): SettingsSectionId {
  switch (rail) {
    case "general":
      return "general";
    case "computer":
      return "execution";
    case "models":
      return "ai";
    case "permissions":
      return "privacy";
    case "vault":
      return "privacy";
    case "usage":
      return "privacy";
    case "updates":
      return "general";
    case "more":
      return "research";
    default:
      return "general";
  }
}

/** Nested settings shell — left rail + content wells (shared by page + floating dialog). */
export function SettingsShell({ className }: { className?: string }) {
  const desktop = isDesktopApp();
  const [rail, setRail] = useState<RailId>("general");
  const [panelSection, setPanelSection] = useState<SettingsSectionId>("general");

  const visibleRail = useMemo(
    () => RAIL.filter((r) => !r.desktopOnly || desktop),
    [desktop]
  );

  const selectRail = (id: RailId) => {
    setRail(id);
    setPanelSection(railToPanelSection(id));
  };

  const title =
    visibleRail.find((r) => r.id === rail)?.label ?? "Settings";

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <div className="flex min-h-0 flex-1 overflow-hidden">
          <nav
            className="flex w-[9.5rem] shrink-0 flex-col gap-0.5 border-r border-border/50 bg-muted/15 p-2 sm:w-44"
            aria-label="Settings sections"
          >
            {visibleRail.map((item) => {
              const Icon = item.icon;
              const active = rail === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectRail(item.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    active
                      ? "bg-background font-medium text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-80" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:p-5">
            <h2 className="mb-4 text-base font-semibold tracking-tight">{title}</h2>

            {rail === "general" && (
              <div className="space-y-4">
                <AccountCard />
              </div>
            )}

            {rail === "computer" && desktop && (
              <div className="space-y-4">
                <LocalAICard />
                <ExecutionReadinessCard />
                <AgentVoiceCard />
                <SettingsPanel
                  section="execution"
                  onSectionChange={setPanelSection}
                  hideTabList
                />
              </div>
            )}

            {rail === "models" && (
              <SettingsPanel
                section="ai"
                onSectionChange={setPanelSection}
                hideTabList
              />
            )}

            {rail === "permissions" && (
              <div className="space-y-4">
                <SettingsPanel
                  section="privacy"
                  onSectionChange={setPanelSection}
                  hideTabList
                />
                {desktop && (
                  <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                    <h3 className="mb-2 text-sm font-medium">Approvals & agents</h3>
                    <p className="mb-3 text-xs text-muted-foreground">
                      Permission prompts and agent action boundaries.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRail("more");
                        setPanelSection("agents");
                      }}
                    >
                      Open agent approvals
                    </Button>
                  </div>
                )}
              </div>
            )}

            {rail === "vault" && desktop && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Provider keys and secrets live in the OS-backed vault when available. Manage storage under Permissions
                  privacy, or in Models for API keys.
                </p>
                <SettingsPanel
                  section="privacy"
                  onSectionChange={setPanelSection}
                  hideTabList
                />
              </div>
            )}

            {rail === "usage" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Analytics and optional usage signals. Cloud provider quotas appear when a key is configured.
                </p>
                <SettingsPanel
                  section="privacy"
                  onSectionChange={setPanelSection}
                  hideTabList
                />
              </div>
            )}

            {rail === "updates" && desktop && (
              <div className="max-w-xl">
                <DesktopUpdateCard />
              </div>
            )}

            {rail === "more" && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["research", "Research"],
                      ["integrations", "Integrations"],
                      ...(desktop
                        ? ([
                            ["agents", "Agents"],
                            ["experiments", "Experiments"],
                          ] as const)
                        : []),
                    ] as Array<[SettingsSectionId, string]>
                  ).map(([id, label]) => (
                    <Button
                      key={id}
                      type="button"
                      size="sm"
                      variant={panelSection === id ? "secondary" : "outline"}
                      className="h-8"
                      onClick={() => setPanelSection(id)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <SettingsPanel
                  section={
                    panelSection === "research" ||
                    panelSection === "integrations" ||
                    panelSection === "agents" ||
                    panelSection === "experiments"
                      ? panelSection
                      : "research"
                  }
                  onSectionChange={setPanelSection}
                  hideTabList
                />
              </div>
            )}
          </div>
      </div>
    </div>
  );
}

/** Deep-link /settings — thin page shell; primary UX is the floating card dialog. */
const SettingsPage: React.FC = () => {
  return (
    <div className="flex h-full min-h-0 flex-1 items-stretch justify-center overflow-hidden bg-background/80 p-3 md:p-6">
      <div className="flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-3">
          <h1 className="text-base font-semibold tracking-tight">Settings</h1>
          <span className="ml-auto">
            <FeedbackDialog />
          </span>
        </div>
        <SettingsShell />
      </div>
    </div>
  );
};

function ExecutionReadinessCard() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Wrench className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Execution agents</h3>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        OpenCode, Claude Code, Codex, Cursor, Aider, and Gemini CLI — detect and start from here or the composer runtime
        pill.
      </p>
      {!open ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Check status
        </Button>
      ) : (
        <ExecutionSetupSection onContinue={() => setOpen(false)} />
      )}
    </div>
  );
}

function AccountCard() {
  const { status, user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-4">
      <h3 className="text-sm font-medium">Account</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {status === "signed-in"
          ? `Signed in as ${user?.email ?? user?.displayName}`
          : status === "loading"
            ? "Checking session…"
            : "Local-only — no account required."}
      </p>
      <div className="mt-3">
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
        ) : null}
      </div>
    </div>
  );
}

function AgentVoiceCard() {
  const navigate = useNavigate();
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Bot className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Agent & voice</h3>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Local task execution and speech live in the Agent workspace.
      </p>
      <Button variant="outline" size="sm" onClick={() => navigate("/agent")}>
        Open Agent workspace
      </Button>
    </div>
  );
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
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
    health,
    status,
    modelNames,
    runningModels,
    version,
    error,
    defaultModel,
    preferredModel,
    setPreferredModel,
    refresh,
    pullModel,
    activePulls,
    installInfo,
    recommendedModels,
    checking,
    desktopAvailable,
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
    health === "ready"
      ? "Ready"
      : health === "checking"
        ? "Checking…"
        : health === "no-models"
          ? "No models"
          : health === "unsupported"
            ? "Desktop only"
            : "Unavailable";

  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Local AI — Ollama</h3>
        <Badge variant={health === "ready" ? "default" : "secondary"}>{healthLabel}</Badge>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        {status?.reachable
          ? `Ollama ${version ?? ""} · ${modelNames.length} model${modelNames.length === 1 ? "" : "s"}`
          : (error ?? "Ollama is not reachable.")}
      </p>
      <div className="flex flex-col gap-3">
        <Button variant="outline" size="sm" className="w-fit gap-1.5" disabled={checking} onClick={() => refresh()}>
          <RefreshCw size={13} className={checking ? "animate-spin" : ""} /> Check connection
        </Button>
        {installInfo && !status?.reachable && desktopAvailable && (
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => {
              const w = window as unknown as {
                openbenttDesktop?: { openExternal: (u: string) => Promise<unknown> };
              };
              const url = installInfo.downloadUrl;
              if (w.openbenttDesktop) void w.openbenttDesktop.openExternal(url);
              else window.open(url, "_blank", "noopener,noreferrer");
            }}
          >
            Install Ollama
          </Button>
        )}
        {modelNames.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {status?.models.map((m) => {
              const active = effectiveModel?.modelId === m.name;
              const running = runningModels.includes(m.name);
              const pull = activePulls[m.name];
              return (
                <div
                  key={m.name}
                  className="flex items-center gap-2.5 rounded-lg border border-border/50 px-3 py-2"
                >
                  <Cpu size={15} className="shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {friendlyModelLabel(m.name)}
                      {running && (
                        <span
                          className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-green-500 align-middle"
                          aria-label="Loaded"
                        />
                      )}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {formatBytes(m.size)}
                      {m.details?.parameterSize ? ` · ${m.details.parameterSize}` : ""}
                    </p>
                    {pull && pull.state !== "ready" && (
                      <Progress value={pull.percent ?? undefined} className="mt-1.5 h-1" />
                    )}
                  </div>
                  {preferredModel === m.name && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      Preferred
                    </Badge>
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
        {desktopAvailable && status?.reachable && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(recommendedModels.length > 0 ? recommendedModels : ["qwen3:1.7b"]).map((m) => (
                <Button
                  key={m}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  disabled={!!busy}
                  onClick={() => void download(m)}
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
                placeholder="Custom model name"
                className="h-9 font-mono text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void download(custom);
                  }
                }}
              />
              <Button
                size="sm"
                className="h-9 shrink-0"
                disabled={!custom.trim() || !!busy}
                onClick={() => void download(custom)}
              >
                Download
              </Button>
            </div>
            {opError && <p className="text-xs text-destructive">{opError}</p>}
            <p className="text-[11px] text-muted-foreground">
              Default: {defaultModel ? friendlyModelLabel(defaultModel) : "none yet"}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsPage;
