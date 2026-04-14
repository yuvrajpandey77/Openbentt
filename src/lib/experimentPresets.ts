import { v4 as uuidv4 } from "uuid";
import type { ApiKeyConfig } from "@/types/chat";
import { normalizeApiConfig } from "@/types/chat";

const KEY = "cogerphere-experiment-presets";

export interface ExperimentPreset {
  id: string;
  name: string;
  config: ApiKeyConfig;
  createdAt: string;
}

function readRaw(): ExperimentPreset[] {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return [];
    const j = JSON.parse(s) as ExperimentPreset[];
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

function writeRaw(list: ExperimentPreset[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function listExperimentPresets(): ExperimentPreset[] {
  return readRaw().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveExperimentPreset(name: string, config: ApiKeyConfig): ExperimentPreset {
  const list = readRaw();
  const preset: ExperimentPreset = {
    id: uuidv4(),
    name: name.trim() || "Unnamed",
    config: normalizeApiConfig(config),
    createdAt: new Date().toISOString(),
  };
  list.push(preset);
  writeRaw(list);
  return preset;
}

export function deleteExperimentPreset(id: string) {
  writeRaw(readRaw().filter((p) => p.id !== id));
}
