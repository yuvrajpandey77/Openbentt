import React, { useCallback, useEffect, useState } from "react";
import { hasOpenCodeDesktopApi, openCodeAgentApi } from "@/lib/agent/openCodeAgentApi";
import { getDesktopApi } from "@/lib/desktopApi";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Phase H UI — compact computer-use console: capability status, live
 * screenshot, bounded action buttons (LOW/MEDIUM direct; HIGH via
 * request/confirm). Observe → act → observe → verify, all visible.
 */
export const ComputerUsePanel: React.FC = () => {
  const available = isDesktopApp() && hasOpenCodeDesktopApi();
  const [caps, setCaps] = useState<{ screenshot: boolean; act: boolean; open: boolean; platform: string } | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [coord, setCoord] = useState("640,400");
  const [text, setText] = useState("");
  const [pending, setPending] = useState<{ approvalId: string; action: string } | null>(null);

  const refresh = useCallback(async () => {
    const api = getDesktopApi();
    if (!api?.computerCapabilities) return;
    try {
      setCaps(await api.computerCapabilities());
    } catch {
      /* degraded */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!available) return <p className="text-xs text-muted-foreground">Computer use needs the desktop app.</p>;

  const say = (s: string) => setLog((prev) => [...prev.slice(-49), `${new Date().toLocaleTimeString()} ${s}`]);

  const screenshot = async () => {
    const api = getDesktopApi();
    if (!api?.computerScreenshot) return;
    setBusy(true);
    try {
      const r = await api.computerScreenshot();
      setShot(r.dataUrl);
      say("Screenshot captured.");
    } catch (e) {
      say(`Screenshot failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: string, params: Record<string, unknown>) => {
    const api = getDesktopApi();
    if (!api?.computerAct) return;
    setBusy(true);
    try {
      const r = await api.computerAct(action, params);
      say(`${r.result.message} (exit ${r.result.code ?? "?"})`);
      if (r.after) setShot(r.after);
    } catch (e) {
      say(`${action} failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(false);
    }
  };

  const requestHigh = async (action: string, params: Record<string, unknown>) => {
    const api = getDesktopApi();
    if (!api?.computerRequest) return;
    setBusy(true);
    try {
      const r = await api.computerRequest(action, params);
      setPending({ approvalId: r.approvalId, action });
      say(`${action} needs approval (risk ${r.risk}). Approve below — never automatic.`);
    } catch (e) {
      say(`Request failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(false);
    }
  };

  const confirmHigh = async (decision: "allow" | "deny") => {
    const api = getDesktopApi();
    if (!api?.computerConfirm || !pending) return;
    setBusy(true);
    try {
      const r = await api.computerConfirm(pending.approvalId, decision);
      say(`Drag ${r.status}.`);
    } catch (e) {
      say(`Confirm failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setPending(null);
      setBusy(false);
    }
  };

  const parseCoord = () => {
    const m = coord.split(",").map((s) => Number(s.trim()));
    return { x: m[0] ?? 0, y: m[1] ?? 0 };
  };

  return (
    <div className="rounded-lg border border-border/60 p-3" aria-label="Computer use">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-foreground">Computer Use</p>
        <span className={cn("rounded-full border px-2 py-px text-[10px]", caps?.act ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
          {caps ? (caps.act ? "control READY" : "observe only") : "checking…"}
        </span>
        <Button type="button" size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => void screenshot()}>
          Screenshot
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={busy || !caps?.act} onClick={() => void act("click", parseCoord())}>
          Click
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={busy || !caps?.act} onClick={() => void act("key", { key: "Return" })}>
          Enter
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={busy || !caps?.act} onClick={() => void act("scroll", { direction: "down", amount: 3 })}>
          Scroll
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={busy || !caps?.act} onClick={() => void requestHigh("drag", { x1: 100, y1: 100, x2: 300, y2: 300 })}>
          Drag (approval)
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Input value={coord} onChange={(e) => setCoord(e.target.value)} placeholder="x,y" className="h-7 w-28 font-mono text-xs" aria-label="Click coordinates" />
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type text…" className="h-7 flex-1 font-mono text-xs" aria-label="Text to type" />
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={busy || !text.trim() || !caps?.act} onClick={() => void act("type", { text: text.slice(0, 500) })}>
          Type
        </Button>
      </div>
      {pending && (
        <div role="dialog" aria-label="Approve computer action" className="mt-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5">
          <p className="text-xs font-medium">Approve HIGH-risk action: {pending.action}?</p>
          <div className="mt-1.5 flex gap-1.5">
            <Button type="button" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => void confirmHigh("allow")}>Allow</Button>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => void confirmHigh("deny")}>Deny</Button>
          </div>
        </div>
      )}
      {shot && (
        <div className="mt-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Last screenshot</p>
          <img src={shot} alt="Desktop screenshot" className="w-full rounded border border-border/60" />
        </div>
      )}
      {log.length > 0 && (
        <div className="mt-2 max-h-32 overflow-y-auto rounded bg-muted/30 p-2 font-mono text-[10px] text-muted-foreground">
          {log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
};

/** OpenCode model/provider routing status (OmniRoute) for diagnostics. */
export const ModelRouteStatus: React.FC = () => {
  const [info, setInfo] = useState<string>("checking…");
  useEffect(() => {
    if (!hasOpenCodeDesktopApi()) {
      setInfo("Desktop bridge unavailable (web).");
      return;
    }
    openCodeAgentApi
      .getRuntimeStatus()
      .then((s) => {
        setInfo(
          `OpenCode ${s.opencode.status} · OmniRoute ${s.omniRoute.status} · ${s.omniRoute.provider?.modelCount ?? 0} models · ${s.omniRoute.baseUrl || "no endpoint"}`
        );
      })
      .catch(() => setInfo("Runtime unreachable."));
  }, []);
  return <p className="font-mono text-[11px] text-muted-foreground">{info}</p>;
};
