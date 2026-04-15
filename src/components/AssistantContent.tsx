import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { extractChartBlocks } from "@/lib/chartSpec";
import { OpenbenttChartViews } from "@/components/OpenbenttChartViews";
import type { Components } from "react-markdown";
import { MarkdownCodeBlock } from "@/components/MarkdownCodeBlock";
import { highlightInReactChildren } from "@/lib/highlightSearch";
import type { ReactNode } from "react";

interface AssistantContentProps {
  content: string;
  streaming?: boolean;
  /** When set (e.g. thread search), matching text is highlighted; fenced code blocks are skipped. */
  highlightQuery?: string;
}

function makeMarkdownComponents(highlightQuery: string | undefined): Components {
  const q = highlightQuery?.trim() ?? "";
  const H = (children: ReactNode) => (q ? highlightInReactChildren(children, q) : children);

  return {
    a: ({ href, children, ...rest }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary font-medium underline underline-offset-2 decoration-primary/40 hover:decoration-primary"
        {...rest}
      >
        {H(children)}
      </a>
    ),
    table: ({ children, ...props }) => (
      <div className="my-4 w-full overflow-x-auto rounded-lg border border-border/60 bg-muted/10">
        <table className="w-full min-w-[20rem] border-collapse text-sm" {...props}>
          {children}
        </table>
      </div>
    ),
    thead: (props) => <thead className="bg-muted/50" {...props} />,
    th: ({ children, ...props }) => (
      <th
        className="border border-border/50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        {...props}
      >
        {H(children)}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td className="border border-border/40 px-3 py-2 align-top text-sm leading-relaxed text-foreground" {...props}>
        {H(children)}
      </td>
    ),
    tr: (props) => <tr className="even:bg-muted/20" {...props} />,
    pre: ({ children }) => <MarkdownCodeBlock>{children}</MarkdownCodeBlock>,
    code: ({ className, children, ...props }) => {
      const isBlock = typeof className === "string" && className.includes("language-");
      if (isBlock) {
        return (
          <code className={`font-mono text-[0.85em] text-foreground ${className ?? ""}`} {...props}>
            {children}
          </code>
        );
      }
      return (
        <code
          className="rounded-md bg-muted/80 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
          {...props}
        >
          {H(children)}
        </code>
      );
    },
    ul: ({ children, ...props }) => (
      <ul className="my-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground marker:text-foreground" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol className="my-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-foreground marker:text-foreground" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => (
      <li className="leading-relaxed text-foreground" {...props}>
        {H(children)}
      </li>
    ),
    blockquote: ({ children, ...props }) => (
      <blockquote
        className="my-3 border-l-4 border-primary/40 pl-4 text-sm italic text-muted-foreground"
        {...props}
      >
        {H(children)}
      </blockquote>
    ),
    hr: () => <hr className="my-6 border-border/60" />,
    h1: ({ children, ...props }) => (
      <h1 className="mt-4 mb-2 text-xl font-bold tracking-tight text-foreground first:mt-0" {...props}>
        {H(children)}
      </h1>
    ),
    h2: ({ children, ...props }) => (
      <h2 className="mt-5 mb-2 text-lg font-semibold tracking-tight text-foreground first:mt-0" {...props}>
        {H(children)}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3 className="mt-4 mb-1.5 text-base font-semibold text-foreground first:mt-0" {...props}>
        {H(children)}
      </h3>
    ),
    p: ({ children, ...props }) => (
      <p className="my-2 text-sm leading-relaxed text-foreground last:mb-0 first:mt-0" {...props}>
        {H(children)}
      </p>
    ),
  };
}

/** Renders markdown (GFM tables, lists) with optional ```openbentt-chart``` JSON blocks as live charts. */
export const AssistantContent: React.FC<AssistantContentProps> = ({ content, streaming, highlightQuery }) => {
  const { displayText, charts } = extractChartBlocks(content);
  const markdownComponents = useMemo(() => makeMarkdownComponents(highlightQuery), [highlightQuery]);
  return (
    <div className="space-y-2">
      <div className="prose prose-sm max-w-none text-foreground dark:prose-invert prose-p:leading-relaxed prose-headings:scroll-mt-20 prose-p:text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-li:text-foreground prose-td:text-foreground">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {displayText || (streaming ? "" : "\u00a0")}
        </ReactMarkdown>
        {streaming && !displayText && <span className="inline-block w-0.5 h-4 bg-primary typing-cursor ml-1" />}
      </div>
      {charts.length > 0 && <OpenbenttChartViews charts={charts} />}
    </div>
  );
};
