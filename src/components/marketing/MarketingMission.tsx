import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { mission } from "@/config/marketingContent";
import { MarketingReveal } from "@/components/marketing/MarketingReveal";
import { ArrowRight } from "lucide-react";

export function MarketingMission() {
  return (
    <section id="mission" className="marketing-section scroll-mt-32 border-t border-border/40 bg-muted/20">
      <div className="marketing-container">
        <MarketingReveal className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">{mission.eyebrow}</p>
          <h2 className="marketing-section-title mt-4">{mission.title}</h2>
          <p className="marketing-section-lead mt-6 text-left md:text-center">{mission.body}</p>
          <div className="mt-10 flex justify-center">
            <Button size="lg" className="h-12 gap-2 rounded-xl px-8 text-base font-semibold" asChild>
              <Link to={mission.cta.to}>
                {mission.cta.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </MarketingReveal>
      </div>
    </section>
  );
}
