import { describe, expect, it } from "vitest";
import { arrayBufferToBase64 } from "@/lib/research/base64";

describe("arrayBufferToBase64", () => {
  it("round-trips small and chunked buffers", () => {
    const small = new Uint8Array([72, 101, 108, 108, 111]);
    expect(atob(arrayBufferToBase64(small.buffer))).toBe("Hello");

    const large = new Uint8Array(20_000);
    for (let i = 0; i < large.length; i++) large[i] = i % 256;
    const encoded = arrayBufferToBase64(large.buffer);
    const decoded = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    expect(decoded).toEqual(large);
  });
});
