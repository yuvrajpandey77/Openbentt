import { MarketingReveal } from "@/components/marketing/MarketingReveal";
import { cn } from "@/lib/utils";

type MarketingSectionHeaderProps = {
  title: string;
  lead?: string;
  eyebrow?: string;
  align?: "center" | "left";
  className?: string;
};

export function MarketingSectionHeader({
  title,
  lead,
  eyebrow,
  align = "center",
  className,
}: MarketingSectionHeaderProps) {
  const centered = align === "center";

  return (
    <MarketingReveal className={cn(centered && "text-center", className)}>
      {eyebrow && <p className="marketing-eyebrow">{eyebrow}</p>}
      <h2 className={cn("marketing-section-title", eyebrow && "mt-3")}>{title}</h2>
      {lead && (
        <p className={cn("marketing-section-lead", centered && "mx-auto max-w-2xl")}>{lead}</p>
      )}
    </MarketingReveal>
  );
}
