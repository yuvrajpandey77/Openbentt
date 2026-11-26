import { Link } from "react-router-dom";
import { MarketingReveal } from "@/components/marketing/MarketingReveal";
import { productCapabilities } from "@/config/marketingContent";
import { ArrowUpRight } from "lucide-react";

/** Dense map of real Openbentt surfaces — names, routes, what they do. */
export function MarketingCapabilityMap() {
  return (
    <section id="capabilities" className="marketing-section scroll-mt-32" aria-label="What Openbentt includes">
      <div className="marketing-container">
        <MarketingReveal>
          <p className="marketing-eyebrow text-left">Inside the desktop app</p>
          <h2 className="mt-3 max-w-3xl text-left font-display text-3xl font-semibold tracking-tight text-foreground md:text-4xl lg:text-[2.75rem] lg:leading-tight">
            Eight surfaces. Not a chat wrapper with a download button.
          </h2>
        </MarketingReveal>

        <ul className="marketing-capability-map mt-10 md:mt-14">
          {productCapabilities.map((cap, i) => {
            const Icon = cap.icon;
            return (
              <MarketingReveal key={cap.id} as="li" delay={i * 45}>
                <Link to={cap.route} className="marketing-capability-map__item group">
                  <div className="flex items-start justify-between gap-3">
                    <span className="marketing-capability-map__icon" aria-hidden>
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <ArrowUpRight
                      className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100"
                      aria-hidden
                    />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold text-foreground md:text-xl">{cap.name}</h3>
                  <p className="mt-1.5 text-sm font-medium text-primary md:text-[0.95rem]">{cap.line}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{cap.detail}</p>
                </Link>
              </MarketingReveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
