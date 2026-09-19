/**
 * Phase 7 — Google Drive client (Drive API v3, read-only). Plain-JS SSOT.
 * Official reference: https://developers.google.com/drive/api/reference/rest/v3
 * Real endpoints: GET /drive/v3/about (verify), /drive/v3/files (list/search),
 * /drive/v3/files/{id} (metadata). No write paths exist here by design.
 */
import {
  clampPageSize,
  providerGetJson,
  truncateSnippet,
} from "./providerHttp.mjs";
import { sanitizeText } from "../connectorCore.mjs";

export const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
export const DRIVE_ABOUT_URL = "https://www.googleapis.com/drive/v3/about?fields=user";

const FILE_FIELDS =
  "id,name,mimeType,parents,owners(displayName),createdTime,modifiedTime,size,webViewLink,trashed,capabilities";

export function driveKindFor(mime) {
  if (mime === "application/vnd.google-apps.folder") return "folder";
  if (mime === "application/vnd.google-apps.document") return "document";
  if (mime === "application/vnd.google-apps.spreadsheet") return "spreadsheet";
  if (mime === "application/vnd.google-apps.presentation") return "presentation";
  if (mime === "application/pdf") return "pdf";
  if (String(mime).startsWith("text/")) return "text";
  return "file";
}

export function driveListUrl(args) {
  const a = args ?? {};
  const url = new URL(`${DRIVE_API_BASE}/files`);
  const q = [a.query?.trim(), "trashed = false"].filter(Boolean).join(" and ");
  url.searchParams.set("q", q || "trashed = false");
  url.searchParams.set("pageSize", String(clampPageSize(a.pageSize)));
  url.searchParams.set("fields", `nextPageToken,files(${FILE_FIELDS})`);
  url.searchParams.set("orderBy", a.orderBy ?? "modifiedTime desc");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  if (a.pageToken) url.searchParams.set("pageToken", a.pageToken);
  return url.toString();
}

export function driveFileUrl(fileId) {
  if (!/^[a-zA-Z0-9_-]{10,256}$/.test(String(fileId))) throw new Error("invalid-drive-id");
  const url = new URL(`${DRIVE_API_BASE}/files/${fileId}`);
  url.searchParams.set("fields", FILE_FIELDS);
  url.searchParams.set("supportsAllDrives", "true");
  return url.toString();
}

export function normalizeDriveFile(raw) {
  const id = sanitizeText(raw.id, 256);
  if (!id) throw new Error("invalid-drive-file");
  const mime = sanitizeText(raw.mimeType, 128) || "application/octet-stream";
  const owners = Array.isArray(raw.owners) ? raw.owners : [];
  const owner = owners.map((o) => sanitizeText(o?.displayName, 256)).find(Boolean);
  const parents = Array.isArray(raw.parents) ? raw.parents.map((p) => sanitizeText(p, 256)) : [];
  return {
    kind: driveKindFor(mime),
    id,
    title: sanitizeText(raw.name, 1000) || "(untitled)",
    mimeType: mime,
    parentId: parents[0],
    owner,
    createdAt: sanitizeText(raw.createdTime, 64) || undefined,
    updatedAt: sanitizeText(raw.modifiedTime, 64) || undefined,
    url: typeof raw.webViewLink === "string" ? raw.webViewLink.slice(0, 2000) : undefined,
    size: Number.isFinite(Number(raw.size)) ? Number(raw.size) : undefined,
  };
}

export async function driveVerifyConnection(fetchImpl) {
  const json = await providerGetJson(DRIVE_ABOUT_URL, fetchImpl);
  const label = sanitizeText(json?.user?.displayName, 256) || sanitizeText(json?.user?.emailAddress, 256);
  if (!label) throw new Error("drive-verify-failed");
  return { accountLabel: label };
}

export async function driveListResources(fetchImpl, args) {
  const a = args ?? {};
  const json = await providerGetJson(driveListUrl(a), fetchImpl);
  const files = Array.isArray(json.files) ? json.files : [];
  const items = [];
  for (const f of files.slice(0, 100)) {
    try {
      items.push(normalizeDriveFile(f));
    } catch {
      /* skip malformed entries */
    }
  }
  return { items, nextCursor: json.nextPageToken, rawCount: files.length };
}

export async function driveSearch(fetchImpl, query, args) {
  const q = truncateSnippet(query, 500) ?? "";
  if (!q) throw new Error("empty-query");
  return driveListResources(fetchImpl, { ...(args ?? {}), query: `fullText contains '${q.replace(/'/g, "\\'")}'` });
}

export async function driveGetResource(fetchImpl, fileId) {
  return normalizeDriveFile(await providerGetJson(driveFileUrl(fileId), fetchImpl));
}
