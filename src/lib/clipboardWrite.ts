import { getDesktopApi } from "@/lib/desktopApi";

/** Copy text via Electron main clipboard first, then navigator.clipboard. */
export async function writeClipboardText(text: string): Promise<{ ok: boolean; error?: string }> {
  const value = String(text ?? "");
  if (!value) return { ok: false, error: "Nothing to copy" };

  const api = getDesktopApi();
  if (api?.copyText) {
    try {
      const r = await api.copyText(value);
      if (r?.ok) return { ok: true };
    } catch (e) {
      /* fall through to web clipboard */
      void e;
    }
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return { ok: true };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Clipboard unavailable" };
  }

  // Last resort: temporary textarea + execCommand (works in some Electron contexts).
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) return { ok: true };
  } catch {
    /* ignore */
  }

  return { ok: false, error: "Clipboard is not available." };
}
