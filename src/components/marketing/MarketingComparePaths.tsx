import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MarketingReveal } from "@/components/marketing/MarketingReveal";
import { MarketingSectionHeader } from "@/components/marketing/MarketingSectionHeader";
import { MarketingVisual } from "@/components/marketing/MarketingVisual";
import { comparePaths } from "@/config/marketingContent";
import { showcaseImages } from "@/config/marketingImages";

export function MarketingComparePaths() {
  const paths = [comparePaths.desktop, comparePaths.web] as const;

  return (
    <section id="compare" className="marketing-section marketing-section-band scroll-mt-32 border-y border-border/40">
      <div className="marketing-container">
        <MarketingSectionHeader
          eyebrow="Choose your path"
          title="Desktop depth or web convenience"
          lead="Same design language, different capabilities. Pick what fits today's session."
        />

        <div className="mt-12 grid gap-8 lg:grid-cols-2 lg:gap-10">
          {paths.map((path, i) => {
            const slot = showcaseImages[path.imageKey];

            return (
              <MarketingReveal key={path.title} delay={i * 100}>
                <article
                  id={path.imageKey === "run-locally" ? "run-locally" : undefined}
                  className="marketing-card flex h-full flex-col overflow-hidden p-0"
                >
                  <div className="marketing-showcase-frame rounded-none border-0 border-b border-border/50 shadow-none ring-0">
                    {slot && (
                      <MarketingVisual slot={slot} plain large className="rounded-none border-0 shadow-none ring-0" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-6 md:p-8">
                    <h3 className="font-display text-xl font-semibold text-foreground md:text-2xl">{path.title}</h3>
                    <p className="mt-3 flex-1 text-base leading-relaxed text-muted-foreground md:text-lg">
                      {path.description}
                    </p>
                    <Button className="mt-6 w-fit rounded-xl font-medium" asChild>
                      <Link to={path.cta.to}>{path.cta.label}</Link>
                    </Button>
                  </div>
                </article>
              </MarketingReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
