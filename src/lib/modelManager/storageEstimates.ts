import type { LocalModelDescriptor } from "./types";
import { formatBytes } from "@/lib/downloadProgress";

export interface StorageSummary {
  totalBytes: number;
  modelCount: number;
  largestModel: LocalModelDescriptor | null;
  formattedTotal: string;
  diskFreeBytes: number | null;
  formattedFree: string;
  hasLowDiskWarning: boolean;
}

const LOW_DISK_RATIO = 0.15;

export function sumStorageBytes(models: LocalModelDescriptor[]): number {
  return models.reduce((acc, m) => acc + (m.storage.bytesOnDisk || 0), 0);
}

export function estimateDownloadBytes(
  models: LocalModelDescriptor[],
  availabilityStates: Map<string, "ready" | "downloadable" | "missing">
): number {
  let pending = 0;
  for (const m of models) {
    const st = availabilityStates.get(m.id);
    if (st === "missing" || st === "downloadable") {
      pending += m.storage.bytesOnDisk || m.storage.recommendedFreeBytes;
    }
  }
  return pending;
}

export function buildStorageSummary(
  models: LocalModelDescriptor[],
  diskFreeBytes: number | null
): StorageSummary {
  const withBytes = models.filter((m) => m.storage.bytesOnDisk > 0);
  const totalBytes = sumStorageBytes(withBytes);
  const largestModel =
    withBytes.length > 0
      ? withBytes.reduce((a, b) => (a.storage.bytesOnDisk >= b.storage.bytesOnDisk ? a : b))
      : null;

  const hasLowDiskWarning =
    diskFreeBytes != null &&
    totalBytes > 0 &&
    diskFreeBytes < totalBytes * (1 + LOW_DISK_RATIO);

  return {
    totalBytes,
    modelCount: withBytes.length,
    largestModel,
    formattedTotal: formatBytes(totalBytes),
    diskFreeBytes,
    formattedFree: diskFreeBytes != null ? formatBytes(diskFreeBytes) : "—",
    hasLowDiskWarning,
  };
}

export function resourceWarningForModel(
  m: LocalModelDescriptor,
  diskFreeBytes: number | null
): string | null {
  const need = m.storage.recommendedFreeBytes || m.storage.bytesOnDisk;
  if (diskFreeBytes != null && need > 0 && diskFreeBytes < need) {
    return `Low disk: need ~${formatBytes(need)}, ${formatBytes(diskFreeBytes)} free.`;
  }
  if (m.storage.vramGiBHint != null && m.storage.vramGiBHint > 8) {
    return `Large model (~${m.storage.vramGiBHint.toFixed(1)} GiB VRAM hint) — expect slower loads.`;
  }
  return null;
}
