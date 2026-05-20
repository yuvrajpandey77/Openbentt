/**
 * Heuristics for GGUF filenames (community naming is inconsistent; best-effort only).
 */

const QUANT_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /IQ[0-9]_?(?:XS|M|L|XL)/i, label: "IQ (quant)" },
  { re: /Q8_0|Q8_K|q8[_-]?0/i, label: "Q8" },
  { re: /Q6_K|q6[_-]?k/i, label: "Q6_K" },
  { re: /Q5_K_M|Q5_K_S|Q5_K|q5[_-]?k/i, label: "Q5_K" },
  { re: /Q4_K_M|Q4_K_S|Q4_0|Q4_K|q4[_-]?k|q4[_-]?0/i, label: "Q4" },
  { re: /Q3_K|q3/i, label: "Q3" },
  { re: /Q2_K|q2/i, label: "Q2" },
  { re: /F16|fp16|f16/i, label: "F16" },
  { re: /F32|fp32/i, label: "F32" },
];

/**
 * Best-effort quantization label from a `.gguf` file name.
 */
export function guessQuantLabelFromGgufFileName(fileName: string): string | null {
  const base = fileName.split("/").pop() ?? fileName;
  for (const { re, label } of QUANT_PATTERNS) {
    if (re.test(base)) return label;
  }
  return null;
}

/**
 * Very rough minimum VRAM (GiB) to **fully** hold weights (not KV cache). Err on the high side for UI hints.
 * Rule of thumb: file bytes × 1.15 for overhead, map to “next” GiB.
 */
export function estimateMinVramGiBForWeights(fileSizeBytes: number): number {
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) return 0;
  const withOverhead = (fileSizeBytes * 1.15) / 1024 ** 3;
  return Math.max(0.5, Math.ceil(withOverhead * 2) / 2);
}
