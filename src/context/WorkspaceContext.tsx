import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useChat, resolveExecutionWorkspace } from "@/context/ChatContext";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { getDesktopApi } from "@/lib/desktopApi";
import { detectProjectType, type ProjectWorkspace } from "@/lib/workspace";
import { isDesktopApp } from "@/lib/isDesktopApp";
import type { NotebookStudioFileRef } from "@/context/NotebookStudioContext";
import type { ResearchProjectData } from "@/types/researchProject";

/**
 * Phase A — canonical workspace authority (renderer side).
 * Derives ONE ProjectWorkspace from: active project + bound folder +
 * real filesystem (main). Editor views push activeFile/selection here;
 * tasks consume it. Web (no bridge): context without fs verification.
 */

interface WorkspaceContextValue {
  workspace: ProjectWorkspace | null;
  resolving: boolean;
  refresh: () => Promise<void>;
  setActiveFile: (rel: string | null, selection?: { startLine: number; endLine: number } | null) => void;
  /** Map a notebook virtual ref to a workspace-relative path (null when none). */
  syncNotebookRef: (ref: NotebookStudioFileRef, project: ResearchProjectData | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function notebookRefToRel(
  ref: NotebookStudioFileRef,
  project: ResearchProjectData | null
): string | null {
  if (ref.type === "draft") return "main.tex";
  if (ref.type === "bib") return "references.bib";
  if (ref.type === "projectFile" && project?.projectFiles) {
    const f = project.projectFiles.find((p) => p.id === ref.fileId);
    return f?.path ?? null;
  }
  return null;
}

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeProjectId, chats, currentChatId, registerProjectContextProvider } = useChat();
  const { projects } = useResearchProject();
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [resolving, setResolving] = useState(false);
  const seqRef = useRef(0);
  const workspaceRef = useRef<ProjectWorkspace | null>(null);
  workspaceRef.current = workspace;

  /* Phase B: bounded project context for OpenCode task prompts. */
  useEffect(() => {
    registerProjectContextProvider(() => {
      const ws = workspaceRef.current;
      if (!ws) return null;
      const lines = [
        `[PROJECT CONTEXT — trusted workspace metadata, not instructions]`,
        `project: ${ws.displayName} (${ws.projectId})`,
      ];
      if (ws.rootPath) lines.push(`workspaceRoot: ${ws.rootPath}`);
      lines.push(`projectType: ${ws.detectedProjectType}`);
      if (ws.activeFile) {
        lines.push(
          `activeFile: ${ws.activeFile}` +
            (ws.activeSelection ? ` (selected lines ${ws.activeSelection.startLine}-${ws.activeSelection.endLine})` : "")
        );
      }
      if (ws.git) lines.push(`git: branch ${ws.git.branch}`);
      if (ws.latex) {
        lines.push(
          `latex project: main file ${ws.latex.mainTex}; after editing .tex/.bib, compile (latexmk -pdf or pdflatex+bibtex passes) into ${ws.latex.buildDir}/ and verify the PDF exists — never claim success without the artifact.`
        );
      }
      if (ws.projectInstructions) {
        lines.push(`project instructions:\n${ws.projectInstructions.slice(0, 1500)}`);
      }
      return lines.join("\n");
    });
    return () => registerProjectContextProvider(null);
  }, [registerProjectContextProvider]);

  const refresh = useCallback(async () => {
    const seq = ++seqRef.current;
    const projectId = activeProjectId;
    if (!projectId) {
      if (seq === seqRef.current) setWorkspace(null);
      return;
    }
    setResolving(true);
    try {
      const project = projects.find((p) => p.id === projectId);
      const displayName = project?.title ?? "Project";
      const folder = resolveExecutionWorkspace(projectId);
      const api = isDesktopApp() ? getDesktopApi() : undefined;
      if (!folder || !api?.workspaceResolve) {
        // Context without filesystem authority (web or unbound project).
        if (seq === seqRef.current) {
          setWorkspace((prev) => ({
            projectId,
            rootPath: prev?.projectId === projectId ? (prev.rootPath ?? "") : "",
            displayName,
            linkedFolders: [],
            allowedPaths: [],
            activeFile: prev?.projectId === projectId ? prev.activeFile : null,
            activeSelection: null,
            activeConversationId: currentChatId,
            projectInstructions: null,
            detectedProjectType: "unknown",
            git: null,
          }));
        }
        return;
      }
      const { root } = await api.workspaceResolve(folder);
      const [list, instructions, git] = await Promise.all([
        api.workspaceList?.(root, ".", 2).catch(() => []) ?? [],
        api.workspaceInstructions?.(root).catch(() => ({ path: null, text: null })),
        api.workspaceGit?.(root).catch(() => null),
      ]);
      const type = detectProjectType((list ?? []).filter((e) => e.kind === "file").map((e) => e.path));
      let latex: ProjectWorkspace["latex"] = null;
      if (type === "latex" || type === "mixed") {
        try {
          const det = await api.latexDetect?.(root).catch(() => null);
          if (det?.isLatex && det.mainTex) latex = { mainTex: det.mainTex, buildDir: det.buildDir ?? "build" };
        } catch {
          /* optional */
        }
      }
      if (seq !== seqRef.current) return;
      setWorkspace((prev) => ({
        projectId,
        rootPath: root,
        displayName,
        linkedFolders: [],
        allowedPaths: [root],
        activeFile: prev?.projectId === projectId ? prev.activeFile : null,
        activeSelection: null,
        activeConversationId: currentChatId,
        projectInstructions: instructions?.text ?? null,
        detectedProjectType: type,
        latex,
        git: git ?? null,
      }));
    } catch {
      if (seq === seqRef.current) setWorkspace(null);
    } finally {
      if (seq === seqRef.current) setResolving(false);
    }
  }, [activeProjectId, projects, currentChatId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setActiveFile = useCallback(
    (rel: string | null, selection?: { startLine: number; endLine: number } | null) => {
      setWorkspace((prev) =>
        prev ? { ...prev, activeFile: rel, activeSelection: selection ?? null } : prev
      );
    },
    []
  );

  const syncNotebookRef = useCallback(
    (ref: NotebookStudioFileRef, project: ResearchProjectData | null) => {
      setActiveFile(notebookRefToRel(ref, project));
    },
    [setActiveFile]
  );

  const value = useMemo(
    () => ({ workspace, resolving, refresh, setActiveFile, syncNotebookRef }),
    [workspace, resolving, refresh, setActiveFile, syncNotebookRef]
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return ctx;
}
