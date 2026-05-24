import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Wrench,
  Calculator,
  Globe,
  FlaskConical,
  Bug,
  ShieldAlert,
  Activity,
  BarChart3,
  BookOpen,
  Sigma,
  Copy,
  Check,
} from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { normalizeApiConfig } from "@/types/chat";
import { substituteInlineCalc } from "@/lib/mathInline";
import { isWebClient } from "@/config/platformSurface";
import { cn } from "@/lib/utils";

const CHART_TEMPLATE = `Use quantitative comparisons where helpful. Valid JSON inside:

\`\`\`openbentt-chart
{"kind":"bar","title":"Example","xKey":"x","series":[{"key":"y","name":"Y"}],"rows":[{"x":"A","y":1},{"x":"B","y":2}]}
\`\`\`
`;

interface ModeRowProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  badge?: string;
}

function ModeRow({ icon, label, description, checked, onCheckedChange, badge }: ModeRowProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-xl border px-4 py-3 transition-colors",
        checked ? "border-primary/40 bg-primary/5" : "border-border/50 bg-muted/20 hover:bg-muted/40"
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn("mt-0.5 shrink-0", checked ? "text-primary" : "text-muted-foreground")}>
          {icon}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium leading-none">{label}</span>
            {badge && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[9px] font-medium">
                {badge}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

interface ToolsPopoverProps {
  message: string;
  setMessage: (s: string) => void;
}

export const ToolsPopover: React.FC<ToolsPopoverProps> = ({ message, setMessage }) => {
  const webClient = isWebClient();
  const { apiConfig, setApiConfig } = useChat();
  const [open, setOpen] = useState(false);
  const [calcExpr, setCalcExpr] = useState("");
  const [calcResult, setCalcResult] = useState<string | null>(null);
  const [calcError, setCalcError] = useState(false);
  const [copied, setCopied] = useState(false);

  const runLocalCalc = () => {
    if (!calcExpr.trim()) return;
    try {
      const merged = substituteInlineCalc(`[[calc:${calcExpr}]]`);
      setCalcResult(merged);
      setCalcError(false);
    } catch {
      setCalcResult("Could not evaluate expression");
      setCalcError(true);
    }
  };

  const copyResult = () => {
    if (!calcResult) return;
    navigator.clipboard.writeText(calcResult).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const insertChartTemplate = () => {
    setMessage(message ? `${message}\n\n${CHART_TEMPLATE}` : CHART_TEMPLATE);
    setOpen(false);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-9 gap-1.5 border-border/60"
        type="button"
        onClick={() => setOpen(true)}
      >
        <Wrench className="h-4 w-4" />
        <span className="hidden sm:inline">Tools</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] w-full max-w-xl overflow-y-auto p-0">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-border/60 px-6 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Wrench className="h-4 w-4 text-primary" />
            </div>
            <div>
              <DialogHeader>
                <DialogTitle className="text-base">Tools &amp; Modes</DialogTitle>
                <DialogDescription className="text-xs">
                  Toggle AI capabilities and use built-in utilities.
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>

          <div className="space-y-6 px-6 py-5">
            {/* ── AI Modes ── */}
            <section>
              <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <FlaskConical className="h-3.5 w-3.5" />
                AI Modes
              </h3>
              <div className="space-y-2">
                <ModeRow
                  icon={<Globe className="h-4 w-4" />}
                  label="Research"
                  description="Fetches Wikipedia, Semantic Scholar, web URLs, and optional Brave Search results before responding."
                  checked={apiConfig.researchEnabled}
                  onCheckedChange={(v) =>
                    setApiConfig(normalizeApiConfig({ ...apiConfig, researchEnabled: v }))
                  }
                />
                <ModeRow
                  icon={<Sigma className="h-4 w-4" />}
                  label="Math mode"
                  description="Strengthens step-by-step reasoning and symbolic calculation in responses."
                  checked={apiConfig.mathModeEnabled}
                  onCheckedChange={(v) =>
                    setApiConfig(normalizeApiConfig({ ...apiConfig, mathModeEnabled: v }))
                  }
                />
                {!webClient && (
                  <>
                    <ModeRow
                      icon={<Bug className="h-4 w-4" />}
                      label="Debug / Code"
                      description="Adds detailed code-analysis and debugging instructions to the system prompt."
                      checked={apiConfig.debugModeEnabled}
                      onCheckedChange={(v) =>
                        setApiConfig(normalizeApiConfig({ ...apiConfig, debugModeEnabled: v }))
                      }
                    />
                    <ModeRow
                      icon={<ShieldAlert className="h-4 w-4" />}
                      label="Red-team eval"
                      description="Safety evaluation preset for adversarial prompt testing."
                      badge="Advanced"
                      checked={apiConfig.redTeamModeEnabled}
                      onCheckedChange={(v) =>
                        setApiConfig(normalizeApiConfig({ ...apiConfig, redTeamModeEnabled: v }))
                      }
                    />
                    <ModeRow
                      icon={<Activity className="h-4 w-4" />}
                      label="Research trace UI"
                      description="Shows collapsible agent-step traces on assistant messages when Research is on."
                      checked={apiConfig.showAgentTraces}
                      onCheckedChange={(v) =>
                        setApiConfig(normalizeApiConfig({ ...apiConfig, showAgentTraces: v }))
                      }
                    />
                  </>
                )}
              </div>
            </section>

            <Separator />

            {/* ── Utilities ── */}
            <section>
              <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Wrench className="h-3.5 w-3.5" />
                Utilities
              </h3>
              <div className="space-y-4">
                {/* Chart template */}
                <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
                  <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Chart template</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Inserts a JSON chart block into your message. The AI will populate it with real data.
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-2.5 h-7 text-xs"
                      onClick={insertChartTemplate}
                    >
                      <BarChart3 className="mr-1.5 h-3 w-3" />
                      Insert into message
                    </Button>
                  </div>
                </div>

                {/* Calculator */}
                <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
                  <div className="mb-3 flex items-center gap-2">
                    <Calculator className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="text-sm font-medium">Calculator</p>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={calcExpr}
                      onChange={(e) => {
                        setCalcExpr(e.target.value);
                        setCalcResult(null);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && runLocalCalc()}
                      placeholder="e.g. sin(pi/4) * 2  or  2^10"
                      className="h-8 font-mono text-sm"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 shrink-0 px-3"
                      onClick={runLocalCalc}
                      disabled={!calcExpr.trim()}
                    >
                      =
                    </Button>
                  </div>

                  {calcResult !== null && (
                    <div
                      className={cn(
                        "mt-2 flex items-center justify-between gap-2 rounded-lg px-3 py-2",
                        calcError
                          ? "bg-destructive/10 text-destructive"
                          : "bg-primary/5 text-foreground"
                      )}
                    >
                      <span className="min-w-0 break-all font-mono text-sm">{calcResult}</span>
                      {!calcError && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 shrink-0"
                          onClick={copyResult}
                          title="Copy result"
                        >
                          {copied ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                    </div>
                  )}

                  <p className="mt-2.5 text-[10px] leading-relaxed text-muted-foreground">
                    Tip: you can also write{" "}
                    <code className="rounded bg-muted px-1 py-0.5">[[calc:2^10]]</code> directly in
                    your message — it expands before sending.
                  </p>
                </div>

                {/* Research prompt info */}
                <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Research sources</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      When Research mode is on, the AI fetches Wikipedia, Semantic Scholar, and any
                      HTTPS URLs you paste. Add a Brave Search API key in{" "}
                      <strong>Settings → Research</strong> for broader web results.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
