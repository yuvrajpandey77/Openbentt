import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { FolderOpen, Plus } from "lucide-react";
import { useState } from "react";

export function ProjectBar() {
  const { projects, project, loading, selectProject, createProject } = useResearchProject();
  const [newTitle, setNewTitle] = useState("");

  if (loading) {
    return (
      <div className="flex h-11 items-center border-b border-border/60 px-3 text-xs text-muted-foreground">
        Loading research project…
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/20 px-3 py-2">
      <FolderOpen className="h-4 w-4 text-primary shrink-0" aria-hidden />
      <Select value={project?.id ?? ""} onValueChange={(id) => void selectProject(id)}>
        <SelectTrigger className="h-9 w-[min(100%,220px)]">
          <SelectValue placeholder="Select project" />
        </SelectTrigger>
        <SelectContent>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.title} ({p.paperCount} papers)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1.5">
        <Input
          className="h-9 w-36"
          placeholder="New project"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newTitle.trim()) {
              void createProject(newTitle.trim());
              setNewTitle("");
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9"
          onClick={() => {
            if (newTitle.trim()) {
              void createProject(newTitle.trim());
              setNewTitle("");
            }
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
