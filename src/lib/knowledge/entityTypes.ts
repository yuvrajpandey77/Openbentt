/**
 * Phase 3 — Entity type registry (typed facade; ids owned by knowledgeCore.mjs).
 * Future phases add Company/ResearchLab/Benchmark/… via registerEntityType.
 */
import { ENTITY_TYPE_IDS } from "@/lib/knowledge/knowledgeCore.mjs";
import type { EntityTypeDefinition } from "@/lib/knowledge/types";

const DESCRIPTIONS: Record<string, string> = {
  person: "An author, researcher, or individual.",
  organization: "A publisher, institution, lab, or company.",
  paper: "An academic paper or research document.",
  venue: "A journal, conference, or preprint server.",
  method: "A research method or algorithm.",
  dataset: "A dataset used for evaluation or study.",
  metric: "An evaluation metric reported by research.",
  model: "An ML/AI model.",
  technology: "A technology, language, or framework.",
  concept: "A topic, term, or research concept.",
  location: "A geographic location.",
  event: "A conference event, release, or dated occurrence.",
  product: "A software product or service.",
  project: "A project or initiative spanning sources.",
  task: "A unit of work, todo, or action item.",
  repository: "A code repository.",
  issue: "A tracked issue or ticket.",
  pull_request: "A proposed code change.",
  meeting: "A meeting or calendar event.",
  message: "A chat message or thread post.",
  email: "An email message or thread.",
  document: "A general document or file.",
};

const LABELS: Record<string, string> = {
  person: "Person", organization: "Organization", paper: "Paper", venue: "Venue",
  method: "Method", dataset: "Dataset", metric: "Metric", model: "Model",
  technology: "Technology", concept: "Concept", location: "Location",
  event: "Event", product: "Product", project: "Project", task: "Task",
  repository: "Repository", issue: "Issue", pull_request: "Pull request",
  meeting: "Meeting", message: "Message", email: "Email", document: "Document",
};

export const ENTITY_TYPES: EntityTypeDefinition[] = (ENTITY_TYPE_IDS as string[]).map((id) => ({
  id, label: LABELS[id] ?? id, description: DESCRIPTIONS[id] ?? "",
}));

const BY_ID = new Map(ENTITY_TYPES.map((t) => [t.id, t]));

export function isKnownEntityType(type: string): boolean {
  return BY_ID.has(type);
}

export function getEntityType(id: string): EntityTypeDefinition | undefined {
  return BY_ID.get(id);
}

export function registerEntityType(def: EntityTypeDefinition): void {
  if (!def?.id || !def.label) throw new Error("validation: invalid entity type definition");
  BY_ID.set(def.id, def);
  if (!ENTITY_TYPES.some((t) => t.id === def.id)) ENTITY_TYPES.push(def);
}
