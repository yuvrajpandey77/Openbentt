import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import type { OpenbenttChartSpec } from "@/lib/chartSpec";
import { Card } from "@/components/ui/card";

function pickColors(series: OpenbenttChartSpec["series"], index: number): string {
  const fallback = ["hsl(var(--primary))", "#6366f1", "#14b8a6", "#f97316", "#a855f7"];
  return series[index]?.color || fallback[index % fallback.length];
}

export const OpenbenttChartViews: React.FC<{ charts: OpenbenttChartSpec[] }> = ({ charts }) => {
  if (charts.length === 0) return null;
  return (
    <div className="space-y-4 mt-4">
      {charts.map((spec, i) => (
        <Card key={i} className="p-4 border border-border/80 bg-muted/20">
          {spec.title && <h4 className="text-sm font-semibold mb-3 text-foreground">{spec.title}</h4>}
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {spec.kind === "bar" ? (
                <BarChart data={spec.rows}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                  <XAxis dataKey={spec.xKey} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                  />
                  <Legend />
                  {spec.series.map((s, j) => (
                    <Bar key={s.key} dataKey={s.key} name={s.name} fill={pickColors(spec.series, j)} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              ) : spec.kind === "line" ? (
                <LineChart data={spec.rows}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                  <XAxis dataKey={spec.xKey} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                  />
                  <Legend />
                  {spec.series.map((s, j) => (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.name}
                      stroke={pickColors(spec.series, j)}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              ) : (
                <AreaChart data={spec.rows}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                  <XAxis dataKey={spec.xKey} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                  />
                  <Legend />
                  {spec.series.map((s, j) => (
                    <Area
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.name}
                      stroke={pickColors(spec.series, j)}
                      fill={pickColors(spec.series, j)}
                      fillOpacity={0.15}
                    />
                  ))}
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </Card>
      ))}
    </div>
  );
};
