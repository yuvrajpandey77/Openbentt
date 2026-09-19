/**
 * Phase 7 — GitHub client (REST API, READ-ONLY). Plain-JS SSOT.
 * Official reference: https://docs.github.com/en/rest
 * Real endpoints: /user (verify), /user/repos, /search/issues,
 * /repos/{o}/{r}/contents/{path}. No merge/push/create/delete.
 */
import {
  clampPageSize,
  providerGetJson,
  truncateSnippet,
} from "./providerHttp.mjs";
import { sanitizeText } from "../connectorCore.mjs";

export const GITHUB_API_BASE = "https://api.github.com";
const NAME_RE = /^[a-zA-Z0-9_.-]{1,128}$/;

export function githubUrl(path, params) {
  if (!String(path).startsWith("/")) throw new Error("invalid-github-path");
  const url = new URL(`${GITHUB_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v).slice(0, 2000));
  return url.toString();
}

function repoPath(owner, repo) {
  if (!NAME_RE.test(String(owner)) || !NAME_RE.test(String(repo))) throw new Error("invalid-repo");
  return `${owner}/${repo}`;
}

export async function githubVerifyConnection(fetchImpl) {
  const json = await providerGetJson(githubUrl("/user"), fetchImpl);
  const label = sanitizeText(json?.login, 128);
  if (!label) throw new Error("github-verify-failed");
  return { accountLabel: label };
}

export async function githubListRepos(fetchImpl, args) {
  const a = args ?? {};
  const size = clampPageSize(a.perPage);
  const page = Math.min(100, Math.max(1, Number(a.page ?? 1)));
  const json = await providerGetJson(
    githubUrl("/user/repos", { per_page: String(size), page: String(page), sort: "updated" }),
    fetchImpl
  );
  const repos = Array.isArray(json) ? json : [];
  return {
    items: repos.slice(0, 100).map((r) => ({
      kind: "repository",
      id: `repo:${sanitizeText(r.id, 64)}`,
      repo: sanitizeText(r.full_name, 256) || undefined,
      title: sanitizeText(r.full_name, 256) || "(unknown repo)",
      snippet: truncateSnippet(r.description),
      url: typeof r.html_url === "string" ? r.html_url.slice(0, 2000) : undefined,
      updatedAt: sanitizeText(r.updated_at, 64) || undefined,
    })),
    nextCursor: repos.length === size ? String(page + 1) : undefined,
    rawCount: repos.length,
  };
}

export async function githubSearchIssues(fetchImpl, query, args) {
  const q = truncateSnippet(query, 500) ?? "";
  if (!q) throw new Error("empty-query");
  const a = args ?? {};
  const size = clampPageSize(a.perPage, 30);
  const page = Math.min(100, Math.max(1, Number(a.page ?? 1)));
  const json = await providerGetJson(
    githubUrl("/search/issues", { q, per_page: String(size), page: String(page) }),
    fetchImpl
  );
  const items = Array.isArray(json.items) ? json.items : [];
  return {
    items: items.slice(0, 100).map((i) => {
      const isPr = Boolean(i.pull_request);
      return {
        kind: isPr ? "pull_request" : "issue",
        id: `${isPr ? "pr" : "issue"}:${sanitizeText(i.id, 64)}`,
        repo: sanitizeText(String(i.repository_url ?? "").replace("https://api.github.com/repos/", ""), 256) || undefined,
        title: sanitizeText(i.title, 1000) || "(untitled)",
        snippet: truncateSnippet(i.body),
        url: typeof i.html_url === "string" ? i.html_url.slice(0, 2000) : undefined,
        state: sanitizeText(i.state, 32) || undefined,
        author: sanitizeText(i.user?.login, 128) || undefined,
        updatedAt: sanitizeText(i.updated_at, 64) || undefined,
      };
    }),
    nextCursor: items.length === size ? String(page + 1) : undefined,
    rawCount: items.length,
  };
}

export async function githubGetFile(fetchImpl, owner, repo, filePath, ref) {
  const full = repoPath(owner, repo);
  const clean = String(filePath ?? "").replace(/^\/+/, "").slice(0, 1024);
  if (!clean || clean.includes("..")) throw new Error("invalid-path");
  const url = new URL(
    `${GITHUB_API_BASE}/repos/${full}/contents/${clean.split("/").map(encodeURIComponent).join("/")}`
  );
  if (ref) url.searchParams.set("ref", String(ref).slice(0, 256));
  const json = await providerGetJson(url.toString(), fetchImpl);
  let snippet;
  if (json.encoding === "base64" && typeof json.content === "string") {
    try {
      const text = Buffer.from(json.content.replace(/\n/g, ""), "base64").toString("utf8");
      snippet = truncateSnippet(text, 8000);
    } catch {
      snippet = undefined;
    }
  }
  return {
    kind: "file",
    id: `file:${full}:${clean}`,
    repo: full,
    title: sanitizeText(json.name, 500) || clean,
    snippet,
    url: typeof json.html_url === "string" ? json.html_url.slice(0, 2000) : undefined,
  };
}
