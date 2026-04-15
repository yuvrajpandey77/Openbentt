/**
 * Assistant messages can include fenced blocks the model (or user) outputs:
 * ```openbentt-chart
 * { JSON }
 * ```
 * Legacy ```cogerphere-chart``` is still parsed for backward compatibility.
 * Renders as Recharts in the UI (matplotlib-style workflow: model emits data → chart).
 */

export type ChartKind = "bar" | "line" | "area";

export interface ChartSeries {
  key: string;
  name: string;
  color?: string;
}

export interface OpenbenttChartSpec {
  kind: ChartKind;
  title?: string;
  /** Row key for X axis labels */
  xKey: string;
  series: ChartSeries[];
  rows: Record<string, string | number>[];
}

/** @deprecated Use {@link OpenbenttChartSpec} */
export type CogerphereChartSpec = OpenbenttChartSpec;

const BLOCK_RE = /```(?:openbentt-chart|cogerphere-chart)\s*([\s\S]*?)```/gi;

export function extractChartBlocks(markdown: string): { displayText: string; charts: OpenbenttChartSpec[] } {
  const charts: OpenbenttChartSpec[] = [];
  const displayText = markdown.replace(BLOCK_RE, (_full, jsonRaw: string) => {
    try {
      const parsed = JSON.parse(jsonRaw.trim()) as OpenbenttChartSpec;
      if (
        parsed &&
        typeof parsed === "object" &&
        parsed.xKey &&
        Array.isArray(parsed.series) &&
        Array.isArray(parsed.rows) &&
        (parsed.kind === "bar" || parsed.kind === "line" || parsed.kind === "area")
      ) {
        charts.push(parsed);
      }
    } catch {
      /* ignore bad JSON */
    }
    return "";
  });
  return { displayText: displayText.replace(/\n{3,}/g, "\n\n").trim(), charts };
}
