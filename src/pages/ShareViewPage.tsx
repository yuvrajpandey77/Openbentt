import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { decodeShareSnapshot, snapshotToMessages } from "@/lib/shareRun";
import type { Message } from "@/types/chat";
import { AssistantContent } from "@/components/AssistantContent";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const ShareViewPage: React.FC = () => {
  const [title, setTitle] = useState("Shared run");
  const [frozenAt, setFrozenAt] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const h = window.location.hash.replace(/^#/, "");
    if (!h) {
      setErr("No snapshot in URL hash.");
      return;
    }
    const snap = decodeShareSnapshot(h);
    if (!snap) {
      setErr("Invalid or corrupted snapshot.");
      return;
    }
    setTitle(snap.title);
    setFrozenAt(snap.frozenAt);
    setMessages(snapshotToMessages(snap));
  }, []);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/chat">← Chat</Link>
          </Button>
          <Badge variant="secondary">Read-only</Badge>
        </div>
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {frozenAt && <p className="text-xs text-muted-foreground mt-1">Frozen {new Date(frozenAt).toLocaleString()}</p>}
        </div>
        {err && <p className="text-destructive text-sm">{err}</p>}
        <div className="space-y-6">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg border border-border/80 p-4 ${m.role === "user" ? "bg-secondary/30" : "bg-card"}`}
            >
              <div className="text-[10px] uppercase text-muted-foreground mb-2">{m.role}</div>
              {m.role === "assistant" ? (
                <>
                  <AssistantContent content={m.content} />
                  {m.researchSources && m.researchSources.length > 0 && (
                    <div className="mt-3 rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
                      <div className="font-semibold mb-2">Sources (frozen)</div>
                      <ul className="space-y-2 list-none p-0 m-0">
                        {m.researchSources.map((s, i) => (
                          <li key={i}>
                            <span className="font-medium">{s.title}</span>
                            {s.kind && (
                              <Badge variant="outline" className="ml-2 text-[10px]">
                                {s.kind}
                              </Badge>
                            )}
                            {s.url && (
                              <a href={s.url} className="block text-primary text-[11px] break-all" target="_blank" rel="noreferrer">
                                {s.url}
                              </a>
                            )}
                            <p className="text-muted-foreground mt-1">{s.snippet}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="whitespace-pre-wrap text-sm">{m.content}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ShareViewPage;
