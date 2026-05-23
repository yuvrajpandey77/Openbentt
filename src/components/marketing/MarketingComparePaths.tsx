import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MarketingReveal } from "@/components/marketing/MarketingReveal";
import { MarketingSectionHeader } from "@/components/marketing/MarketingSectionHeader";
import { comparePaths } from "@/config/marketingContent";
import { cn } from "@/lib/utils";
import { Globe, Monitor } from "lucide-react";

const pathMeta = {
  desktop: { icon: Monitor, iconClassName: "bg-primary/10 text-primary" },
  web: { icon: Globe, iconClassName: "bg-primary/10 text-primary dark:text-primary" },
} as const;

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

        <div className="mt-12 grid gap-6 lg:grid-cols-2 lg:gap-8">
          {paths.map((path, i) => {
            const meta = path.id === "web" ? pathMeta.web : pathMeta.desktop;
            const Icon = meta.icon;

            return (
              <MarketingReveal key={path.title} delay={i * 80}>
                <article
                  id={path.id === "web" ? "run-locally" : undefined}
                  className="marketing-card flex h-full flex-col p-6 md:p-8"
                >
                  <div
                    className={cn(
                      "mb-5 flex h-12 w-12 items-center justify-center rounded-xl",
                      meta.iconClassName
                    )}
                  >
                    <Icon className="h-6 w-6" strokeWidth={2} aria-hidden />
                  </div>
                  <h3 className="font-display text-xl font-semibold text-foreground md:text-2xl">{path.title}</h3>
                  <p className="mt-3 flex-1 text-base leading-relaxed text-muted-foreground md:text-lg">
                    {path.description}
                  </p>
                  <Button className="mt-6 w-fit rounded-xl font-medium" asChild>
                    <Link to={path.cta.to}>{path.cta.label}</Link>
                  </Button>
                </article>
              </MarketingReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
