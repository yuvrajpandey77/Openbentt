import type { LocalInferenceProfile } from "@/types/chat";

/**
 * Keep system block + the tail of the conversation; budget is approximate character count.
 * Browser WASM SLMs are slow with long context — keep budgets tight for responsive chat.
 */
export function budgetCharsForLocalProfile(p: LocalInferenceProfile): number {
  switch (p) {
    case "eco":
      return 2_500;
    case "balanced":
      return 6_000;
    case "performance":
    default:
      return 12_000;
  }
}

export function trimApiMessagesForLocal(
  messages: Array<{ role: string; content: unknown }>,
  profile: LocalInferenceProfile
): Array<{ role: string; content: unknown }> {
  const cap = budgetCharsForLocalProfile(profile);
  if (cap >= 200_000) return messages;

  const out: Array<{ role: string; content: unknown }> = [];
  const systems = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");

  const asLen = (m: { content: unknown }) => {
    const c = m.content;
    if (typeof c === "string") return c.length;
    return JSON.stringify(c).length;
  };

  for (const s of systems) out.push(s);

  let used = out.reduce((a, m) => a + asLen(m), 0);
  const tail: typeof rest = [];
  for (let i = rest.length - 1; i >= 0; i--) {
    const m = rest[i]!;
    const l = asLen(m);
    if (used + l > cap && tail.length > 0) break;
    used += l;
    tail.push(m);
  }
  tail.reverse();
  for (const m of tail) out.push(m);

  return out;
}
