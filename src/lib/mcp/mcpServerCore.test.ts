/**
 * Phase 8 — MCP server policy tests: read-only exposure, bearer checks.
 */
import { describe, it, expect } from "vitest";
import {
  bearerMatches,
  isExposableTool,
  parseJsonRpc,
  resolveExposedTools,
  validateServerConfig,
} from "@/lib/mcp/mcpServerCore.mjs";

const READ = { id: "knowledge.search", permission: "READ_ONLY", mutation: false };
const WRITE = { id: "gmail.send", permission: "USER_CONFIRMATION", risk: "HIGH", mutation: true };
const FAKE = { id: "shell.exec", permission: "READ_ONLY", mutation: false };

describe("mcp server policy", () => {
  it("exposes read-only registered tools only", () => {
    expect(isExposableTool(READ)).toBe(true);
    expect(isExposableTool(WRITE)).toBe(false);
    expect(isExposableTool(FAKE)).toBe(false);
    expect(isExposableTool({ id: "connector.import", permission: "USER_CONFIRMATION", mutation: true })).toBe(false);
  });
  it("resolves configured allowlists fail-closed", () => {
    expect(resolveExposedTools(["knowledge.search", "gmail.send", "shell.exec"], [READ, WRITE, FAKE]))
      .toEqual(["knowledge.search"]);
  });
  it("validates server config", () => {
    expect(validateServerConfig({ enabled: true, port: 3877, allowedTools: ["knowledge.search"] })).toBe(null);
    expect(validateServerConfig({ port: 80 })).not.toBe(null);
    expect(validateServerConfig({ allowedTools: ["gmail.send"] })).not.toBe(null);
  });
  it("compares bearers in constant time semantics", () => {
    expect(bearerMatches("abc", "abc")).toBe(true);
    expect(bearerMatches("abc", "abd")).toBe(false);
    expect(bearerMatches("ab", "abc")).toBe(false);
    expect(bearerMatches("", "abc")).toBe(false);
  });
  it("parses JSON-RPC narrowly", () => {
    const ok = parseJsonRpc(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }));
    expect(ok.method).toBe("tools/list");
    expect(parseJsonRpc("{{{").error).toBeTruthy();
    expect(parseJsonRpc(JSON.stringify({ jsonrpc: "1.0", method: "tools/list" })).error).toBeTruthy();
    expect(parseJsonRpc(JSON.stringify({ jsonrpc: "2.0", method: "system.exec" })).error).toBeTruthy();
  });
});
