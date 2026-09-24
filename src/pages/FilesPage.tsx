import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useWorkspace } from "@/context/WorkspaceContext";
import { getDesktopApi } from "@/lib/desktopApi";
import { Button } from "@/components/ui/button";
import { FileText, FolderOpen } from "lucide-react";
import { FilterInput } from "@/components/FilterInput";

/**
 * Phase J — Files view: a VIEW into the canonical ProjectWorkspace
 * (filesystem authoritative). No duplicated file database.
 */
const FilesPage: React.FC = () => {
  const { workspace, setActiveFile } = useWorkspace();
  const [entries, setEntries] = useState<Array<{ path: string; kind: string }>>([]);
  const [preview, setPreview] = useState<{ path: string; text: string; truncated: boolean } | null>(null);
  const [cwd, setCwd] = useState(".");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = q ? entries.filter((e) => e.path.toLowerCase().includes(q)) : entries;

  useEffect(() => {
    setCwd(".");
    setPreview(null);
  }, [workspace?.rootPath]);

  useEffect(() => {
    const api = getDesktopApi();
    if (!workspace?.rootPath || !api?.workspaceList) {
      setEntries([]);
      return;
    }
    void api
      .workspaceList(workspace.rootPath, cwd, 2)
      .then((list) => setEntries(list ?? []))
      .catch(() => setEntries([]));
  }, [workspace?.rootPath, cwd]);

  if (!workspace?.rootPath) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-6">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <FolderOpen className="h-5 w-5 text-primary" /> Files
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Open a project and bind its workspace folder to browse real files.
        </p>
        <Button asChild size="sm" className="mt-3">
          <Link to="/projects">Open projects</Link>
        </Button>
      </div>
    );
  }

  const openEntry = (e: { path: string; kind: string }) => {
    if (e.kind === "dir") {
      setCwd(e.path);
      setPreview(null);
      return;
    }
    const api = getDesktopApi();
    if (!api?.workspaceRead || !workspace.rootPath) return;
    void api
      .workspaceRead(workspace.rootPath, e.path, 32768)
      .then((r) => {
        setPreview({ path: e.path, text: r.text, truncated: r.truncated });
        setActiveFile(e.path);
      })
      .catch(() => {});
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl min-h-0 flex-1 flex-col px-4 py-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <FolderOpen className="h-5 w-5 text-primary" /> Files
        </h1>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{workspace.rootPath}</span>
        {workspace.git && (
          <span className="rounded-full border border-border/60 px-2 py-px text-[10px] text-muted-foreground">
            git:{workspace.git.branch} · {workspace.git.modified.length} modified
          </span>
        )}
      </div>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">/{cwd === "." ? "" : cwd}</p>
      <div className="mt-2">
        <FilterInput value={query} onChange={setQuery} placeholder="Filter files…" className="max-w-xs" />
      </div>
      <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2">
        <ul className="min-h-0 space-y-0.5 overflow-y-auto rounded-lg border border-border/60 p-2">
          {cwd !== "." && (
            <li>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
                onClick={() => {
                  const up = cwd.split("/").slice(0, -1).join("/") || ".";
                  setCwd(up);
                  setPreview(null);
                }}
              >
                ← ..
              </button>
            </li>
          )}
          {visible.map((e) => (
            <li key={e.path}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => openEntry(e)}
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-mono text-xs">{e.path.split("/").pop()}</span>
              </button>
            </li>
          ))}
          {visible.length === 0 && (
            <li className="px-2 py-3 text-xs text-muted-foreground">
              {entries.length === 0 ? "Empty folder." : `No files match “${query.trim()}”.`}
            </li>
          )}
        </ul>
        <div className="min-h-0 overflow-y-auto rounded-lg border border-border/60 bg-muted/10 p-3">
          {preview ? (
            <>
              <p className="mb-2 truncate font-mono text-[11px] text-muted-foreground">{preview.path}</p>
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
                {preview.text.slice(0, 12000)}
              </pre>
              {preview.truncated && <p className="mt-1 text-[10px] text-muted-foreground">Truncated preview.</p>}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Select a file to preview. Opening a file sets it as the active file for “Rewrite this”.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilesPage;
