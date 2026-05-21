import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useChat } from "@/context/ChatContext";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { useNotebookViewer } from "@/context/NotebookViewerContext";
import {
  editorFileKey,
  useNotebookStudio,
} from "@/context/NotebookStudioContext";
import { loadPaperPdfDesktop, listProjectAssetsDesktop, storeProjectAssetDesktop, loadProjectAssetDesktop } from "@/lib/research/researchDesktopApi";
import { downloadBlob, exportProjectZip } from "@/lib/research/projectExport";
import { arrayBufferToBase64, base64ToArrayBuffer } from "@/lib/research/base64";
import type { PaperReviewStatus, ProjectFile } from "@/types/researchProject";
import { cn } from "@/lib/utils";
import {
  BookMarked,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  MessageSquare,
  Download,
  Plus,
} from "lucide-react";

type TreeNode = {
  id: string;
  label: string;
  kind: "folder" | "draft" | "bib" | "paper" | "projectFile" | "asset";
  paperId?: string;
  fileId?: string;
  assetName?: string;
  reviewStatus?: PaperReviewStatus;
  children?: TreeNode[];
};

function buildTree(
  projectFiles: ProjectFile[] | undefined,
  papers: { id: string; fileName: string; metadata: { title?: string }; reviewStatus?: PaperReviewStatus }[],
  assets: string[]
): TreeNode[] {
  const root: TreeNode[] = [
    { id: "draft", label: "main.tex", kind: "draft" },
    { id: "bib", label: "references.bib", kind: "bib" },
  ];

  const chapters: TreeNode = { id: "folder-chapters", label: "chapters", kind: "folder", children: [] };
  const figures: TreeNode = { id: "folder-figures", label: "figures", kind: "folder", children: [] };
  const other: TreeNode = { id: "folder-other", label: "includes", kind: "folder", children: [] };

  for (const f of projectFiles ?? []) {
    const label = f.path.split("/").pop() ?? f.path;
    const node: TreeNode = {
      id: `pf-${f.id}`,
      label,
      kind: "projectFile",
      fileId: f.id,
    };
    if (f.path.startsWith("chapters/")) chapters.children!.push(node);
    else if (f.path.startsWith("figures/") || f.path.startsWith("assets/")) figures.children!.push(node);
    else other.children!.push({ ...node, label: f.path });
  }

  if (chapters.children!.length) root.push(chapters);
  if (figures.children!.length) root.push(figures);
  if (other.children!.length) root.push(other);

  const papersFolder: TreeNode = {
    id: "folder-papers",
    label: "papers",
    kind: "folder",
    children: papers.map((p) => ({
      id: `paper-${p.id}`,
      label: p.metadata.title ?? p.fileName,
      kind: "paper" as const,
      paperId: p.id,
      reviewStatus: p.reviewStatus,
    })),
  };
  root.push(papersFolder);

  if (assets.length) {
    root.push({
      id: "folder-assets",
      label: "assets",
      kind: "folder",
      children: assets.map((name) => ({
        id: `asset-${name}`,
        label: name,
        kind: "asset" as const,
        assetName: name,
      })),
    });
  }

  return root;
}

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  activeId,
  onSelect,
  onOpenChat,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  activeId: string;
  onSelect: (node: TreeNode) => void;
  onOpenChat?: (node: TreeNode) => void;
}) {
  const isFolder = node.kind === "folder";
  const isOpen = expanded.has(node.id);
  const active = activeId === node.id;

  const Icon =
    node.kind === "draft" || node.kind === "projectFile"
      ? FileCode2
      : node.kind === "bib"
        ? BookMarked
        : node.kind === "asset"
          ? FileImage
          : FileText;

  const canChat = node.kind === "draft" || node.kind === "bib" || node.kind === "projectFile";

  const row = (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-1 rounded-md py-1 pr-2 text-left text-xs transition-colors hover:bg-muted/60",
        active && "bg-primary/10 text-primary"
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      onClick={() => (isFolder ? onToggle(node.id) : onSelect(node))}
    >
        {isFolder ? (
          isOpen ? (
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {isFolder ? (
          isOpen ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 opacity-70" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 opacity-70" />
          )
        ) : (
          <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
        )}
        <span className="min-w-0 flex-1 truncate">{node.label}</span>
        {node.reviewStatus === "reviewed" && (
          <span className="rounded bg-emerald-500/15 px-1 text-[9px] text-emerald-700 dark:text-emerald-300">✓</span>
        )}
        {node.reviewStatus === "reviewing" && (
          <span className="rounded bg-amber-500/15 px-1 text-[9px] text-amber-700 dark:text-amber-300">…</span>
        )}
      </button>
  );

  return (
    <>
      {canChat && onOpenChat ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ContextMenuItem onClick={() => onSelect(node)}>Open file</ContextMenuItem>
            <ContextMenuItem onClick={() => onOpenChat(node)}>
              <MessageSquare className="mr-2 h-3.5 w-3.5" />
              Open chat for {node.label}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        row
      )}
      {isFolder && isOpen &&
        node.children?.map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            activeId={activeId}
            onSelect={onSelect}
            onOpenChat={onOpenChat}
          />
        ))}
    </>
  );
}

