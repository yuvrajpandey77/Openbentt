import React, { Fragment, cloneElement, isValidElement } from "react";
import type { ReactNode } from "react";
import { MarkdownCodeBlock } from "@/components/MarkdownCodeBlock";

/** Visible search hit (yellow/amber) — works in light and dark. */
export const SEARCH_HIGHLIGHT_MARK_CLASS =
  "rounded-sm bg-primary/20 px-0.5 text-inherit ring-1 ring-primary/30 dark:bg-primary/40 dark:ring-primary/30";

/** Wrap all case-insensitive occurrences of `query` in `<mark>`. */
export function highlightSearchInText(text: string, query: string): ReactNode {
  const trimmed = query.trim();
  if (!trimmed) return text;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "gi");
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <mark key={`hl-${k++}`} className={SEARCH_HIGHLIGHT_MARK_CLASS}>
        {m[0]}
      </mark>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? <>{out}</> : text;
}

/**
 * Recursively highlight query in text nodes. Skips fenced code (`MarkdownCodeBlock`) so code content is unchanged.
 */
export function highlightInReactChildren(node: ReactNode, query: string): ReactNode {
  const trimmed = query.trim();
  if (!trimmed) return node;
  if (typeof node === "string" || typeof node === "number") {
    return highlightSearchInText(String(node), trimmed);
  }
  if (Array.isArray(node)) {
    return node.map((n, i) => <Fragment key={i}>{highlightInReactChildren(n, trimmed)}</Fragment>);
  }
  if (isValidElement(node)) {
    if (node.type === MarkdownCodeBlock) return node;
    const props = node.props as { children?: ReactNode };
    if (props.children == null) return node;
    return cloneElement(node, {}, highlightInReactChildren(props.children, trimmed));
  }
  return node;
}
