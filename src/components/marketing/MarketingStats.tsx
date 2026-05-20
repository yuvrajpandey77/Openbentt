import { punchStats } from "@/config/marketingContent";
import { MarketingReveal } from "@/components/marketing/MarketingReveal";

export function MarketingStats() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {punchStats.map((stat, i) => (
        <MarketingReveal key={stat.headline} as="li" delay={i * 80}>
          <div className="marketing-stat h-full transition-shadow duration-300 hover:shadow-md">
            <p className="text-lg font-semibold tracking-tight text-foreground md:text-xl">{stat.headline}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">{stat.subline}</p>
          </div>
        </MarketingReveal>
      ))}
    </ul>
  );
}
