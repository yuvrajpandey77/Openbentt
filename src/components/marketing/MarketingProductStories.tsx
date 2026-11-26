import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FeatureShowcaseVisual } from "@/components/marketing/FeatureShowcaseVisual";
import { MarketingReveal } from "@/components/marketing/MarketingReveal";
import { productStories } from "@/config/marketingContent";
import { cn } from "@/lib/utils";

/** Deep dives into real product workflows. */
export function MarketingProductStories() {
  return (
    <section id="features" className="marketing-section scroll-mt-32 border-t border-border/40" aria-label="Product deep dives">
      <div className="marketing-container">
        <MarketingReveal>
          <p className="marketing-eyebrow text-left">How it actually works</p>
          <h2 className="mt-3 max-w-3xl text-left font-display text-3xl font-semibold tracking-tight text-foreground md:text-4xl lg:text-[2.75rem] lg:leading-tight">
            From compile to agents to offline weights.
          </h2>
        </MarketingReveal>

        <div className="marketing-feature-stack">
          {productStories.map((story, i) => (
            <MarketingReveal key={story.id} delay={i * 40}>
              <article
                id={story.id}
                className={cn(
                  "grid scroll-mt-28 items-center gap-10 lg:grid-cols-2 lg:gap-16",
                  story.reverse && "lg:[&>div:first-child]:order-2 lg:[&>div:last-child]:order-1"
                )}
              >
                <div className="space-y-5">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">{story.kicker}</p>
                  <h3 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl lg:text-[2.15rem] lg:leading-tight">
                    {story.title}
                  </h3>
                  {story.body.map((p) => (
                    <p key={p.slice(0, 48)} className="text-base leading-relaxed text-muted-foreground md:text-lg">
                      {p}
                    </p>
                  ))}
                  <ul className="flex flex-wrap gap-2 pt-1">
                    {story.proof.map((chip) => (
                      <li
                        key={chip}
                        className="rounded-md border border-border/60 bg-transparent px-2.5 py-1 font-mono text-[11px] text-foreground/80"
                      >
                        {chip}
                      </li>
                    ))}
                  </ul>
                  <div className="pt-2">
                    <Button size="lg" className="rounded-xl px-6 font-medium" asChild>
                      <Link to={story.cta.to}>{story.cta.label}</Link>
                    </Button>
                  </div>
                </div>
                <div className="marketing-showcase-frame">
                  <FeatureShowcaseVisual variant={story.visual} />
                </div>
              </article>
            </MarketingReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
