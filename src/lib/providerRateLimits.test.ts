import { describe, expect, it } from "vitest";
import { collectRateLimitHeaders, parseRequestWindow } from "./providerRateLimits";

describe("parseRequestWindow", () => {
  it("parses OpenAI-style request headers", () => {
    const w = parseRequestWindow({
      "x-ratelimit-limit-requests": "500",
      "x-ratelimit-remaining-requests": "499",
    });
    expect(w).toEqual({ limit: 500, remaining: 499 });
  });

  it("parses generic x-ratelimit-limit / x-ratelimit-remaining (OpenRouter-style)", () => {
    const w = parseRequestWindow({
      "x-ratelimit-limit": "20",
      "x-ratelimit-remaining": "0",
    });
    expect(w).toEqual({ limit: 20, remaining: 0 });
  });

  it("returns null when incomplete", () => {
    expect(parseRequestWindow({ "x-ratelimit-remaining-requests": "10" })).toBeNull();
  });
});

describe("collectRateLimitHeaders", () => {
  it("collects ratelimit headers", () => {
    const h = new Headers();
    h.set("X-RateLimit-Remaining-Requests", "5");
    h.set("Content-Type", "application/json");
    const res = new Response(null, { headers: h });
    expect(collectRateLimitHeaders(res)).toEqual({
      "x-ratelimit-remaining-requests": "5",
    });
  });
});
