import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Wrench, Calculator } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { normalizeApiConfig } from "@/types/chat";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { substituteInlineCalc } from "@/lib/mathInline";
import { isWebClient } from "@/config/platformSurface";

const CHART_TEMPLATE = `Use quantitative comparisons where helpful. Valid JSON inside:

\`\`\`openbentt-chart
{"kind":"bar","title":"Example","xKey":"x","series":[{"key":"y","name":"Y"}],"rows":[{"x":"A","y":1},{"x":"B","y":2}]}
\`\`\`
`;

interface ToolsPopoverProps {
  message: string;
  setMessage: (s: string) => void;
}

export const ToolsPopover: React.FC<ToolsPopoverProps> = ({ message, setMessage }) => {
  const webClient = isWebClient();
  const { apiConfig, setApiConfig } = useChat();
  const [calcExpr, setCalcExpr] = useState("2 + 2");
  const [calcResult, setCalcResult] = useState("");

  const runLocalCalc = () => {
    try {
      const merged = substituteInlineCalc(`[[calc:${calcExpr}]]`);
      setCalcResult(merged);
    } catch {
      setCalcResult("Error");
    }
  };

  const insertChartTemplate = () => {
    setMessage(message ? `${message}\n\n${CHART_TEMPLATE}` : CHART_TEMPLATE);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1 border-border/60" type="button">
          <Wrench className="h-4 w-4" />
          <span className="hidden sm:inline">Tools</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        <div className="p-3 border-b border-border/60 space-y-3">
          <p className="text-xs font-medium text-foreground">Modes (saved with settings)</p>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm">Research (web context)</Label>
            <Switch
              checked={apiConfig.researchEnabled}
              onCheckedChange={(v) => setApiConfig(normalizeApiConfig({ ...apiConfig, researchEnabled: v }))}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm">Math mode</Label>
            <Switch
              checked={apiConfig.mathModeEnabled}
              onCheckedChange={(v) => setApiConfig(normalizeApiConfig({ ...apiConfig, mathModeEnabled: v }))}
            />
          </div>
          {!webClient && (
            <>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm">Debug / code</Label>
            <Switch
              checked={apiConfig.debugModeEnabled}
              onCheckedChange={(v) => setApiConfig(normalizeApiConfig({ ...apiConfig, debugModeEnabled: v }))}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm">Red-team eval</Label>
            <Switch
              checked={apiConfig.redTeamModeEnabled}
              onCheckedChange={(v) => setApiConfig(normalizeApiConfig({ ...apiConfig, redTeamModeEnabled: v }))}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm">Research trace UI</Label>
            <Switch
              checked={apiConfig.showAgentTraces}
              onCheckedChange={(v) => setApiConfig(normalizeApiConfig({ ...apiConfig, showAgentTraces: v }))}
            />
          </div>
            </>
          )}
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Research adds Wikipedia, Semantic Scholar, HTTPS URLs (reader), and optional Brave (key in Settings). Chart
            hints auto-append when Research is on.
          </p>
        </div>
        <ScrollArea className="max-h-64">
          <div className="p-3 space-y-3 border-b border-border/60">
            <Button type="button" variant="secondary" size="sm" className="w-full" onClick={insertChartTemplate}>
              Insert chart template
            </Button>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Calculator className="h-4 w-4" />
                Calculator
              </div>
              <Input
                value={calcExpr}
                onChange={(e) => setCalcExpr(e.target.value)}
                placeholder="sin(pi/4) * 2"
                className="font-mono text-sm"
              />
              <Button type="button" size="sm" onClick={runLocalCalc}>
                Evaluate
              </Button>
              {calcResult && (
                <p className="text-sm font-mono break-all rounded-md bg-muted/50 p-2">{calcResult}</p>
              )}
              <p className="text-[10px] text-muted-foreground">
                In messages you can also write <code className="bg-muted px-1 rounded">[[calc:2^10]]</code> — it is
                expanded before send.
              </p>
            </div>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
