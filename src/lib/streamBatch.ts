/** Batch streaming character deltas — flush every animation frame, or sooner if buffer grows large (snappier UI). */

const DEFAULT_FLUSH_CHARS = 96;

export function createRafBatcher(onFlush: (chunk: string) => void, flushChars: number = DEFAULT_FLUSH_CHARS) {
  let buf = "";
  let raf: number | null = null;

  const flush = () => {
    if (raf != null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
    if (buf.length === 0) return;
    const s = buf;
    buf = "";
    onFlush(s);
  };

  const schedule = () => {
    if (raf != null) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      if (buf.length === 0) return;
      const s = buf;
      buf = "";
      onFlush(s);
    });
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
