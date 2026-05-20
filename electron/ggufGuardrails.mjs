/**
 * Mirror of `src/lib/localGguf/guardrails.ts` for the main process (keep in sync).
 */

export const GGUF_ABSOLUTE_MAX_PARAM_B = 16;

export function normalizeGgufMaxParamB(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (n >= 16) return 16;
  return 8;
}

const QUANT_PATTERNS = [
  { re: /Q8_0|Q8_K|q8[_-]?0/i, label: "Q8" },
  { re: /Q4_K_M|Q4_K_S|Q4_0|Q4_K|q4[_-]?k|q4[_-]?0/i, label: "Q4" },
  { re: /F16|fp16|f16/i, label: "F16" },
  { re: /F32|fp32/i, label: "F32" },
];

function guessQuant(fileName) {
  const base = fileName.split("/").pop() ?? fileName;
  for (const { re, label } of QUANT_PATTERNS) {
    if (re.test(base)) return label;
  }
  return null;
}

export function parseParamBillions(repoId, fileName) {
  const hay = `${repoId}/${fileName}`.toLowerCase();
  const matches = [...hay.matchAll(/(?:^|[^0-9])(\d+(?:\.\d+)?)\s*b(?:illion)?(?:[^a-z]|$)/gi)];
  if (!matches.length) return null;
  let max = 0;
  for (const m of matches) {
    const v = parseFloat(m[1]);
    if (Number.isFinite(v) && v > max) max = v;
  }
  return max > 0 ? max : null;
}

export function maxDownloadBytesForPolicy(maxParamB) {
  const gib = maxParamB <= 8 ? 8 : 14;
  return gib * 1024 ** 3;
}

function isHighRiskQuant(fileName) {
  const q = guessQuant(fileName);
  return q === "F16" || q === "F32";
}

export function assertGgufDownloadAllowed({ repoId, fileName, fileSizeBytes, maxParamB }) {
  const policyB = Math.min(GGUF_ABSOLUTE_MAX_PARAM_B, normalizeGgufMaxParamB(maxParamB));
  const paramB = parseParamBillions(repoId, fileName);
  const maxBytes = maxDownloadBytesForPolicy(policyB);

  if (paramB != null && paramB > policyB) {
    throw new Error(
      `Model looks like ~${paramB}B parameters. Safety limit is ${policyB}B (max ${GGUF_ABSOLUTE_MAX_PARAM_B}B in Settings).`
    );
  }

  const size = fileSizeBytes;
  if (typeof size === "number" && size > 0) {
    if (size > maxBytes) {
      throw new Error(
        `File is ~${(size / 1024 ** 3).toFixed(1)} GiB, above the ~${(maxBytes / 1024 ** 3).toFixed(0)} GiB cap for ${policyB}B policy.`
      );
    }
    if (paramB == null && size > 6 * 1024 ** 3) {
      throw new Error(
        "Parameter size unclear and file is over 6 GiB. Choose a smaller model with a clear size in the filename (e.g. 3B, 7B)."
      );
    }
  }

  if (isHighRiskQuant(fileName) && paramB != null && paramB >= 3) {
    throw new Error(`Full-precision quant for ~${paramB}B models is blocked. Use Q4/Q5/IQ instead.`);
  }
}
