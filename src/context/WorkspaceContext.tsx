import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useChat, resolveExecutionWorkspace } from "@/context/ChatContext";
import { useResearchProject } from "@/context/ResearchProjectContext";
import { getDesktopApi } from "@/lib/desktopApi";
import { detectProjectType, type ProjectWorkspace } from "@/lib/workspace";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { buildLatexEditContract, extractBibKeysFromBibliography } from "@/lib/assistantFileEdits";
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
  const { project: activeResearchProject } = useResearchProject();
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [resolving, setResolving] = useState(false);
  const seqRef = useRef(0);
  const workspaceRef = useRef<ProjectWorkspace | null>(null);
  workspaceRef.current = workspace;
  const projectsRef = useRef(activeResearchProject);
  projectsRef.current = activeResearchProject;
  // Scalar deps for refresh (object identity churns on every project update).
  const activeResearchId = activeResearchProject?.id;
  const activeResearchTitle = activeResearchProject?.title;

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
        // Edit contract: which files the model may rewrite + valid cite keys,
        // so "rewrite chapter 3 and fix citations" actually lands as edits
        // the app can apply (file-edit blocks) instead of prose.
        try {
          const proj = projectsRef.current;
          const allowed = [
            ws.latex.mainTex,
            ...(ws.latex.chapters ?? []).slice(0, 20),
            ...(ws.latex.bibliography ?? []).slice(0, 5),
          ].filter(Boolean);
          if (!allowed.includes("references.bib")) allowed.push("references.bib");
          const keys =
            proj && proj.id === ws.projectId && proj.bibliography
              ? extractBibKeysFromBibliography(proj.bibliography)
              : [];
          lines.push(
            buildLatexEditContract({
              allowedFiles: [...new Set(allowed)],
              citeKeys: keys,
              mainTex: ws.latex.mainTex,
              buildDir: ws.latex.buildDir,
            })
          );
        } catch {
          /* contract is advisory — never break task creation */
        }
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
      const displayName =
        activeResearchId === projectId && activeResearchTitle ? activeResearchTitle : "Project";
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
          if (det?.isLatex && det.mainTex) {
            latex = {
              mainTex: det.mainTex,
              buildDir: det.buildDir ?? "build",
              chapters: Array.isArray(det.chapters) ? det.chapters.filter((c) => typeof c === "string").slice(0, 40) : [],
              bibliography: Array.isArray(det.bibliography)
                ? det.bibliography.filter((b) => typeof b === "string").slice(0, 10)
                : [],
            };
          }
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
  }, [activeProjectId, activeResearchId, activeResearchTitle, currentChatId]);

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
