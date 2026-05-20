import type { RevisionHistoryEntry, RevisionSuggestion } from "@/types/researchProject";

export function appendRevisionHistory(
  history: RevisionHistoryEntry[],
  suggestion: RevisionSuggestion,
  action: RevisionHistoryEntry["action"]
): RevisionHistoryEntry[] {
  const entry: RevisionHistoryEntry = {
    id: `rh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    suggestionId: suggestion.id,
    action,
    summary: suggestion.original.slice(0, 120),
    at: new Date().toISOString(),
  };
  return [entry, ...history].slice(0, 80);
}
