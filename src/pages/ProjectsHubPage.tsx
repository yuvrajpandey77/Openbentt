import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { DesktopOnlyGate } from "@/components/notebook/DesktopOnlyGate";
import { NewProjectDialog } from "@/components/notebook/NewProjectDialog";
import { TemplateGallery } from "@/components/notebook/TemplateGallery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useChat } from "@/context/ChatContext";
import { canSendChat } from "@/types/chat";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { ProjectLoadingScreen } from "@/components/notebook/ProjectLoadingScreen";
import {
  featuredTemplateEntries,
  loadTemplateCatalog,
  type TemplateCatalogEntry,
} from "@/lib/research/templateCatalog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  BookOpen,
  FolderOpen,
  LayoutGrid,
  LayoutTemplate,
  List,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { isDesktopApp } from "@/lib/isDesktopApp";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { apiConfig } = useChat();
  const chatReady = canSendChat(apiConfig);
  const {
    projects,
    loading,
    selectProject,
    createProject,
    createProjectFromTemplate,
    removeProject,
    importProjectFromFile,
  } = useResearchProject();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [newTitle, setNewTitle] = useState("");
  const [opening, setOpening] = useState(false);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [browseTemplatesOpen, setBrowseTemplatesOpen] = useState(false);
  const [featuredTemplates, setFeaturedTemplates] = useState<TemplateCatalogEntry[]>([]);
  const [templateTitle, setTemplateTitle] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  // Map from projectId → number of linked chat threads stored in the project DB.
  const [linkedThreadCounts, setLinkedThreadCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    document.title = "Projects — Openbentt";
  }, []);

  useEffect(() => {
    if (searchParams.get("templates") === "1") {
      setBrowseTemplatesOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("templates");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    void loadTemplateCatalog().then((cat) => setFeaturedTemplates(featuredTemplateEntries(cat)));
  }, []);

  // Load linked thread counts from the project DB (desktop only).
  useEffect(() => {
    if (!isDesktopApp() || !projects.length) return;
    const api = (window as { openbenttResearch?: { listLinkedThreads?: (id: string) => Promise<{ threadId: string; messageCount: number }[]> } }).openbenttResearch;
    if (!api?.listLinkedThreads) return;
    Promise.all(
      projects.map((p) =>
        api.listLinkedThreads!(p.id)
          .then((rows) => [p.id, rows.length] as [string, number])
          .catch(() => [p.id, 0] as [string, number])
      )
    ).then((pairs) => {
      setLinkedThreadCounts(Object.fromEntries(pairs));
    });
  }, [projects]);

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

  const handleCreateFromTemplate = async (title: string, entry: TemplateCatalogEntry) => {
    setOpening(true);
    try {
      await createProjectFromTemplate(title.trim() || entry.label, entry);
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
      <div className="flex h-full min-h-0 w-full overflow-hidden bg-background">
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
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              onClick={() => setBrowseTemplatesOpen(true)}
            >
              <LayoutTemplate className="h-4 w-4 shrink-0" />
              Templates
            </button>

            <Link
              to="/labs"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <BookOpen className="h-4 w-4 shrink-0" />
              Library
            </Link>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
          {!chatReady && (
            <div className="mx-6 mt-4 min-w-0 md:mx-10">
              <Alert className="w-full rounded-md border-primary/30 bg-primary/5 py-2">
                <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 shrink break-words">
                    Add your OpenRouter API key to enable AI chat and writing assist (free models available).
                  </span>
                  <Button asChild size="sm" variant="default" className="h-7 shrink-0 text-xs">
                    <Link to="/setup">Set up OpenRouter</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
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
              <Button className="h-9 gap-1.5 rounded-xl" onClick={() => setNewDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                New project
              </Button>
            </div>
          </header>

          <main className="flex-1 px-6 py-6 md:px-10 md:py-8">
            <section className="mb-8">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Start from a template</h2>
                  <p className="text-xs text-muted-foreground">
                    Verified LaTeX scaffolds with main.tex, references.bib, and compile hints.
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setBrowseTemplatesOpen(true)}>
                  Browse all
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {featuredTemplates.slice(0, 8).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="flex flex-col rounded-xl border border-border/60 bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/20"
                    onClick={() => void handleCreateFromTemplate(entry.label, entry)}
                  >
                    <LayoutTemplate className="h-5 w-5 text-primary" />
                    <p className="mt-2 font-medium leading-tight">{entry.label}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{entry.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {entry.requiresLocalTex ? (
                        <Badge variant="outline" className="text-[10px]">
                          Local TeX
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          WASM OK
                        </Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </section>

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
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 px-6 py-16 text-center">
                <BookOpen className="h-10 w-10 text-muted-foreground/50" />
                <p className="mt-4 font-medium">No projects yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Pick a template above or create a blank project to write LaTeX and review PDFs.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  <Button className="rounded-xl" onClick={() => setNewDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    New project
                  </Button>
                  <Button variant="outline" className="rounded-xl" onClick={() => setBrowseTemplatesOpen(true)}>
                    <LayoutTemplate className="mr-2 h-4 w-4" />
                    Templates
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
                        className="grid w-full cursor-pointer grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border/40 px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-muted/40"
                        onClick={() => void openProject(p.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void openProject(p.id);
                          }
                        }}
                      >
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate font-medium">{p.title}</span>
                          {(linkedThreadCounts[p.id] ?? 0) > 0 && (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <MessageSquare className="h-2.5 w-2.5" />
                              {linkedThreadCounts[p.id]} chat{linkedThreadCounts[p.id] !== 1 ? "s" : ""}
                            </span>
                          )}
                        </span>
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
                        {(linkedThreadCounts[p.id] ?? 0) > 0 && (
                          <span className="ml-2 inline-flex items-center gap-0.5">
                            <MessageSquare className="h-2.5 w-2.5" />
                            {linkedThreadCounts[p.id]} chat{linkedThreadCounts[p.id] !== 1 ? "s" : ""}
                          </span>
                        )}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </main>
        </div>
      </div>

      <NewProjectDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        busy={opening}
        onCreateBlank={(title) => void handleCreate(title)}
        onCreateFromTemplate={(title, entry) => void handleCreateFromTemplate(title, entry)}
        onImport={(files) => void onImport(files)}
      />

      <TemplateGallery
        open={browseTemplatesOpen}
        onOpenChange={setBrowseTemplatesOpen}
        mode="create"
        featuredOnly
        projectTitle={templateTitle}
        onProjectTitleChange={setTemplateTitle}
        applying={opening}
        onApply={(entry) => void handleCreateFromTemplate(templateTitle.trim() || entry.label, entry)}
      />
    </DesktopOnlyGate>
  );
};

export default ProjectsHubPage;
