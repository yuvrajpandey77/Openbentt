export type DetectedExternalAgent = {
  id: string;
  name: string;
  available: boolean;
  path: string | null;
  version: string | null;
  kind: "agent" | "assistant";
};

type DetectResult = { ok: boolean; agents: DetectedExternalAgent[]; message?: string };

export async function detectExternalAgents(): Promise<DetectResult> {
  const api = window.openbenttDesktop as
    | { detectExternalAgents?: () => Promise<DetectResult> }
    | undefined;
  if (api?.detectExternalAgents) {
    return api.detectExternalAgents();
  }
  // Web: we cannot probe host PATH — report OpenCode layer only via other APIs.
  return { ok: true, agents: [] };
}
