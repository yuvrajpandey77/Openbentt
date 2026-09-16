/**
 * Phase 4 — Renderer connector API: desktop IPC (`research:connectors` on the
 * existing openbenttResearch bridge) with a local web fallback.
 * The web fallback executes normalization + import against the local
 * knowledge web store (bounded, offline-first, no server).
 */
import { knowledgeWebStore } from "@/lib/knowledge/webStore";
import { logger } from "@/lib/log";
import { dryRunImport, importExternalItems } from "@/lib/connectors/connectorImport";
import { listConnectorDefinitions } from "@/lib/connectors/connectorRegistry";
import { connectorWebStore } from "@/lib/connectors/connectorWebStore";
import type {
  ConnectorDefinition,
  DryRunResult,
  ExternalItem,
  ImportOptions,
  ImportResult,
  SyncState,
} from "@/lib/connectors/connectorTypes";

function bridge(): { connectors: (op: string, payload?: unknown) => Promise<unknown> } | undefined {
  try {
    const w = window as unknown as {
      openbenttResearch?: { connectors?: (op: string, payload?: unknown) => Promise<unknown> };
    };
    return w.openbenttResearch?.connectors ? { connectors: w.openbenttResearch.connectors } : undefined;
  } catch {
    return undefined;
  }
}

export function hasConnectorDesktopApi(): boolean {
  return Boolean(bridge());
}

function webBackend(projectId?: string) {
  return {
    getEntity: (id: string) => knowledgeWebStore.getEntity(id),
    upsertEntity: (e: Parameters<typeof knowledgeWebStore.upsertEntity>[0]) =>
      knowledgeWebStore.upsertEntity({ ...e, projectId: (e.projectId ?? projectId) as string | undefined }),
    getRelationship: () => null,
    upsertRelationship: (r: Parameters<typeof knowledgeWebStore.upsertRelationship>[0]) =>
      knowledgeWebStore.upsertRelationship({ ...r, projectId: (r.projectId ?? projectId) as string | undefined }),
    addEvidence: (e: Parameters<typeof knowledgeWebStore.addEvidence>[0]) =>
      knowledgeWebStore.addEvidence({ ...e, projectId: (e.projectId ?? projectId) as string | undefined }),
    getEvidenceFor: (t: "entity" | "relationship", id: string) => knowledgeWebStore.getEvidenceFor(t, id),
  };
}

const webHashes = {
  getHash: (c: string, e: string) => connectorWebStore.getHash(c, e),
  setHash: (c: string, e: string, h: string) => connectorWebStore.setHash(c, e, h),
};

export const connectorApi = {
  list(): Promise<ConnectorDefinition[]> {
    const b = bridge();
    if (b) return b.connectors("list") as Promise<ConnectorDefinition[]>;
    return Promise.resolve(listConnectorDefinitions());
  },
  capabilities(connectorId: string): Promise<string[]> {
    const b = bridge();
    if (b) return b.connectors("capabilities", { connectorId }) as Promise<string[]>;
    const def = listConnectorDefinitions().find((d) => d.id === connectorId);
    if (!def) return Promise.reject(new Error("Unknown connector."));
    return Promise.resolve([...def.capabilities]);
  },
  async preview(items: ExternalItem[]): Promise<ExternalItem[]> {
    const b = bridge();
    if (b) return b.connectors("preview", { items }) as Promise<ExternalItem[]>;
    return items.slice(0, 200);
  },
  async dryRun(items: ExternalItem[], opts?: ImportOptions): Promise<DryRunResult> {
    const b = bridge();
    if (b) return b.connectors("dryRun", { items, opts }) as Promise<DryRunResult>;
    return dryRunImport(items, webBackend(opts?.projectId), opts, webHashes);
  },
  async import(items: ExternalItem[], opts?: ImportOptions): Promise<ImportResult> {
    const started = performance.now();
    const b = bridge();
    if (b) return b.connectors("import", { items, opts }) as Promise<ImportResult>;
    const res = await importExternalItems(items, webBackend(opts?.projectId), opts, webHashes);
    for (const it of res.items) {
      if (it.entityId && (it.status === "created" || it.status === "updated")) {
        connectorWebStore.link(it.connectorId, it.externalId, it.entityId);
      }
    }
    logger.info("connectors", "connector import (web fallback)", {
      durationMs: Math.round(performance.now() - started),
      itemsReceived: items.length,
      itemsCreated: res.created.length,
      itemsUpdated: res.updated.length,
      itemsSkipped: res.skipped.length + res.unchanged.length,
      itemsFailed: res.failed.length,
      conflicts: res.conflicts.length,
    });
    return res;
  },
  syncStatus(connectorId: string, scope?: string): Promise<SyncState | null> {
    const b = bridge();
    if (b) return b.connectors("syncStatus", { connectorId, scope }) as Promise<SyncState | null>;
    return Promise.resolve(connectorWebStore.getSync(connectorId, scope) ?? null);
  },
  reset(connectorId?: string): Promise<{ ok: boolean }> {
    const b = bridge();
    if (b) return b.connectors("reset", { connectorId }) as Promise<{ ok: boolean }>;
    connectorWebStore.reset(connectorId);
    return Promise.resolve({ ok: true });
  },
};
