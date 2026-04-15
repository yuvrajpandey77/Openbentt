/**
 * `\item Git & GitHub` triggers "Misplaced alignment tab character &" in many setups
 * because `&` is special. Prose "and" must be `Git \& GitHub`.
 *
 * We only touch lines that look like list items and do not contain `\begin{tabular`
 * on the same line (so nested tables in an item are left alone).
 */
const PRESERVE = "__CPH_AMP_ESC__";

export function escapeAmpersandsOnItemLines(tex: string): string {
  return tex
    .split("\n")
    .map((line) => {
      if (!/^\s*\\item\b/.test(line) || /\\begin\{tabular/.test(line)) return line;
      const preserved = line.replace(/\\&/g, PRESERVE);
      return preserved.replace(/&/g, "\\&").split(PRESERVE).join("\\&");
    })
    .join("\n");
}
