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
    document.title = "Shared run · Openbentt";
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
    <div className="marketing-page min-h-screen bg-background">
      <header className="border-b border-border/50">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 md:px-6">
          <Link to="/" className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <img src="/openbentt-logo.svg" alt="" width={24} height={24} className="rounded-md" />
            Openbentt
          </Link>
          <Button variant="outline" size="sm" className="rounded-lg" asChild>
            <Link to="/">Openbentt</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
            {frozenAt && (
              <p className="mt-1 text-sm text-muted-foreground">Frozen {new Date(frozenAt).toLocaleString()}</p>
            )}
          </div>
          <Badge variant="secondary">Read-only snapshot</Badge>
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}

        <div className="space-y-5">
          {messages.map((m) => (
            <article
              key={m.id}
              className={`rounded-xl border border-border/70 p-4 ${m.role === "user" ? "bg-muted/30" : "bg-card"}`}
            >
              <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{m.role}</p>
              {m.role === "assistant" ? (
                <>
                  <AssistantContent content={m.content} />
                  {m.researchSources && m.researchSources.length > 0 && (
                    <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
                      <p className="mb-2 font-semibold">Sources (frozen)</p>
                      <ul className="m-0 list-none space-y-2 p-0">
                        {m.researchSources.map((s, i) => (
                          <li key={i}>
                            <span className="font-medium">{s.title}</span>
                            {s.kind && (
                              <Badge variant="outline" className="ml-2 text-[10px]">
                                {s.kind}
                              </Badge>
                            )}
                            {s.url && (
                              <a
                                href={s.url}
                                className="mt-1 block break-all text-[11px] text-primary"
                                target="_blank"
                                rel="noreferrer"
                              >
                                {s.url}
                              </a>
                            )}
                            <p className="mt-1 text-muted-foreground">{s.snippet}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
              )}
            </article>
          ))}
        </div>
      </main>
    </div>
  );
};

export default ShareViewPage;
