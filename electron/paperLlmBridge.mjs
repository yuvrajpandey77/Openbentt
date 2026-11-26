/**
 * Local OpenAI-compatible bridge for PaperOrchestra.
 *
 * Paper's Python agents speak HTTP chat.completions. Chat already answers
 * via `opencode run` with NO OpenRouter key in our process. This bridge
 * exposes that same path on loopback so Paper uses the user's OpenCode /
 * agent models instead of scraping OpenRouter keys out of auth.json.
 */
import http from "node:http";
import { randomUUID } from "node:crypto";

/** @type {http.Server | null} */
let server = null;
/** @type {number | null} */
let port = null;
/** @type {string} */
let defaultModel = "opencode/big-pickle";
/** @type {import('electron').App | null} */
let boundApp = null;

const PAPER_ASK_MAX_CHARS = 120_000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) {
        reject(new Error("Request too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(raw),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(raw);
}

function messagesToPrompt(messages) {
  if (!Array.isArray(messages) || !messages.length) return "";
  const parts = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    const role = String(m.role ?? "user");
    let content = m.content;
    if (Array.isArray(content)) {
      content = content
        .map((c) => {
          if (typeof c === "string") return c;
          if (c && typeof c === "object" && typeof c.text === "string") return c.text;
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }
    if (typeof content !== "string") content = String(content ?? "");
    if (!content.trim()) continue;
    if (role === "system" || role === "developer") {
      parts.push(`System:\n${content.trim()}`);
    } else if (role === "assistant") {
      parts.push(`Assistant:\n${content.trim()}`);
    } else {
      parts.push(`User:\n${content.trim()}`);
    }
  }
  parts.push(
    "Respond as the Assistant. When the user asks for JSON, return ONLY valid JSON (no markdown fences)."
  );
  return parts.join("\n\n").slice(0, PAPER_ASK_MAX_CHARS);
}

async function pickDefaultModel() {
  try {
    const { listOpenCodeModels } = await import("./opencodeService.mjs");
    const res = await listOpenCodeModels();
    const models = Array.isArray(res?.models) ? res.models : [];
    const free =
      models.find((m) => /^opencode\//i.test(m.id) && /free|pickle|flint|beam|nemotron/i.test(m.id)) ||
      models.find((m) => /^opencode\//i.test(m.id));
    if (free?.id) return free.id;
  } catch {
    /* keep default */
  }
  return "opencode/big-pickle";
}

async function handleChatCompletions(req, res) {
  const raw = await readBody(req);
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    json(res, 400, { error: { message: "Invalid JSON body" } });
    return;
  }
  const prompt = messagesToPrompt(body.messages);
  if (!prompt.trim()) {
    json(res, 400, { error: { message: "Empty messages" } });
    return;
  }
  let model =
    typeof body.model === "string" && body.model.trim() ? body.model.trim().slice(0, 200) : defaultModel;
  // Gemini-named Paper defaults → OpenCode free model (never OpenRouter).
  if (/gemini|imagen|gpt-4o|openrouter\/free|llama-3\.3.*:free/i.test(model)) {
    model = defaultModel;
  }
  try {
    const { askOpenCode } = await import("./opencodeService.mjs");
    const result = await askOpenCode(boundApp, {
      message: prompt,
      model,
      title: "PaperOrchestra",
      askRequestId: `ask_paper_${Date.now().toString(36)}`,
      maxPromptChars: PAPER_ASK_MAX_CHARS,
    });
    const text = String(result?.text ?? "");
    const id = `chatcmpl_paper_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    json(res, 200, {
      id,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: result?.model || model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: text },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    json(res, 502, { error: { message: msg.slice(0, 800), type: "opencode_bridge_error" } });
  }
}

async function handleModels(_req, res) {
  try {
    const { listOpenCodeModels } = await import("./opencodeService.mjs");
    const listed = await listOpenCodeModels();
    const models = (Array.isArray(listed?.models) ? listed.models : []).map((m) => ({
      id: m.id,
      object: "model",
      owned_by: "opencode",
    }));
    if (!models.some((m) => m.id === defaultModel)) {
      models.unshift({ id: defaultModel, object: "model", owned_by: "opencode" });
    }
    json(res, 200, { object: "list", data: models });
  } catch {
    json(res, 200, {
      object: "list",
      data: [{ id: defaultModel, object: "model", owned_by: "opencode" }],
    });
  }
}

/**
 * Ensure a loopback OpenAI-compat server that forwards to OpenCode.
 * @param {import('electron').App} app
 * @returns {Promise<{ baseUrl: string, model: string, source: string }>}
 */
export async function ensurePaperLlmBridge(app) {
  boundApp = app;
  defaultModel = await pickDefaultModel();
  if (server && port) {
    return { baseUrl: `http://127.0.0.1:${port}/v1`, model: defaultModel, source: "opencode-bridge" };
  }
  const { detectOpenCode } = await import("./opencodeService.mjs");
  const det = await detectOpenCode();
  if (!det?.installed) {
    throw new Error("OpenCode is not installed — Paper needs the same agent runtime as chat.");
  }

  await new Promise((resolve, reject) => {
    server = http.createServer(async (req, res) => {
      try {
        if (req.method === "OPTIONS") {
          res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          });
          res.end();
          return;
        }
        const url = String(req.url ?? "").split("?")[0];
        if (req.method === "GET" && (url === "/v1/models" || url === "/models")) {
          await handleModels(req, res);
          return;
        }
        if (req.method === "POST" && (url === "/v1/chat/completions" || url === "/chat/completions")) {
          await handleChatCompletions(req, res);
          return;
        }
        if (req.method === "GET" && (url === "/" || url === "/health")) {
          json(res, 200, { ok: true, service: "openbentt-paper-llm-bridge", model: defaultModel });
          return;
        }
        json(res, 404, { error: { message: `Not found: ${url}` } });
      } catch (e) {
        json(res, 500, { error: { message: e instanceof Error ? e.message : String(e) } });
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      port = typeof addr === "object" && addr ? addr.port : null;
      if (!port) {
        reject(new Error("Failed to bind Paper LLM bridge"));
        return;
      }
      resolve();
    });
  });

  return { baseUrl: `http://127.0.0.1:${port}/v1`, model: defaultModel, source: "opencode-bridge" };
}

export function stopPaperLlmBridge() {
  try {
    server?.close();
  } catch {
    /* ignore */
  }
  server = null;
  port = null;
}
