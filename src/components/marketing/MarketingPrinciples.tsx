import type { HeroPrinciple } from "@/config/marketingContent";
import { cn } from "@/lib/utils";

type MarketingPrinciplesProps = {
  items: HeroPrinciple[];
  className?: string;
};

export function MarketingPrinciples({ items, className }: MarketingPrinciplesProps) {
  return (
    <ul className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-5", className)}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <li
            key={item.title}
            className="rounded-xl border border-border/60 bg-card/90 px-4 py-4"
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
          </li>
        );
      })}
    </ul>
  );
}
