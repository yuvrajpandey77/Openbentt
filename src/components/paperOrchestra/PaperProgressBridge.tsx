import { useEffect, useRef } from "react";
import { getPaperOrchestraApi } from "@/lib/paperOrchestra/desktopApi";
import { useTaskCenter } from "@/context/TaskCenterContext";
import { useToast } from "@/components/ui/use-toast";

/**
 * App-shell listener: keeps TaskCenter paper chips live while Notebook is
 * unmounted (e.g. user navigated to /chat mid-run).
 */
export function PaperProgressBridge() {
  const api = getPaperOrchestraApi();
  const { upsertTask } = useTaskCenter();
  const { toast } = useToast();
  const seenDoneRef = useRef<string | null>(null);

  useEffect(() => {
    if (!api?.onProgress) return;
    return api.onProgress((p) => {
      if (p.stage === "install") {
        upsertTask({
          id: "paper-install",
          kind: "paper-install",
          title: p.done
            ? p.ok === false
              ? "Paper engine install failed"
              : "Paper engine ready"
            : "Installing Paper engine",
          detail: p.message?.slice(0, 120) ?? null,
          percent: p.done && p.ok !== false ? 100 : null,
          state: p.done ? (p.ok === false ? "failed" : "done") : "running",
          error: p.done && p.ok === false ? p.message ?? null : null,
        });
        return;
      }

      const doneKey = p.done ? `${p.runId ?? "run"}:${p.ok}:${p.message ?? ""}` : null;
      upsertTask({
        id: "paper-run",
        kind: "paper-run",
        title: p.done
          ? p.ok
            ? "PaperOrchestra finished"
            : p.stage === "cancelled"
              ? "PaperOrchestra cancelled"
              : "PaperOrchestra failed"
          : "PaperOrchestra running",
        detail: p.message?.slice(0, 160) ?? null,
        percent: p.done && p.ok ? 100 : null,
        state: p.done
          ? p.ok
            ? "done"
            : p.stage === "cancelled"
              ? "cancelled"
              : "failed"
          : "running",
        error: p.done && !p.ok ? p.message ?? null : null,
        onCancel: p.done ? undefined : () => void api.cancel(),
      });

      if (p.done && doneKey && seenDoneRef.current !== doneKey) {
        seenDoneRef.current = doneKey;
        // Canvas already toasts when Notebook is mounted; only cue when away.
        const onNotebook =
          typeof window !== "undefined" && /\/notebook/.test(window.location.pathname);
        if (!onNotebook || (typeof document !== "undefined" && document.hidden)) {
          toast({
            title: p.ok ? "Paper ready" : p.stage === "cancelled" ? "Paper cancelled" : "Paper failed",
            description: p.message?.slice(0, 160),
            variant: p.ok ? "default" : "destructive",
          });
        }
      }
    });
  }, [api, toast, upsertTask]);

  return null;
}
