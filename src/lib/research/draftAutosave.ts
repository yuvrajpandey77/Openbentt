/**
 * Debounced draft persistence — avoids full project rebuild/save on every keystroke.
 */

export type DraftSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export type DraftAutosaveOptions = {
  debounceMs?: number;
  onFlush: (content: string) => Promise<void>;
  onStatusChange?: (status: DraftSaveStatus) => void;
};

export function createDraftAutosave(opts: DraftAutosaveOptions) {
  const debounceMs = opts.debounceMs ?? 800;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: string | null = null;
  let flushing = false;
  let status: DraftSaveStatus = "idle";

  const setStatus = (next: DraftSaveStatus) => {
    status = next;
    opts.onStatusChange?.(next);
  };

  const scheduleFlush = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), debounceMs);
  };

  const flush = async () => {
    if (pending === null || flushing) return;
    const content = pending;
    pending = null;
    flushing = true;
    setStatus("saving");
    try {
      await opts.onFlush(content);
      if (pending !== null) {
        setStatus("dirty");
        scheduleFlush();
      } else {
        setStatus("saved");
      }
    } catch {
      pending = content;
      setStatus("error");
    } finally {
      flushing = false;
    }
  };

  return {
    getStatus: () => status,
    markDirty: (content: string) => {
      pending = content;
      setStatus("dirty");
      scheduleFlush();
    },
    flushNow: async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await flush();
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
      setStatus("idle");
    },
  };
}
