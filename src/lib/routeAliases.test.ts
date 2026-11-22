import { describe, expect, it } from "vitest";
import { resolveRouteAlias } from "@/lib/routeAliases";

describe("resolveRouteAlias", () => {
  it("maps legacy paths to real destinations", () => {
    expect(resolveRouteAlias("/voice")).toBe("/agent");
    expect(resolveRouteAlias("/scheduled")).toBe("/tasks");
    expect(resolveRouteAlias("/research")).toBe("/labs");
    expect(resolveRouteAlias("/help/")).toBe("/settings");
  });

  it("returns null for unknown paths", () => {
    expect(resolveRouteAlias("/chat")).toBeNull();
    expect(resolveRouteAlias("/nope")).toBeNull();
  });
});
