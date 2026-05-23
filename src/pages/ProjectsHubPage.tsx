import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DesktopOnlyGate } from "@/components/notebook/DesktopOnlyGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useChat } from "@/context/ChatContext";
import { canSendChat } from "@/types/chat";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { ProjectLoadingScreen } from "@/components/notebook/ProjectLoadingScreen";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  BookOpen,
  ChevronDown,
  FolderOpen,
  LayoutGrid,
  List,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "Today";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

const ProjectsHubPage: React.FC = () => {
  const navigate = useNavigate();
  const { apiConfig } = useChat();
  const chatReady = canSendChat(apiConfig);
  const { projects, loading, selectProject, createProject, removeProject, importProjectFromFile } =
    useResearchProject();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [newTitle, setNewTitle] = useState("");
  const [opening, setOpening] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Projects — Openbentt";
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.title.toLowerCase().includes(q));
  }, [projects, query]);

  const openProject = async (id: string) => {
    setOpening(true);
    try {
      await selectProject(id);
      navigate("/notebook");
    } finally {
      setOpening(false);
    }
  };

  const handleCreate = async (title?: string) => {
    const t = (title ?? newTitle).trim() || "New project";
    setOpening(true);
    try {
      await createProject(t);
      setNewTitle("");
      navigate("/notebook");
    } finally {
      setOpening(false);
    }
  };

  const onImport = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setOpening(true);
    try {
      await importProjectFromFile(file);
      navigate("/notebook");
    } finally {
      setOpening(false);
    }
  };

  if (loading || opening) {
    return (
      <DesktopOnlyGate>
        <ProjectLoadingScreen
          title={opening ? "Opening project" : "Loading projects"}
          subtitle="Setting up your research workspace…"
        />
      </DesktopOnlyGate>
    );
  }

  return (
    <DesktopOnlyGate>
      <div className="flex h-full min-h-0 bg-background">
        <aside className="flex w-[220px] shrink-0 flex-col border-r border-border/60 bg-muted/10">
          <div className="flex items-center gap-2.5 px-4 py-4">
            <Avatar className="h-8 w-8">
              <AvatarImage src="/openbentt-logo.svg" alt="" />
              <AvatarFallback className="text-xs">OB</AvatarFallback>
            </Avatar>
            <span className="font-display text-sm font-semibold tracking-tight">Openbentt</span>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 px-2">
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-left text-sm font-medium text-primary"
            >
              <FolderOpen className="h-4 w-4 shrink-0" />
              All projects
            </button>
            <Link
              to="/chat"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <MessageSquare className="h-4 w-4 shrink-0" />
              Chat
            </Link>
            <Link
              to="/labs"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <BookOpen className="h-4 w-4 shrink-0" />
              Library
            </Link>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {!chatReady && (
            <Alert className="mx-6 mt-4 rounded-md border-primary/30 bg-primary/5 py-2 md:mx-10">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>
                  Add your OpenRouter API key to enable AI chat and writing assist (free models available).
                </span>
                <Button asChild size="sm" variant="default" className="h-7 text-xs">
                  <Link to="/setup">Set up OpenRouter</Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border/60 px-6 py-4 md:px-10">
            <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">All projects</h1>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="relative hidden sm:block">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 w-44 pl-8 md:w-56"
                  placeholder="Search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="flex rounded-lg border border-border/60 p-0.5">
                <Button
                  type="button"
                  size="icon"
                  variant={view === "list" ? "secondary" : "ghost"}
                  className="h-8 w-8"
                  onClick={() => setView("list")}
                  aria-label="List view"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={view === "grid" ? "secondary" : "ghost"}
                  className="h-8 w-8"
                  onClick={() => setView("grid")}
                  aria-label="Grid view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
              <input
                ref={importRef}
                type="file"
                accept=".tex,.bib"
                className="hidden"
                onChange={(e) => {
                  void onImport(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                onClick={() => importRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Import</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="h-9 gap-1.5 rounded-xl">
                    <Plus className="h-4 w-4" />
                    New
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuItem onClick={() => void handleCreate("New project")}>
                    Blank project
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleCreate("Paper review")}>
                    Paper review queue
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <div className="flex gap-2 p-2">
                    <Input
                      placeholder="Project name"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleCreate();
                      }}
                    />
                    <Button type="button" size="sm" onClick={() => void handleCreate()}>
                      Create
                    </Button>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="flex-1 px-6 py-6 md:px-10 md:py-8">
            <div className="relative mb-4 sm:hidden">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 w-full pl-8"
                placeholder="Search projects"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 px-6 py-20 text-center">
                <BookOpen className="h-10 w-10 text-muted-foreground/50" />
                <p className="mt-4 font-medium">No projects yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Create a project to write LaTeX, upload PDFs, and proofread at scale. Or import an existing{" "}
                  <code className="rounded bg-muted px-1 text-xs">.tex</code> file.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  <Button className="rounded-xl" onClick={() => void handleCreate()}>
                    <Plus className="mr-2 h-4 w-4" />
                    New project
                  </Button>
                  <Button variant="outline" className="rounded-xl" onClick={() => importRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />
                    Import .tex
                  </Button>
                </div>
              </div>
            ) : view === "list" ? (
              <div className="overflow-hidden rounded-xl border border-border/60">
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-border/60 bg-muted/30 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <span>Name</span>
                  <span className="hidden sm:block">Papers</span>
                  <span>Created</span>
                </div>
                <ul>
                  {filtered.map((p) => (
                    <li key={p.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border/40 px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-muted/40 cursor-pointer"
                        onClick={() => void openProject(p.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void openProject(p.id);
                          }
                        }}
                      >
                        <span className="truncate font-medium">{p.title}</span>
                        <span className="hidden text-sm tabular-nums text-muted-foreground sm:block">
                          {p.paperCount}
                        </span>
                        <span className="flex items-center gap-2 text-sm text-muted-foreground">
                          {formatRelative(p.createdAt)}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={(e) => e.stopPropagation()}
                                aria-label="Project actions"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void removeProject(p.id);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex h-full w-full flex-col rounded-xl border border-border/60 bg-card p-5 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/20"
                      )}
                      onClick={() => void openProject(p.id)}
                    >
                      <BookOpen className="h-5 w-5 text-primary" />
                      <p className="mt-3 truncate font-medium">{p.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p.paperCount} papers · {formatRelative(p.createdAt)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </main>
        </div>
      </div>
    </DesktopOnlyGate>
  );
};

export default ProjectsHubPage;
