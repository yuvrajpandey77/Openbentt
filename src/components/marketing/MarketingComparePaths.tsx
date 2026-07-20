import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MarketingReveal } from "@/components/marketing/MarketingReveal";
import { MarketingSectionHeader } from "@/components/marketing/MarketingSectionHeader";
import { comparePaths } from "@/config/marketingContent";
import { Monitor } from "lucide-react";

export function MarketingComparePaths() {
  return (
    <section id="compare" className="marketing-section marketing-section-band scroll-mt-32 border-y border-border/40">
      <div className="marketing-container">
        <MarketingSectionHeader
          eyebrow="Desktop-first"
          title="Full desktop workspace"
          lead="Offline GGUF, Research labs, tiled model arena, and long PDF sessions."
        />

        <div className="mt-12 mx-auto max-w-lg">
          <MarketingReveal>
            <article className="marketing-card flex h-full flex-col p-6 md:p-8">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Monitor className="h-6 w-6" strokeWidth={2} aria-hidden />
              </div>
              <h3 className="font-display text-xl font-semibold text-foreground md:text-2xl">{comparePaths.desktop.title}</h3>
              <p className="mt-3 flex-1 text-base leading-relaxed text-muted-foreground md:text-lg">
                {comparePaths.desktop.description}
              </p>
              <Button className="mt-6 w-fit rounded-xl font-medium" asChild>
                <Link to={comparePaths.desktop.cta.to}>{comparePaths.desktop.cta.label}</Link>
              </Button>
            </article>
          </MarketingReveal>
        </div>
      </div>
    </section>
  );
}
