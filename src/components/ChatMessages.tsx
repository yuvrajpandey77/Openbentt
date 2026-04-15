import React, { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Message } from "@/types/chat";
import { Bot, Pencil, RotateCcw, FileText, ChevronDown, Sparkles } from "lucide-react";
import { WORKSPACE_NAV_ITEMS } from "@/config/workspaceNav";
import { cn } from "@/lib/utils";
import { shortModelLabel } from "@/lib/openrouter";
import { AssistantContent } from "@/components/AssistantContent";
import { Button } from "@/components/ui/button";
import { useChat } from "@/context/ChatContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MessageReferences } from "@/components/MessageReferences";
import { AssistantMessageToolbar } from "@/components/AssistantMessageToolbar";
import { buildAssistantPlainText } from "@/lib/assistantPlainText";

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
}

function MetricsBar({ metrics }: { metrics: NonNullable<Message["metrics"]> }) {
  const parts: string[] = [];
  if (metrics.ttftMs != null) parts.push(`TTFT ${metrics.ttftMs} ms`);
  parts.push(`Total ${metrics.totalMs} ms`);
  if (metrics.completionTokens != null) parts.push(`${metrics.completionTokens} tok out`);
  if (metrics.promptTokens != null) parts.push(`${metrics.promptTokens} tok in`);
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-border/60 pt-2 text-[11px] text-muted-foreground font-mono">
      {parts.map((p) => (
        <span key={p}>{p}</span>
      ))}
    </div>
  );
}

