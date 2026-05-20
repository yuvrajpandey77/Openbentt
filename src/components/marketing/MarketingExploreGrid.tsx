import { Link } from "react-router-dom";
import { MarketingReveal } from "@/components/marketing/MarketingReveal";
import { MarketingSectionHeader } from "@/components/marketing/MarketingSectionHeader";
import { exploreItems } from "@/config/marketingContent";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

export function MarketingExploreGrid() {
  return (
    <section id="explore" className="marketing-section scroll-mt-32">
      <div className="marketing-container">
        <MarketingSectionHeader
          eyebrow="Explore"
          title="Jump to what you need"
          lead="Six capabilities with quick links. Full previews are in the features section below."
        />

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:mt-14 lg:grid-cols-3 lg:gap-5">
          {exploreItems.map((item, i) => {
            const Icon = item.icon;
            return (
              <MarketingReveal key={item.id} as="li" delay={i * 40}>
                <Link
                  to={item.href}
                  className="marketing-card group flex h-full flex-col p-5 md:p-6"
                >
                  <div
                    className={cn(
                      "mb-4 flex h-11 w-11 items-center justify-center rounded-xl",
                      item.iconClassName
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{item.summary}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Learn more
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              </MarketingReveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
