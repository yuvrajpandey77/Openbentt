import React, { useState } from "react";
import { useChat } from "@/context/ChatContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { buildChatCompletionMessages } from "@/lib/openrouter";
import { streamChatForConfig } from "@/lib/aiStream";
import type { Message } from "@/types/chat";
import { v4 as uuidv4 } from "uuid";
import { canSendChat } from "@/types/chat";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";

interface Row {
  run: number;
  ttftMs: number | null;
  totalMs: number;
  tokens?: number;
  error?: string;
}

const BenchmarkPage: React.FC = () => {
  const { apiConfig } = useChat();
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("Explain overfitting in one paragraph.");
  const [runs, setRuns] = useState(3);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const runBench = async () => {
    if (!canSendChat(apiConfig)) {
      toast({ title: "Configure API", description: "Add OpenRouter key or local /v1 base.", variant: "destructive" });
      return;
    }
    setBusy(true);
    setRows([]);
    const out: Row[] = [];
    const userMsg: Message = {
      id: uuidv4(),
      role: "user",
      content: prompt,
      timestamp: new Date(),
    };
    const apiMessages = buildChatCompletionMessages([], [userMsg]);

    for (let i = 0; i < runs; i++) {
      const controller = new AbortController();
      try {
        const { metrics } = await streamChatForConfig(apiConfig, apiConfig.model, apiMessages, controller.signal, {
          onDelta: () => {},
        });
        out.push({
          run: i + 1,
          ttftMs: metrics.ttftMs,
          totalMs: metrics.totalMs,
          tokens: metrics.totalTokens,
        });
      } catch (e) {
        out.push({
          run: i + 1,
          ttftMs: null,
          totalMs: 0,
          error: e instanceof Error ? e.message : "error",
        });
      }
      setRows([...out]);
    }
    setBusy(false);
    toast({ title: "Benchmark complete", description: `${runs} runs logged.` });
  };

  const csv = () => {
    const header = "run,ttftMs,totalMs,totalTokens,error\n";
    const body = rows
      .map((r) => `${r.run},${r.ttftMs ?? ""},${r.totalMs},${r.tokens ?? ""},${r.error ?? ""}`)
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cogerphere-benchmark.csv";
    a.click();
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">
          Raw API timing (TTFT / total) — not the tiled chat path. Model: <code className="text-xs">{apiConfig.model}</code>.
          Ask in the main composer about methodology; prompts include Benchmark context.
        </p>
        <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-h-[100px] font-mono text-sm" />
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm flex items-center gap-2">
            Runs
            <Input
              type="number"
              min={1}
              max={20}
              value={runs}
              onChange={(e) => setRuns(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              className="w-20"
            />
          </label>
          <Button type="button" onClick={() => void runBench()} disabled={busy || !prompt.trim()}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin inline" />}
            Run
          </Button>
          {rows.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={csv}>
              Export CSV
            </Button>
          )}
        </div>
        {rows.length > 0 && (
          <table className="w-full text-xs border border-border/60 rounded-md overflow-hidden">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 text-left">#</th>
                <th className="p-2 text-left">TTFT ms</th>
                <th className="p-2 text-left">Total ms</th>
                <th className="p-2 text-left">Tokens</th>
                <th className="p-2 text-left">Error</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.run} className="border-t border-border/40">
                  <td className="p-2">{r.run}</td>
                  <td className="p-2">{r.ttftMs ?? "—"}</td>
                  <td className="p-2">{r.totalMs}</td>
                  <td className="p-2">{r.tokens ?? "—"}</td>
                  <td className="p-2 text-destructive">{r.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default BenchmarkPage;
