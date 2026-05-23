import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { runSubmissionChecks } from "@/lib/research/submissionRules";
import type { TargetVenue } from "@/types/researchProject";
import { CheckCircle2, XCircle } from "lucide-react";
import { useMemo } from "react";

export function NotebookSubmitPanel() {
  const { project, setTargetVenue } = useResearchProject();

  const checks = useMemo(
    () => (project ? runSubmissionChecks(project.draftTex, project.bibliography, project.targetVenue) : []),
    [project]
  );

  if (!project) return null;

  const passed = checks.filter((c) => c.passed).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Target venue</span>
        <Select
          value={project.targetVenue}
          onValueChange={(v) => void setTargetVenue(v as TargetVenue)}
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="generic">Generic</SelectItem>
            <SelectItem value="ieee">IEEE</SelectItem>
            <SelectItem value="acm">ACM</SelectItem>
            <SelectItem value="nature">Nature-style</SelectItem>
            <SelectItem value="arxiv">arXiv</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {passed}/{checks.length} checks passed
        </span>
      </div>

      <ul className="space-y-2">
        {checks.map((c) => (
          <li
            key={c.id}
            className="flex gap-3 rounded-lg border border-border/60 px-3 py-2.5 text-sm"
          >
            {c.passed ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
            ) : (
              <XCircle className="h-5 w-5 shrink-0 text-destructive" />
            )}
            <div>
              <p className="font-medium text-foreground">{c.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      <Button
        type="button"
        variant="outline"
        className="w-fit"
        onClick={() => {
          const report = checks.map((c) => `- [${c.passed ? "x" : " "}] ${c.label}: ${c.detail}`).join("\n");
          void navigator.clipboard.writeText(`# Submission checklist (${project.targetVenue})\n\n${report}`);
        }}
      >
        Copy checklist
      </Button>
    </div>
  );
}
