/** Batch streaming character deltas — flush on size threshold or time throttle (reduces React re-renders). */

const DEFAULT_FLUSH_CHARS = 192;
const DEFAULT_FLUSH_MS = 80;

export function createRafBatcher(
  onFlush: (chunk: string) => void,
  flushChars: number = DEFAULT_FLUSH_CHARS,
  flushMs: number = DEFAULT_FLUSH_MS
) {
  let buf = "";
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearScheduled = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flush = () => {
    clearScheduled();
    if (buf.length === 0) return;
    const s = buf;
    buf = "";
    onFlush(s);
  };

  const schedule = () => {
    if (timer != null) return;
    timer = setTimeout(() => {
      timer = null;
      if (buf.length === 0) return;
      const s = buf;
      buf = "";
      onFlush(s);
    }, flushMs);
  };

  return {
    push(delta: string) {
      if (!delta) return;
      buf += delta;
      if (buf.length >= flushChars) {
        flush();
        return;
      }
      schedule();
    },
    flushPending() {
      flush();
    },
  };
}
