import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { LIMITS } from "@/lib/research/projectLimits";
import { Link } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Message } from "@/types/chat";
import { Pencil, RotateCcw, FileText, ChevronDown, BookOpen } from "lucide-react";
import { isDesktopApp } from "@/lib/isDesktopApp";
import { isWebClient } from "@/config/platformSurface";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { shortModelLabel } from "@/lib/openrouter";
import { AssistantContent } from "@/components/AssistantContent";
import { Button } from "@/components/ui/button";
import { useChat } from "@/context/ChatContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MessageReferences } from "@/components/MessageReferences";
import { AssistantMessageToolbar } from "@/components/AssistantMessageToolbar";
import { buildAssistantPlainText } from "@/lib/assistantPlainText";
import { highlightSearchInText } from "@/lib/highlightSearch";
import { ChatThinkingIndicator } from "@/components/ChatThinkingIndicator";
import { CompareUseInNotebook } from "@/components/research/CompareUseInNotebook";

const SCROLL_PIN_THRESHOLD_PX = 80;

function messageMatchesSearch(m: Message, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  if (m.role === "user") {
    if (m.content.toLowerCase().includes(t)) return true;
    return m.attachments?.some((a) => a.name.toLowerCase().includes(t)) ?? false;
  }
  return buildAssistantPlainText(m).toLowerCase().includes(t);
}

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  searchQuery?: string;
  emptyVariant?: "home" | "studio";
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
  highlightQuery?: string;
  compact?: boolean;
}> = ({ message, idx, messages, isLoading, showAgentTraces, highlightQuery, compact }) => {
  const exportRef = useRef<HTMLDivElement>(null);
  const plainText = useMemo(() => buildAssistantPlainText(message), [message]);
  const isLast = idx === messages.length - 1;
  const toolsDisabled =
    isLoading &&
    isLast &&
    (message.comparisonResponses
      ? message.comparisonResponses.every((p) => !p.content.trim() && !p.error)
      : !message.content.trim());

  const isStreamingSingle =
    isLast &&
    isLoading &&
    !message.comparisonResponses?.length;

  const streamingActive = Boolean(message.streaming || isStreamingSingle);

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
                  <div className="flex items-center gap-1 shrink-0">
                    {!part.streaming && !part.error && (
                      <CompareUseInNotebook model={part.model} content={part.content} />
                    )}
                    {part.streaming && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-primary">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                        Live
                      </span>
                    )}
                  </div>
                </div>
                {part.error ? (
                  <p className="text-sm text-destructive">
                    {highlightQuery?.trim()
                      ? highlightSearchInText(part.error, highlightQuery)
                      : part.error}
                  </p>
                ) : (
                  <div className="flex-1">
                    <AssistantContent
                      content={part.content}
                      streaming={part.streaming}
                      highlightQuery={highlightQuery}
                      compact={compact}
                    />
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
        <AssistantContent
          content={message.content}
          streaming={streamingActive}
          highlightQuery={highlightQuery}
          compact={compact}
        />
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

const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages,
  isLoading,
  searchQuery = "",
  emptyVariant = "home",
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  const { beginEditUserMessage, regenerateLastResponse, apiConfig } = useChat();
  const localOnDevice = apiConfig.aiProvider === "webgpu_gemma";

  const isNearBottom = useCallback((el: HTMLElement) => {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_PIN_THRESHOLD_PX;
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onScroll = () => {
      pinnedToBottomRef.current = isNearBottom(el);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [isNearBottom]);

  const visibleMessages = useMemo(() => {
    const base = !searchQuery.trim()
      ? messages
      : messages.filter((m) => messageMatchesSearch(m, searchQuery));
    /** Hide empty assistant placeholder until the first token arrives (avoids blank bubble + "stuck" feel). */
    if (!isLoading) return base;
    return base.filter((m, i) => {
      if (i !== base.length - 1) return true;
      if (m.role !== "assistant" || m.comparisonResponses) return true;
      return Boolean(String(m.content ?? "").trim());
    });
  }, [messages, searchQuery, isLoading]);

  const useVirtual = visibleMessages.length > LIMITS.maxChatMessagesVirtualize;
  const virtualizer = useVirtualizer({
    count: useVirtual ? visibleMessages.length : 0,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => 140,
    overscan: 6,
  });

  const scrollToBottom = useCallback(
    (instant: boolean) => {
      if (!pinnedToBottomRef.current) return;

      const viewport = viewportRef.current;
      if (useVirtual) {
        virtualizer.scrollToIndex(visibleMessages.length - 1, { align: "end", behavior: instant ? "auto" : "smooth" });
        return;
      }

      if (viewport) {
        if (instant) {
          viewport.scrollTop = viewport.scrollHeight;
        } else {
          bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        }
        return;
      }

      bottomRef.current?.scrollIntoView({ behavior: instant ? "auto" : "smooth", block: "end" });
    },
    [useVirtual, virtualizer, visibleMessages.length]
  );

  useEffect(() => {
    const isStreaming = isLoading || messages.some((m) => m.streaming);
    scrollToBottom(isStreaming);
  }, [messages, visibleMessages.length, isLoading, scrollToBottom]);

  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last?.role === "user") {
      pinnedToBottomRef.current = true;
    }
  }, [messages]);

  const lastMsg = messages[messages.length - 1];
  const showRetry =
    lastMsg?.role === "assistant" && !lastMsg.comparisonResponses && !isLoading;

  const renderMessage = (message: Message, displayIdx: number) => {
    const idx = messages.indexOf(message);
    const isLast = idx === messages.length - 1;
    const isActiveStream =
      (isLoading && isLast && message.role === "assistant") || Boolean(message.streaming);
    return (
    <div
      key={message.id}
      className={cn(
        "w-full streaming-message group/msg",
        isActiveStream && "streaming-message-active",
        message.role === "user" ? "flex justify-end mb-5" : "flex justify-start mb-5"
      )}
    >
      <div
        className={cn(
          "flex items-start gap-3 w-full",
          !isActiveStream && "animate-fade-in",
          message.role === "user" ? "flex-row-reverse max-w-[min(100%,42rem)]" : ""
        )}
      >
        <div
          className={cn(
            message.role === "user" ? "web-message-user" : "web-message-assistant w-full"
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
              <p className="m-0 whitespace-pre-wrap text-foreground">
                {searchQuery.trim()
                  ? highlightSearchInText(message.content.trim() || "\u00a0", searchQuery)
                  : message.content.trim() || "\u00a0"}
              </p>
            </div>
          ) : (
            <>
              <AssistantRoleContent
                message={message}
                idx={idx}
                messages={messages}
                isLoading={isLoading}
                showAgentTraces={apiConfig.showAgentTraces}
                highlightQuery={searchQuery}
                compact={emptyVariant === "studio"}
              />
              {showRetry && message.id === lastMsg?.id && (
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
    );
  };

  return (
    <ScrollArea
      viewportRef={viewportRef}
      className={cn(
        "min-h-0",
        isWebClient() && emptyVariant !== "studio" && "h-0 flex-1",
        emptyVariant === "studio"
          ? "h-full w-full p-2"
          : cn("flex-1", isWebClient() ? "px-0 py-3 sm:px-4 sm:py-3" : "p-4")
      )}
    >
      <div ref={scrollRef} className={cn("mx-auto max-w-3xl", isWebClient() && "web-chat-messages-inner w-full")}>
        {useVirtual && visibleMessages.length > 0 && (
          <p className="mb-4 text-center text-[11px] text-muted-foreground">
            Virtualized thread ({visibleMessages.length} messages) — scroll stays responsive.
          </p>
        )}
        {messages.length > 0 && visibleMessages.length === 0 && searchQuery.trim() ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            No messages match <span className="font-medium text-foreground">“{searchQuery.trim()}”</span>. Clear the search
            box to see the full thread.
          </div>
        ) : null}

        {messages.length === 0 ? (
          emptyVariant === "studio" ? (
            <p className="px-4 py-5 text-center text-xs leading-relaxed text-muted-foreground">
              No messages yet. Ask about your LaTeX draft, compile errors, citations, or uploaded PDFs.
            </p>
          ) : isDesktopApp() ? (
            <div className="flex min-h-[min(50vh,420px)] items-center justify-center py-10">
              <div className="w-full max-w-md px-4 text-center">
                <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
                  Chat
                </h2>
                <p className="mx-auto mt-2 text-sm leading-relaxed text-muted-foreground">
                  General AI questions outside a project. For LaTeX, PDFs, and research tools, open a project.
                </p>
                <Link
                  to="/projects"
                  className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-5 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
                >
                  <BookOpen className="h-4 w-4" strokeWidth={2} />
                  Open projects
                </Link>
                <Collapsible className="group mt-8 text-left">
                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mx-auto flex gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                      Tips
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4 text-left text-xs leading-relaxed text-muted-foreground">
                    <p>
                      <strong className="text-foreground/90">Sidebar</strong> — icons only; hover for labels. New chat,
                      history, Projects, Library, Settings.
                    </p>
                    <p>
                      <strong className="text-foreground/90">Projects</strong> — LaTeX editor, PDF proofreading, citations,
                      Zotero, notes (Tools tab in notebook).
                    </p>
                    <p>
                      <strong className="text-foreground/90">Retry / Edit</strong> on messages; attach images, audio, or PDFs
                      with vision-capable models.
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          ) : (
          <div className="flex min-h-[min(50vh,380px)] items-center justify-center py-8 sm:py-12">
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11 rounded-xl shadow-sm ring-1 ring-border/50">
                  <AvatarImage src="/openbentt-logo.svg" alt="" />
                  <AvatarFallback className="font-display text-xs">OB</AvatarFallback>
                </Avatar>
                <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  Openbentt
                </h2>
              </div>
              <p className="max-w-[16rem] text-sm text-muted-foreground">Ask anything below</p>
            </div>
          </div>
          )
        ) : useVirtual ? (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((vItem) => {
              const message = visibleMessages[vItem.index];
              return (
                <div
                  key={message.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vItem.start}px)`,
                  }}
                >
                  {renderMessage(message, vItem.index)}
                </div>
              );
            })}
          </div>
        ) : (
          visibleMessages.map((message, idx) => renderMessage(message, idx))
        )}

        {isLoading &&
          (!(lastMsg?.role === "assistant") ||
            !String(lastMsg.content ?? "").trim()) && (
          <div className="flex justify-start pb-8 streaming-message streaming-message-active">
            <div
              className={cn(
                "openbentt-card w-full border border-border/80 bg-card p-4 shadow-sm",
                emptyVariant === "studio" ? "max-w-full" : "max-w-[min(100%,42rem)]"
              )}
            >
              <ChatThinkingIndicator
                compact={emptyVariant === "studio"}
                localOnDevice={localOnDevice}
              />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
};

export default ChatMessages;
