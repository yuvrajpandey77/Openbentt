/**
 * Phase 5 — Shared tool core (single source of truth).
 * Plain JS so the renderer (via TS facades) and Electron (toolStore.mjs)
 * share categories, capabilities, permissions, risk, limits, schema
 * validation, policy evaluation, audit sanitization, and the bounded
 * calculator with zero divergence. Mirrors the knowledgeCore.mjs /
 * connectorCore.mjs precedent.
 *
 * Deterministic only. No network, no LLM, no secrets, no Node APIs here.
 */

export const TOOL_CATEGORIES = [
  "READ",
  "SEARCH",
  "KNOWLEDGE",
  "DOCUMENT",
  "CONNECTOR",
  "EXPORT",
  "UTILITY",
  "WRITE",
];

export const TOOL_CAPABILITIES = [
  "knowledge.read",
  "knowledge.search",
  "knowledge.traverse",
  "document.read",
  "document.search",
  "connector.read",
  "connector.search",
  "connector.preview",
  "connector.import",
  "project.read",
  "export.create",
  "utility.compute",
];

export const TOOL_PERMISSIONS = [
  "READ_ONLY",
  "USER_CONFIRMATION",
  "USER_INITIATED_WRITE",
  "SYSTEM_INTERNAL",
];

export const TOOL_RISKS = ["LOW", "MEDIUM", "HIGH"];

export const TOOL_EXECUTION_MODES = ["local", "backend"];

export const TOOL_LIMITS = {
  maxInputChars: 20000,
  maxInputKeys: 32,
  maxStringChars: 2000,
  maxArrayItems: 200,
  maxQueryChars: 500,
  maxIdChars: 128,
  maxLimit: 100,
  maxDepth: 3,
  maxSnippetChars: 400,
  maxAuditEvents: 2000,
  maxAuditSummaryChars: 2000,
  maxCalcChars: 200,
  maxCalcDigits: 15,
  maxCalcDepth: 32,
  defaultTimeoutMs: 30000,
  maxTimeoutMs: 120000,
};

export const ID_RE_SRC = "^[a-zA-Z0-9_:@.\\-]{1,128}$";
export const SAFE_ID_RE_SRC = "^[a-zA-Z0-9_-]{1,128}$";
export const CONNECTOR_ID_RE_SRC = "^(crossref|zotero)$";

