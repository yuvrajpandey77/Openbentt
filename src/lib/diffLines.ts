import { diffLines as diffLinesLib } from "diff";

export type LineDiffRow =
  | { kind: "equal"; line: string }
  | { kind: "remove"; line: string }
  | { kind: "add"; line: string };

/** Unified-style rows for proposal review UI. */
export function diffLineRows(oldText: string, newText: string): LineDiffRow[] {
  const parts = diffLinesLib(oldText, newText);
  const rows: LineDiffRow[] = [];
  for (const part of parts) {
    const chunk = part.value;
    const lines = chunk.split("\n");
    if (chunk.endsWith("\n")) lines.pop();
    const toWalk = lines.length ? lines : [""];
    for (const line of toWalk) {
      if (part.added) rows.push({ kind: "add", line });
      else if (part.removed) rows.push({ kind: "remove", line });
      else rows.push({ kind: "equal", line });
    }
  }
  return rows;
}

export function mergeProposalLines(proposedLines: string[], include: boolean[]): string {
  const out: string[] = [];
  for (let i = 0; i < proposedLines.length; i++) {
    if (include[i] !== false) out.push(proposedLines[i]);
  }
  return out.join("\n");
}
