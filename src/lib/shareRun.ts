import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import type { Chat, Message } from "@/types/chat";

export const SHARE_PAYLOAD_VERSION = 1 as const;

export interface ShareSnapshotV1 {
  v: typeof SHARE_PAYLOAD_VERSION;
  title: string;
  messages: Array<Omit<Message, "timestamp"> & { timestamp: string }>;
  frozenAt: string;
}

export function chatToShareSnapshot(chat: Chat): ShareSnapshotV1 {
  return {
    v: SHARE_PAYLOAD_VERSION,
    title: chat.title,
    frozenAt: new Date().toISOString(),
    messages: chat.messages.map((m) => ({
      ...m,
      timestamp: m.timestamp.toISOString(),
    })),
  };
}

export function encodeShareSnapshot(snapshot: ShareSnapshotV1): string {
  return compressToEncodedURIComponent(JSON.stringify(snapshot));
}

export function decodeShareSnapshot(encoded: string): ShareSnapshotV1 | null {
  try {
    const raw = decompressFromEncodedURIComponent(encoded);
    if (!raw) return null;
    const j = JSON.parse(raw) as ShareSnapshotV1;
    if (j.v !== 1 || !Array.isArray(j.messages)) return null;
    return j;
  } catch {
    return null;
  }
}

export function snapshotToMessages(snapshot: ShareSnapshotV1): Message[] {
  return snapshot.messages.map((m) => ({
    ...m,
    timestamp: new Date(m.timestamp),
  }));
}

export function buildShareUrl(baseOrigin: string, encoded: string): string {
  return `${baseOrigin.replace(/\/$/, "")}/share#${encoded}`;
}
