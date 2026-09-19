/**
 * Phase 8 — GitHub write client (GitHub REST API, REAL endpoints).
 * Official reference: https://docs.github.com/en/rest/issues/issues#create-an-issue
 *   https://docs.github.com/en/rest/pulls/pulls#create-a-pull-request
 * Endpoints: POST /repos/{owner}/{repo}/issues, POST /repos/{owner}/{repo}/pulls.
 * Plain-JS SSOT. No secrets here. No merge/delete paths by design.
 */
import { providerPostJson } from "./providerHttp.mjs";
import { sanitizeText } from "../connectorCore.mjs";

export const GITHUB_API_BASE = "https://api.github.com";

const REPO_RE = /^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/;

export function assertRepoSlug(repository) {
  const slug = String(repository ?? "").trim();
  if (!REPO_RE.test(slug)) throw new Error("invalid-github-repository");
  return slug;
}

export function githubCreateIssueUrl(repository) {
  return `${GITHUB_API_BASE}/repos/${assertRepoSlug(repository)}/issues`;
}

export function githubCreatePullUrl(repository) {
  return `${GITHUB_API_BASE}/repos/${assertRepoSlug(repository)}/pulls`;
}

/** Build an issues.create body from validated action input. Pure. */
export function buildGithubIssueBody(input) {
  const v = input ?? {};
  const body = { title: String(v.title ?? "").slice(0, 300) };
  if (typeof v.body === "string" && v.body) body.body = v.body.slice(0, 8000);
  if (Array.isArray(v.labels) && v.labels.length) {
    body.labels = v.labels.map((l) => String(l).slice(0, 50)).slice(0, 10);
  }
  if (Array.isArray(v.assignees) && v.assignees.length) {
    body.assignees = v.assignees.map((a) => String(a).slice(0, 100)).slice(0, 10);
  }
  return body;
}

/** Build a pulls.create body from validated action input. Pure. */
export function buildGithubPullBody(input) {
  const v = input ?? {};
  const body = {
    head: String(v.head ?? "").trim().slice(0, 255),
    base: String(v.base ?? "").trim().slice(0, 255),
  };
  if (typeof v.title === "string" && v.title) body.title = v.title.slice(0, 300);
  if (typeof v.body === "string" && v.body) body.body = v.body.slice(0, 8000);
  if (typeof v.draft === "boolean") body.draft = v.draft;
  return body;
}

export function parseGithubIssueResponse(json) {
  const id = Number(json?.id);
  const number = Number(json?.number);
  if (!Number.isFinite(id) || !Number.isFinite(number)) throw new Error("invalid-github-issue-response");
  return {
    issueId: id,
    number,
    url: typeof json?.html_url === "string" ? json.html_url.slice(0, 2000) : undefined,
    state: sanitizeText(json?.state, 32) || undefined,
    title: sanitizeText(json?.title, 300) || undefined,
  };
}

export function parseGithubPullResponse(json) {
  const id = Number(json?.id);
  const number = Number(json?.number);
  if (!Number.isFinite(id) || !Number.isFinite(number)) throw new Error("invalid-github-pull-response");
  return {
    pullId: id,
    number,
    url: typeof json?.html_url === "string" ? json.html_url.slice(0, 2000) : undefined,
    state: sanitizeText(json?.state, 32) || undefined,
    title: sanitizeText(json?.title, 300) || undefined,
  };
}

/** Create a GitHub issue. Returns { issueId, number, url, state, title }. */
export async function githubCreateIssue(fetchImpl, input) {
  const json = await providerPostJson(githubCreateIssueUrl(input?.repository), fetchImpl, buildGithubIssueBody(input));
  return parseGithubIssueResponse(json);
}

/** Create a GitHub pull request. Returns { pullId, number, url, state, title }. */
export async function githubCreatePull(fetchImpl, input) {
  const json = await providerPostJson(githubCreatePullUrl(input?.repository), fetchImpl, buildGithubPullBody(input));
  return parseGithubPullResponse(json);
}
