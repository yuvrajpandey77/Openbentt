/**
 * Phase 8 — Cross-source identity linking (main process only).
 *
 * Conservative rule: link two entities ONLY when they share the SAME
 * identifier namespace AND value (e.g. github_repo:acme/web observed on both
 * a synced issue entity and a synced repository entity). Names alone NEVER
 * merge anything; ambiguous identities stay separate.
 *
 * Links are RELATED_TO relationships with connector evidence on both sides,
 * so every link is traceable to actual observations. Bounded (10 links/run).
 */
import { getDb } from "./researchDb.mjs";
import { createLogger } from "./log.mjs";
import { fnv1aHex } from "../src/lib/knowledge/knowledgeCore.mjs";

const log = createLogger("identity");
const MAX_LINKS_PER_RUN = 10;

function linkId(a, b, namespace, value) {
  const [x, y] = [a, b].sort();
  return `krel-link-${fnv1aHex(`${x}|${y}|${namespace}|${value}`)}`;
}

/**
 * For freshly imported entity ids, find other entities sharing an exact
 * identifier and link them with evidence. Returns { linked }.
 */
export function linkSharedIdentifiers(app, entityIds) {
  const db = getDb(app);
  const ids = [...new Set((entityIds ?? []).filter((e) => typeof e === "string"))].slice(0, 50);
  let linked = 0;
  for (const entityId of ids) {
    if (linked >= MAX_LINKS_PER_RUN) break;
    let idents = [];
    try {
      idents = db.prepare(
        "SELECT namespace, value FROM knowledge_entity_identifiers WHERE entity_id = ?"
      ).all(entityId).slice(0, 32);
    } catch {
      continue;
    }
    for (const { namespace, value } of idents) {
      if (linked >= MAX_LINKS_PER_RUN) break;
      if (!namespace || !value) continue;
      // Skip weak namespaces that would over-link (per-connector external ids
      // are unique by construction; doi/email/repo/thread are the join keys).
      if (!["doi", "email_address", "github_repo", "gmail_thread", "slack_channel"].includes(namespace)) continue;
      let others = [];
      try {
        others = db.prepare(
          `SELECT entity_id FROM knowledge_entity_identifiers
           WHERE namespace = ? AND value = ? AND entity_id != ? LIMIT 5`
        ).all(namespace, value, entityId);
      } catch {
        continue;
      }
      for (const row of others) {
        if (linked >= MAX_LINKS_PER_RUN) break;
        const otherId = row.entity_id;
        const relId = linkId(entityId, otherId, namespace, value);
        try {
          const existing = db.prepare("SELECT id FROM knowledge_relationships WHERE id = ?").get(relId);
          if (existing) continue;
          const now = new Date().toISOString();
          db.prepare(
            `INSERT INTO knowledge_relationships (id, project_id, type, subject_id, object_id,
              properties_json, status, confidence, origin, provenance, created_at, updated_at)
             VALUES (?, NULL, 'RELATED_TO', ?, ?, ?, 'asserted', 'medium', 'import', 'imported', ?, ?)`
          ).run(
            relId, entityId, otherId,
            JSON.stringify({ "link:namespace": namespace, "link:value": String(value).slice(0, 200) }),
            now, now
          );
          const evId = `kev-link-${fnv1aHex(`${relId}|${now}`)}`;
          const ent = db.prepare("SELECT canonical_name FROM knowledge_entities WHERE id = ?").get(entityId);
          db.prepare(
            `INSERT INTO knowledge_evidence (id, project_id, subject_type, subject_id, predicate,
              quote, evidence_type, source_json, source_document_id, confidence, status, origin, created_at)
             VALUES (?, NULL, 'relationship', ?, 'RELATED_TO', ?, 'connector', ?, '', 'medium', 'current', 'import', ?)
             ON CONFLICT(id) DO NOTHING`
          ).run(
            evId, relId,
            `Shared identifier ${namespace}:${String(value).slice(0, 120)} observed on "${String(ent?.canonical_name ?? entityId).slice(0, 120)}" and a second entity.`.slice(0, 600),
            JSON.stringify({ connector: true, namespace, entityId }),
            now
          );
          linked += 1;
        } catch (err) {
          log.warn("identity link failed", { error: err instanceof Error ? err.message : "unknown" });
        }
      }
    }
  }
  return { linked };
}
