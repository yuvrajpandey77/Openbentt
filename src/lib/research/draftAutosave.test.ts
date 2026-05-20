import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createDraftAutosave } from "@/lib/research/draftAutosave";

describe("createDraftAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not flush on every keystroke — debounces to a single save", async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const autosave = createDraftAutosave({ debounceMs: 500, onFlush });

    autosave.markDirty("a");
    autosave.markDirty("ab");
    autosave.markDirty("abc");

    expect(onFlush).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith("abc");
  });

  it("tracks dirty then saved status", async () => {
    const statuses: string[] = [];
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const autosave = createDraftAutosave({
      debounceMs: 100,
      onFlush,
      onStatusChange: (s) => statuses.push(s),
    });

    autosave.markDirty("x");
    expect(statuses).toContain("dirty");

    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    expect(statuses).toContain("saved");
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it("flushNow bypasses debounce", async () => {
    const onFlush = vi.fn().mockResolvedValue(undefined);
    const autosave = createDraftAutosave({ debounceMs: 10_000, onFlush });

    autosave.markDirty("now");
    await autosave.flushNow();

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith("now");
  });
});
