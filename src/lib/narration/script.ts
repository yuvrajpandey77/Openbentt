/** Turn a markdown reply into short spoken lines and matching display chunks. */

export type NarrationChunk = {
  markdown: string;
  /** Null for code and other blocks that should stay on screen and not be read. */
  speak: string | null;
};

const CODE_FENCE = /```[\s\S]*?```/g;

export function stripSpeakMarkup(raw: string): string {
  return raw
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/[*_~`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const bits = clean.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  for (const bit of bits) {
    const t = bit.trim();
    if (t.length < 2) continue;
    if (t.length <= 420) {
      out.push(t);
      continue;
    }
    for (let i = 0; i < t.length; i += 420) out.push(t.slice(i, i + 420).trim());
  }
  return out.slice(0, 36);
}

export function buildNarrationScript(markdown: string): NarrationChunk[] {
  const source = markdown.replace(/```openbentt-chart[\s\S]*?```/g, "").trim();
  if (!source) return [];
  const chunks: NarrationChunk[] = [];
  let last = 0;
  for (const match of source.matchAll(CODE_FENCE)) {
    const index = match.index ?? 0;
    pushProse(chunks, source.slice(last, index));
    chunks.push({ markdown: match[0], speak: null });
    last = index + match[0].length;
  }
  pushProse(chunks, source.slice(last));
  return chunks.filter((c) => c.markdown.trim()).slice(0, 80);
}

function pushProse(chunks: NarrationChunk[], raw: string) {
  const paragraphs = raw
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const paragraph of paragraphs) {
    const sentences = splitSentences(stripSpeakMarkup(paragraph));
    if (!sentences.length) {
      chunks.push({ markdown: paragraph, speak: null });
      continue;
    }
    if (sentences.length === 1) {
      chunks.push({ markdown: paragraph, speak: sentences[0]! });
      continue;
    }
    for (const sentence of sentences) chunks.push({ markdown: sentence, speak: sentence });
  }
}

export function speakableChunks(chunks: NarrationChunk[]): NarrationChunk[] {
  return chunks.filter((c) => c.speak);
}
