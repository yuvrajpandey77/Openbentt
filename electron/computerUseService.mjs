/**
 * Computer Use capability (Electron main only).
 *
 * Observe (screenshot) → act (bounded xdotool verbs) → observe → verify.
 * Same ONE actionStore authority: user-initiated acts (button clicks) run
 * directly but logged; task-initiated acts require propose→approve→consume.
 * Renderer never touches the desktop; all verbs validated + bounded.
 */
import { execFile, execSync } from "node:child_process";
import { createLogger } from "./log.mjs";

const log = createLogger("computerUse");

const MAX_TEXT_CHARS = 500;
const SCREENSHOT_W = 1280;
const ACT_TIMEOUT_MS = 30000;

/** Risk mapping per spec §16 (stored on the approval). */
const ACTION_RISK = {
  screenshot: "LOW",
  inspect: "LOW",
  click: "MEDIUM",
  type: "MEDIUM",
  scroll: "MEDIUM",
  key: "MEDIUM",
  open: "MEDIUM",
  drag: "HIGH",
};

const KEY_ALLOWLIST = new Set([
  "Return", "Escape", "Tab", "BackSpace", "Delete",
  "Left", "Right", "Up", "Down", "Home", "End", "Page_Up", "Page_Down",
  "F5", "F11", "ctrl+s", "ctrl+c", "ctrl+v", "ctrl+f", "ctrl+l", "ctrl+w", "ctrl+t",
  "alt+Left", "alt+Right", "super_L",
]);

const OPEN_APP_ALLOWLIST = new Set([
  "firefox", "google-chrome", "chromium", "code", "evince", "okular",
  "xdg-open", "gnome-terminal", "nautilus", "gimp", "libreoffice",
]);

