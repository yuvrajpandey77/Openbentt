/**
 * IPC input guards — keep renderer → main boundaries narrow.
 */
import path from "node:path";

const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

/** @param {unknown} id @param {string} label */
export function assertSafeId(id, label = "id") {
  if (typeof id !== "string" || !ID_RE.test(id)) {
    throw new Error(`Invalid ${label}`);
  }
  return id;
}

/** @param {unknown} raw @param {number} maxBytes */
export function assertBase64Pdf(raw, maxBytes = 48 * 1024 * 1024) {
  if (typeof raw !== "string" || raw.length < 8) {
    throw new Error("Invalid PDF payload");
  }
  if (!/^[A-Za-z0-9+/=\s]+$/.test(raw.slice(0, 256))) {
    throw new Error("Invalid base64 PDF");
  }
  const approxBytes = Math.floor((raw.replace(/\s/g, "").length * 3) / 4);
  if (approxBytes > maxBytes) {
    throw new Error("PDF exceeds size limit");
  }
  return raw.replace(/\s/g, "");
}

/**
 * Resolve a path under distRoot; reject traversal.
 * @param {string} distRoot
 * @param {string} pathname URL pathname (may start with /)
 */
export function resolveUnderDistRoot(distRoot, pathname) {
  const root = path.resolve(distRoot);
  const rel = pathname.replace(/^\/+/, "");
  const candidate = path.resolve(root, rel || "index.html");
  if (candidate !== root && !candidate.startsWith(root + path.sep)) {
    return path.join(root, "index.html");
  }
  return candidate;
}

/**
 * Resolve path only if it lies under one of the allowed roots (no traversal).
 * @param {unknown} filePath
 * @param {string[]} roots
 * @param {string} label
 */
export function assertPathUnderRoots(filePath, roots, label = "path") {
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new Error(`Invalid ${label}`);
  }
  const resolved = path.resolve(filePath.trim());
  const allowed = roots.some((r) => {
    const base = path.resolve(r);
    return resolved === base || resolved.startsWith(base + path.sep);
  });
  if (!allowed) {
    throw new Error(`${label} not in allowlist`);
  }
  return resolved;
}

/** @param {unknown} configured @param {string[]} allowPrefixes */
export function assertLlamaBinaryAllowlisted(configured, allowPrefixes = []) {
  if (configured == null || configured === "") return "";
  if (typeof configured !== "string" || configured.length > 512) {
    throw new Error("Invalid llama-server path");
  }
  const trimmed = configured.trim();
  if (!trimmed) return "";
  const resolved = path.resolve(trimmed);
  const allowed =
    allowPrefixes.length === 0 ||
    allowPrefixes.some((p) => {
      const base = path.resolve(p);
      return resolved === base || resolved.startsWith(base + path.sep);
    });
  if (!allowed) {
    throw new Error("llama-server path not in allowlist");
  }
  return resolved;
}
