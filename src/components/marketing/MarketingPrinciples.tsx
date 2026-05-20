import type { HeroPrinciple } from "@/config/marketingContent";
import { MarketingReveal } from "@/components/marketing/MarketingReveal";
import { cn } from "@/lib/utils";

type MarketingPrinciplesProps = {
  items: HeroPrinciple[];
  className?: string;
};

export function MarketingPrinciples({ items, className }: MarketingPrinciplesProps) {
  return (
    <ul className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-5", className)}>
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <MarketingReveal
            key={item.title}
            as="li"
            delay={i * 70}
            className="rounded-xl border border-border/60 bg-card/90 px-4 py-4 transition-all duration-300 hover:border-primary/25 hover:shadow-md"
          >
            <div
              className={cn(
                "mb-3 flex h-9 w-9 items-center justify-center rounded-lg",
                item.iconClassName
              )}
            >
              <Icon className="h-[1.15rem] w-[1.15rem]" strokeWidth={2} aria-hidden />
            </div>
            <p className="text-sm font-semibold text-foreground">{item.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
          </MarketingReveal>
        );
      })}
    </ul>
  );
}