function hasBinary(name) {
  try {
    execSync(`command -v ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

let cachedCaps = null;
export function probeCapabilities() {
  if (cachedCaps) return cachedCaps;
  cachedCaps = {
    screenshot: true, // desktopCapturer (Electron built-in), verified at call time
    act: hasBinary("xdotool"),
    open: hasBinary("xdg-open"),
    platform: process.platform,
  };
  return cachedCaps;
}

const num = (v, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error("Out of range");
  return Math.round(n);
};

function cleanText(t) {
  const s = String(t ?? "").slice(0, MAX_TEXT_CHARS);
  if (/[\0]/.test(s)) throw new Error("Invalid text");
  return s;
}

export async function takeScreenshot() {
  // Lazy import keeps this module testable under plain node.
  const { desktopCapturer } = await import("electron");
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: SCREENSHOT_W, height: Math.round((SCREENSHOT_W * 9) / 16) },
  });
  if (!sources.length) throw new Error("No screens available");
  const shot = sources[0].thumbnail.toDataURL();
  if (!shot || shot.length < 100) throw new Error("Screenshot capture failed");
  // Bound: ~1.5MB dataURL max.
  if (shot.length > 2_000_000) throw new Error("Screenshot too large");
  return { dataUrl: shot, displayId: sources[0].display_id ?? null, at: new Date().toISOString() };
}

function xdotool(args) {
  return new Promise((resolve) => {
    execFile("xdotool", args, { timeout: ACT_TIMEOUT_MS, maxBuffer: 512 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      resolve({
        code: err && !err.killed ? (err.code ?? 1) : err?.killed ? null : 0,
        timedOut: Boolean(err?.killed),
        output: `${stdout ?? ""}\n${stderr ?? ""}`.slice(0, 4000),
      });
    });
  });
}

/**
 * Execute one validated act verb. Throws on unknown/unavailable/denied.
 * Returns { result, before?, after? } — screenshots bookend mutating acts
 * for observe→act→observe verification.
 */
export async function computerAct(action, params = {}, opts = {}) {
  const caps = probeCapabilities();
  const mutating = ["click", "type", "scroll", "key", "open", "drag"].includes(action);
  let before = null;
  if (mutating && opts.verify !== false) {
    try {
      before = (await takeScreenshot()).dataUrl;
    } catch { /* verification best-effort */ }
  }
  let result;
  switch (action) {
    case "click": {
      if (!caps.act) throw new Error("Desktop control unavailable (xdotool missing)");
      const x = num(params.x, 0, 10000);
      const y = num(params.y, 0, 10000);
      const button = params.button === 3 ? "3" : params.button === 2 ? "2" : "1";
      const r = await xdotool(["mousemove", String(x), String(y), "click", button]);
      result = { message: `Clicked (${x}, ${y})`, ...r };
      break;
    }
    case "type": {
      if (!caps.act) throw new Error("Desktop control unavailable (xdotool missing)");
      const text = cleanText(params.text);
      if (!text) throw new Error("Empty text");
      const r = await xdotool(["type", "--clearmodifiers", "--", text]);
      result = { message: `Typed ${text.length} chars`, ...r };
      break;
    }
    case "key": {
      if (!caps.act) throw new Error("Desktop control unavailable (xdotool missing)");
      const key = String(params.key ?? "");
      if (!KEY_ALLOWLIST.has(key)) throw new Error("Key not allowed");
      const r = await xdotool(["key", "--clearmodifiers", key]);
      result = { message: `Pressed ${key}`, ...r };
      break;
    }
    case "scroll": {
      if (!caps.act) throw new Error("Desktop control unavailable (xdotool missing)");
      const dir = params.direction === "down" ? "5" : "4";
      const amount = num(params.amount ?? 3, 1, 10);
      const r = await xdotool(["click", "--repeat", String(amount), "--delay", "40", dir]);
      result = { message: `Scrolled ${params.direction === "down" ? "down" : "up"}`, ...r };
      break;
    }
    case "drag": {
      if (!caps.act) throw new Error("Desktop control unavailable (xdotool missing)");
      const x1 = num(params.x1, 0, 10000);
      const y1 = num(params.y1, 0, 10000);
      const x2 = num(params.x2, 0, 10000);
      const y2 = num(params.y2, 0, 10000);
      const r = await xdotool(["mousemove", String(x1), String(y1), "mousedown", "1", "mousemove", String(x2), String(y2), "mouseup", "1"]);
      result = { message: `Dragged (${x1}, ${y1}) → (${x2}, ${y2})`, ...r };
      break;
    }
    case "open": {
      // Launch an allowlisted app; operand must be https URL or nothing.
      const app = String(params.app ?? "");
      if (!OPEN_APP_ALLOWLIST.has(app)) throw new Error("Application not allowed");
      const operand = params.operand ? String(params.operand).slice(0, 2000) : null;
      if (operand && !/^https:\/\/[^\s]+$/i.test(operand)) throw new Error("Operand must be an https URL");
      const r = await xdotool([]);
      void r;
      const res = await new Promise((resolve) => {
        const child = execFile(app, operand ? [operand] : [], { timeout: 15000, windowsHide: true }, (err) => {
          resolve({ code: err ? (err.code ?? 1) : 0 });
        });
        // Detach: app launch success = process spawned, not exit code.
        setTimeout(() => {
          try {
            if (!child.killed && child.exitCode === null) {
              child.unref?.();
              resolve({ code: 0, detached: true });
            }
          } catch { /* noop */ }
        }, 2500);
      });
      result = { message: `Opened ${app}${operand ? ` (${operand})` : ""}`, ...res };
      break;
    }
    default:
      throw new Error(`Unknown computer action: ${String(action).slice(0, 40)}`);
  }
  let after = null;
  if (mutating && opts.verify !== false) {
    try {
      after = (await takeScreenshot()).dataUrl;
    } catch { /* best effort */ }
  }
  log.info("computer act", { action, code: result.code });
  return { result, before, after };
}

export function actionRisk(action) {
  return ACTION_RISK[action] ?? "HIGH";
}

/* ---------------- IPC (propose/confirm shares actionStore with everything) ---------------- */

const COMPUTER_TOOL_PREFIX = "computer.";

function assertPayload(p) {
  if (!p || typeof p !== "object") throw new Error("Invalid payload");
  return p;
}

export function registerComputerUseIpc(ipcMain, app) {
  void app;
  ipcMain.handle("computer:capabilities", async () => probeCapabilities());
  ipcMain.handle("computer:screenshot", async () => takeScreenshot());
  // Direct (user-gesture) execution for LOW/MEDIUM: logged + bounded, the
  // click IS the approval. HIGH acts and ALL task-initiated acts must use
  // request/confirm — never automatic.
  ipcMain.handle("computer:act", async (_e, payload) => {
    const p = assertPayload(payload);
    if (typeof p.action !== "string") throw new Error("Invalid action");
    const risk = actionRisk(p.action);
    if (risk !== "LOW" && risk !== "MEDIUM") {
      throw new Error("HIGH-risk computer actions require explicit approval (use request/confirm).");
    }
    return computerAct(p.action, p.params ?? {});
  });
  ipcMain.handle("computer:request", async (_e, payload) => {
    const p = assertPayload(payload);
    if (typeof p.action !== "string" || !ACTION_RISK[p.action]) throw new Error("Invalid action");
    const { proposeAction, listApprovals } = await import("./actionStore.mjs");
    const { actionFingerprint, newIdempotencyKey } = await import("../src/lib/actions/actionCore.mjs");
    const input = { action: p.action, params: p.params ?? {}, taskId: p.taskId ?? null, idempotencyKey: newIdempotencyKey() };
    const fingerprint = actionFingerprint(`${COMPUTER_TOOL_PREFIX}${p.action}`, undefined, input);
    const existing = listApprovals(app, { status: "proposed" }).find(
      (a) => a.fingerprint === fingerprint && a.toolId === `${COMPUTER_TOOL_PREFIX}${p.action}`
    );
    const approval = existing ?? proposeAction(app, {
      toolId: `${COMPUTER_TOOL_PREFIX}${p.action}`,
      projectId: undefined,
      runId: p.taskId ?? null,
      requestId: `computer_${Date.now()}`,
      input,
      risk: actionRisk(p.action),
    });
    return { approvalId: approval.id, risk: approval.risk ?? actionRisk(p.action), status: "needs-approval" };
  });
  ipcMain.handle("computer:confirm", async (_e, payload) => {
    const p = assertPayload(payload);
    if (typeof p.approvalId !== "string" || !p.approvalId) throw new Error("Invalid approval");
    const { approveAction, rejectAction, consumeApprovalForExecution, getApproval } =
      await import("./actionStore.mjs");
    if (p.decision !== "allow") {
      try {
        rejectAction(app, p.approvalId);
      } catch { /* settled */ }
      return { status: "rejected" };
    }
    const approval = getApproval(app, p.approvalId);
    if (!approval) throw new Error("Approval not found");
    approveAction(app, p.approvalId);
    consumeApprovalForExecution(app, p.approvalId, {
      toolId: approval.toolId,
      projectId: approval.projectId,
      runId: approval.runId,
      input: approval.input,
    });
    const out = await computerAct(approval.input.action, approval.input.params ?? {});
    return { status: "done", ...out };
  });
}
