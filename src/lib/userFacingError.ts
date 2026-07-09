/** ONNX Runtime Web / WASM sometimes throws `Error` whose `message` is only a status code. */
const NUMERIC_RUNTIME_MSG = /^\d{5,}$/;

/** Classic WebAssembly traps from ORT / linked modules (often context too long or overlapping inference). */
const WASM_TRAP_RE =
  /table index is out of bounds|memory access out of bounds|unreachable|indirect call signature mismatch|function signature mismatch|does not support unaligned|unaligned access/i;

export function expandNumericRuntimeMessage(message: string): string {
  const t = message.trim();
  if (!NUMERIC_RUNTIME_MSG.test(t)) return message;
  return (
    `Model runtime error (code ${t}). This usually comes from ONNX Runtime Web (GPU / WebGPU / WASM). ` +
    `If the console also shows "Device failed at creation", WebGPU failed to open the GPU (common on Linux until Vulkan/Mesa and Chromium flags line up—fully quit and restart the Openbentt desktop app after updating). ` +
    `Otherwise try freeing GPU memory, updating drivers (Linux: Mesa / Vulkan), or switching to a cloud model in Settings. ` +
    `Open DevTools (F12) → Console for details.`
  );
}

export function expandWasmTrapMessage(message: string): string {
  const t = message.trim();
  if (!WASM_TRAP_RE.test(t)) return message;
  const unalignedHint = /unaligned/i.test(t)
    ? "Messages about **unaligned access** often track a bad **GPU / WebGPU / Vulkan** stack (not your chat text): e.g. Electron/Chromium logs *Wayland is not compatible with Vulkan*, *Failed to create vulkan surface*, or GBM/driver lines. Try an **X11** session, update Mesa/NVIDIA drivers, fully quit and restart the app, or use a **cloud** model until WebGPU is healthy. "
    : "";
  return (
    `${t}\n\n` +
    "This is a WebAssembly-level error from the on-device model runtime (often ONNX Runtime Web). " +
    unalignedHint +
    "Typical causes: the prompt is too long for the exported model graph, a second generation started before the first finished, or GPU/WASM memory pressure. " +
    "Try: shorten the thread or switch to **Eco** profile in Settings, wait for the current reply to finish before sending again, pick a smaller local model, or use a cloud provider. " +
    "If it persists after a full tab reload, check the browser console (F12) for the first stack line."
  );
}

/** Apply numeric ORT expansion and WASM-trap hints (order: WASM first so raw text is preserved in the prefix). */
export function expandRuntimeInferenceMessage(message: string): string {
  let out = message.trim();
  if (WASM_TRAP_RE.test(out)) out = expandWasmTrapMessage(out);
  out = expandNumericRuntimeMessage(out);
  if (/Failed to fetch|NetworkError|ERR_NETWORK|Load failed|download.*fail/i.test(out)) {
    out =
      `${out}\n\n` +
      "The on-device model could not finish downloading from Hugging Face. Check your network, disable blockers for huggingface.co, then retry. " +
      "Or switch to OpenRouter (cloud) in Settings.";
  }
  if (
    /can'?t create session|cannot create session|create.?session|ERROR_CODE:\s*6|error code\s*=?\s*6|bad_alloc|Failed to allocate/i.test(
      out
    )
  ) {
    out =
      `${out}\n\n` +
      "ONNX Runtime ran out of memory creating the model session (error code 6 / bad_alloc). " +
      "Hard-refresh this tab, close other heavy tabs, then try again — we load a smaller q8 CPU build by default. " +
      "If it still fails: DevTools → Application → Clear site data for this origin (clears a broken cache), or use OpenRouter (cloud) in Settings.";
  }
  return out;
}

export function formatUserFacingError(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "Aborted";
  }
  if (err instanceof Error) {
    const m = err.message.trim();
    if (!m) return fallback;
    return expandRuntimeInferenceMessage(m);
  }
  if (typeof err === "string") {
    const m = err.trim();
    return m ? expandRuntimeInferenceMessage(m) : fallback;
  }
  const s = String(err).trim();
  return s ? expandRuntimeInferenceMessage(s) : fallback;
}