export function NotebookFileTree({
  onUploadPdfs,
}: {
  onUploadPdfs: () => void;
}) {
  const { project, updatePaperReview, addProjectFile, deleteProjectFile, renameProjectFile } = useResearchProject();
  const { createNewChat, selectChat, chats } = useChat();
  const { viewer } = useNotebookViewer();
  const {
    reviewFilter,
    setReviewFilter,
    openEditorTab,
    setActiveFile,
    registerFileNav,
    setActivePaperId,
    activeFile,
    setChatConnection,
    chatConnections,
    openChatPanel,
  } = useNotebookStudio();
  const [expanded, setExpanded] = useState(
    () => new Set(["folder-papers", "folder-chapters", "folder-assets"])
  );
  const activeId = editorFileKey(activeFile);
  const [assets, setAssets] = useState<string[]>([]);
  const [newFilePath, setNewFilePath] = useState("");
  const [assetPreview, setAssetPreview] = useState<{ name: string; url: string; mime: string } | null>(null);
  const assetUploadRef = useRef<HTMLInputElement>(null);
  const openPdfRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!project) return;
    void listProjectAssetsDesktop(project.id).then((names) => setAssets(names ?? []));
  }, [project]);

  const filteredPapers = useMemo(() => {
    if (!project) return [];
    return project.papers.filter((p) => {
      if (reviewFilter === "all") return true;
      if (reviewFilter === "reviewed") return p.reviewStatus === "reviewed";
      return p.reviewStatus !== "reviewed";
    });
  }, [project, reviewFilter]);

  const tree = useMemo(
    () => buildTree(project?.projectFiles, filteredPapers, assets),
    [project?.projectFiles, filteredPapers, assets]
  );

  const flatPapers = useMemo(() => filteredPapers.map((p) => p.id), [filteredPapers]);

  const openPaper = useCallback(
    async (paperId: string, fileName: string) => {
      if (!project) return;
      setActiveFile({ type: "paper", paperId });
      setActivePaperId(paperId);
      await updatePaperReview(paperId, { reviewStatus: "reviewing" });
      const res = await loadPaperPdfDesktop(project.id, paperId);
      if (res?.ok && res.base64) {
        viewer?.loadPdfBytes(base64ToArrayBuffer(res.base64), fileName, {
          replaceSource: false,
          paperId,
        });
      }
      viewer?.focusPreview();
    },
    [project, setActiveFile, setActivePaperId, updatePaperReview, viewer]
  );

  const openChatForNode = useCallback(
    (node: TreeNode) => {
      let fileRef: { type: "draft" } | { type: "bib" } | { type: "projectFile"; fileId: string } | null = null;
      if (node.kind === "draft") fileRef = { type: "draft" };
      else if (node.kind === "bib") fileRef = { type: "bib" };
      else if (node.kind === "projectFile" && node.fileId) fileRef = { type: "projectFile", fileId: node.fileId };
      if (!fileRef) return;

      openEditorTab(fileRef);
      const tabKey = editorFileKey(fileRef);
      const existing = chats.find((c) => c.title === `📄 ${node.label}`);
      if (existing) selectChat(existing.id);
      else createNewChat(`📄 ${node.label}`);
      if (!chatConnections.texFileKeys.includes(tabKey)) {
        setChatConnection("tex", tabKey);
      }
      openChatPanel();
      viewer?.focusSource();
    },
    [
      openEditorTab,
      chats,
      selectChat,
      createNewChat,
      chatConnections.texFileKeys,
      setChatConnection,
      openChatPanel,
      viewer,
    ]
  );

  const selectNode = useCallback(
    (node: TreeNode) => {
      if (node.kind === "draft") {
        openEditorTab({ type: "draft" });
        viewer?.focusSource();
      } else if (node.kind === "bib") {
        openEditorTab({ type: "bib" });
        viewer?.focusSource();
      } else if (node.kind === "paper" && node.paperId) {
        void openPaper(node.paperId, node.label);
      } else if (node.kind === "projectFile" && node.fileId) {
        openEditorTab({ type: "projectFile", fileId: node.fileId });
        viewer?.focusSource();
      } else if (node.kind === "asset" && node.assetName && project) {
        void loadProjectAssetDesktop(project.id, node.assetName).then((r) => {
          if (!r?.ok || !r.base64) return;
          const mime = r.mime ?? "application/octet-stream";
          if (mime === "application/pdf") {
            viewer?.loadPdfBytes(base64ToArrayBuffer(r.base64), node.assetName!, { replaceSource: false });
            viewer?.focusPreview();
            return;
          }
          if (mime.startsWith("image/")) {
            setAssetPreview({ name: node.assetName!, url: `data:${mime};base64,${r.base64}`, mime });
          }
        });
      }
    },
    [openEditorTab, openPaper, viewer, project]
  );

  const insertAssetRef = useCallback(
    (assetName: string) => {
      const snippet = `\\includegraphics[width=0.9\\linewidth]{assets/${assetName}}`;
      navigator.clipboard?.writeText(snippet);
    },
    []
  );

  const exportZip = useCallback(async () => {
    if (!project) return;
    const blob = await exportProjectZip(project);
    downloadBlob(blob, `${project.title.replace(/\s+/g, "-")}-export.zip`);
  }, [project]);

  const goNext = useCallback(() => {
    if (!flatPapers.length) return;
    const cur = flatPapers.findIndex((id) => activeId === `paper-${id}`);
    const next = flatPapers[cur < 0 ? 0 : (cur + 1) % flatPapers.length];
    const p = project?.papers.find((x) => x.id === next);
    if (p) void openPaper(p.id, p.fileName);
  }, [activeId, flatPapers, openPaper, project?.papers]);

  const goPrev = useCallback(() => {
    if (!flatPapers.length) return;
    const cur = flatPapers.findIndex((id) => activeId === `paper-${id}`);
    const prev = flatPapers[cur <= 0 ? flatPapers.length - 1 : cur - 1];
    const p = project?.papers.find((x) => x.id === prev);
    if (p) void openPaper(p.id, p.fileName);
  }, [activeId, flatPapers, openPaper, project?.papers]);

  useEffect(() => {
    registerFileNav({ next: goNext, prev: goPrev });
    return () => registerFileNav(null);
  }, [goNext, goPrev, registerFileNav]);

  const addFile = () => {
    const path = newFilePath.trim();
    if (!path) return;
    void addProjectFile(path, "", path.endsWith(".bib") ? "bib" : "tex");
    setNewFilePath("");
  };

  const onAssetUpload = async (files: FileList | null) => {
    if (!project || !files?.length) return;
    for (const file of Array.from(files)) {
      const buf = await file.arrayBuffer();
      const ok = await storeProjectAssetDesktop(project.id, file.name, arrayBufferToBase64(buf));
      if (ok) {
        setAssets((prev) => (prev.includes(file.name) ? prev : [...prev, file.name]));
      }
    }
  };

  if (!project) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 px-2 py-2">
        <Select value={reviewFilter} onValueChange={(v) => setReviewFilter(v as typeof reviewFilter)}>
          <SelectTrigger className="h-8 flex-1 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All files</SelectItem>
            <SelectItem value="unread">Unread PDFs</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => void exportZip()} aria-label="Export project ZIP">
          <Download className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={onUploadPdfs} aria-label="Upload PDFs">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-1">
        {tree.map((node) => (
          <TreeRow
            key={node.id}
            node={node}
            depth={0}
            expanded={expanded}
            onToggle={(id) =>
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            activeId={activeId}
            onSelect={selectNode}
            onOpenChat={openChatForNode}
          />
        ))}
      </ScrollArea>
      <div className="shrink-0 space-y-1.5 border-t border-border/60 p-2">
        <input
          ref={assetUploadRef}
          type="file"
          accept="image/*,.png,.jpg,.jpeg,.svg,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            void onAssetUpload(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-full gap-1.5 text-xs"
          onClick={() => assetUploadRef.current?.click()}
        >
          <FileImage className="h-3.5 w-3.5" />
          Upload asset
        </Button>
        <div className="flex gap-1">
          <Input
            className="h-8 text-xs"
            placeholder="chapters/intro.tex"
            value={newFilePath}
            onChange={(e) => setNewFilePath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addFile()}
          />
          <Button type="button" size="sm" className="h-8 shrink-0 text-xs" onClick={addFile}>
            Add
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          <kbd className="rounded border px-1">J</kbd>/<kbd className="rounded border px-1">K</kbd> next/prev PDF
        </p>
      </div>
      <Dialog open={!!assetPreview} onOpenChange={(o) => !o && setAssetPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{assetPreview?.name}</DialogTitle>
            <DialogDescription className="sr-only">
              Preview project asset and copy an includegraphics path for LaTeX.
            </DialogDescription>
          </DialogHeader>
          {assetPreview?.mime.startsWith("image/") && (
            <img src={assetPreview.url} alt={assetPreview.name} className="max-h-[60vh] w-full object-contain" />
          )}
          {assetPreview && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => insertAssetRef(assetPreview.name)}
            >
              Copy \\includegraphics path
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
