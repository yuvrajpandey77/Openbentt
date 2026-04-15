/** BusyTeX / pdflatex wrapper lines — not the root cause. */
const GENERIC_BUSY_TAIL =
  /^(==>\s*)?(Fatal error occurred|That was a fatal error|no output PDF file produced\.?|No pages of output\.?)\s*$/i;

/** BusyTeX often ends the log with `!  ==> Fatal error…` — must not require `$` (line often ends with `produced!`). */
function isGenericBangLine(t: string): boolean {
  const s = t.trim();
  if (!s.startsWith("!")) return false;
  if (/^!\s*(?:==>\s*)?Fatal error occurred/i.test(s)) return true;
  if (/That was a fatal error/i.test(s)) return true;
  if (/no output PDF file produced/i.test(s)) return true;
  if (/^!\s*\.?\s*No pages of output/i.test(s)) return true;
  return false;
}

/** If present, TeX diagnostics live in the `LOG:` block (BusyTeX concatenates stdout/stderr after). */
function narrowToPdflatexLogSection(log: string): string {
  const idx = log.indexOf("\nLOG:");
  if (idx === -1) return log;
  const after = log.slice(idx + "\nLOG:".length);
  const end = after.search(/\n==\s*\n(?:STDOUT|STDERR):/);
  const body = end === -1 ? after : after.slice(0, end);
  return body.trim() || log;
}

/**
 * Prefer the last **non-generic** `!` block. Logs often end with `! ==> Fatal error…`
 * which would hide `! LaTeX Error` / `!pdfTeX error` above.
 */
function takeLinesUntilGenericFatal(lines: string[], start: number, maxAfter: number): string {
  const out: string[] = [];
  const end = Math.min(lines.length, start + maxAfter);
  for (let j = start; j < end; j++) {
    const line = lines[j] ?? "";
    if (j > start && isGenericBangLine(line)) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

function lastMeaningfulExclamationBlock(lines: string[], maxAfter = 14): string | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = (lines[i] ?? "").trim();
    if (!t.startsWith("!")) continue;
    if (isGenericBangLine(t)) continue;
    return takeLinesUntilGenericFatal(lines, i, maxAfter);
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = (lines[i] ?? "").trim();
    if (t.startsWith("!")) {
      return takeLinesUntilGenericFatal(lines, i, maxAfter);
    }
  }
  return null;
}

/** `graphicx` / pdftex.def when an image path is missing (common in Notebook: .tex only, no asset bundle). */
function snippetAroundPdftexMissingFile(focused: string): string | null {
  const fileNotFound = /File [`']([^`']+\.(?:pdf|png|jpe?g|eps|ps|svg))[`''] not found(?::| using draft)?/i;
  let idx = focused.search(/(?:^|\n)!\s*Package pdftex\.def Error:\s*File/i);
  if (idx < 0) idx = focused.search(/Package pdftex\.def Error:\s*File/i);
  if (idx < 0) {
    const m = focused.match(fileNotFound);
    if (m?.index != null) idx = m.index;
  }
  if (idx < 0) return null;
  const lineStart = focused.lastIndexOf("\n", idx) + 1;
  const chunk = focused.slice(lineStart, lineStart + 1200);
  const lines = chunk.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length && out.length < 14; i++) {
    const line = lines[i] ?? "";
    out.push(line);
    if (/Here is how much of TeX's memory/i.test(line)) break;
  }
  return out.join("\n").trim();
}

/** User-facing hint when the log shows a missing \\includegraphics target. */
export function missingBundledFileHint(fullMessage: string): string | null {
  const m = fullMessage.match(/File [`']([^`']+)[`''] not found(?::| using draft)?/i);
  if (!m?.[1]) return null;
  const name = m[1].trim();
  if (!/\.(pdf|png|jpe?g|eps|ps|svg)$/i.test(name)) return null;
  return `Notebook compiles text-only .tex (no image files are uploaded). Remove or comment out \\\\includegraphics{${name}}, draw with TikZ/tikz-cd, or use a text/fbox placeholder.`;
}

/** Pull meaningful LaTeX error lines (prefer real `! …` lines, not the BusyTeX fatal tail). */
export function extractLaTeXErrorSnippet(log: string, maxLines = 10): string {
  const focused = narrowToPdflatexLogSection(log);
  const pdftexSnip = snippetAroundPdftexMissingFile(focused);
  if (pdftexSnip) return pdftexSnip;

  const lines = focused.split(/\r?\n/);

  const bang = lastMeaningfulExclamationBlock(lines);
  if (bang) return bang;

  const hits: string[] = [];
  for (let i = lines.length - 1; i >= 0 && hits.length < maxLines; i--) {
    const line = lines[i] ?? "";
    const t = line.trim();
    if (GENERIC_BUSY_TAIL.test(t) || isGenericBangLine(t)) continue;
    if (
      /^!/.test(t) ||
      /^l\.\d+/.test(t) ||
      /^<\*>|^<\w+>/.test(t) ||
      /Emergency stop|Emergency|stop>|cannot find|not found|Undefined control sequence|LaTeX Error|\.sty'|\.cls'|capacity exceeded|Memory|Out of memory|wasm|WebAssembly|aborted|pdfTeX error/i.test(
        t
      )
    ) {
      hits.unshift(line.length > 200 ? `${line.slice(0, 197)}…` : line);
    }
  }
  if (hits.length) return hits.join("\n");

  return lines
    .slice(-18)
    .join("\n")
    .trim();
}

const MAX_TOAST_CHARS = 420;

/** Truncate for UI: keep the *end* (LaTeX errors are at the bottom of the log). */
function clipTail(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `…${t.slice(-(max - 1))}`;
}

/** Short string for Error.message / combined fallback text (not the full TeX transcript). */
export function briefCompileMessage(text: string, max = MAX_TOAST_CHARS): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const sn = extractLaTeXErrorSnippet(t);
  const body = (sn.length >= 20 ? sn : clipTail(t, Math.min(t.length, max + 160))).trim();
  return clipTail(body, max);
}

export function wasmLatexFailureMessage(log: string, exitCode: number): string {
  const core = briefCompileMessage(log, MAX_TOAST_CHARS - 36);
  return `LaTeX failed (exit ${exitCode}). ${core}`;
}

/** Normalize any thrown compile error for toast + log the full text to the console. */
export function formatCompileFailureToast(err: unknown, logContext = "Compile"): { title: string; description: string } {
  const raw = err instanceof Error ? err.message : String(err);
  console.error(`[${logContext}]`, err);
  if (raw.length > 500) {
    console.error(`[${logContext}] full message (${raw.length} chars):`, raw);
  }

  const clipped = briefCompileMessage(raw, MAX_TOAST_CHARS);
  const assetHint =
    /Notebook compiles text-only/i.test(raw) ? null : missingBundledFileHint(raw);
  const tail =
    raw.length > clipped.length + 20
      ? "\n\nFull details are in the browser console (F12)."
      : "";
  const description = [clipped || "Unknown error", assetHint ? `\n\n${assetHint}` : "", tail].join("");

  return { title: "Compile failed", description };
}
