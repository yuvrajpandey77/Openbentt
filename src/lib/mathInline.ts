import { create, all } from "mathjs";

const math = create(all, {});

/** Replace `[[calc:expression]]` with evaluated result (numeric/string). */
export function substituteInlineCalc(text: string): string {
  return text.replace(/\[\[calc:([\s\S]*?)\]\]/g, (_full, expr: string) => {
    try {
      const v = math.evaluate(expr.trim());
      if (v === undefined || v === null) return "";
      if (typeof v === "object" && v !== null && "toString" in v) {
        return String((v as { toString(): string }).toString());
      }
      return String(v);
    } catch {
      return `[calc error: ${expr.trim()}]`;
    }
  });
}
