import React from "react";
import { useInView } from "@/hooks/useInView";
import { cn } from "@/lib/utils";

type MarketingRevealProps = {
  children: React.ReactNode;
  className?: string;
  /** Stagger delay in milliseconds */
  delay?: number;
  as?: "div" | "section" | "article" | "li" | "ul";
};

export function MarketingReveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: MarketingRevealProps) {
  const { ref, inView } = useInView({ threshold: 0.1, once: true });

  return React.createElement(
    Tag,
    {
      ref,
      className: cn("marketing-reveal", inView && "marketing-reveal--visible", className),
      style: { "--reveal-delay": `${delay}ms` } as React.CSSProperties,
    },
    children
  );
}
