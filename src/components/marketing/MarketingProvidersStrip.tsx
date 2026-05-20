import { MarketingReveal } from "@/components/marketing/MarketingReveal";
import { providerStrip } from "@/config/marketingContent";

export function MarketingProvidersStrip() {
  return (
    <section className="border-y border-border/40 py-10 md:py-12">
      <div className="marketing-container">
        <MarketingReveal>
          <p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Connects to
          </p>
          <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 md:gap-x-12">
            {providerStrip.map((name, i) => (
              <li
                key={name}
                className="text-sm font-medium text-foreground/70 transition-colors hover:text-foreground md:text-base"
                style={{ transitionDelay: `${i * 40}ms` }}
              >
                {name}
              </li>
            ))}
          </ul>
        </MarketingReveal>
      </div>
    </section>
  );
}
