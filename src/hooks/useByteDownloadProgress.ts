import { useCallback, useEffect, useRef, useState } from "react";
import {
  ByteDownloadTracker,
  type DownloadProgressSnapshot,
} from "@/lib/downloadProgress";
import type { DownloadProgressEvent } from "@/lib/localGguf/desktopApi";
import { getLocalGgufApi } from "@/lib/localGguf/desktopApi";

const IDLE: DownloadProgressSnapshot = {
  percent: null,
  received: null,
  total: null,
  speedBps: null,
  etaSeconds: null,
};

/** Subscribes to desktop GGUF download IPC and exposes speed / ETA / bytes. */
export function useGgufDownloadProgress(): DownloadProgressSnapshot & { active: boolean } {
  const [snap, setSnap] = useState<DownloadProgressSnapshot>(IDLE);
  const trackerRef = useRef(new ByteDownloadTracker());

  useEffect(() => {
    const api = getLocalGgufApi();
    if (!api) return undefined;
    return api.onDownloadProgress((e: DownloadProgressEvent) => {
      if (e.received == null) return;
      const total = (e.total ?? 0) > 0 ? e.total : null;
      const next = trackerRef.current.tick(e.received, total);
      setSnap(next);
    });
  }, []);

  return {
    ...snap,
    active: snap.percent != null,
  };
}

/** Imperative percent updates for browser-side model caches (WebGPU). */
export function usePercentDownloadProgress() {
  const [snap, setSnap] = useState<DownloadProgressSnapshot>(IDLE);
  const trackerRef = useRef(new ByteDownloadTracker());

  const setPercent = useCallback((pct: number | null) => {
    if (pct == null) {
      trackerRef.current.reset();
      setSnap(IDLE);
      return;
    }
    setSnap(trackerRef.current.tickPercent(pct));
  }, []);

  const reset = useCallback(() => {
    trackerRef.current.reset();
    setSnap(IDLE);
  }, []);

  return { ...snap, active: snap.percent != null, setPercent, reset };
}
