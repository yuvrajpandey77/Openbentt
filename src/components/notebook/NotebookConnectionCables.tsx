import { useEffect, useMemo, useRef } from "react";
import { editorFileKey, useNotebookStudio } from "@/context/NotebookStudioContext";
import {
  connectionTargetMatches,
  findSnapTarget,
  texFileKeyFromTabAnchor,
} from "@/lib/notebookConnections";

type Point = { x: number; y: number };

function bezierPath(a: Point, b: Point): string {
  const dx = Math.abs(b.x - a.x);
  const cp = Math.max(48, dx * 0.45);
  return `M ${a.x} ${a.y} C ${a.x + cp} ${a.y}, ${b.x - cp} ${b.y}, ${b.x} ${b.y}`;
}

const CABLE_COLORS = {
  tex: "#8b5cf6",
  pdf: "#8b5cf6",
} as const;

type NotebookConnectionCablesProps = {
  containerRef: React.RefObject<HTMLElement | null>;
};

/** SVG overlay drawing cables between chat and editor/preview handles. */
export function NotebookConnectionCables({ containerRef }: NotebookConnectionCablesProps) {
  const {
    chatConnections,
    editorTabs,
    getConnectionAnchorCenter,
    connectionLayoutTick,
    chatPanelOpen,
    connectionDrag,
    setConnectionDrag,
    pendingConnection,
    setChatConnection,
    setPendingConnection,
    bumpConnectionLayout,
    activePaperId,
  } = useNotebookStudio();

  const dragRef = useRef(connectionDrag);
  dragRef.current = connectionDrag;
  const pendingRef = useRef(pendingConnection);
  pendingRef.current = pendingConnection;

  const texTabKeys = useMemo(() => editorTabs.map((t) => editorFileKey(t)), [editorTabs]);

  useEffect(() => {
    if (!connectionDrag) return;

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const snapTargetId = findSnapTarget(
        d.from,
        { x: e.clientX, y: e.clientY },
        getConnectionAnchorCenter,
        texTabKeys
      );
      setConnectionDrag({ ...d, x: e.clientX, y: e.clientY, snapTargetId });
      bumpConnectionLayout();
    };

    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      setConnectionDrag(null);
      if (!drag) return;

      const moved =
        Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 8;

      let targetId = drag.snapTargetId ?? null;
      if (!targetId) {
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        const handle = hit?.closest("[data-connection-handle]") as HTMLElement | null;
        targetId = handle?.getAttribute("data-connection-handle") ?? null;
      }
      const targetKind = targetId
        ? (document.querySelector(`[data-connection-handle="${targetId}"]`)?.getAttribute("data-connection-kind") ?? null)
        : null;

      if (
        targetId &&
        connectionTargetMatches(
          drag.from,
          targetId,
          targetKind as "chat-tex" | "chat-pdf" | "tex-tab" | "pdf-preview" | null
        )
      ) {
        if (drag.from === "chat-tex") {
          const key = texFileKeyFromTabAnchor(targetId);
          if (key) setChatConnection("tex", key);
        } else {
          setChatConnection("pdf", activePaperId ?? "compiled");
        }
        setPendingConnection(null);
      } else if (!moved) {
        const cur = pendingRef.current;
        setPendingConnection(cur?.from === drag.from ? null : { from: drag.from });
      } else {
        setPendingConnection(null);
      }
      bumpConnectionLayout();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [
    connectionDrag,
    setConnectionDrag,
    setChatConnection,
    setPendingConnection,
    bumpConnectionLayout,
    activePaperId,
    getConnectionAnchorCenter,
    texTabKeys,
  ]);

  const texCount = chatConnections.texFileKeys.length;
  const multiTex = texCount > 1;

  const paths = useMemo(() => {
    void connectionLayoutTick;
    const container = containerRef.current;
    if (!container || !chatPanelOpen) return [];

    const cr = container.getBoundingClientRect();
    const toLocal = (p: Point): Point => ({ x: p.x - cr.left, y: p.y - cr.top });

    const out: { d: string; color: string; id: string; preview?: boolean; faint?: boolean }[] = [];

    for (const fileKey of chatConnections.texFileKeys) {
      const from = getConnectionAnchorCenter("chat-tex");
      const to = getConnectionAnchorCenter(`tex-tab-${fileKey}`);
      if (from && to) {
        const a = toLocal(from);
        const b = toLocal(to);
        out.push({
          d: bezierPath(a, b),
          color: CABLE_COLORS.tex,
          id: `cable-tex-${fileKey}`,
          faint: multiTex,
        });
      }
    }

    if (chatConnections.pdfPaperIds.length) {
      const from = getConnectionAnchorCenter("chat-pdf");
      const to = getConnectionAnchorCenter("pdf-preview");
      if (from && to) {
        const a = toLocal(from);
        const b = toLocal(to);
        out.push({ d: bezierPath(a, b), color: CABLE_COLORS.pdf, id: "cable-pdf" });
      }
    }

    const dragFrom = connectionDrag?.from ?? pendingConnection?.from;
    if (dragFrom) {
      const from = getConnectionAnchorCenter(dragFrom);
      if (from) {
        const a = toLocal(from);
        let b: Point;
        if (connectionDrag?.snapTargetId) {
          const snap = getConnectionAnchorCenter(connectionDrag.snapTargetId);
          b = snap ? toLocal(snap) : toLocal({ x: connectionDrag.x, y: connectionDrag.y });
        } else if (connectionDrag) {
          b = toLocal({ x: connectionDrag.x, y: connectionDrag.y });
        } else {
          b = { x: a.x + 80, y: a.y };
        }
        out.push({
          d: bezierPath(a, b),
          color: dragFrom === "chat-tex" ? CABLE_COLORS.tex : CABLE_COLORS.pdf,
          id: "cable-drag",
          preview: true,
        });
      }
    }

    return out;
  }, [
    chatConnections.texFileKeys,
    chatConnections.pdfPaperIds,
    connectionLayoutTick,
    chatPanelOpen,
    connectionDrag,
    pendingConnection,
    containerRef,
    getConnectionAnchorCenter,
    multiTex,
  ]);

  if (!chatPanelOpen || !paths.length) return null;

  return (
    <svg className="pointer-events-none absolute inset-0 z-[45] overflow-visible" aria-hidden>
      <defs>
        <filter id="notebook-cable-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {paths.map((p) => (
        <g key={p.id} filter={p.preview ? undefined : "url(#notebook-cable-glow)"}>
          <path
            d={p.d}
            stroke={p.color}
            strokeWidth={p.preview ? 4 : p.faint ? 3 : 5}
            strokeOpacity={p.preview ? 0.22 : p.faint ? 0.12 : 0.22}
            fill="none"
          />
          <path
            d={p.d}
            stroke={p.color}
            strokeWidth={p.preview ? 2.5 : p.faint ? 1.5 : 3}
            strokeOpacity={p.preview ? 0.95 : p.faint ? 0.55 : 0.88}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={p.preview ? "8 6" : p.faint ? "4 5" : "10 6"}
          />
        </g>
      ))}
    </svg>
  );
}

export function texTabAnchorId(fileKey: string): string {
  return `tex-tab-${fileKey}`;
}
