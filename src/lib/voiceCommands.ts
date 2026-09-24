/** Voice command routing: "open X" → app tab, everything else → chat task. No React. */

/** App tabs the voice commander can open. */
export const VOICE_TAB_ROUTES: Array<{ route: string; label: string; keys: string[] }> = [
  { route: "/chat", label: "Chat", keys: ["chat", "conversation", "home"] },
  { route: "/projects", label: "Projects", keys: ["project", "projects"] },
  { route: "/files", label: "Files", keys: ["file", "files", "folder", "folders"] },
  { route: "/labs", label: "Research", keys: ["research", "library", "lab", "labs", "papers"] },
  { route: "/documents", label: "Documents", keys: ["document", "documents"] },
  { route: "/notebook", label: "Editor", keys: ["editor", "notebook", "latex"] },
  { route: "/tasks", label: "Tasks", keys: ["task", "tasks", "activity"] },
  { route: "/diagnostics", label: "Diagnostics", keys: ["diagnostic", "diagnostics", "status", "health"] },
  { route: "/benchmark", label: "Benchmark", keys: ["benchmark"] },
  { route: "/settings", label: "Settings", keys: ["setting", "settings", "preferences"] },
  { route: "/setup", label: "Setup", keys: ["setup", "provider", "providers", "integration", "integrations"] },
  { route: "/agent", label: "Agent view", keys: ["agent"] },
];

const NAV_VERBS = /^(open|go to|goto|show|navigate to|switch to|take me to|launch)\b/i;

/**
 * Parse a voice transcript as an app command. Returns a route when the user
 * wants a tab opened, otherwise null (caller sends it to chat as a task).
 */
export function parseVoiceCommand(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/[?.!]+$/, "");
  if (!t) return null;
  const m = t.match(NAV_VERBS);
  const rest = (m ? t.slice(m[0].length) : t).trim().replace(/^(the|my|app)\b\s*/, "").trim();
  // Bare tab names ("tasks", "projects") also count; anything longer without
  // a nav verb is a real prompt, not navigation.
  const navigating = Boolean(m) || rest.split(/\s+/).length === 1;
  if (!navigating) return null;
  for (const tab of VOICE_TAB_ROUTES) {
    if (tab.keys.some((k) => rest === k || rest.startsWith(`${k} `) || rest.endsWith(` ${k}`) || rest.includes(` ${k} `))) {
      return tab.route;
    }
  }
  return null;
}

export function voiceTabLabel(route: string): string {
  return VOICE_TAB_ROUTES.find((x) => x.route === route)?.label ?? route;
}
