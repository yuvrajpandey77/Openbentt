/**
 * Pull `.tex` out of assistant chat: prefers ```latex / ```tex fenced blocks;
 * if several blocks exist, prefers the one containing \\documentclass.
 */
export function extractTexFromAssistantReply(raw: string): string {
  const t = raw.trim();
  const blocks: { inner: string; score: number }[] = [];
  const re = /```(?:latex|tex)?\s*\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const inner = m[1]!.trim();
    let score = 0;
    if (inner.includes("\\documentclass")) score += 4;
    if (inner.includes("\\begin{document}")) score += 2;
    if (inner.includes("\\chapter") || inner.includes("\\section")) score += 1;
    blocks.push({ inner, score });
  }
  if (blocks.length) {
    blocks.sort((a, b) => b.score - a.score);
    return blocks[0]!.inner;
  }
  return t;
}