export function fnv1aHex(input) {
  let h = 0x811c9dc5;
  const s = String(input ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (`0000000${(h >>> 0).toString(16)}`).slice(-8);
}

let toolCounter = 0;
export function newRequestId(prefix = "treq") {
  toolCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${toolCounter.toString(36)}`.slice(0, 64);
}

export function newEventId() {
  toolCounter += 1;
  return `taudit_${Date.now().toString(36)}_${toolCounter.toString(36)}`.slice(0, 64);
}

/* ---------------- schema validation (data-driven, both runtimes) ---------------- */

/**
 * Depth/breadth guard for free-form tool outputs (handlers already bound
 * their results; this is defense in depth, not a size contract).
 */
export function boundedJson(v, depth) {
  if (depth > 8) return { ok: false };
  if (Array.isArray(v)) {
    if (v.length > 2000) return { ok: false };
    for (const e of v) {
      if (!boundedJson(e, depth + 1).ok) return { ok: false };
    }
    return { ok: true };
  }
  if (v !== null && typeof v === "object") {
    const keys = Object.keys(v);
    if (keys.length > 500) return { ok: false };
    for (const k of keys) {
      if (!boundedJson(v[k], depth + 1).ok) return { ok: false };
    }
    return { ok: true };
  }
  if (typeof v === "string" && v.length > 500000) return { ok: false };
  return { ok: true };
}

/**
 * Field schema: { type: string|string[], required?, maxLength?, maxItems?,
 * enum?, pattern?, minimum?, maximum?, fields? (nested object), items? (array item schema) }.
 * Unknown input keys are REJECTED (strict v1 contract).
 * Returns { ok:true, value } (sanitized copy) or { ok:false, error }.
 */
export function validateAgainstSchema(schema, input, path = "input") {
  if (!schema || typeof schema !== "object") return { ok: false, error: `${path}: bad schema` };
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: `${path} must be an object` };
  }
  const keys = Object.keys(input);
  if (keys.length > TOOL_LIMITS.maxInputKeys) {
    return { ok: false, error: `${path} exceeds ${TOOL_LIMITS.maxInputKeys} keys` };
  }
  const fields = schema.fields ?? {};
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(fields, k)) {
      return { ok: false, error: `${path}.${k} is not a known field` };
    }
  }
  const out = {};
  for (const [name, rule] of Object.entries(fields)) {
    const v = input[name];
    if (v === undefined || v === null) {
      if (rule.required) return { ok: false, error: `${path}.${name} is required` };
      continue;
    }
    const checked = checkValue(v, rule, `${path}.${name}`);
    if (!checked.ok) return checked;
    out[name] = checked.value;
  }
  return { ok: true, value: out };
}

function checkValue(v, rule, path) {
  const types = Array.isArray(rule.type) ? rule.type : [rule.type ?? "string"];
  const jsType = Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
  if (!types.includes(jsType)) {
    return { ok: false, error: `${path} must be ${types.join("|")}` };
  }
  if (jsType === "string") {
    if (rule.maxLength !== undefined && v.length > rule.maxLength) {
      return { ok: false, error: `${path} exceeds ${rule.maxLength} characters` };
    }
    if (rule.minLength !== undefined && v.length < rule.minLength) {
      return { ok: false, error: `${path} is too short` };
    }
    if (rule.enum && !rule.enum.includes(v)) {
      return { ok: false, error: `${path} must be one of ${rule.enum.join(", ")}` };
    }
    if (rule.pattern) {
      const re = new RegExp(rule.pattern);
      if (!re.test(v)) return { ok: false, error: `${path} has an invalid format` };
    }
    return { ok: true, value: v };
  }
  if (jsType === "number") {
    if (!Number.isFinite(v)) return { ok: false, error: `${path} must be finite` };
    if (rule.minimum !== undefined && v < rule.minimum) return { ok: false, error: `${path} is below minimum` };
    if (rule.maximum !== undefined && v > rule.maximum) return { ok: false, error: `${path} is above maximum` };
    if (rule.integer && !Number.isInteger(v)) return { ok: false, error: `${path} must be an integer` };
    return { ok: true, value: v };
  }
  if (jsType === "boolean") return { ok: true, value: v };
  if (jsType === "array") {
    if (rule.maxItems !== undefined && v.length > rule.maxItems) {
      return { ok: false, error: `${path} exceeds ${rule.maxItems} items` };
    }
    if (!rule.items) {
      const b = boundedJson(v, 0);
      if (!b.ok) return { ok: false, error: `${path} output too large` };
      return { ok: true, value: v.slice() };
    }
    const out = [];
    for (let i = 0; i < v.length; i++) {
      const checked = checkValue(v[i], rule.items, `${path}[${i}]`);
      if (!checked.ok) return checked;
      out.push(checked.value);
    }
    return { ok: true, value: out };
  }
  if (jsType === "object") {
    if (rule.freeform) {
      const b = boundedJson(v, 0);
      if (!b.ok) return { ok: false, error: `${path} output too large` };
      return { ok: true, value: v };
    }
    if (!rule.fields) return { ok: false, error: `${path} nested objects are not allowed` };
    return validateAgainstSchema(rule, v, path);
  }
  return { ok: false, error: `${path} has an unsupported type` };
}

/* ---------------- policy engine (deterministic) ---------------- */

/**
 * evaluatePolicy(tool, context) -> { decision: ALLOW|DENY|CONFIRM, reason }.
 * tool: { id, permission, risk, capabilities[] }.
 * context: { userInitiated?, userConfirmed?, confirmedToolId? }.
 */
export function evaluatePolicy(tool, context) {
  if (!tool || typeof tool.id !== "string") return { decision: "DENY", reason: "unknown tool" };
  const caps = Array.isArray(tool.capabilities) ? tool.capabilities : [];
  for (const c of caps) {
    if (!TOOL_CAPABILITIES.includes(c)) return { decision: "DENY", reason: `unknown capability: ${c}` };
  }
  if (!TOOL_PERMISSIONS.includes(tool.permission)) return { decision: "DENY", reason: "unknown permission" };
  if (!TOOL_RISKS.includes(tool.risk)) return { decision: "DENY", reason: "unknown risk" };
  const ctx = context ?? {};
  switch (tool.permission) {
    case "READ_ONLY":
      return { decision: "ALLOW", reason: "read-only" };
    case "SYSTEM_INTERNAL":
      return ctx.systemInternal === true
        ? { decision: "ALLOW", reason: "system internal" }
        : { decision: "DENY", reason: "system internal only" };
    case "USER_INITIATED_WRITE":
      if (ctx.userInitiated !== true) return { decision: "DENY", reason: "requires user initiation" };
      if (tool.risk !== "LOW" && ctx.userConfirmed !== true) {
        return { decision: "CONFIRM", reason: "confirmation required" };
      }
      return { decision: "ALLOW", reason: "user initiated" };
    case "USER_CONFIRMATION":
      if (ctx.userConfirmed === true && (ctx.confirmedToolId === undefined || ctx.confirmedToolId === tool.id)) {
        return { decision: "ALLOW", reason: "user confirmed" };
      }
      return { decision: "CONFIRM", reason: "confirmation required" };
    default:
      return { decision: "DENY", reason: "unknown permission" };
  }
}

/** Confirmation descriptor rendered by UI before a CONFIRM-gated execution. */
export function buildToolRequest(tool, inputSummary) {
  return {
    toolId: tool.id,
    toolVersion: tool.version,
    summary: `${tool.name}: ${inputSummary}`.slice(0, 500),
    riskLevel: tool.risk,
    requestedCapabilities: [...(tool.capabilities ?? [])],
    affectedResources: [],
    confirmationRequired: tool.permission === "USER_CONFIRMATION"
      || (tool.permission === "USER_INITIATED_WRITE" && tool.risk !== "LOW"),
  };
}

/* ---------------- audit sanitization ---------------- */

const SECRET_KEY_RE = /api[_-]?key|token|secret|password|authorization|cookie|session/i;

function scrubString(s) {
  return String(s ?? "")
    .replace(/(Bearer\s+)[^\s;,"'}]+/gi, "$1[redacted]")
    .replace(/([A-Za-z0-9_-]*(?:api[_-]?key|token|secret|password)[A-Za-z0-9_-]*\s*[:=]\s*)([^\s&;,"'}]+)/gi, "$1[redacted]")
    .slice(0, 500);
}

function scrubValue(v, depth = 0) {
  if (depth > 4) return "[max depth]";
  if (v === null || v === undefined) return v;
  if (typeof v === "string") {
    const s = scrubString(v);
    return s.length > 200 ? `${s.slice(0, 80)}…[${s.length} chars]` : s;
  }
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.slice(0, 20).map((e) => scrubValue(e, depth + 1));
  if (typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v).slice(0, 32)) {
      out[k] = SECRET_KEY_RE.test(k) ? "[redacted]" : scrubValue(val, depth + 1);
    }
    return out;
  }
  return "[unsupported]";
}

/** Bounded, redacted audit summary of tool input (identifiers, no payloads). */
export function summarizeForAudit(input) {
  return scrubValue(input ?? {});
}

/* ---------------- bounded calculator (no interpreter, no eval) ---------------- */

/**
 * Deterministic arithmetic evaluator: numbers, + - * / % ^, parentheses,
 * unary minus, and whitelisted functions sqrt/abs/round/floor/ceil/min/max/pow.
 * Rejects everything else. Caps: expression length, digit runs, paren depth,
 * operand magnitude, iteration budget. Throws Error("calc-error") on misuse.
 */
export function evaluateCalculation(raw) {
  if (typeof raw !== "string") throw new Error("calc-error");
  const expr = raw.trim();
  if (!expr || expr.length > TOOL_LIMITS.maxCalcChars) throw new Error("calc-error");
  if (!/^[0-9+\-*/().,%\s^a-z]*$/.test(expr)) throw new Error("calc-error");
  const lowered = expr.toLowerCase();
  const blocked = ["import", "create", "constructor", "prototype", "__proto__",
    "process", "global", "window", "eval", "function", "require", "this", "=>"];
  for (const b of blocked) {
    if (lowered.includes(b)) throw new Error("calc-error");
  }
  if (/\d{16,}/.test(expr.replace(/\s+/g, ""))) throw new Error("calc-error");
  const tokens = tokenize(expr);
  const parser = { tokens, pos: 0, steps: 0 };
  const value = parseAdd(parser);
  if (parser.pos !== tokens.length) throw new Error("calc-error");
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("calc-error");
  if (Math.abs(value) > 1e15) throw new Error("calc-error");
  return value;
}

const FN1 = {
  sqrt: (x) => { if (x < 0) throw new Error("calc-error"); return Math.sqrt(x); },
  abs: (x) => Math.abs(x),
  round: (x) => Math.round(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
};

function tokenize(expr) {
  const tokens = [];
  let i = 0;
  let depth = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === ",") { tokens.push({ t: "comma" }); i++; continue; }
    if (c === "(") { depth++; if (depth > TOOL_LIMITS.maxCalcDepth) throw new Error("calc-error"); tokens.push({ t: "lp" }); i++; continue; }
    if (c === ")") { depth--; if (depth < 0) throw new Error("calc-error"); tokens.push({ t: "rp" }); i++; continue; }
    if ("+-*/%^".includes(c)) { tokens.push({ t: "op", v: c }); i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const num = Number(expr.slice(i, j));
      if (!Number.isFinite(num)) throw new Error("calc-error");
      tokens.push({ t: "num", v: num });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < expr.length && /[a-zA-Z]/.test(expr[j])) j++;
      const name = expr.slice(i, j).toLowerCase();
      if (name !== "sqrt" && name !== "abs" && name !== "round" && name !== "floor"
        && name !== "ceil" && name !== "min" && name !== "max" && name !== "pow") {
        throw new Error("calc-error");
      }
      tokens.push({ t: "fn", v: name });
      i = j;
      continue;
    }
    throw new Error("calc-error");
  }
  if (depth !== 0) throw new Error("calc-error");
  return tokens;
}

function step(p) {
  p.steps += 1;
  if (p.steps > 10000) throw new Error("calc-error");
}

function parseAdd(p) {
  step(p);
  let v = parseMul(p);
  for (;;) {
    const t = p.tokens[p.pos];
    if (t && t.t === "op" && (t.v === "+" || t.v === "-")) {
      p.pos++;
      const r = parseMul(p);
      v = t.v === "+" ? v + r : v - r;
    } else return v;
  }
}

function parseMul(p) {
  step(p);
  let v = parsePow(p);
  for (;;) {
    const t = p.tokens[p.pos];
    if (t && t.t === "op" && (t.v === "*" || t.v === "/" || t.v === "%")) {
      p.pos++;
      const r = parsePow(p);
      if ((t.v === "/" || t.v === "%") && r === 0) throw new Error("calc-error");
      v = t.v === "*" ? v * r : t.v === "/" ? v / r : v % r;
    } else return v;
  }
}

function parsePow(p) {
  step(p);
  const base = parseUnary(p);
  const t = p.tokens[p.pos];
  if (t && t.t === "op" && t.v === "^") {
    p.pos++;
    const exp = parsePow(p);
    if (Math.abs(exp) > 1000 || Math.abs(base) > 1e6) throw new Error("calc-error");
    const v = Math.pow(base, exp);
    if (!Number.isFinite(v)) throw new Error("calc-error");
    return v;
  }
  return base;
}

function parseUnary(p) {
  step(p);
  const t = p.tokens[p.pos];
  if (t && t.t === "op" && t.v === "-") { p.pos++; return -parseUnary(p); }
  if (t && t.t === "op" && t.v === "+") { p.pos++; return parseUnary(p); }
  return parsePrimary(p);
}

function parsePrimary(p) {
  step(p);
  const t = p.tokens[p.pos];
  if (!t) throw new Error("calc-error");
  if (t.t === "num") { p.pos++; return t.v; }
  if (t.t === "lp") {
    p.pos++;
    const v = parseAdd(p);
    const c = p.tokens[p.pos];
    if (!c || c.t !== "rp") throw new Error("calc-error");
    p.pos++;
    return v;
  }
  if (t.t === "fn") {
    p.pos++;
    const open = p.tokens[p.pos];
    if (!open || open.t !== "lp") throw new Error("calc-error");
    p.pos++;
    const args = [];
    if (p.tokens[p.pos] && p.tokens[p.pos].t !== "rp") {
      args.push(parseAdd(p));
      while (p.tokens[p.pos] && p.tokens[p.pos].t === "comma") {
        p.pos++;
        if (args.length >= 2) throw new Error("calc-error");
        args.push(parseAdd(p));
      }
    }
    const close = p.tokens[p.pos];
    if (!close || close.t !== "rp") throw new Error("calc-error");
    p.pos++;
    if (FN1[t.v]) {
      if (args.length !== 1) throw new Error("calc-error");
      return FN1[t.v](args[0]);
    }
    if (t.v === "min" || t.v === "max") {
      if (args.length !== 2) throw new Error("calc-error");
      return t.v === "min" ? Math.min(args[0], args[1]) : Math.max(args[0], args[1]);
    }
    if (t.v === "pow") {
      if (args.length !== 2) throw new Error("calc-error");
      if (Math.abs(args[1]) > 1000 || Math.abs(args[0]) > 1e6) throw new Error("calc-error");
      const v = Math.pow(args[0], args[1]);
      if (!Number.isFinite(v)) throw new Error("calc-error");
      return v;
    }
    throw new Error("calc-error");
  }
  throw new Error("calc-error");
}

/* ---------------- static tool definitions (single source of truth) ---------------- */
/* Pure data shared by renderer TS and Electron. No functions, no logic. */

const ID = { type: "string", maxLength: 128, pattern: "^[a-zA-Z0-9_:@.\\-]{1,128}$" };
const SAFE_ID = { type: "string", maxLength: 128, pattern: "^[a-zA-Z0-9_-]{1,128}$" };
const QUERY = { type: "string", maxLength: 500, minLength: 1 };
const LIMIT = { type: "number", integer: true, minimum: 1, maximum: 100 };
const OPT_STR = (maxLength) => ({ type: "string", maxLength });
function out(fields) {
  return { fields };
}

export const TOOL_DEFINITIONS = [
  {
    id: "knowledge.search", name: "Search knowledge entities",
    description: "Search knowledge entities by text, type, tag, identifier, or status. Read-only.",
    version: "1", category: "KNOWLEDGE",
    inputSchema: { fields: {
      query: { type: "string", maxLength: 500 },
      entityType: { type: "string", maxLength: 64 },
      tag: OPT_STR(64), identifier: OPT_STR(512), status: { type: "string", enum: ["active", "unresolved", "deprecated", "merged"] },
      projectId: SAFE_ID, limit: LIMIT,
    } },
    outputSchema: out({ entities: { type: "array", maxItems: 100 } }),
    capabilities: ["knowledge.search"], permission: "READ_ONLY", risk: "LOW",
    executionMode: "backend", externalNetwork: false, mutation: false,
  },
  {
    id: "knowledge.get_entity", name: "Get knowledge entity",
    description: "Fetch one knowledge entity with aliases, identifiers, tags, and provenance summary.",
    version: "1", category: "KNOWLEDGE",
    inputSchema: { fields: { entityId: { ...ID, required: true } } },
    outputSchema: out({ entity: { type: "object", required: true, freeform: true } }),
    capabilities: ["knowledge.read"], permission: "READ_ONLY", risk: "LOW",
    executionMode: "backend", externalNetwork: false, mutation: false,
  },
  {
    id: "knowledge.get_relationships", name: "Get relationships",
    description: "List relationships for an entity (depth 1) or bounded traversal (depth 2-3).",
    version: "1", category: "KNOWLEDGE",
    inputSchema: { fields: {
      entityId: { ...ID, required: true },
      direction: { type: "string", enum: ["both", "outgoing", "incoming"] },
      relationshipType: OPT_STR(64), depth: { type: "number", integer: true, minimum: 1, maximum: 3 },
      limit: LIMIT, projectId: SAFE_ID,
    } },
    outputSchema: out({ relationships: { type: "array", maxItems: 500 } }),
    capabilities: ["knowledge.read", "knowledge.traverse"], permission: "READ_ONLY", risk: "LOW",
    executionMode: "backend", externalNetwork: false, mutation: false,
  },
  {
    id: "knowledge.get_evidence", name: "Get evidence",
    description: "Fetch evidence with provenance for an entity or relationship.",
    version: "1", category: "KNOWLEDGE",
    inputSchema: { fields: {
      entityId: ID, relationshipId: ID, limit: LIMIT, projectId: SAFE_ID,
    } },
    outputSchema: out({ evidence: { type: "array", maxItems: 200 } }),
    capabilities: ["knowledge.read"], permission: "READ_ONLY", risk: "LOW",
    executionMode: "backend", externalNetwork: false, mutation: false,
  },
  {
    id: "document.search", name: "Search documents",
    description: "Full-text search over the local document registry with filters.",
    version: "1", category: "DOCUMENT",
    inputSchema: { fields: {
      query: { ...QUERY, required: true },
      projectId: SAFE_ID, sourceType: { type: "string", maxLength: 32 },
      author: OPT_STR(300), limit: LIMIT,
    } },
    outputSchema: out({ hits: { type: "array", maxItems: 100 } }),
    capabilities: ["document.search"], permission: "READ_ONLY", risk: "LOW",
    executionMode: "local", externalNetwork: false, mutation: false,
  },
  {
    id: "document.get", name: "Get document",
    description: "Fetch bounded document metadata (no filesystem paths, no binary).",
    version: "1", category: "DOCUMENT",
    inputSchema: { fields: { documentId: { ...ID, required: true } } },
    outputSchema: out({ document: { type: "object", required: true, freeform: true } }),
    capabilities: ["document.read"], permission: "READ_ONLY", risk: "LOW",
    executionMode: "local", externalNetwork: false, mutation: false,
  },
  {
    id: "document.inspect", name: "Inspect document",
    description: "Inspect document structure: sections, bounded blocks, bounded chunks, references, SourceRefs.",
    version: "1", category: "DOCUMENT",
    inputSchema: { fields: {
      documentId: { ...ID, required: true },
      maxBlocks: { type: "number", integer: true, minimum: 1, maximum: 50 },
      maxChunks: { type: "number", integer: true, minimum: 1, maximum: 20 },
    } },
    outputSchema: out({ inspection: { type: "object", required: true, freeform: true } }),
    capabilities: ["document.read"], permission: "READ_ONLY", risk: "LOW",
    executionMode: "local", externalNetwork: false, mutation: false,
  },
  {
    id: "connector.list", name: "List connectors",
    description: "List registered connectors with capabilities and sync status.",
    version: "1", category: "CONNECTOR",
    inputSchema: { fields: {} },
    outputSchema: out({ connectors: { type: "array", maxItems: 32 } }),
    capabilities: ["connector.read"], permission: "READ_ONLY", risk: "LOW",
    executionMode: "backend", externalNetwork: false, mutation: false,
  },
  {
    id: "connector.get", name: "Get connector",
    description: "Get one connector definition with capabilities and sync status.",
    version: "1", category: "CONNECTOR",
    inputSchema: { fields: { connectorId: { type: "string", required: true, maxLength: 64, pattern: "^(crossref|zotero)$" } } },
    outputSchema: out({ connector: { type: "object", required: true, freeform: true } }),
    capabilities: ["connector.read"], permission: "READ_ONLY", risk: "LOW",
    executionMode: "backend", externalNetwork: false, mutation: false,
  },
  {
    id: "connector.preview", name: "Preview connector items",
    description: "Validate and summarize normalized external items without importing.",
    version: "1", category: "CONNECTOR",
    inputSchema: { fields: {
      items: { type: "array", required: true, maxItems: 200 },
    } },
    outputSchema: out({ preview: { type: "array", maxItems: 200 } }),
    capabilities: ["connector.preview"], permission: "READ_ONLY", risk: "LOW",
    executionMode: "backend", externalNetwork: false, mutation: false,
  },
  {
    id: "connector.search", name: "Search Crossref",
    description: "Search Crossref works (allowlisted host only, bounded rows). Returns retrieval metadata.",
    version: "1", category: "CONNECTOR",
    inputSchema: { fields: {
      query: { ...QUERY, required: true }, rows: { type: "number", integer: true, minimum: 1, maximum: 20 },
    } },
    outputSchema: out({ items: { type: "array", maxItems: 20 } }),
    capabilities: ["connector.search"], permission: "READ_ONLY", risk: "LOW",
    executionMode: "backend", externalNetwork: true, mutation: false,
  },
  {
    id: "connector.import", name: "Import connector items",
    description: "Import normalized external items via the Phase 4 engine. Requires explicit user confirmation.",
    version: "1", category: "CONNECTOR",
    inputSchema: { fields: {
      items: { type: "array", required: true, maxItems: 200 },
      projectId: SAFE_ID, dryRun: { type: "boolean" },
    } },
    outputSchema: out({ result: { type: "object", required: true, freeform: true } }),
    capabilities: ["connector.import"], permission: "USER_CONFIRMATION", risk: "MEDIUM",
    executionMode: "backend", externalNetwork: false, mutation: true,
  },
  {
    id: "project.get", name: "Get project summary",
    description: "Fetch a bounded project summary (metadata + counts, no full draft or embeddings).",
    version: "1", category: "READ",
    inputSchema: { fields: { projectId: { ...SAFE_ID, required: true } } },
    outputSchema: out({ project: { type: "object", required: true, freeform: true } }),
    capabilities: ["project.read"], permission: "READ_ONLY", risk: "LOW",
    executionMode: "backend", externalNetwork: false, mutation: false,
  },
  {
    id: "export.create", name: "Create knowledge export",
    description: "Export bounded knowledge (entities + evidence) as validated openbentt-knowledge-v1 JSON.",
    version: "1", category: "EXPORT",
    inputSchema: { fields: {
      projectId: SAFE_ID, entityIds: { type: "array", maxItems: 200, items: ID },
      maxEntities: { type: "number", integer: true, minimum: 1, maximum: 500 },
    } },
    outputSchema: out({ export: { type: "object", required: true, freeform: true } }),
    capabilities: ["export.create"], permission: "READ_ONLY", risk: "LOW",
    executionMode: "backend", externalNetwork: false, mutation: false,
  },
  {
    id: "utility.calculate", name: "Calculate expression",
    description: "Evaluate a bounded arithmetic expression deterministically (no code execution).",
    version: "1", category: "UTILITY",
    inputSchema: { fields: { expression: { type: "string", required: true, maxLength: 200, minLength: 1 } } },
    outputSchema: out({ result: { type: "number", required: true } }),
    capabilities: ["utility.compute"], permission: "READ_ONLY", risk: "LOW",
    executionMode: "local", externalNetwork: false, mutation: false,
  },
]
