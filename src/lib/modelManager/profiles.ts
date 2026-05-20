import type { ModelProfile } from "./types";
import type { ModelTask } from "@/lib/modelRouting/tasks";

export const MODEL_PROFILES: ModelProfile[] = [
  {
    id: "eco",
    name: "Eco",
    description: "Smallest models, lowest RAM/VRAM. Best for quick tasks.",
    preferredQuant: "Q4",
    tasks: ["chat_lightweight", "embedding"],
    tier: "tiny",
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "Default mix — compact/small chat models for daily use.",
    preferredQuant: "Q4",
    tasks: ["chat_general", "chat_drafting", "code_assist"],
    tier: "small",
  },
  {
    id: "quality",
    name: "Quality",
    description: "Larger GGUF / on-device models for drafting and synthesis.",
    preferredQuant: "Q5",
    tasks: ["chat_drafting", "chat_synthesis"],
    tier: "medium",
  },
  {
    id: "synthesis",
    name: "Synthesis",
    description: "Prefer largest available local model for long-form synthesis.",
    preferredQuant: "Q8",
    tasks: ["chat_synthesis"],
    tier: "large",
  },
];

export function profileForTask(task: ModelTask): ModelProfile {
  const match = MODEL_PROFILES.find((p) => p.tasks.includes(task));
  return match ?? MODEL_PROFILES[1]!;
}

export function profileById(id: string): ModelProfile | null {
  return MODEL_PROFILES.find((p) => p.id === id) ?? null;
}
