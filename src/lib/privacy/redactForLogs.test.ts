import { describe, it, expect } from "vitest";
import { redactForLogs, redactSecretsInText } from "./redactForLogs";

describe("redactForLogs", () => {
  it("redacts secret-valued keys", () => {
    const out = redactForLogs({ apiKey: "sk-abc", name: "x", nested: { token: "t" } }) as Record<string, unknown>;
    expect(out.apiKey).toBe("[redacted]");
    expect(out.name).toBe("x");
    expect((out.nested as Record<string, unknown>).token).toBe("[redacted]");
  });

  it("truncates long strings", () => {
    const out = redactForLogs("x".repeat(300));
    expect(String(out)).toContain("[300 chars]");
  });

  it("stops at max depth", () => {
    const deep: Record<string, unknown> = {};
    let cur = deep;
    for (let i = 0; i < 10; i++) {
      cur.next = {};
      cur = cur.next as Record<string, unknown>;
    }
    expect(JSON.stringify(redactForLogs(deep))).toContain("[max depth]");
  });
});

describe("redactSecretsInText", () => {
  it("redacts known provider key shapes", () => {
    expect(redactSecretsInText("bad key sk-or-v1-abc123XYZ_FAIL")).toContain("[redacted-secret]");
    expect(redactSecretsInText("bad key sk-ant-abc123XYZ_FAIL")).toContain("[redacted-secret]");
    expect(redactSecretsInText("bad key AIzaSyD-abcdefghij1234")).toContain("[redacted-secret]");
    expect(redactSecretsInText("bad key hf_abcdef1234567890")).toContain("[redacted-secret]");
    expect(redactSecretsInText("auth Bearer abcdef1234567890 failed")).toContain("[redacted-secret]");
  });

  it("leaves ordinary text untouched", () => {
    const t = "Chat request failed (401): invalid authentication credentials";
    expect(redactSecretsInText(t)).toBe(t);
  });

  it("never emits the original secret", () => {
    const secret = "sk-or-v1-THISISASECRETVALUE99";
    const out = redactSecretsInText(`provider said no to ${secret} today`);
    expect(out).not.toContain(secret);
    expect(out).toContain("[redacted-secret]");
  });
});
