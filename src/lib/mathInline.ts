/**
 * `[[calc:...]]` substitution.
 *
 * mathjs is a large module (~633 kB minified in this build). Loading it at
 * startup slowed every app launch — including users who never use the tool —
 * so it is imported on first use and cached afterwards.
 */
type MathEvaluator = { evaluate: (expr: string) => unknown };

let mathPromise: Promise<MathEvaluator> | null = null;

async function getMath(): Promise<MathEvaluator> {
  if (!mathPromise) {
    mathPromise = import("mathjs")
      .then(({ create, all }) => create(all, {}) as MathEvaluator)
      .catch((err) => {
        mathPromise = null; // allow a retry after a transient load failure
        throw err;
      });
  }
  return mathPromise;
}

/** Replace `[[calc:expression]]` with evaluated result (numeric/string). */
export async function substituteInlineCalc(text: string): Promise<string> {
  if (!text.includes("[[calc:")) return text;
  const math = await getMath();
  return text.replace(/\[\[calc:([\s\S]*?)\]\]/g, (_full, expr: string) => {
    try {
      const v = math.evaluate(expr.trim());
      if (v === undefined || v === null) return "";
      if (typeof v === "object" && v !== null && "toString" in v) {
        return String(v.toString());
      }
      return String(v);
    } catch {
      return `[calc error: ${expr.trim()}]`;
    }
  });
}