const AssistantRoleContent: React.FC<{
  message: Message;
  idx: number;
  messages: Message[];
  isLoading: boolean;
  showAgentTraces: boolean;
}> = ({ message, idx, messages, isLoading, showAgentTraces }) => {
  const exportRef = useRef<HTMLDivElement>(null);
  const plainText = useMemo(() => buildAssistantPlainText(message), [message]);
  const toolsDisabled =
    isLoading &&
    idx === messages.length - 1 &&
    (message.comparisonResponses
      ? message.comparisonResponses.every((p) => !p.content.trim() && !p.error)
      : !message.content.trim());

  const streamingSingle =
    idx === messages.length - 1 &&
    isLoading &&
    message.content === "" &&
    !message.comparisonResponses?.length;

  if (message.comparisonResponses?.length) {
    return (
      <>
        <div ref={exportRef} className="space-y-3">
          <div
            className={cn(
              "grid gap-3 w-full",
              message.comparisonResponses.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
            )}
          >
            {message.comparisonResponses.map((part) => (
              <div
                key={part.id}
                className="rounded-lg border border-border/70 bg-background/50 p-3 min-h-[120px] flex flex-col text-foreground"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold truncate" title={part.model}>
                    {shortModelLabel(part.model)}
                  </span>
                  {part.streaming && (
                    <span className="text-[10px] uppercase tracking-wide text-primary">Streaming</span>
                  )}
                </div>
                {part.error ? (
                  <p className="text-sm text-destructive">{part.error}</p>
                ) : (
                  <div className="flex-1">
                    <AssistantContent content={part.content} streaming={part.streaming} />
                  </div>
                )}
                {part.metrics && <MetricsBar metrics={part.metrics} />}
              </div>
            ))}
          </div>
          <MessageReferences sources={message.researchSources ?? []} />
        </div>
        <AssistantMessageToolbar
          exportRef={exportRef}
          plainText={plainText}
          fileBaseName={`compare-${message.id.slice(0, 8)}`}
          disabled={toolsDisabled}
        />
      </>
    );
  }

  return (
    <>
      <div ref={exportRef}>
        <AssistantContent content={message.content} streaming={streamingSingle} />
        <MessageReferences sources={message.researchSources ?? []} />
      </div>
      {message.metrics && <MetricsBar metrics={message.metrics} />}
      {showAgentTraces && message.agentTrace && message.agentTrace.length > 0 && (
        <Collapsible className="mt-3 rounded-lg border border-dashed border-border/60 bg-muted/15">
          <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ChevronDown className="h-4 w-4 shrink-0" />
            Agent / research trace
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pb-3 space-y-1.5 text-[11px] font-mono text-muted-foreground">
            {message.agentTrace.map((t, i) => (
              <div key={i}>
                <span className="text-primary/90">{t.step}</span>: {t.detail}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
      <AssistantMessageToolbar
        exportRef={exportRef}
        plainText={plainText}
        fileBaseName={`msg-${message.id.slice(0, 8)}`}
        disabled={toolsDisabled}
      />
    </>
  );
};

const ChatMessages: React.FC<ChatMessagesProps> = ({ messages, isLoading }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { beginEditUserMessage, regenerateLastResponse, apiConfig } = useChat();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const hasAssistant = messages.some((m) => m.role === "assistant");
  const lastAssistantIdx = [...messages].map((m, i) => ({ m, i })).filter((x) => x.m.role === "assistant").pop()?.i;
  const lastMsg = messages[messages.length - 1];
  const showRetry =
    lastMsg?.role === "assistant" && !lastMsg.comparisonResponses && !isLoading;

  return (
    <ScrollArea className="flex-1 p-4 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-8">
        {messages.length === 0 ? (
          <div className="flex min-h-[min(70vh,560px)] items-center justify-center py-12">
            <div className="w-full max-w-2xl px-4 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="h-6 w-6" aria-hidden />
              </div>
              <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                Welcome to Openbentt
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground md:text-base">
                A local-first AI workspace: choose a model, attach files, turn on <strong>research</strong> in Settings,
                and compare replies. Your keys stay in this browser.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                {WORKSPACE_NAV_ITEMS.map((item) =>
                  item.disabled ? (
                    <span
                      key={item.to}
                      className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-border/40 bg-muted/15 px-3 py-1.5 text-xs font-medium text-muted-foreground/50 opacity-70"
                      aria-disabled="true"
                    >
                      <item.Icon className="h-3.5 w-3.5 text-muted-foreground/45" strokeWidth={2} />
                      {item.label}
                    </span>
                  ) : (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/35 hover:bg-primary/5"
                    >
                      <item.Icon className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
                      {item.label}
                    </Link>
                  )
                )}
              </div>
              <p className="mt-4 text-[11px] text-muted-foreground/90 md:text-xs">
                Open <strong className="text-foreground/90">Workspace</strong> in the sidebar for these tools — your{" "}
                <strong className="text-foreground/90">chats</strong> stay listed below them.
              </p>
              <div className="mt-10 grid grid-cols-1 gap-4 text-left sm:grid-cols-2">
                <div className="openbentt-card rounded-xl border border-border/80 p-4">
                  <h3 className="mb-2 font-medium text-foreground">Chat tips</h3>
                  <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                    <li>
                      • <strong className="text-foreground/90">Specs</strong> — model pricing &amp; context (by the model
                      name).
                    </li>
                    <li>
                      • <strong className="text-foreground/90">Retry</strong> on the last reply; <strong className="text-foreground/90">Edit</strong> on your message to tweak and resend.
                    </li>
                    <li>
                      • Charts: fenced <code className="rounded bg-muted px-1 text-[11px]">openbentt-chart</code> JSON
                      blocks render as live charts.
                    </li>
                  </ul>
                </div>
                <div className="openbentt-card rounded-xl border border-border/80 p-4">
                  <h3 className="mb-2 font-medium text-foreground">Multimodal</h3>
                  <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                    <li>• Images &amp; video (first frame) — pick a vision-capable model.</li>
                    <li>
                      • Audio — sent as <code className="rounded bg-muted px-1 text-[11px]">input_audio</code> when the
                      provider supports it.
                    </li>
                    <li>• PDFs — text is extracted and sent with your prompt.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : (
          messages.map((message, idx) => (
            <div
              key={message.id}
              className={cn(
                "w-full streaming-message group/msg",
                message.role === "user" ? "flex justify-end" : "flex justify-start"
              )}
            >
              <div
                className={cn(
                  "flex items-start gap-3 animate-fade-in w-full",
                  message.role === "user" ? "flex-row-reverse max-w-[min(100%,42rem)]" : ""
                )}
              >
                <div
                  className={cn(
                    "openbentt-card p-4 border border-border/80 shadow-sm",
                    message.role === "user" ? "bg-secondary/40" : "bg-card w-full max-w-full"
                  )}
                >
                  {message.role === "user" && message.attachments && message.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {message.attachments.map((a) => (
                        <div key={a.id} className="rounded-md border border-border overflow-hidden w-24 h-24 bg-muted/30">
                          {a.kind === "pdf" ? (
                            <div className="flex flex-col items-center justify-center h-full text-[10px] p-1 text-center text-muted-foreground">
                              <FileText className="h-8 w-8 text-primary" />
                              PDF
                            </div>
                          ) : a.kind === "audio" ? (
                            <div className="flex flex-col items-center justify-center h-full text-[10px] p-1 text-center text-muted-foreground">
                              Audio
                            </div>
                          ) : (
                            <img src={a.dataUrl} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {message.role === "user" ? (
                    <div className="prose prose-sm max-w-none text-foreground dark:prose-invert prose-p:text-foreground text-left">
                      <p className="m-0 whitespace-pre-wrap text-foreground">{message.content.trim() || "\u00a0"}</p>
                    </div>
                  ) : (
                    <>
                      <AssistantRoleContent
                        message={message}
                        idx={idx}
                        messages={messages}
                        isLoading={isLoading}
                        showAgentTraces={apiConfig.showAgentTraces}
                      />
                      {showRetry && idx === lastAssistantIdx && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5"
                            onClick={() => void regenerateLastResponse()}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Retry
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {message.role === "user" && (
                  <div className="flex flex-col gap-1 pt-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      title="Edit message"
                      onClick={() => beginEditUserMessage(message.id)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {isLoading && !hasAssistant && (
          <div className="flex items-start gap-3 animate-fade-in">
            <div className="p-2 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
              <Bot size={16} />
            </div>
            <div className="openbentt-card p-4 max-w-[85%] bg-card/90 border border-border/80">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Generating</span>
                <div className="flex gap-1">
                  <div className="animate-bounce h-2 w-2 bg-primary rounded-full" style={{ animationDelay: "0ms" }} />
                  <div className="animate-bounce h-2 w-2 bg-primary rounded-full" style={{ animationDelay: "150ms" }} />
                  <div className="animate-bounce h-2 w-2 bg-primary rounded-full" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
};

export default ChatMessages;
