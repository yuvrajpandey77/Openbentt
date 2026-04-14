import React from "react";
import type { ResearchSourceRef } from "@/types/chat";
import { Badge } from "@/components/ui/badge";

interface MessageReferencesProps {
  sources: ResearchSourceRef[];
}

/** Shown after the assistant body: URLs gathered for this turn (grounding). */
export const MessageReferences: React.FC<MessageReferencesProps> = ({ sources }) => {
  if (!sources.length) return null;
  return (
    <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
      <div className="font-semibold mb-2 text-foreground">References</div>
      <ul className="space-y-2.5 list-none p-0 m-0">
        {sources.map((s, i) => (
          <li key={i} className="border-b border-border/40 last:border-0 pb-2.5 last:pb-0">
            <div className="font-medium text-foreground flex flex-wrap items-center gap-2">
              {s.title}
              {s.kind && (
                <Badge variant="outline" className="text-[10px] font-normal">
                  {s.kind}
                </Badge>
              )}
            </div>
            {s.url && (
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all text-[11px] block mt-0.5"
              >
                {s.url}
              </a>
            )}
            {s.snippet ? <p className="text-muted-foreground mt-1 leading-snug">{s.snippet}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
};
