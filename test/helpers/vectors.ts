/** Unit vectors for semantic similarity tests (no model download). */

export function unitVector(dim: number, index: number): number[] {
  const v = new Array(dim).fill(0);
  v[index % dim] = 1;
  return v;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
