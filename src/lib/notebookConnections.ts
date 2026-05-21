import type { ConnectionHandleKind } from "@/components/notebook/ConnectionHandle";

export const CONNECTION_SNAP_RADIUS_PX = 50;

/** Whether dropping a drag wire onto `targetId` completes `from`. */
export function connectionTargetMatches(
  from: "chat-tex" | "chat-pdf",
  targetId: string,
  targetKind: ConnectionHandleKind | null
): boolean {
  if (from === "chat-tex" && targetKind === "tex-tab" && targetId.startsWith("tex-tab-")) {
    return true;
  }
  if (from === "chat-pdf" && targetKind === "pdf-preview" && targetId === "pdf-preview") {
    return true;
  }
  return false;
}

export function texFileKeyFromTabAnchor(anchorId: string): string | null {
  if (!anchorId.startsWith("tex-tab-")) return null;
  return anchorId.slice("tex-tab-".length);
}

export function validSnapTargetIds(from: "chat-tex" | "chat-pdf", texFileKeys: string[]): string[] {
  if (from === "chat-pdf") return ["pdf-preview"];
  return texFileKeys.map((k) => `tex-tab-${k}`);
}

/** Closest valid snap target within radius, or null. */
export function findSnapTarget(
  from: "chat-tex" | "chat-pdf",
  pointer: { x: number; y: number },
  getCenter: (id: string) => { x: number; y: number } | null,
  texFileKeys: string[],
  radius = CONNECTION_SNAP_RADIUS_PX
): string | null {
  let best: { id: string; dist: number } | null = null;
  for (const id of validSnapTargetIds(from, texFileKeys)) {
    const center = getCenter(id);
    if (!center) continue;
    const dist = Math.hypot(pointer.x - center.x, pointer.y - center.y);
    if (dist <= radius && (!best || dist < best.dist)) {
      best = { id, dist };
    }
  }
  return best?.id ?? null;
}
