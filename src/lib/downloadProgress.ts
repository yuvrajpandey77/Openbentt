/** Format byte counts for download / disk UI. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GiB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${(n / 1024).toFixed(0)} KiB`;
}

/** Human-readable transfer rate (bytes per second). */
export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "—";
  if (bytesPerSecond >= 1024 ** 2) return `${(bytesPerSecond / 1024 ** 2).toFixed(1)} MiB/s`;
  if (bytesPerSecond >= 1024) return `${(bytesPerSecond / 1024).toFixed(0)} KiB/s`;
  return `${Math.round(bytesPerSecond)} B/s`;
}

/** Rough ETA from remaining bytes and current speed. */
export function formatEta(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s left`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m left`;
  }
  return s > 0 ? `${m}m ${s}s left` : `${m}m left`;
}

export interface DownloadProgressSnapshot {
  percent: number | null;
  received: number | null;
  total: number | null;
  speedBps: number | null;
  etaSeconds: number | null;
}

const SPEED_WINDOW_MS = 2000;

/**
 * Tracks byte-based download progress with smoothed speed and ETA.
 * Call `tick(received, total)` on each progress event; `reset()` when done.
 */
export class ByteDownloadTracker {
  private samples: { t: number; bytes: number }[] = [];
  private lastReceived = 0;
  private lastTotal: number | null = null;

  reset(): void {
    this.samples = [];
    this.lastReceived = 0;
    this.lastTotal = null;
  }

  tick(received: number, total?: number | null): DownloadProgressSnapshot {
    const now = Date.now();
    const totalBytes = total != null && total > 0 ? total : this.lastTotal;
    if (total != null && total > 0) this.lastTotal = total;

    this.samples.push({ t: now, bytes: received });
    const cutoff = now - SPEED_WINDOW_MS;
    this.samples = this.samples.filter((s) => s.t >= cutoff);

    let speedBps: number | null = null;
    if (this.samples.length >= 2) {
      const first = this.samples[0]!;
      const last = this.samples[this.samples.length - 1]!;
      const dt = (last.t - first.t) / 1000;
      const dBytes = last.bytes - first.bytes;
      if (dt > 0.2 && dBytes > 0) speedBps = dBytes / dt;
    }

    this.lastReceived = received;

    const percent =
      totalBytes != null && totalBytes > 0
        ? Math.min(99, Math.floor((100 * received) / totalBytes))
        : null;

    let etaSeconds: number | null = null;
    if (speedBps != null && speedBps > 0 && totalBytes != null && totalBytes > received) {
      etaSeconds = (totalBytes - received) / speedBps;
    }

    return {
      percent,
      received,
      total: totalBytes,
      speedBps,
      etaSeconds,
    };
  }

  /** Percent-only updates (WebGPU) — no byte totals; speed unavailable. */
  tickPercent(percent: number): DownloadProgressSnapshot {
    return {
      percent: Math.min(99, Math.max(0, Math.floor(percent))),
      received: null,
      total: null,
      speedBps: null,
      etaSeconds: null,
    };
  }
}
