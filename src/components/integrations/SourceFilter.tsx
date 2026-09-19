/**
 * Phase 7 — Chat source filter (trusted application state, not model output).
 * The selected sources travel as tool input (`sources`) — the model cannot
 * invent source permissions.
 */
import { useState } from "react";

export const ALL_SOURCES = [
  { id: "google-drive", label: "Drive" },
  { id: "gmail", label: "Gmail" },
  { id: "google-calendar", label: "Calendar" },
  { id: "slack", label: "Slack" },
  { id: "github", label: "GitHub" },
  { id: "notion", label: "Notion" },
  { id: "local", label: "Openbentt" },
] as const;

interface Props {
  value: string[];
  onChange: (sources: string[]) => void;
}

export function SourceFilter({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const all = value.length === 0;
  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((s) => s !== id));
    else onChange([...value, id]);
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground"
      >
        {all ? "All sources" : `${value.length} source(s)`}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-44 rounded-xl border border-border bg-popover p-2 shadow-lg">
          <button
            type="button"
            onClick={() => {
              onChange([]);
              setOpen(false);
            }}
            className="w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted"
          >
            All sources
          </button>
          {ALL_SOURCES.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted">
              <input
                type="checkbox"
                checked={value.includes(s.id)}
                onChange={() => toggle(s.id)}
                className="h-3.5 w-3.5"
              />
              {s.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
