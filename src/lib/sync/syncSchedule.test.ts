/**
 * Phase 8 — sync schedule core tests: intervals, due checks, backoff.
 */
import { describe, it, expect } from "vitest";
import {
  backoffNextRunAt,
  defaultIntervalFor,
  isDue,
  isSyncConnectorId,
  isTransientSyncError,
  nextRunAt,
  validateIntervalMinutes,
} from "@/lib/sync/syncSchedule.mjs";

describe("sync schedule", () => {
  it("validates intervals 5–1440", () => {
    expect(validateIntervalMinutes(15)).toBe(15);
    expect(validateIntervalMinutes(4)).toBe(null);
    expect(validateIntervalMinutes(1441)).toBe(null);
    expect(validateIntervalMinutes("nope")).toBe(null);
  });
  it("knows syncable connectors + defaults", () => {
    expect(isSyncConnectorId("gmail")).toBe(true);
    expect(isSyncConnectorId("dropbox")).toBe(false);
    expect(defaultIntervalFor("slack")).toBe(10);
    expect(defaultIntervalFor("gmail")).toBe(15);
  });
  it("computes next runs and due checks", () => {
    const last = "2026-09-17T10:00:00.000Z";
    const next = nextRunAt(last, 15);
    expect(Date.parse(next) - Date.parse(last)).toBe(15 * 60 * 1000);
    expect(isDue(next, Date.parse(next) + 1)).toBe(true);
    expect(isDue(next, Date.parse(next) - 1000)).toBe(false);
    expect(isDue(null)).toBe(true);
  });
  it("backs off on consecutive failures (capped)", () => {
    const now = Date.now();
    const first = Date.parse(backoffNextRunAt(15, 1, now));
    expect(first - now).toBe(30 * 60 * 1000);
    const capped = Date.parse(backoffNextRunAt(15, 100, now));
    expect(capped - now).toBeLessThanOrEqual(24 * 3600 * 1000);
  });
  it("classifies transient errors only", () => {
    expect(isTransientSyncError(new Error("rate_limited"))).toBe(true);
    expect(isTransientSyncError(new Error("timeout"))).toBe(true);
    expect(isTransientSyncError(new Error("authentication_failed"))).toBe(false);
    expect(isTransientSyncError(new Error("permission_denied"))).toBe(false);
  });
});
