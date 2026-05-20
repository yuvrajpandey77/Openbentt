import { guessQuantLabelFromGgufFileName } from "@/lib/localGguf/ggufHints";

/** Hard ceiling — main process must mirror this. */
export const GGUF_ABSOLUTE_MAX_PARAM_B = 16;

export type GgufMaxParamPolicy = 8 | 16;

export interface GgufGuardrailPolicy {
  maxParamB: GgufMaxParamPolicy;
}

export const DEFAULT_GGUF_GUARDRAIL_POLICY: GgufGuardrailPolicy = {
  maxParamB: 8,
};

export function normalizeGgufMaxParamB(value: unknown): GgufMaxParamPolicy {
  const n = typeof value === "number" ? value : Number(value);
  if (n >= 16) return 16;
  return 8;
}

/**
 * Best-effort parameter count (billions) from repo id + GGUF filename.
 * Examples: `Llama-3.2-3B`, `Qwen2.5-7B-Instruct`, `0.5B`, `70B`.
 */
export function parseParamBillions(repoId: string, fileName: string): number | null {
  const hay = `${repoId}/${fileName}`.toLowerCase();
  const matches = [...hay.matchAll(/(?:^|[^0-9])(\d+(?:\.\d+)?)\s*b(?:illion)?(?:[^a-z]|$)/gi)];
  if (!matches.length) return null;
  let max = 0;
  for (const m of matches) {
    const v = parseFloat(m[1]!);
    if (Number.isFinite(v) && v > max) max = v;
  }
  return max > 0 ? max : null;
}

export function maxDownloadBytesForPolicy(maxParamB: GgufMaxParamPolicy): number {
  /** Q4 ~0.5–0.7 bytes/param; add headroom for larger quants. */
  const gib = maxParamB <= 8 ? 8 : 14;
  return gib * 1024 ** 3;
}

export function isHighRiskQuant(fileName: string): boolean {
  const q = guessQuantLabelFromGgufFileName(fileName);
  return q === "F16" || q === "F32";
}

export type GgufGuardrailVerdict =
  | { ok: true; paramB: number | null; warnings: string[] }
  | { ok: false; reason: string; warnings: string[] };

export function evaluateGgufDownload(opts: {
  repoId: string;
  fileName: string;
  fileSizeBytes: number | null | undefined;
  policy?: Partial<GgufGuardrailPolicy>;
}): GgufGuardrailVerdict {
  const policy: GgufGuardrailPolicy = {
    ...DEFAULT_GGUF_GUARDRAIL_POLICY,
    ...opts.policy,
    maxParamB: normalizeGgufMaxParamB(opts.policy?.maxParamB ?? DEFAULT_GGUF_GUARDRAIL_POLICY.maxParamB),
  };
  const warnings: string[] = [];
  const paramB = parseParamBillions(opts.repoId, opts.fileName);
  const maxBytes = maxDownloadBytesForPolicy(policy.maxParamB);

  if (paramB != null && paramB > policy.maxParamB) {
    return {
      ok: false,
      reason: `Model looks like ~${paramB}B parameters. Your safety limit is ${policy.maxParamB}B — choose a smaller model or raise the limit in Settings (max ${GGUF_ABSOLUTE_MAX_PARAM_B}B).`,
      warnings,
    };
  }

  if (paramB != null && paramB > 8 && policy.maxParamB === 8) {
    warnings.push(`~${paramB}B is large for 8 GiB RAM machines; prefer Q4 quants.`);
  }

  const size = opts.fileSizeBytes;
  if (typeof size === "number" && size > 0) {
    if (size > maxBytes) {
      const needGiB = (size / 1024 ** 3).toFixed(1);
      const capGiB = (maxBytes / 1024 ** 3).toFixed(0);
      return {
        ok: false,
        reason: `File is ~${needGiB} GiB, above the ~${capGiB} GiB cap for ${policy.maxParamB}B policy. Pick a smaller quant (Q4) or a smaller model.`,
        warnings,
      };
    }
    if (paramB == null && size > 6 * 1024 ** 3) {
      return {
        ok: false,
        reason:
          "Could not verify parameter size from the filename, and this file is over 6 GiB. Pick a smaller listed model or a file with a clear size (e.g. 7B, 3B) in the name.",
        warnings,
      };
    }
  }

  if (isHighRiskQuant(opts.fileName)) {
    if (paramB != null && paramB >= 3) {
      return {
        ok: false,
        reason: `Full-precision (${guessQuantLabelFromGgufFileName(opts.fileName)}) weights for ~${paramB}B models are blocked — use Q4/Q5/IQ quants instead.`,
        warnings,
      };
    }
    warnings.push("F16/F32 quants use much more RAM; prefer Q4 on laptops.");
  }

  if (paramB == null) {
    warnings.push("Parameter size unclear from name — download only if you trust this file.");
  }

  return { ok: true, paramB, warnings };
}

export function filterGgufFileNames(
  files: string[],
  repoId: string,
  policy: GgufGuardrailPolicy,
  fileSizes?: Record<string, number>
): { allowed: string[]; blocked: Array<{ fileName: string; reason: string }> } {
  const allowed: string[] = [];
  const blocked: Array<{ fileName: string; reason: string }> = [];
  for (const f of files) {
    const v = evaluateGgufDownload({
      repoId,
      fileName: f,
      fileSizeBytes: fileSizes?.[f],
      policy,
    });
    if (v.ok) allowed.push(f);
    else blocked.push({ fileName: f, reason: v.reason });
  }
  allowed.sort((a, b) => {
    const pa = parseParamBillions(repoId, a) ?? 999;
    const pb = parseParamBillions(repoId, b) ?? 999;
    if (pa !== pb) return pa - pb;
    const sa = fileSizes?.[a] ?? 0;
    const sb = fileSizes?.[b] ?? 0;
    return sa - sb;
  });
  return { allowed, blocked };
}

export function scoreGgufFileForDefault(files: string[], repoId: string): string | null {
  const q4 = files.filter((f) => /q4/i.test(f));
  const pool = q4.length ? q4 : files;
  const sorted = [...pool].sort((a, b) => {
    const pa = parseParamBillions(repoId, a) ?? 999;
    const pb = parseParamBillions(repoId, b) ?? 999;
    return pa - pb;
  });
  return sorted[0] ?? files[0] ?? null;
}
