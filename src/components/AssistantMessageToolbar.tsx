import React, { useMemo, useState } from "react";
import { Copy, FileDown, FileCheck2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { exportElementToPdf } from "@/lib/chatExportPdf";
import { getDesktopApi } from "@/lib/desktopApi";
import { isDesktopApp } from "@/lib/isDesktopApp";
import {
  parseAssistantFileEdits,
  validateAssistantFileEdits,
  type AssistantFileEdit,
} from "@/lib/assistantFileEdits";

interface AssistantMessageToolbarProps {
  exportRef: React.RefObject<HTMLElement | null>;
  plainText: string;
  fileBaseName: string;
  disabled?: boolean;
  /**
   * Chat-to-file apply (disk-bound projects only). When workspaceRoot is set
   * and the reply contains ```file-edit blocks, an "Apply file edits" button
   * appears: parse → validate → HIGH-risk approval (Allow/Deny) → write with
   * snapshot-before-write → inline Undo. Nothing writes without Allow.
   */
  workspaceRoot?: string | null;
  applyTaskKey?: string;
  allowedFiles?: string[] | null;
}

export const AssistantMessageToolbar: React.FC<AssistantMessageToolbarProps> = ({
  exportRef,
  plainText,
  fileBaseName,
  disabled,
  workspaceRoot,
  applyTaskKey,
  allowedFiles,
}) => {
  const { toast } = useToast();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<string | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyDone, setApplyDone] = useState<Array<{ path: string; bytes: number }> | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoApproval, setUndoApproval] = useState<string | null>(null);

  const edits: AssistantFileEdit[] = useMemo(() => parseAssistantFileEdits(plainText), [plainText]);
  const problems = useMemo(
    () => (edits.length ? validateAssistantFileEdits(edits, allowedFiles ?? null) : []),
    [edits, allowedFiles]
  );
  const canApply = isDesktopApp() && !!workspaceRoot && edits.length > 0 && !disabled;

  if (disabled) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainText);
      toast({ title: "Copied", description: "Full reply copied to clipboard." });
    } catch (e) {
      toast({
        title: "Copy failed",
        description: e instanceof Error ? e.message : "Clipboard unavailable",
        variant: "destructive",
      });
    }
  };

  const savePdf = async () => {
    const el = exportRef.current;
    if (!el) {
      toast({ title: "Nothing to export", description: "Content not ready.", variant: "destructive" });
      return;
    }
    setPdfBusy(true);
    try {
      await exportElementToPdf(el, fileBaseName);
      toast({ title: "PDF saved", description: "Raster export of the message card (like LaTeX workspace)." });
    } catch (e) {
      toast({
        title: "PDF export failed",
        description: e instanceof Error ? e.message : "error",
        variant: "destructive",
      });
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        disabled={!plainText.trim()}
        onClick={() => void copy()}
      >
        <Copy className="h-3.5 w-3.5" />
        Copy full
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        disabled={pdfBusy}
        onClick={() => void savePdf()}
      >
        <FileDown className="h-3.5 w-3.5" />
        {pdfBusy ? "PDF…" : "Download PDF"}
      </Button>
      {canApply && (
        <Button
          type="button"
          variant={applyDone ? "secondary" : "default"}
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => {
            setApplyOpen((v) => !v);
            setApplyError(null);
          }}
          aria-expanded={applyOpen}
        >
          <FileCheck2 className="h-3.5 w-3.5" />
          {applyDone ? `Applied ${applyDone.length} file${applyDone.length === 1 ? "" : "s"}` : `Apply ${edits.length} file edit${edits.length === 1 ? "" : "s"}`}
        </Button>
      )}
      {canApply && applyOpen && (
        <div className="w-full rounded-lg border border-border/60 bg-muted/20 p-3" role="dialog" aria-label="Apply file edits">
          {!applyDone ? (
            <>
              <p className="text-xs font-medium text-foreground">
                Write these files in {workspaceRoot}?
              </p>
              <ul className="mt-1.5 space-y-1">
                {edits.map((e) => (
                  <li key={e.path}>
                    <details className="rounded border border-border/50 bg-background">
                      <summary className="cursor-pointer truncate px-2 py-1 font-mono text-[11px]">
                        {e.path} <span className="text-muted-foreground">({e.content.length.toLocaleString()} chars)</span>
                      </summary>
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words border-t border-border/50 p-2 font-mono text-[10px] leading-relaxed">
                        {e.content.slice(0, 6000)}
                        {e.content.length > 6000 ? "\n…(truncated preview)" : ""}
                      </pre>
                    </details>
                  </li>
                ))}
              </ul>
              {problems.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {problems.map((p, i) => (
                    <li key={i} className="text-[11px] text-destructive">
                      {p}
                    </li>
                  ))}
                </ul>
              )}
              {applyError && <p className="mt-1.5 text-[11px] text-destructive">{applyError}</p>}
              {!pendingApproval ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={applyBusy || problems.length > 0}
                    onClick={() => void requestWrite()}
                  >
                    {applyBusy ? "Requesting…" : "Review & request write"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setApplyOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="mt-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5">
                  <p className="text-xs font-medium">
                    Allow writing {edits.length} file{edits.length === 1 ? "" : "s"}? A snapshot is taken first — Undo stays available.
                  </p>
                  <div className="mt-1.5 flex gap-1.5">
                    <Button type="button" size="sm" className="h-7 text-xs" disabled={applyBusy} onClick={() => void confirmWrite("allow")}>
                      {applyBusy ? "Writing…" : "Allow"}
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={applyBusy} onClick={() => void confirmWrite("deny")}>
                      Deny
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div>
              <p className="text-xs font-medium text-foreground">
                Written — {applyDone.map((w) => w.path).join(", ")}. Open the file to review, or undo below.
              </p>
              {!undoApproval ? (
                <div className="mt-1.5 flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    disabled={undoBusy}
                    onClick={() => void requestUndo()}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    {undoBusy ? "Requesting…" : "Undo this write"}
                  </Button>
                </div>
              ) : (
                <div className="mt-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 p-2.5">
                  <p className="text-xs font-medium">Restore the pre-write snapshot?</p>
                  <div className="mt-1.5 flex gap-1.5">
                    <Button type="button" size="sm" className="h-7 text-xs" disabled={undoBusy} onClick={() => void confirmUndo("allow")}>
                      {undoBusy ? "Restoring…" : "Allow"}
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={undoBusy} onClick={() => void confirmUndo("deny")}>
                      Deny
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  async function requestWrite() {
    const api = getDesktopApi();
    if (!api?.workspaceWrite || !workspaceRoot) return;
    setApplyBusy(true);
    setApplyError(null);
    try {
      const r = await api.workspaceWrite(
        workspaceRoot,
        applyTaskKey ?? `chat_${Date.now()}`,
        edits.map((e) => ({ path: e.path, text: e.content }))
      );
      if (r.status === "needs-approval" && r.approvalId) {
        setPendingApproval(r.approvalId);
      } else {
        setApplyError("Unexpected write response.");
      }
    } catch (e) {
      setApplyError(e instanceof Error ? e.message.slice(0, 220) : "Write request failed.");
    } finally {
      setApplyBusy(false);
    }
  }

  async function confirmWrite(decision: "allow" | "deny") {
    const api = getDesktopApi();
    if (!api?.workspaceWriteConfirm || !pendingApproval) return;
    setApplyBusy(true);
    try {
      const r = await api.workspaceWriteConfirm(pendingApproval, decision);
      if (r.status === "written") {
        setApplyDone(r.written ?? edits.map((e) => ({ path: e.path, bytes: e.content.length })));
        setPendingApproval(null);
        toast({
          title: "Files written",
          description: `${edits.length} file${edits.length === 1 ? "" : "s"} updated — snapshot taken, Undo available above.`,
        });
      } else {
        setPendingApproval(null);
        setApplyError(decision === "deny" ? "Write denied — nothing changed." : "Write was not completed.");
      }
    } catch (e) {
      setApplyError(e instanceof Error ? e.message.slice(0, 220) : "Write failed.");
      setPendingApproval(null);
    } finally {
      setApplyBusy(false);
    }
  }

  async function requestUndo() {
    const api = getDesktopApi();
    if (!api?.workspaceUndo) return;
    setUndoBusy(true);
    try {
      // Scope restore to exactly the files this message wrote.
      const r = await api.workspaceUndo(
        applyTaskKey ?? `chat_${Date.now()}`,
        (applyDone ?? edits).map((e) => e.path)
      );
      if (r.status === "needs-approval" && r.approvalId) {
        setUndoApproval(r.approvalId);
      }
    } catch (e) {
      toast({
        title: "Undo unavailable",
        description: e instanceof Error ? e.message.slice(0, 200) : "unknown",
        variant: "destructive",
      });
    } finally {
      setUndoBusy(false);
    }
  }

  async function confirmUndo(decision: "allow" | "deny") {
    const api = getDesktopApi();
    if (!api?.workspaceUndoConfirm || !undoApproval) return;
    setUndoBusy(true);
    try {
      const r = await api.workspaceUndoConfirm(undoApproval, decision);
      if (r.status === "restored") {
        setApplyDone(null);
        setApplyOpen(false);
        setUndoApproval(null);
        toast({ title: "Write undone", description: "Pre-write snapshot restored." });
      } else {
        setUndoApproval(null);
      }
    } catch (e) {
      toast({
        title: "Undo failed",
        description: e instanceof Error ? e.message.slice(0, 200) : "unknown",
        variant: "destructive",
      });
      setUndoApproval(null);
    } finally {
      setUndoBusy(false);
    }
  }
};
