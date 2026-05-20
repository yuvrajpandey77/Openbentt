import { appCardHero, hero } from "@/config/marketingContent";
import { HeroHeadline } from "@/components/marketing/HeroHeadline";

/** Hero built from live text + app card (matches launch creative colors). */
export function MarketingHero() {
  return (
    <div className="marketing-hero-stage" aria-labelledby="marketing-hero-title">
      <div className="marketing-hero-blobs" aria-hidden />

      <div className="marketing-hero-inner relative z-10">
        <div className="marketing-hero-enter marketing-hero-enter--1">
          <HeroHeadline id="marketing-hero-title" />
        </div>

        <p className="marketing-hero-subhead marketing-hero-enter marketing-hero-enter--2">
          Openbentt is a <span className="marketing-hero-accent">local-first</span> AI workspace for LaTeX, PDFs,
          benchmarking, and fine-tuned small models. Built for researchers, by researchers.
        </p>

        <div className="marketing-hero-card-wrap marketing-hero-enter marketing-hero-enter--3">
          <img
            src={appCardHero.src}
            alt={appCardHero.alt}
            width={appCardHero.width}
            height={appCardHero.height}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            className="marketing-hero-card-img max-w-full transition-transform duration-500 hover:scale-[1.01]"
          />
        </div>
      </div>
    </div>
  );
}
