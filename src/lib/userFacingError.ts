/** ONNX Runtime Web / WASM sometimes throws `Error` whose `message` is only a status code. */
const NUMERIC_RUNTIME_MSG = /^\d{5,}$/;

export function expandNumericRuntimeMessage(message: string): string {
  const t = message.trim();
  if (!NUMERIC_RUNTIME_MSG.test(t)) return message;
  return (
    `Model runtime error (code ${t}). This usually comes from ONNX Runtime Web (GPU / WebGPU / WASM). ` +
    `Try restarting the app, updating GPU drivers (Linux: Mesa / Vulkan), freeing GPU memory, or switching to a cloud model in Settings. ` +
    `Open DevTools (F12) → Console for details.`
  );
}

export function formatUserFacingError(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "Aborted";
  }
  if (err instanceof Error) {
    const m = err.message.trim();
    if (!m) return fallback;
    return expandNumericRuntimeMessage(m);
  }
  if (typeof err === "string") {
    const m = err.trim();
    return m ? expandNumericRuntimeMessage(m) : fallback;
  }
  const s = String(err).trim();
  return s ? expandNumericRuntimeMessage(s) : fallback;
}
