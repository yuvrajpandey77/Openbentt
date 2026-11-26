/**
 * Resolve LLM credentials for PaperOrchestra child env.
 *
 * Precedence (matches chat):
 *   1. Gemini vault (optional quality upgrade)
 *   2. Local OpenCode bridge (same `opencode run` path as chat — no OpenRouter key)
 *   3. OmniRoute / vault OpenAI-compat (only if OpenCode unavailable)
 *
 * Never logs secret values. Never prefers scraping OpenRouter keys out of
 * OpenCode auth.json — that bypasses the agent runtime the user configured.
 */
import { readVaultSecret } from "./secretVault.mjs";

/**
 * Mutates `env` with credentials. Returns a short status for progress UI.
 * @param {import('electron').App} app
 * @param {Record<string, string>} env
 * @param {Record<string, string>} [inject]
 */
export async function applyPaperOrchestraCredentials(app, env, inject = {}) {
  const vaultGemini = (await readVaultSecret(app, "gemini_api_key")).trim();
  const vaultOpenAi = (await readVaultSecret(app, "openai_api_key")).trim();
  const vaultProvider = (await readVaultSecret(app, "provider_api_key")).trim();
  const vaultOmni = (await readVaultSecret(app, "omniroute_local_key")).trim();
  const vaultS2 = (await readVaultSecret(app, "semantic_scholar_api_key")).trim();

  if (vaultGemini) env.GEMINI_API_KEY = vaultGemini;
  if (vaultOpenAi) env.OPENAI_API_KEY = vaultOpenAi;
  if (vaultS2) env.SEMANTIC_SCHOLAR_API_KEY = vaultS2;

  for (const [k, v] of Object.entries(inject)) {
    if (
      /^(GEMINI_API_KEY|OPENAI_API_KEY|SEMANTIC_SCHOLAR_API_KEY|VERTEX_AI_PROJECT|VERTEX_AI_LOCATION|SMTP_EMAIL|SMTP_PASSWORD|OPENAI_BASE_URL|OPENBENTT_PROVIDER_BASE_URL|OPENBENTT_PAPER_LLM_BRIDGE|OPENBENTT_PAPER_BRIDGE_MODEL)$/.test(
        k
      ) &&
      typeof v === "string" &&
      v.trim()
    ) {
      env[k] = v.trim();
    }
  }

  const hasGemini =
    Boolean(String(env.GEMINI_API_KEY ?? "").trim()) ||
    Boolean(String(env.VERTEX_AI_PROJECT ?? "").trim());

  if (hasGemini) {
    return {
      source: "gemini",
      hasGemini: true,
      hasOpenAiCompat: Boolean(String(env.OPENAI_API_KEY ?? "").trim()),
      bridgeModel: null,
    };
  }

  // Primary path: same OpenCode agent runtime chat uses (no OpenRouter URL).
  try {
    const { ensurePaperLlmBridge } = await import("./paperLlmBridge.mjs");
    const bridge = await ensurePaperLlmBridge(app);
    env.OPENAI_BASE_URL = bridge.baseUrl;
    env.OPENBENTT_PROVIDER_BASE_URL = bridge.baseUrl;
    env.OPENAI_API_KEY = env.OPENAI_API_KEY || "openbentt-opencode";
    env.OPENBENTT_PAPER_LLM_BRIDGE = "openai";
    env.OPENBENTT_PAPER_BRIDGE_MODEL = env.OPENBENTT_PAPER_BRIDGE_MODEL || bridge.model;
    // Prefer free OpenCode ids for Paper's Gemini-named defaults.
    if (!String(env.OPENBENTT_PAPER_BRIDGE_MODEL ?? "").startsWith("opencode/")) {
      env.OPENBENTT_PAPER_BRIDGE_MODEL = bridge.model;
    }
    return {
      source: "opencode-bridge",
      hasGemini: false,
      hasOpenAiCompat: true,
      bridgeModel: env.OPENBENTT_PAPER_BRIDGE_MODEL,
    };
  } catch (bridgeErr) {
    // Fall through to OmniRoute / vault only when OpenCode bridge cannot start.
    void bridgeErr;
  }

  // Secondary: local OmniRoute gateway (still not OpenRouter.com).
  try {
    const { startOmniRoute, getOmniRouteStatus } = await import("./omniRouteService.mjs");
    let omni = getOmniRouteStatus();
    if (omni.status !== "READY") {
      omni = await startOmniRoute(app);
    }
    if (omni?.status === "READY" && omni.baseUrl) {
      env.OPENAI_BASE_URL = omni.baseUrl;
      env.OPENBENTT_PROVIDER_BASE_URL = omni.baseUrl;
      env.OPENAI_API_KEY = String(env.OPENAI_API_KEY ?? "").trim() || vaultOmni || vaultProvider || vaultOpenAi || "openbentt-local";
      env.OPENBENTT_PAPER_LLM_BRIDGE = "openai";
      env.OPENBENTT_PAPER_BRIDGE_MODEL = env.OPENBENTT_PAPER_BRIDGE_MODEL || "opencode/big-pickle";
      return {
        source: "omniroute",
        hasGemini: false,
        hasOpenAiCompat: true,
        bridgeModel: env.OPENBENTT_PAPER_BRIDGE_MODEL,
      };
    }
  } catch {
    /* continue */
  }

  if (vaultOpenAi || vaultProvider) {
    env.OPENAI_API_KEY = vaultOpenAi || vaultProvider;
    env.OPENBENTT_PAPER_LLM_BRIDGE = env.OPENBENTT_PAPER_LLM_BRIDGE || "openai";
    return {
      source: "vault-openai",
      hasGemini: false,
      hasOpenAiCompat: true,
      bridgeModel: String(env.OPENBENTT_PAPER_BRIDGE_MODEL ?? "").trim() || null,
    };
  }

  return {
    source: "none",
    hasGemini: false,
    hasOpenAiCompat: false,
    bridgeModel: null,
  };
}

/** @deprecated kept for unit tests that imported OpenCode auth scraping */
export function readOpenCodeAuthKeys() {
  return null;
}
