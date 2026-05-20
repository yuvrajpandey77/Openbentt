import { useResearchProject } from "@/context/ResearchProjectContext";
import { Cloud, CloudOff, Loader2, Check } from "lucide-react";

const LABELS = {
  idle: "Draft",
  dirty: "Unsaved changes",
  saving: "Saving draft…",
  saved: "Draft saved",
  error: "Save failed",
} as const;

export function DraftSaveStatus() {
  const { draftSaveStatus } = useResearchProject();
  const label = LABELS[draftSaveStatus];

  const Icon =
    draftSaveStatus === "saving"
      ? Loader2
      : draftSaveStatus === "saved"
        ? Check
        : draftSaveStatus === "error"
          ? CloudOff
          : Cloud;

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      role="status"
      aria-live="polite"
      data-save-status={draftSaveStatus}
    >
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${draftSaveStatus === "saving" ? "animate-spin" : ""} ${
          draftSaveStatus === "saved" ? "text-emerald-600 dark:text-emerald-400" : ""
        }`}
        aria-hidden
      />
      {label}
    </span>
  );
}
