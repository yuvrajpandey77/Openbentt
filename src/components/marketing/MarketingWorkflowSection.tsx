import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MarketingReveal } from "@/components/marketing/MarketingReveal";
import { MarketingSectionHeader } from "@/components/marketing/MarketingSectionHeader";
import { MarketingVisual } from "@/components/marketing/MarketingVisual";
import { workflowSteps } from "@/config/marketingContent";
import { showcaseImages } from "@/config/marketingImages";
import { cn } from "@/lib/utils";

export function MarketingWorkflowSection() {
  return (
    <section id="workflow" className="marketing-section scroll-mt-32 border-t border-border/40">
      <div className="marketing-container">
        <MarketingSectionHeader
          eyebrow="Workflow"
          title="From install to published draft"
          lead="Three steps researchers follow on day one. Each step maps to a different part of the app."
        />

        <ol className="mt-12 space-y-16 md:mt-16 md:space-y-24">
          {workflowSteps.map((step, i) => {
            const slot = showcaseImages[step.imageKey];
            const reverse = i % 2 === 1;

            return (
              <MarketingReveal key={step.step} delay={i * 80}>
                <li
                  className={cn(
                    "grid items-center gap-10 lg:grid-cols-2 lg:gap-16",
                    reverse && "lg:[&>div:first-child]:order-2 lg:[&>div:last-child]:order-1"
                  )}
                >
                  <div className="space-y-4">
                    <span className="marketing-feature-index">{step.step}</span>
                    <h3 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                      {step.title}
                    </h3>
                    <p className="text-lg leading-relaxed text-muted-foreground">{step.description}</p>
                  </div>
                  <div className="marketing-showcase-frame">
                    {slot && <MarketingVisual slot={slot} plain large className="border-0 shadow-none ring-0" />}
                  </div>
                </li>
              </MarketingReveal>
            );
          })}
        </ol>

        <MarketingReveal className="mt-14 flex justify-center md:mt-16">
          <Button size="lg" className="h-12 rounded-xl px-8 font-semibold" asChild>
            <Link to="/download">Get started</Link>
          </Button>
        </MarketingReveal>
      </div>
    </section>
  );
}
