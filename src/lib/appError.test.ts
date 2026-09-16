import { describe, it, expect } from "vitest";
import { AppError, toAppError } from "./appError";
import { StreamHttpError } from "./openrouter";

describe("AppError", () => {
  it("carries code, message, and retryability", () => {
    const e = new AppError("rate-limit", "slow down");
    expect(e.code).toBe("rate-limit");
    expect(e.retryable).toBe(true);
    expect(e).toBeInstanceOf(Error);
    const fatal = new AppError("authentication", "bad key");
    expect(fatal.retryable).toBe(false);
  });

  it("respects explicit retryable override and details", () => {
    const e = new AppError("network", "x", { retryable: false, details: { op: "chat" } });
    expect(e.retryable).toBe(false);
    expect(e.details).toEqual({ op: "chat" });
  });
});

describe("toAppError", () => {
  it("passes AppError through", () => {
    const e = new AppError("storage", "disk");
    expect(toAppError(e)).toBe(e);
  });

  it("maps StreamHttpError statuses", () => {
    expect(toAppError(new StreamHttpError("m", 429, {})).code).toBe("rate-limit");
    expect(toAppError(new StreamHttpError("m", 401, {})).code).toBe("authentication");
    expect(toAppError(new StreamHttpError("m", 403, {})).code).toBe("authentication");
    expect(toAppError(new StreamHttpError("m", 500, {})).code).toBe("provider");
    expect(toAppError(new StreamHttpError("m", 400, {})).code).toBe("provider");
  });

  it("maps aborts and network TypeErrors", () => {
    const abort = new DOMException("x", "AbortError");
    expect(toAppError(abort).code).toBe("validation");
    expect(toAppError(new TypeError("Failed to fetch")).code).toBe("network");
  });

  it("falls back safely for unknown shapes", () => {
    expect(toAppError(undefined).code).toBe("unknown");
    expect(toAppError("plain string").message).toBe("plain string");
    expect(toAppError(new Error("boom"), "storage").code).toBe("storage");
  });

  it("never throws", () => {
    expect(() => toAppError(Symbol("s") as unknown)).not.toThrow();
  });
});
